// Paper-assessment photo scan (parse step). A coach photographs the printed
// packet sheets (G1/G2/B1/P1 from /print/assessments) and posts them here; each
// photo is stored in the private assessment-scans bucket and read by the vision
// model, then everything is assembled into a reviewable draft — parsed answers,
// per-item flags for the leader to resolve, and scores computed by the same lib
// code the in-app assessments use (the model reads marks, never does math).
// Nothing is persisted to the result tables here — the leader reviews the draft
// and /api/assessments/commit writes it.
//
// Two ways in (Vercel rejects request bodies over ~4.5MB at the edge, so a
// multi-photo upload of real camera frames can never ride in one request):
//   1. multipart with store=1 + one photo  → stores it, returns { path }
//   2. JSON { paths: [...] }               → parses previously stored photos
// The legacy single-request multipart form (all photos at once) still works
// for payloads small enough to fit — build 79 clients use it.
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

// Full-sheet read, then a focused second pass over rows the grid read left
// blank or unclear — recovers marks the full read slipped past, while genuine
// blanks stay blank (and stay flagged for the leader). Alongside the full
// sheet the recheck gets a zoomed crop strip: the model's internal downscale
// makes 50-row grids marginal, and the crop restores the lost resolution.
async function parseSheet(buffer: Buffer): Promise<ParsedPage> {
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
  return parsed
}

function scanResponse(
  person: { id: string; name: string },
  results: { path: string; parsed: ParsedPage }[]
) {
  return NextResponse.json({
    status: 'parsed',
    person,
    pages: results.map(r => ({ code: r.parsed.page, path: r.path })),
    draft: assembleDraft(results.map(r => r.parsed)),
    model: MODEL,
  })
}

export async function POST(request: NextRequest) {
  // JSON body = parse-by-path (photos already stored via store=1 requests).
  if (request.headers.get('content-type')?.includes('application/json')) {
    let body: { accessToken?: unknown; personId?: unknown; paths?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { accessToken, personId, paths } = body
    if (typeof personId !== 'string' || !personId) {
      return NextResponse.json({ error: 'personId required' }, { status: 400 })
    }
    if (!Array.isArray(paths) || !paths.length || !paths.every(p => typeof p === 'string')) {
      return NextResponse.json({ error: 'paths required' }, { status: 400 })
    }
    if (paths.length > MAX_PHOTOS) {
      return NextResponse.json({ error: `Too many photos (${MAX_PHOTOS} max)` }, { status: 400 })
    }
    // Stored paths are namespaced by person — refuse anything outside it so a
    // token can't point the parser at another person's photos.
    if (!paths.every(p => p.startsWith(`${personId}/`) && !p.includes('..'))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const auth = await authorizeScanCaller(supabase, typeof accessToken === 'string' ? accessToken : null)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { data: person } = await supabase.from('people').select('id, name').eq('id', personId).maybeSingle()
    if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

    let results: { path: string; parsed: ParsedPage }[]
    try {
      results = await Promise.all(
        paths.map(async path => {
          const { data, error } = await supabase.storage.from('assessment-scans').download(path)
          if (error || !data) throw new Error(`Stored photo missing: ${path}`)
          return { path, parsed: await parseSheet(Buffer.from(await data.arrayBuffer())) }
        })
      )
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ error: 'Scan failed', detail }, { status: 502 })
    }
    return scanResponse(person, results)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const accessToken = form.get('accessToken')
  const personId = form.get('personId')
  const storeOnly = form.get('store') === '1'
  const photos = form.getAll('photos').filter((f): f is File => f instanceof File)

  if (typeof personId !== 'string' || !personId) {
    return NextResponse.json({ error: 'personId required' }, { status: 400 })
  }
  if (!photos.length) {
    return NextResponse.json({ error: 'At least one photo required' }, { status: 400 })
  }
  if (photos.length > (storeOnly ? 1 : MAX_PHOTOS)) {
    return NextResponse.json({ error: storeOnly ? 'One photo per store request' : `Too many photos (${MAX_PHOTOS} max)` }, { status: 400 })
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
        if (storeOnly) return { path, parsed: null as unknown as ParsedPage }
        return { path, parsed: await parseSheet(buffer) }
      })
    )
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: storeOnly ? 'Upload failed' : 'Scan failed', detail }, { status: 502 })
  }

  if (storeOnly) {
    return NextResponse.json({ status: 'stored', path: results[0].path })
  }
  return scanResponse(person, results)
}
