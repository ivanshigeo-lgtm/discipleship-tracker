import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Answered Prayers scanner. Pass 1 walks every SOAP entry and extracts
// SPECIFIC petitions ("give Shohlise a car") and answer-evidence ("God
// provided the director") into prayer_scan_items. Self-chains like the photo
// import until every entry is scanned. Pass 2 (when nothing is left to scan)
// pairs petitions with later evidence into answered_prayers.

const MODEL = 'claude-sonnet-5'
const CHUNK = 40 // entries per extraction call

type EntryLite = { id: string; journal_date: string; ocr_text: string }

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

const firstJson = (text: string) => {
  const m = text.match(/\{[\s\S]*\}/)
  return JSON.parse(m ? m[0] : text)
}

// Supabase caps every response at 1,000 rows — page through to get them all.
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await page(from, from + 999)
    const batch = (data ?? []) as T[]
    out.push(...batch)
    if (batch.length < 1000) break
  }
  return out
}

// ── Pass 1: extract petitions + evidence from a chunk of entries ──
async function extractChunk(entries: EntryLite[], personId: string): Promise<number> {
  const numbered = entries
    .map((e, i) => `[${i}] ${e.journal_date}\n${e.ocr_text.slice(0, 2500)}`)
    .join('\n\n---\n\n')
  const { text } = await generateText({
    model: anthropic(MODEL),
    providerOptions: { anthropic: { thinking: { type: 'disabled' } } },
    maxOutputTokens: 8000,
    messages: [{
      role: 'user',
      content: `These are dated SOAP journal entries (Scripture, Observation, Application, Prayer), separated by ---, each starting with [index] and its date.

For each entry, find two kinds of statements:

1. PETITIONS — specific, checkable requests to God. Concrete asks about nameable people, situations, needs, or outcomes ("help me find a solution at the preschool", "give Shohlise a car", "heal mom"). NOT generic devotion ("help me trust you more", "make me faithful", "fill me with your spirit") — skip those.
2. EVIDENCE — reports that something happened: gratitude for a provision, an update on a situation, a testimony ("God provided the director", "we got the building", "mom's scan came back clear").

Quote short (under 25 words each, verbatim from the entry). Give each a 2-4 word topic tag (e.g. "preschool leadership", "car for Shohlise"). Entries with neither are simply omitted.

Respond ONLY with JSON:
{"items":[{"index":0,"kind":"petition"|"evidence","quote":"...","topic":"..."}]}

${numbered}`,
    }],
  })
  const parsed = firstJson(text) as { items?: Array<{ index?: number; kind?: string; quote?: string; topic?: string }> }
  const rows: Array<{ person_id: string; journal_id: string; kind: string; quote: string | null; topic: string | null; item_date: string }> = []
  for (const it of parsed.items ?? []) {
    const i = Number(it.index)
    const e = entries[i]
    if (!e || (it.kind !== 'petition' && it.kind !== 'evidence') || !it.quote) continue
    rows.push({ person_id: personId, journal_id: e.id, kind: it.kind, quote: it.quote.slice(0, 400), topic: it.topic?.slice(0, 80) ?? null, item_date: e.journal_date })
  }
  // Every entry gets a 'none' marker row — that makes "scanned" an exact count
  // (one marker per journal) regardless of how many petitions it also produced.
  entries.forEach(e => {
    rows.push({ person_id: personId, journal_id: e.id, kind: 'none', quote: null, topic: null, item_date: e.journal_date })
  })
  const { error } = await supabase.from('prayer_scan_items').insert(rows)
  if (error) throw new Error(error.message)
  return rows.filter(r => r.kind !== 'none').length
}

