import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
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

// Vision model for reading handwriting. Sonnet 5 has the same high-res vision
// as Opus at ~40% of the price; swap to 'claude-opus-4-8' (or 'claude-fable-5',
// also enabled on this key) if read quality ever needs a step up.
const VISION_MODEL = 'claude-sonnet-5'

type Row = {
  id: string
  person_id: string
  photo_url: string | null
  photo_urls: string[] | null
  ocr_text: string | null
  journal_date: string
  import_seq: number | null
}

type Segment = { date: string | null; writtenYear: number | null; scripture: string | null; text: string; isContinuation: boolean }

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

// Upload an already-rotated jpeg buffer, returning the new public url.
async function uploadRotated(rotated: Buffer, personId: string): Promise<string | null> {
  try {
    const path = `${personId}/${Date.now()}-${Math.round(Math.random() * 1e6)}-air.jpg`
    // Blob upload (binary-safe) — a raw Buffer gets corrupted by the storage
    // client on Vercel.
    const { error } = await supabase.storage.from('soap-photos').upload(path, new Blob([new Uint8Array(rotated)], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: false })
    if (error) return null
    return supabase.storage.from('soap-photos').getPublicUrl(path).data.publicUrl
  } catch { return null }
}

type ReadResult = { segments: Segment[]; parseOk: boolean }

