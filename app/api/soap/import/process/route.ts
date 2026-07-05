import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

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

function toDate(year: number, month: unknown, day: unknown): string | null {
  const m = Number(month), d = Number(day)
  if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= 31 &&
      new Date(Date.UTC(year, m - 1, d)).getUTCMonth() === m - 1) {
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

// Read a photo and split it into one segment per dated entry.
async function analyze(photoUrl: string, year: number): Promise<Segment[]> {
  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', image: photoUrl },
        {
          type: 'text',
          text: `This photo shows one or two handwritten notebook pages. It may contain SEVERAL separate SOAP journal entries (Scripture, Observation, Application, Prayer), each usually starting with its own date.
Read everything in natural reading order: the LEFT page top-to-bottom first, then the RIGHT page top-to-bottom.
Split the content into SEGMENTS — one segment per distinct entry. A new segment begins wherever a new date appears or a clearly new entry starts.
For each segment give: month (1-12) and day (1-31) if a date is written for it (the year is ${year}), otherwise null; the scripture reference or null; and the full transcribed text of that segment.
If the VERY FIRST segment has no date and appears to continue from a previous page (begins mid-thought), set is_continuation true for that first segment only.
Respond ONLY with JSON:
{"segments":[{"month":1-12|null,"day":1-31|null,"scripture":"Book C:V"|null,"text":"...","is_continuation":true|false}]}`,
        },
      ],
    }],
  })
  try {
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = JSON.parse(clean) as { segments?: Array<{ month?: number | null; day?: number | null; scripture?: string | null; text?: string; is_continuation?: boolean }> }
    const segs = (parsed.segments ?? [])
      .map((s, i) => ({
        date: toDate(year, s.month, s.day),
        scripture: s.scripture ?? null,
        text: (s.text || '').trim(),
        isContinuation: i === 0 && s.is_continuation === true,
      }))
      .filter(s => s.text.length > 0)
    if (segs.length) return segs
  } catch { /* fall through */ }
  // Fallback: whole photo as one undated entry so nothing is lost.
  return [{ date: null, scripture: null, text: text.slice(0, 4000), isContinuation: false }]
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
  const started = Date.now()

  for (const photo of pending) {
    if (Date.now() - started > 230_000) break // resume on the next call
    if (!photo.photo_url) continue
    try {
      const segments = await analyze(photo.photo_url, yr)
      const photoSeq = photo.import_seq ?? 0

      for (let si = 0; si < segments.length; si++) {
        const seg = segments[si]
        const w = words(seg.text)

        // Duplicate entry (same page shot twice → near-identical text)?
        if (w.length && seenTexts.some(s => similarity(w, s) > 0.85)) { counts.duplicates++; continue }

        if (seg.isContinuation && current) {
          const mergedText = [current.ocr_text, seg.text].filter(Boolean).join('\n\n')
          const mergedPhotos = Array.from(new Set([...current.photo_urls, photo.photo_url]))
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
            photo_url: photo.photo_url,
            photo_urls: [photo.photo_url],
            visibility: 'private',
            source: 'imported',
            import_batch_id: batchId,
            import_seq: photoSeq * 1000 + si,
            updated_at: new Date().toISOString(),
          }).select('id').single()
          if (created) {
            current = { id: (created as { id: string }).id, ocr_text: seg.text, photo_urls: [photo.photo_url] }
            seenTexts.push(w)
            if (seg.date) counts.dated++; else counts.undated++
          }
        }
      }

      // The placeholder photo row has been expanded into per-entry rows.
      await supabase.from('soap_journals').delete().eq('id', photo.id)
      counts.processed++
    } catch (e) {
      console.error('Import process error on photo', photo.id, e)
      // leave the placeholder pending so a later call retries it
    }
  }

  const { count: remaining } = await supabase
    .from('soap_journals')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId)
    .is('ocr_text', null)

  return NextResponse.json({ ...counts, remaining: remaining ?? 0 })
}
