import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { gatherCorpus } from '../../../../lib/bookCorpus'
import { normalizeDials, dialsSummary, BookDials } from '../../../../lib/bookForms'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The middle step: turn a finished interview into a manuscript, in-app.
// Hop 0 plans the outline; each following hop writes one chapter (reading
// everything before it for voice continuity) and self-chains until done.
// Idempotent: each call looks at outline vs chapters written and does the
// next needed thing — a stalled draft resumes with one more POST.

type OutlineChapter = { title: string; brief: string }

const firstJson = (text: string) => {
  const m = text.match(/\{[\s\S]*\}/)
  return JSON.parse(m ? m[0] : text)
}

const RULES = `RULES — hard constraints:
- First person, as the author. Match the voice heard in the journal entries and interview answers: plain, warm, concrete; short declaratives when moved; scripture woven naturally if the author does so; zero self-importance.
- Use ONLY facts, scenes, names, numbers, and quotes present in the materials. NEVER invent dialogue, names, dates, or details not evidenced.
- Where material is thin, write at most a short honest passage claiming only what is known, then leave an italic inline marker exactly like: *[FOR THE INTERVIEW: <specific question>]* and move on.
- Journal quotes may be lightly cleaned for spelling but never reworded; introduce them as — *From my journal, filed under <date>:*
- 1,500-2,400 words per chapter. Prose only — no headings, no bullet lists.
- Do not re-tell what a previous chapter told; do not steal material assigned to a later chapter (foreshadow in one clause at most).`