// Self-chaining: fire the next processing hop and give the request ~3s to reach
// the server, then let go — the new invocation runs on its own; awaiting its
// full (minutes-long) response would pin this function open until its own limit.
async function chainNext(origin: string, batchId: string, year: number, hop: number) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 3000)
  try {
    await fetch(`${origin}/api/soap/import/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, year, hop: hop + 1 }),
      signal: ctrl.signal,
    })
  } catch { /* abort is expected; the next hop is already running */ }
  clearTimeout(t)
}

// How "clean" a read is. A parsed JSON reply with dated segments beats everything;
// a garbled read typically fails to parse or produces short/undated junk.
function readScore(r: ReadResult): number {
  const dated = r.segments.filter(s => s.date).length
  const textLen = r.segments.reduce((n, s) => n + s.text.length, 0)
  return (r.parseOk ? 10000 : 0) + dated * 5000 + Math.min(textLen, 4000)
}

// Is the upright read good enough to skip rotation entirely? A dated entry, or a
// parsed undated one with real text (continuation pages legitimately have no date).
function isGoodRead(r: ReadResult): boolean {
  if (!r.parseOk) return false
  const textLen = r.segments.reduce((n, s) => n + s.text.length, 0)
  return r.segments.some(s => s.date) || textLen >= 150
}

// Read a photo and split it into one segment per dated entry. prevDate (if known)
// is the most recent dated entry before this photo, used to disambiguate sloppy digits.
async function analyze(image: string | Buffer, year: number, prevDate?: string | null): Promise<ReadResult> {
  const { text } = await generateText({
    model: anthropic(VISION_MODEL),
    // Sonnet 5 runs adaptive thinking by default when the param is omitted —
    // OCR doesn't need it, and thinking tokens count against the output limit.
    providerOptions: { anthropic: { thinking: { type: 'disabled' } } },
    maxOutputTokens: 8000, // two dense notebook pages of transcription fit comfortably
    messages: [{
      role: 'user',
      content: [
        { type: 'image', image },
        {
          type: 'text',
          text: `This photo shows one or two handwritten notebook pages with SOAP journal entries (Scripture, Observation, Application, Prayer), each usually starting with its own date.

Read in natural order: the LEFT page top-to-bottom first, then the RIGHT page top-to-bottom.

Split into SEGMENTS — one segment per distinct dated entry. IMPORTANT: an entry frequently CONTINUES from the left page onto the right page (or from the bottom of one column to the top of the next). A page break, column break, or new page is NOT a new entry. Start a new segment ONLY where a NEW DATE is written or an unmistakable new entry begins. Keep a continued entry as ONE segment under its date.

For each segment give: month (1-12) and day (1-31) if a date is written for it, else null; the YEAR only if one is actually written on the page (e.g. "Jan 1, 2023" -> 2023), else null; the scripture reference or null; and the full transcribed text.

DATES ARE CHRONOLOGICAL: entries run in date order down the page and across photos.${prevDate ? ` The most recent dated entry before this photo was ${prevDate}.` : ''} When a handwritten digit is ambiguous (a sloppy 2 can look like 7, 1 like 7, 3 like 5), pick the reading consistent with the surrounding dates — e.g. between "Jan 1" and "Jan 3", an ambiguous day is 2, not 7.

If the VERY FIRST segment has no date and continues from a previous photo (begins mid-thought), set is_continuation true for that first segment only.

Respond ONLY with JSON:
{"segments":[{"month":1-12|null,"day":1-31|null,"year":YYYY|null,"scripture":"Book C:V"|null,"text":"...","is_continuation":true|false}]}`,
        },
      ],
    }],
  })
  try {
    // Extract the first {...} object — robust to ```json fences / leading text.
    const m = text.match(/\{[\s\S]*\}/)
    const parsed = JSON.parse(m ? m[0] : text) as { segments?: Array<{ month?: number | null; day?: number | null; year?: number | null; scripture?: string | null; text?: string; is_continuation?: boolean }> }
    const segs = (parsed.segments ?? [])
      .map((s, i) => ({
        date: toDate(year, s.month, s.day),
        writtenYear: Number.isInteger(s.year) && (s.year as number) >= 1990 && (s.year as number) <= 2100 ? (s.year as number) : null,
        scripture: s.scripture ?? null,
        text: (s.text || '').trim(),
        isContinuation: i === 0 && s.is_continuation === true,
      }))
      .filter(s => s.text.length > 0)
    if (segs.length) return { segments: segs, parseOk: true }
  } catch { /* fall through */ }
  return { segments: [{ date: null, writtenYear: null, scripture: null, text: text.slice(0, 4000), isContinuation: false }], parseOk: false }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const { batchId, year, hop = 0 } = await request.json()
  if (!batchId || !year) return NextResponse.json({ error: 'batchId and year required' }, { status: 400 })
  const yr = Number(year)

  // Already-created entries in this batch: dedup context + continuation anchor.
  const { data: doneRows } = await supabase
    .from('soap_journals')
    .select('id, person_id, photo_url, photo_urls, ocr_text, journal_date, import_seq, date_precision')
    .eq('import_batch_id', batchId)
    .eq('source', 'imported')
    .not('ocr_text', 'is', null)
    .order('import_seq', { ascending: true })
  const processed = (doneRows as (Row & { date_precision: string })[]) ?? []
  // Chronology hint for ambiguous handwritten digits: the last real (day-precision)
  // date filed so far. Same hint for every photo in the slice (reads run concurrently).
  const prevDate = [...processed].reverse().find(r => r.date_precision === 'day')?.journal_date ?? null
  const seenTexts: string[][] = processed.map(r => words(r.ocr_text))
  let current: { id: string; ocr_text: string; photo_urls: string[] } | null =
    processed.length
      ? {
          id: processed[processed.length - 1].id,
          ocr_text: processed[processed.length - 1].ocr_text || '',
          photo_urls: processed[processed.length - 1].photo_urls || [processed[processed.length - 1].photo_url!].filter(Boolean),
        }
      : null

  // Unprocessed photos (placeholder rows), in page order. Skip rows freshly
  // claimed by another worker — claims older than 6 min are dead (the function
  // ceiling is 300s) and safe to steal.
  const staleCutoff = new Date(Date.now() - 6 * 60 * 1000).toISOString()
  const { data: pendingRows } = await supabase
    .from('soap_journals')
    .select('id, person_id, photo_url, photo_urls, ocr_text, journal_date, import_seq')
    .eq('import_batch_id', batchId)
    .is('ocr_text', null)
    .or(`processing_started_at.is.null,processing_started_at.lt.${staleCutoff}`)
    .order('import_seq', { ascending: true })
  const claimable = (pendingRows as Row[]) ?? []

  // Atomically claim our slice so concurrent workers (phone loop + server
  // chain) never read the same photo twice: the UPDATE only wins rows that are
  // still unclaimed-or-stale, and returns exactly the rows we won.
  const wantIds = claimable.slice(0, 20).map(r => r.id)
  let pending: Row[] = []
  if (wantIds.length) {
    const { data: claimed } = await supabase
      .from('soap_journals')
      .update({ processing_started_at: new Date().toISOString() })
      .in('id', wantIds)
      .is('ocr_text', null)
      .or(`processing_started_at.is.null,processing_started_at.lt.${staleCutoff}`)
      .select('id, person_id, photo_url, photo_urls, ocr_text, journal_date, import_seq')
    pending = ((claimed as Row[]) ?? []).sort((a, b) => (a.import_seq ?? 0) - (b.import_seq ?? 0))
  }

  const counts = { processed: 0, dated: 0, undated: 0, merged: 0, duplicates: 0 }
  // Written-year vs selected-year mismatch tally (warn-only; filing still uses `yr`).
  const writtenYearCounts = new Map<number, number>()

  // Phase A — READ the pages concurrently (the slow AI part). A hard time budget
  // stops NEW reads at ~200s so the call always persists its work and chains the
  // next hop before Vercel's 300s ceiling kills it (a killed call loses — and
  // re-bills — every read it completed).
  //
  // Orientation is VERIFY-DON'T-GUESS: read at 0° first and keep that read if it's
  // clean — asking the model "is this rotated?" up front over-rotated upright pages
  // (every garbled/undated entry in the 109-photo test came from a wrongly-rotated
  // page). Only when the upright read is genuinely bad do we try 90/180/270 and
  // keep whichever reads cleanest.
  const READ_DEADLINE = startedAt + 200_000
  const skippedIds: string[] = []
  const analyzed = await mapPool(pending, 5, async (photo) => {
    if (!photo.photo_url) return null
    if (Date.now() > READ_DEADLINE) { skippedIds.push(photo.id); return null }
    try {
      let photoUrl = photo.photo_url
      // 1) Read upright first.
      let best = await analyze(photoUrl, yr, prevDate)
      let bestDeg = 0
      let origBuf: Buffer | null = null
      if (!isGoodRead(best)) {
        // 2) Upright read is bad — trial-rotate in memory and re-read.
        const res = await fetch(photoUrl)
        if (res.ok) origBuf = Buffer.from(await res.arrayBuffer())
        if (origBuf) {
          for (const deg of [90, 180, 270]) {
            const rotated = await sharp(origBuf).rotate(deg).jpeg({ quality: 85 }).toBuffer()
            const r = await analyze(rotated, yr, prevDate)
            if (readScore(r) > readScore(best)) { best = r; bestDeg = deg }
            // A clean dated read at this angle is definitive — stop trialing.
            if (isGoodRead(r) && r.segments.some(s => s.date)) break
          }
        }
      }
      // 3) Persist the winning rotation (if any) so review shows the page upright.
      if (bestDeg && origBuf) {
        const rotated = await sharp(origBuf).rotate(bestDeg).jpeg({ quality: 85 }).toBuffer()
        const rotatedUrl = await uploadRotated(rotated, photo.person_id)
        if (rotatedUrl) photoUrl = rotatedUrl
      }
      return { photo, segments: best.segments, photoUrl }
    } catch (e) {
      console.error('Import analyze error on photo', photo.id, e)
      skippedIds.push(photo.id) // release the claim; retried on a later call
      return null
    }
  })

  // Release claims on photos we didn't finish so any worker can pick them up now.
  if (skippedIds.length) {
    await supabase.from('soap_journals').update({ processing_started_at: null }).in('id', skippedIds)
  }

  // Phase B — PERSIST in page order (continuation-aware; fast DB ops).
  for (const item of analyzed) {
    if (!item) continue
    const { photo, segments, photoUrl } = item
    const photoSeq = photo.import_seq ?? 0
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]
      if (seg.writtenYear && seg.writtenYear !== yr) {
        writtenYearCounts.set(seg.writtenYear, (writtenYearCounts.get(seg.writtenYear) ?? 0) + 1)
      }
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

  // Most-seen written year that disagrees with the selected year (warn-only).
  let yearMismatchCount = 0
  let writtenYear: number | null = null
  for (const [y, n] of writtenYearCounts) {
    yearMismatchCount += n
    if (writtenYear === null || n > (writtenYearCounts.get(writtenYear) ?? 0)) writtenYear = y
  }

  // Self-drive: if work remains and this call made progress (or released skipped
  // claims), fire the next hop after the response is sent — the import finishes
  // on its own even if the phone that started it is closed. Hop cap is a runaway
  // guard; a call that claimed nothing doesn't chain (whoever holds the claims is
  // already driving, and the client's status polls are the backstop).
  const madeProgress = counts.processed > 0 || skippedIds.length > 0
  if ((remaining ?? 0) > 0 && madeProgress && hop < 60) {
    const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : request.nextUrl.origin
    after(() => chainNext(origin, batchId, yr, hop))
  }

  return NextResponse.json({ ...counts, remaining: remaining ?? 0, yearMismatchCount, writtenYear })
}
