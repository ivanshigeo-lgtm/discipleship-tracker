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

// Server-side processor for a bulk SOAP import. Runs independently of the
// browser (so mobile can close mid-import) and is RESUMABLE — each call processes
// the still-pending pages of a batch in page order and returns how many remain.
// Handles: date detection, new-vs-continuation merging, and duplicate pages.

type Row = {
  id: string
  photo_url: string | null
  photo_urls: string[] | null
  ocr_text: string | null
  journal_date: string
  import_seq: number | null
}

const words = (t: string | null) =>
  (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

// Jaccard similarity of two word lists (for spotting the same page shot twice).
function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const sa = new Set(a), sb = new Set(b)
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  return inter / (sa.size + sb.size - inter)
}

async function analyze(photoUrl: string, year: number) {
  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    messages: [{
      role: 'user',
      content: [
        { type: 'image', image: photoUrl },
        {
          type: 'text',
          text: `This is a handwritten SOAP journal entry (Scripture, Observation, Application, Prayer).
Extract:
1. The full text exactly as written (preserve line breaks)
2. The scripture reference (e.g. "John 3:16") or null
3. The date written on the page — MONTH and DAY only (year is ${year}). Return numeric month (1-12) and day (1-31), or null if none is clearly written.
4. Whether this page STARTS a new entry (has a date and/or opens with a Scripture reference / new heading) or CONTINUES the previous page (no date, begins mid-thought). Return starts_new true/false.
Respond ONLY with JSON: {"ocr_text":"...","scripture_reference":"..."|null,"month":1-12|null,"day":1-31|null,"starts_new":true|false}`,
        },
      ],
    }],
  })
  let p: { ocr_text?: string; scripture_reference?: string | null; month?: number | null; day?: number | null; starts_new?: boolean }
  try { p = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()) }
  catch { p = { ocr_text: text } }

  let date: string | null = null
  const m = Number(p.month), d = Number(p.day)
  if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= 31 &&
      new Date(Date.UTC(year, m - 1, d)).getUTCMonth() === m - 1) {
    date = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return {
    ocrText: p.ocr_text || '',
    scripture: p.scripture_reference ?? null,
    date,
    startsNew: p.starts_new !== false,
  }
}

export async function POST(request: NextRequest) {
  const { batchId, year } = await request.json()
  if (!batchId || !year) return NextResponse.json({ error: 'batchId and year required' }, { status: 400 })

  // Already-processed rows in this batch: anchor continuation + dedup context.
  const { data: doneRows } = await supabase
    .from('soap_journals')
    .select('id, photo_url, photo_urls, ocr_text, journal_date, import_seq')
    .eq('import_batch_id', batchId)
    .not('ocr_text', 'is', null)
    .order('import_seq', { ascending: true })
  const processed = (doneRows as Row[]) ?? []
  const seenTexts: string[][] = processed.map(r => words(r.ocr_text))
  let current: { id: string; ocr_text: string; photo_urls: string[] } | null =
    processed.length
      ? { id: processed[processed.length - 1].id, ocr_text: processed[processed.length - 1].ocr_text || '', photo_urls: processed[processed.length - 1].photo_urls || [processed[processed.length - 1].photo_url!].filter(Boolean) }
      : null

  // Pending pages, in page order.
  const { data: pendingRows } = await supabase
    .from('soap_journals')
    .select('id, photo_url, photo_urls, ocr_text, journal_date, import_seq')
    .eq('import_batch_id', batchId)
    .is('ocr_text', null)
    .order('import_seq', { ascending: true })
  const pending = (pendingRows as Row[]) ?? []

  const counts = { processed: 0, dated: 0, undated: 0, merged: 0, duplicates: 0 }
  const started = Date.now()

  for (const row of pending) {
    if (Date.now() - started > 230_000) break // leave margin under maxDuration; resume on next call
    if (!row.photo_url) { continue }
    try {
      const a = await analyze(row.photo_url, Number(year))
      const w = words(a.ocrText)

      // Duplicate page? (same page shot twice → near-identical text)
      if (w.length && seenTexts.some(s => similarity(w, s) > 0.85)) {
        await supabase.from('soap_journals').delete().eq('id', row.id)
        counts.duplicates++
        counts.processed++
        continue
      }

      if (!current || a.startsNew) {
        // New entry
        await supabase.from('soap_journals').update({
          ocr_text: a.ocrText || null,
          scripture_reference: a.scripture,
          journal_date: a.date || row.journal_date,
          date_precision: a.date ? 'day' : 'year',
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        current = { id: row.id, ocr_text: a.ocrText, photo_urls: row.photo_urls || [row.photo_url].filter(Boolean) as string[] }
        seenTexts.push(w)
        if (a.date) counts.dated++; else counts.undated++
      } else {
        // Continuation → merge into current, remove this row
        const mergedText = [current.ocr_text, a.ocrText].filter(Boolean).join('\n\n')
        const mergedPhotos = [...current.photo_urls, ...(row.photo_urls || [row.photo_url].filter(Boolean) as string[])]
        await supabase.from('soap_journals').update({ ocr_text: mergedText, photo_urls: mergedPhotos, updated_at: new Date().toISOString() }).eq('id', current.id)
        await supabase.from('soap_journals').delete().eq('id', row.id)
        current.ocr_text = mergedText
        current.photo_urls = mergedPhotos
        counts.merged++
      }
      counts.processed++
    } catch (e) {
      console.error('Import process error on row', row.id, e)
      // leave the row pending so a later call retries it
    }
  }

  // How many pages still need processing?
  const { count: remaining } = await supabase
    .from('soap_journals')
    .select('id', { count: 'exact', head: true })
    .eq('import_batch_id', batchId)
    .is('ocr_text', null)

  return NextResponse.json({ ...counts, remaining: remaining ?? 0 })
}
