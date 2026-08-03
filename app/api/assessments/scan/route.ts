// Paper-assessment photo scan (parse step). A coach photographs the printed
// packet sheets (G1/G2/B1/P1 from /print/assessments) and posts them here; each
// photo is stored in the private assessment-scans bucket and read by the vision
// model, then everything is assembled into a reviewable draft — parsed answers,
// per-item flags for the leader to resolve, and scores computed by the same lib
// code the in-app assessments use (the model reads marks, never does math).
// Nothing is persisted to the result tables here — the leader reviews the draft
// and /api/assessments/commit writes it.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import {
  SCAN_PROMPT,
  parsedPageSchema,
  recheckItemsSchema,
  buildRecheckPrompt,
  idsNeedingRecheck,
  mergeRecheckedItems,
  authorizeScanCaller,
  assembleDraft,
  type ParsedPage,
} from '@/lib/assessmentScan'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fable 5 — the packet mixes dense bubble grids with cursive handwriting (P1
// reflections); reading accuracy is the whole feature, and volume is tiny (a
// few scans per new disciple).
const MODEL = 'claude-fable-5'

const MAX_PHOTOS = 6
const MAX_BYTES = 10 * 1024 * 1024

// Zoomed horizontal strip around the flagged rows of a bubble sheet. Row
// vertical positions are estimated from the item number's position in the
// sheet's range (the grids span roughly the 14%–82% band of the page), with
// generous padding so tilt/margins in real phone photos stay covered. Returns
// null when sharp is unavailable or the page isn't a bubble sheet.
async function cropRowStrip(buffer: Buffer, page: string, ids: number[]): Promise<Buffer | null> {
  const range = page === 'G1' ? [1, 50] : page === 'G2' ? [51, 100] : page === 'B1' ? [1, 50] : null
  if (!range || !ids.length) return null
  try {
    const sharp = (await import('sharp')).default
    const img = sharp(buffer)
    const meta = await img.metadata()
    if (!meta.height || !meta.width) return null
    const frac = (id: number) => 0.12 + 0.72 * ((id - range[0]) / (range[1] - range[0]))
    const from = Math.max(0, Math.min(...ids.map(frac)) - 0.1)
    const to = Math.min(1, Math.max(...ids.map(frac)) + 0.1)
    const top = Math.round(meta.height * from)
    const height = Math.max(1, Math.round(meta.height * (to - from)))
    return await img.extract({ left: 0, top, width: meta.width, height }).png().toBuffer()
  } catch (e) {
    console.error('cropRowStrip failed:', e)
    return null
  }
}

export async function POST(request: NextRequest) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const accessToken = form.get('accessToken')
  const personId = form.get('personId')
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File)

  if (typeof personId !== 'string' || !personId) {
    return NextResponse.json({ error: 'personId required' }, { status: 400 })
  }
  if (!photos.length) {
    return NextResponse.json({ error: 'At least one photo required' }, { status: 400 })
  }
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Too many photos (${MAX_PHOTOS} max)` }, { status: 400 })
  }
  for (const p of photos) {
    if (p.size > MAX_BYTES) return NextResponse.json({ error: `${p.name}: file too large (10MB max)` }, { status: 400 })
    if (p.type && !p.type.startsWith('image/')) {
      return NextResponse.json({ error: `${p.name}: not an image` }, { status: 400 })
    }
  }

  const auth = await authorizeScanCaller(supabase, typeof accessToken === 'string' ? accessToken : null)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: person } = await supabase.from('people').select('id, name').eq('id', personId).maybeSingle()
  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  // Store + parse each photo concurrently.
  const batch = Date.now()
  let results: { path: string; parsed: ParsedPage }[]
  try {
    results = await Promise.all(
      photos.map(async (photo, i) => {
        const buffer = Buffer.from(await photo.arrayBuffer())
        const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase()
        const path = `${personId}/${batch}-${i + 1}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('assessment-scans')
          .upload(path, buffer, { contentType: photo.type || 'image/jpeg', upsert: false })
        if (upErr) throw new Error(`Photo upload failed: ${upErr.message}`)

        const { object } = await generateObject({
          model: anthropic(MODEL),
          schema: parsedPageSchema,
          maxOutputTokens: 16000,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', image: buffer },
                { type: 'text', text: SCAN_PROMPT },
              ],
            },
          ],
        })

        // Second, focused pass over rows the full-sheet read left blank or
        // unclear — recovers marks the grid read slipped past, while genuine
        // blanks stay blank (and stay flagged for the leader). Alongside the
        // full sheet we send a zoomed crop strip around the flagged rows: the
        // model's internal downscale makes 50-row grids marginal, and the crop
        // restores the lost resolution.
        let parsed = object
        const recheckIds = idsNeedingRecheck(parsed)
        if (recheckIds.length) {
          try {
            const images: Buffer[] = [buffer]
            const strip = await cropRowStrip(buffer, parsed.page, recheckIds)
            if (strip) images.push(strip)
            const { object: recheck } = await generateObject({
              model: anthropic(MODEL),
              schema: recheckItemsSchema,
              maxOutputTokens: 4000,
              messages: [
                {
                  role: 'user',
                  content: [
                    ...images.map(img => ({ type: 'image' as const, image: img })),
                    {
                      type: 'text' as const,
                      text:
                        buildRecheckPrompt(parsed.page, recheckIds) +
                        (strip
                          ? '\n\nThe second image is a zoomed crop of the sheet around the rows in question — use it for the close look, and the full sheet to confirm row numbers.'
                          : ''),
                    },
                  ],
                },
              ],
            })
            parsed = mergeRecheckedItems(parsed, recheckIds, recheck.items)
          } catch (e) {
            console.error('recheck pass failed (keeping first-pass flags):', e)
          }
        }
        return { path, parsed }
      })
    )
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Scan failed', detail }, { status: 502 })
  }

  const draft = assembleDraft(results.map(r => r.parsed))

  return NextResponse.json({
    status: 'parsed',
    person: { id: person.id, name: person.name },
    pages: results.map(r => ({ code: r.parsed.page, path: r.path })),
    draft,
    model: MODEL,
  })
}
