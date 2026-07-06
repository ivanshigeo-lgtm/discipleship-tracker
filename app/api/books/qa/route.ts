import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Interview Q&A for one book: fetch the questions, save an answer.

export async function GET(request: NextRequest) {
  const bookId = request.nextUrl.searchParams.get('bookId')
  if (!bookId) return NextResponse.json({ error: 'bookId required' }, { status: 400 })
  const [{ data: book }, { data: questions, error }] = await Promise.all([
    supabase.from('books').select('id, title, premise, status').eq('id', bookId).single(),
    supabase
      .from('book_questions')
      .select('id, idx, question, why, answer, photo_urls, not_ready')
      .eq('book_id', bookId)
      .order('idx', { ascending: true }),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ book, questions: questions ?? [] })
}

export async function POST(request: NextRequest) {
  const { questionId, answer, photoUrls, notReady } = await request.json()
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 })
  const photos = Array.isArray(photoUrls)
    ? (photoUrls as unknown[]).filter((u): u is string => typeof u === 'string').slice(0, 12)
    : []
  const hasContent = Boolean((answer ?? '').trim()) || photos.length > 0
  const { error } = await supabase
    .from('book_questions')
    .update({
      answer: (answer ?? '').slice(0, 20000),
      photo_urls: photos,
      not_ready: Boolean(notReady) && !hasContent,
      answered_at: hasContent ? new Date().toISOString() : null,
    })
    .eq('id', questionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
