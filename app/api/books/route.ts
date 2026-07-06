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

// Books: list them (with interview progress), and start a new one — which
// creates the book and has the ghostwriter read the person's journals to
// generate its interview questions.

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('personId')
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })

  const { data: books, error } = await supabase
    .from('books')
    .select('id, title, premise, status, created_at')
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const withProgress = await Promise.all(
    (books ?? []).map(async b => {
      const { data: qs } = await supabase
        .from('book_questions')
        .select('id, answer, photo_urls')
        .eq('book_id', b.id)
      const total = qs?.length ?? 0
      const answered = (qs ?? []).filter(q => (q.answer && q.answer.trim()) || (q.photo_urls?.length ?? 0) > 0).length
      return { ...b, totalQuestions: total, answeredQuestions: answered }
    })
  )
  return NextResponse.json({ books: withProgress })
}

const firstJson = (text: string) => {
  const m = text.match(/\{[\s\S]*\}/)
  return JSON.parse(m ? m[0] : text)
}

export async function POST(request: NextRequest) {
  const { personId, title, premise } = await request.json()
  if (!personId || !title?.trim()) {
    return NextResponse.json({ error: 'personId and title required' }, { status: 400 })
  }

  const { data: book, error: bookErr } = await supabase
    .from('books')
    .insert({ person_id: personId, title: title.trim().slice(0, 200), premise: (premise ?? '').trim().slice(0, 2000), status: 'generating' })
    .select('id')
    .single()
  if (bookErr || !book) return NextResponse.json({ error: bookErr?.message ?? 'could not create book' }, { status: 500 })

  // Gather corpus context: entries matching the topic's key words, plus the
  // most recent ones, capped for the prompt.
  const words = `${title} ${premise ?? ''}`.toLowerCase().match(/[a-z]{5,}/g) ?? []
  const keyWords = Array.from(new Set(words)).slice(0, 6)
  const seen = new Set<string>()
  const entries: { journal_date: string; ocr_text: string }[] = []
  for (const w of keyWords) {
    const { data } = await supabase
      .from('soap_journals')
      .select('id, journal_date, ocr_text')
      .eq('person_id', personId)
      .ilike('ocr_text', `%${w}%`)
      .limit(20)
    for (const e of data ?? []) {
      if (!seen.has(e.id)) { seen.add(e.id); entries.push(e) }
    }
  }
  const { data: recent } = await supabase
    .from('soap_journals')
    .select('id, journal_date, ocr_text')
    .eq('person_id', personId)
    .not('ocr_text', 'is', null)
    .order('journal_date', { ascending: false })
    .limit(25)
  for (const e of recent ?? []) {
    if (!seen.has(e.id)) { seen.add(e.id); entries.push(e) }
  }
  entries.sort((a, b) => a.journal_date.localeCompare(b.journal_date))
  const corpus = entries.slice(0, 80).map(e => `--- ${e.journal_date} ---\n${(e.ocr_text ?? '').slice(0, 700)}`).join('\n\n')

  const { text } = await generateText({
    model: anthropic('claude-opus-4-8'),
    providerOptions: { anthropic: { thinking: { type: 'adaptive' } } },
    maxOutputTokens: 8000,
    messages: [{
      role: 'user',
      content: `You are a ghostwriter preparing to write a book for the author of the journal entries below. The author has chosen the topic; your job right now is NOT to write — it is to generate the interview: the questions whose answers you need to write this book truthfully and vividly.

BOOK TITLE: ${title}
PREMISE (author's words): ${premise || '(none given — infer from the title and the journals)'}

RULES:
- 10 to 14 questions, ordered.
- Factual/timeline questions that MUST be resolved come first.
- Then story questions: sensory, specific, one moment at a time — questions that retrieve scenes, names, numbers, first moments; not "how did you feel."
- Ask about what the journals conspicuously DON'T say.
- Each question gets a one-line "why" explaining what it gives the book.
- Warm, direct tone. The author will answer by voice memo.

Respond ONLY with JSON:
{"questions":[{"question":"...","why":"..."}]}

JOURNAL ENTRIES (selection):
${corpus}`,
    }],
  })

  try {
    const parsed = firstJson(text) as { questions?: Array<{ question?: string; why?: string }> }
    const rows = (parsed.questions ?? [])
      .filter(q => q.question?.trim())
      .slice(0, 14)
      .map((q, i) => ({ book_id: book.id, idx: i, question: q.question!.trim().slice(0, 1500), why: (q.why ?? '').trim().slice(0, 500) }))
    if (!rows.length) throw new Error('no questions generated')
    const { error: qErr } = await supabase.from('book_questions').insert(rows)
    if (qErr) throw new Error(qErr.message)
    await supabase.from('books').update({ status: 'interviewing', updated_at: new Date().toISOString() }).eq('id', book.id)
    return NextResponse.json({ bookId: book.id, questions: rows.length })
  } catch (e) {
    await supabase.from('books').delete().eq('id', book.id)
    return NextResponse.json({ error: `Question generation failed — try again. (${String(e).slice(0, 120)})` }, { status: 502 })
  }
}
