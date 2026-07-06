import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Personalized book pitches: the ghostwriter scans a spread of the person's
// journals and suggests books that are actually in there — each with a real
// hook (a quote/date from their own pages). Cached; POST regenerates.

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('personId')
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })
  const { data } = await supabase
    .from('book_suggestions')
    .select('suggestions, created_at')
    .eq('person_id', personId)
    .single()
  return NextResponse.json({ suggestions: data?.suggestions ?? null, createdAt: data?.created_at ?? null })
}

const firstJson = (text: string) => {
  const m = text.match(/\{[\s\S]*\}/)
  return JSON.parse(m ? m[0] : text)
}

export async function POST(request: NextRequest) {
  const { personId } = await request.json()
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })

  // Sample the corpus across its whole span: oldest-first and newest-first
  // pages, stride-sampled so every season is represented.
  const [{ data: early }, { data: late }] = await Promise.all([
    supabase.from('soap_journals').select('journal_date, ocr_text').eq('person_id', personId)
      .not('ocr_text', 'is', null).order('journal_date', { ascending: true }).limit(600),
    supabase.from('soap_journals').select('journal_date, ocr_text').eq('person_id', personId)
      .not('ocr_text', 'is', null).order('journal_date', { ascending: false }).limit(600),
  ])
  const seen = new Set<string>()
  const pool: { journal_date: string; ocr_text: string }[] = []
  for (const e of [...(early ?? []), ...(late ?? [])]) {
    const k = e.journal_date + (e.ocr_text ?? '').slice(0, 40)
    if (!seen.has(k)) { seen.add(k); pool.push(e) }
  }
  pool.sort((a, b) => a.journal_date.localeCompare(b.journal_date))
  const stride = Math.max(1, Math.floor(pool.length / 130))
  const sample = pool.filter((_, i) => i % stride === 0).slice(0, 130)
  if (sample.length < 10) {
    return NextResponse.json({ error: 'Not enough journal entries yet to suggest books.' }, { status: 400 })
  }
  const corpus = sample.map(e => `--- ${e.journal_date} ---\n${(e.ocr_text ?? '').slice(0, 350)}`).join('\n\n')

  const { text } = await generateText({
    model: anthropic('claude-sonnet-5'),
    maxOutputTokens: 8000,
    messages: [{
      role: 'user',
      content: `You are a ghostwriter scanning a person's journal entries (sampled across their whole span below) to pitch them BOOKS that are already hiding in their own pages.

Suggest 5-6 books. Rules:
- Each must be grounded in material you can actually see in the entries — themes that recur, seasons with weight, events, people, arcs.
- title: evocative, specific to THEIR material (not generic).
- premise: 1-2 sentences, second person ("Your...").
- hook: the proof — a short verbatim quote from their entries WITH its date, chosen to make them feel seen.
- Prefer variety: a testimony book, a season/event book, a people book, a lessons book, etc., as the material allows.

Respond ONLY with JSON:
{"suggestions":[{"title":"...","premise":"...","hook":"\\"...\\" — from your journal, <date>"}]}

JOURNAL SAMPLE:
${corpus}`,
    }],
  })

  try {
    const parsed = firstJson(text) as { suggestions?: Array<{ title?: string; premise?: string; hook?: string }> }
    const suggestions = (parsed.suggestions ?? [])
      .filter(s => s.title?.trim())
      .slice(0, 6)
      .map(s => ({ title: s.title!.trim().slice(0, 150), premise: (s.premise ?? '').trim().slice(0, 500), hook: (s.hook ?? '').trim().slice(0, 400) }))
    if (!suggestions.length) throw new Error('no suggestions')
    await supabase.from('book_suggestions').upsert(
      { person_id: personId, suggestions, created_at: new Date().toISOString() },
      { onConflict: 'person_id' }
    )
    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ error: 'Suggestion generation failed — try again.' }, { status: 502 })
  }
}
