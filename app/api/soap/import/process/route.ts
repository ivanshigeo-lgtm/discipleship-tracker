import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Server-side processor for a bulk SOAP import. Runs independently of the browser
// (mobile can close mid-import) and is RESUMABLE. Each photo (which may show TWO
// notebook pages holding SEVERAL dated entries) is segmented into one SOAP per
// dated entry, filed on its real date. Handles cross-photo continuation and
// duplicate pages.

type Row = {
  id: string
  person_id: string
  photo_url: string | null
  photo_urls: string[] | null
  ocr_text: string | null
  journal_date: string
  import_seq: number | null
}

type Segment = { date: string | null; scripture: string | null; text: string; isContinuation: boolean }

const words = (t: string | null) =>
  (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const sa = new Set(a), sb = new Set(b)
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  return inter / (sa.size + sb.size - inter)
}

// Run fn over items with limited concurrency, returning results in input order.
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const runner = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()))
  return results
}

function toDate(year: number, month: unknown, day: unknown): string | null {
  const m = Number(month), d = Number(day)
  if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= 31 &&
      new Date(Date.UTC(year, m - 1, d)).getUTCMonth() === m - 1) {
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

// Rotate a stored photo (clockwise) and return the new public url.
async function rotateStored(url: string, personId: string, deg: number): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const rotated = await sharp(buf).rotate(deg).jpeg({ quality: 85 }).toBuffer()
    const path = `${personId}/${Date.now()}-${Math.round(Math.random() * 1e6)}-air.jpg`
    const { error } = await supabase.storage.from('soap-photos').upload(path, rotated, { contentType: 'image/jpeg', upsert: false })
    if (error) return null
    return supabase.storage.from('soap-photos').getPublicUrl(path).data.publicUrl
  } catch { return null }
}

// Read a photo, detect if it's rotated, and split it into one segment per dated entry.
async function analyze(photoUrl: string, year: number): Promise<{ segments: Segment[]; rotation: number }> {
  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', image: photoUrl },
        {
          type: 'text',
          text: `This photo shows one or two handwritten notebook pages with SOAP journal entries (Scripture, Observation, Application, Prayer), each usually starting with its own date.

ORIENTATION FIRST: Look at which way the handwriting runs. If the lines of text are NOT horizontal-and-upright, give the CLOCKWISE rotation in degrees to make them upright: 90 if the page is turned a quarter-turn counter-clockwise (text runs bottom-to-top), 270 if turned clockwise (text runs top-to-bottom), 180 if upside-down. Use 0 ONLY if the text is already upright and readable left-to-right.

Then read in natural order: the LEFT page top-to-bottom first, then the RIGHT page top-to-bottom.

Split into SEGMENTS — one segment per distinct dated entry. IMPORTANT: an entry frequently CONTINUES from the left page onto the right page (or from the bottom of one column to the top of the next). A page break, column break, or new page is NOT a new entry. Start a new segment ONLY where a NEW DATE is written or an unmistakable new entry begins. Keep a continued entry as ONE segment under its date.

For each segment give: month (1-12) and day (1-31) if a date is written for it (year is ${year}), else null; the scripture reference or null; and the full transcribed text.
If the VERY FIRST segment has no date and continues from a previous photo (begins mid-thought), set is_continuation true for that first segment only.

Respond ONLY with JSON:
{"rotation":0|90|180|270,"segments":[{"month":1-12|null,"day":1-31|null,"scripture":"Book C:V"|null,"text":"...","is_continuation":true|false}]}`,
        },
      ],
    }],
  })
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = JSON.parse(clean) as { rotation?: number; segments?: Array<{ month?: number | null; day?: number | null; scripture?: string | null; text?: string; is_continuation?: boolean }> }
    const rot = [90, 180, 270].includes(Number(parsed.rotation)) ? Number(parsed.rotation) : 0
    const segs = (parsed.segments ?? [])
      .map((s, i) => ({
        date: toDate(year, s.month, s.day),
        scripture: s.scripture ?? null,
        text: (s.text || '').trim(),
        isContinuation: i === 0 && s.is_continuation === true,
      }))
      .filter(s => s.text.length > 0)
    if (segs.length) return { segments: segs, rotation: rot }
  } catch { /* fall through */ }
  // Fallback: whole photo as one undated entry so nothing is lost.
  return { segments: [{ date: null, scripture: null, text: text.slice(0, 4000), isContinuation: false }], rotation: 0 }
}