// ── Pass 2: pair petitions with later evidence ──
async function matchPhase(personId: string): Promise<number> {
  type Item = { journal_id: string; kind: string; quote: string; topic: string | null; item_date: string }
  const items = await fetchAll<Item>((from, to) =>
    supabase
      .from('prayer_scan_items')
      .select('journal_id, kind, quote, topic, item_date')
      .eq('person_id', personId)
      .neq('kind', 'none')
      .order('item_date', { ascending: true })
      .range(from, to)
  )
  // Re-scanned entries can leave duplicate extractions — keep one per quote.
  const seen = new Set<string>()
  const deduped = items.filter(i => {
    const k = `${i.journal_id}|${i.kind}|${i.quote}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const petitions = deduped.filter(i => i.kind === 'petition')
  const evidence = deduped.filter(i => i.kind === 'evidence')
  if (!petitions.length || !evidence.length) return 0

  const pList = petitions.map((p, i) => `P${i} | ${p.item_date} | ${p.topic} | ${p.quote}`).join('\n')
  const eList = evidence.map((e, i) => `E${i} | ${e.item_date} | ${e.topic} | ${e.quote}`).join('\n')

  const { text } = await generateText({
    model: anthropic(MODEL),
    maxOutputTokens: 16000, // adaptive thinking on by default — matching benefits from it
    messages: [{
      role: 'user',
      content: `Below are PETITIONS (specific prayers) and EVIDENCE (reported provisions/outcomes) extracted from one person's journals, each as: id | date | topic | quote.

Pair each petition with evidence that plausibly shows GOD ANSWERED THAT SPECIFIC PRAYER. Rules:
- The evidence date must be ON OR AFTER the petition date.
- Match on substance (same person, situation, or need) — not vague thematic similarity.
- confidence "strong" = clearly the same matter resolved. "possible" = likely related but not certain.
- Most petitions will have NO match — that's expected. Never force a pair.
- For each pair, write arc (one warm sentence, second person, describing the journey from ask to answer, e.g. "You asked for a solution at the preschool in March — by May, God had provided the director.")

Respond ONLY with JSON:
{"pairs":[{"p":0,"e":3,"confidence":"strong"|"possible","arc":"..."}]}

PETITIONS:
${pList}

EVIDENCE:
${eList}`,
    }],
  })
  const parsed = firstJson(text) as { pairs?: Array<{ p?: number; e?: number; confidence?: string; arc?: string }> }
  let inserted = 0
  for (const pair of parsed.pairs ?? []) {
    const p = petitions[Number(pair.p)]
    const ev = evidence[Number(pair.e)]
    if (!p || !ev || ev.item_date < p.item_date) continue
    const { error } = await supabase.from('answered_prayers').insert({
      person_id: personId,
      prayer_journal_id: p.journal_id,
      prayer_date: p.item_date,
      prayer_quote: p.quote,
      answer_journal_id: ev.journal_id,
      answer_date: ev.item_date,
      answer_quote: ev.quote,
      arc_summary: pair.arc?.slice(0, 500) ?? null,
      confidence: pair.confidence === 'strong' ? 'strong' : 'possible',
    })
    if (!error) inserted++ // unique index silently skips re-runs
  }
  return inserted
}

async function chainNext(origin: string, personId: string, hop: number) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 3000)
  try {
    await fetch(`${origin}/api/soap/answered/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, hop: hop + 1 }),
      signal: ctrl.signal,
    })
  } catch { /* abort expected */ }
  clearTimeout(t)
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const { personId, hop = 0 } = await request.json()
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })

  // Entries with text that haven't been scanned yet, diffed in JS. Both sides
  // MUST be paginated — Supabase silently caps any single response at 1,000
  // rows, which would truncate the scanned-set and re-scan entries forever.
  const [entryRows, scannedRows] = await Promise.all([
    fetchAll<EntryLite>((from, to) =>
      supabase.from('soap_journals').select('id, journal_date, ocr_text').eq('person_id', personId).not('ocr_text', 'is', null).order('id').range(from, to)
    ),
    fetchAll<{ journal_id: string }>((from, to) =>
      supabase.from('prayer_scan_items').select('journal_id').eq('person_id', personId).order('id').range(from, to)
    ),
  ])
  const scanned = new Set(scannedRows.map(r => r.journal_id))
  const unscanned = entryRows
    .filter(e => !scanned.has(e.id) && (e.ocr_text || '').trim().length > 40)
    .sort((a, b) => a.journal_date.localeCompare(b.journal_date))

  // ── Everything scanned → run the match phase once ──
  if (!unscanned.length) {
    const { count: existing } = await supabase
      .from('answered_prayers')
      .select('id', { count: 'exact', head: true })
      .eq('person_id', personId)
    if ((existing ?? 0) > 0) return NextResponse.json({ phase: 'done', remaining: 0, pairs: existing })
    const pairs = await matchPhase(personId)
    return NextResponse.json({ phase: 'matched', remaining: 0, pairs })
  }

  // ── Extraction with a time budget; unfinished chunks stay unscanned ──
  const READ_DEADLINE = startedAt + 200_000
  const chunks: EntryLite[][] = []
  for (let i = 0; i < unscanned.length; i += CHUNK) chunks.push(unscanned.slice(i, i + CHUNK))
  let found = 0
  let processedChunks = 0
  await mapPool(chunks.slice(0, 8), 4, async chunk => {
    if (Date.now() > READ_DEADLINE) return
    try {
      found += await extractChunk(chunk, personId)
      processedChunks++
    } catch (e) {
      console.error('answered scan chunk failed', e)
    }
  })

  const scannedNow = Math.min(processedChunks * CHUNK, unscanned.length)
  const remaining = Math.max(0, unscanned.length - scannedNow)

  if (processedChunks > 0 && hop < 40) {
    const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : request.nextUrl.origin
    after(() => chainNext(origin, personId, hop))
  }

  return NextResponse.json({ phase: 'scanning', scanned: scannedNow, found, remaining })
}