async function chainNext(origin: string, bookId: string, hop: number) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 3000)
  try {
    await fetch(`${origin}/api/books/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookId, hop: hop + 1 }),
      signal: ctrl.signal,
    })
  } catch { /* abort expected */ }
  clearTimeout(t)
}

export async function POST(request: NextRequest) {
  const { bookId, hop = 0 } = await request.json()
  if (!bookId) return NextResponse.json({ error: 'bookId required' }, { status: 400 })
  if (hop > 15) return NextResponse.json({ error: 'hop cap reached' }, { status: 400 })

  const { data: book } = await supabase
    .from('books')
    .select('id, person_id, title, premise, status, outline, form, lens, lens_detail, duration, addons, voice')
    .eq('id', bookId)
    .single()
  if (!book) return NextResponse.json({ error: 'book not found' }, { status: 404 })
  const dials: BookDials = normalizeDials({
    form: book.form, lens: book.lens, lensDetail: book.lens_detail,
    duration: book.duration, addons: book.addons, voice: book.voice,
  })

  const { data: qa } = await supabase
    .from('book_questions')
    .select('question, why, answer, not_ready')
    .eq('book_id', bookId)
    .order('idx', { ascending: true })
  const interview = (qa ?? [])
    .map(q => `Q: ${q.question}\nA: ${q.answer?.trim() ? q.answer : q.not_ready ? '(the author was not ready to answer this — leave a [FOR THE INTERVIEW] marker if the book needs it)' : '(unanswered — leave a [FOR THE INTERVIEW] marker if the book needs it)'}`)
    .join('\n\n')

  const corpus = await gatherCorpus(supabase, book.person_id, `${book.title} ${book.premise}`)

  const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : request.nextUrl.origin

  // ── Hop 0 (or missing outline): plan the book ──
  let outline = (book.outline ?? null) as OutlineChapter[] | null
  if (!outline || !Array.isArray(outline) || !outline.length) {
    const { text } = await generateText({
      model: anthropic('claude-opus-4-8'),
      providerOptions: { anthropic: { thinking: { type: 'adaptive' } } },
      maxOutputTokens: 6000,
      messages: [{
        role: 'user',
        content: `You are ghostwriting a book from a person's journals and a completed interview. Plan the book now — units only, no writing.

BOOK TITLE: ${book.title}
PREMISE: ${book.premise || '(infer from title, interview, and journals)'}

THE BOOK'S FORM AND SETTINGS:
${dialsSummary(dials)}

${dials.form === 'devotional'
  ? `Plan the ${dials.duration ?? 30} days as WEEKLY VOLUMES: one planning unit covers about 6-7 consecutive days. For each unit give a title (the week's theme) and a brief listing each day's theme + scripture + which journal/interview material it draws on. Total days across all units must equal ${dials.duration ?? 30}.`
  : 'Plan 5 to 9 units (chapters/lessons/stories/letters per the form) that use the strongest material. Each unit: a short evocative title + a 2-3 sentence brief naming exactly which interview answers and journal threads it draws on, and what it must NOT touch (assigned elsewhere). The final unit should land the book’s central truth.'}

Respond ONLY with JSON:
{"chapters":[{"title":"...","brief":"..."}]}

THE INTERVIEW:
${interview}

JOURNAL ENTRIES (selection):
${corpus}`,
      }],
    })
    try {
      const parsed = firstJson(text) as { chapters?: OutlineChapter[] }
      outline = (parsed.chapters ?? []).filter(c => c.title?.trim()).slice(0, 9)
      if (!outline.length) throw new Error('empty outline')
    } catch {
      return NextResponse.json({ error: 'Outline generation failed — try again.' }, { status: 502 })
    }
    await supabase.from('books').update({ outline, status: 'drafting', updated_at: new Date().toISOString() }).eq('id', bookId)
    after(() => chainNext(origin, bookId, hop))
    return NextResponse.json({ phase: 'planned', chapters: outline.length })
  }

  // ── Write the next chapter ──
  const { data: written } = await supabase
    .from('book_chapters')
    .select('idx, title, content')
    .eq('book_id', bookId)
    .order('idx', { ascending: true })
  const done = written ?? []
  if (done.length >= outline.length) {
    await supabase.from('books').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', bookId)
    return NextResponse.json({ phase: 'done', chapters: done.length })
  }

  const n = done.length // next chapter index (0-based)
  const target = outline[n]
  const prior = done.map(c => `Chapter ${c.idx + 1}\n${c.title}\n\n${c.content}`).join('\n\n---\n\n')

  const { text } = await generateText({
    model: anthropic('claude-opus-4-8'),
    providerOptions: { anthropic: { thinking: { type: 'adaptive' } } },
    maxOutputTokens: 20000,
    messages: [{
      role: 'user',
      content: `You are ghostwriting "${book.title}". Write UNIT ${n + 1} of ${outline.length} — "${target.title}" — now.

THE BOOK'S FORM AND SETTINGS — this unit must be exactly this kind of writing:
${dialsSummary(dials)}
${dials.form === 'devotional' ? 'Write EVERY day in this unit\'s brief, each formatted as: **Day <number> — <title>** on its own line, then the scripture reference and verse text in italics, then the reflection, then the prayer (and challenge/question if the settings call for them). Number days continuously across the whole book.' : ''}

UNIT BRIEF: ${target.brief}

FULL BOOK OUTLINE:
${outline.map((c, i) => `${i + 1}. ${c.title} — ${c.brief}`).join('\n')}

${RULES}

Output ONLY the chapter body — no "Chapter ${n + 1}" heading, no title line, just the prose.

${prior ? `CHAPTERS WRITTEN SO FAR:\n${prior}\n\n` : ''}THE INTERVIEW:
${interview}

JOURNAL ENTRIES (selection):
${corpus}`,
    }],
  })

  const body = text.trim()
  if (body.split(/\s+/).length < 200) {
    return NextResponse.json({ error: 'Chapter came back too short — try again.' }, { status: 502 })
  }
  const { error: insErr } = await supabase
    .from('book_chapters')
    .insert({ book_id: bookId, idx: n, title: target.title, content: body })
  if (insErr) {
    // Unique violation = another hop already wrote it; just continue the chain.
    if (!/duplicate|unique/i.test(insErr.message)) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  const remaining = outline.length - (n + 1)
  if (remaining > 0) {
    after(() => chainNext(origin, bookId, hop))
  } else {
    await supabase.from('books').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', bookId)
  }
  return NextResponse.json({ phase: 'writing', chapter: n + 1, of: outline.length, remaining })
}