export async function POST(request: NextRequest) {
  const { batchId, year } = await request.json()
  if (!batchId || !year) return NextResponse.json({ error: 'batchId and year required' }, { status: 400 })
  const yr = Number(year)

  // Already-created entries in this batch: dedup context + continuation anchor.
  const { data: doneRows } = await supabase
    .from('soap_journals')
    .select('id, person_id, photo_url, photo_urls, ocr_text, journal_date, import_seq')
    .eq('import_batch_id', batchId)
    .eq('source', 'imported')
    .not('ocr_text', 'is', null)
    .order('import_seq', { ascending: true })
  const processed = (doneRows as Row[]) ?? []
  const seenTexts: string[][] = processed.map(r => words(r.ocr_text))
  let current: { id: string; ocr_text: string; photo_urls: string[] } | null =
    processed.length
      ? {
          id: processed[processed.length - 1].id,
          ocr_text: processed[processed.length - 1].ocr_text || '',
          photo_urls: processed[processed.length - 1].photo_urls || [processed[processed.length - 1].photo_url!].filter(Boolean),
        }
      : null

  // Unprocessed photos (placeholder rows), in page order.
  const { data: pendingRows } = await supabase
    .from('soap_journals')
    .select('id, person_id, photo_url, photo_urls, ocr_text, journal_date, import_seq')
    .eq('import_batch_id', batchId)
    .is('ocr_text', null)
    .order('import_seq', { ascending: true })
  const pending = (pendingRows as Row[]) ?? []

  const counts = { processed: 0, dated: 0, undated: 0, merged: 0, duplicates: 0 }

  // Phase A — READ the pages concurrently (the slow AI part). Bounded per call so
  // we stay under maxDuration; the client loops until nothing remains.
  const slice = pending.slice(0, 40)
  const analyzed = await mapPool(slice, 5, async (photo) => {
    if (!photo.photo_url) return null
    try {
      let photoUrl = photo.photo_url
      const first = await analyze(photoUrl, yr)
      let segments = first.segments
      // If the page was sideways, the first read is unreliable — rotate the image
      // upright and READ IT AGAIN so dates/structure are detected correctly.
      if (first.rotation) {
        const rotated = await rotateStored(photoUrl, photo.person_id, first.rotation)
        if (rotated) {
          photoUrl = rotated
          const reread = await analyze(rotated, yr)
          if (reread.segments.length) segments = reread.segments
        }
      }
      return { photo, segments, photoUrl }
    } catch (e) {
      console.error('Import analyze error on photo', photo.id, e)
      return null // stays pending; retried on a later call
    }
  })

  // Phase B — PERSIST in page order (continuation-aware; fast DB ops).
  for (const item of analyzed) {
    if (!item) continue
    const { photo, segments, photoUrl } = item
    const photoSeq = photo.import_seq ?? 0
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]
      const w = words(seg.text)

      // Duplicate entry (same page shot twice → near-identical text)?
      if (w.length && seenTexts.some(s => similarity(w, s) > 0.85)) { counts.duplicates++; continue }

      if (seg.isContinuation && current) {
        const mergedText = [current.ocr_text, seg.text].filter(Boolean).join('\n\n')
        const mergedPhotos = Array.from(new Set([...current.photo_urls, photoUrl]))
        await supabase.from('soap_journals').update({ ocr_text: mergedText, photo_urls: mergedPhotos, updated_at: new Date().toISOString() }).eq('id', current.id)
        current.ocr_text = mergedText
        current.photo_urls = mergedPhotos
        seenTexts.push(w)
        counts.merged++
      } else {
        const { data: created } = await supabase.from('soap_journals').insert({
          person_id: photo.person_id,
          journal_date: seg.date || `${yr}-01-01`,
          date_precision: seg.date ? 'day' : 'year',
          ocr_text: seg.text,
          scripture_reference: seg.scripture,
          photo_url: photoUrl,
          photo_urls: [photoUrl],
          visibility: 'private',
          source: 'imported',
          import_batch_id: batchId,
          import_seq: photoSeq * 1000 + si,
          updated_at: new Date().toISOString(),
        }).select('id').single()
        if (created) {
          current = { id: (created as { id: string }).id, ocr_text: seg.text, photo_urls: [photoUrl] }
          seenTexts.push(w)
          if (seg.date) counts.dated++; else counts.undated++
        }
      }
    }
    // The placeholder photo row has been expanded into per-entry rows.
    await supabase.from('soap_journals').delete().eq('id', photo.id)
    counts.processed++
  }

  const { count: remaining } = await supabase
    .from('soap_journals')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId)
    .is('ocr_text', null)

  return NextResponse.json({ ...counts, remaining: remaining ?? 0 })
}
