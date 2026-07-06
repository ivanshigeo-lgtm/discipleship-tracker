import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Assemble a book's draft (title page + chapters) as markdown in the same
// shape the reader's parser expects.
export async function GET(request: NextRequest) {
  const bookId = request.nextUrl.searchParams.get('bookId')
  if (!bookId) return NextResponse.json({ error: 'bookId required' }, { status: 400 })

  const [{ data: book }, { data: chapters }] = await Promise.all([
    supabase.from('books').select('id, person_id, title, premise, status, outline').eq('id', bookId).single(),
    supabase.from('book_chapters').select('idx, title, content').eq('book_id', bookId).order('idx', { ascending: true }),
  ])
  if (!book) return NextResponse.json({ error: 'book not found' }, { status: 404 })

  const parts: string[] = [
    `# ${book.title}`,
    book.premise ? `*${book.premise}*` : '',
    '## Contents',
    (chapters ?? []).map((c, i) => `${i + 1}. ${c.title}`).join('\n'),
  ].filter(Boolean)

  for (const c of chapters ?? []) {
    parts.push('---')
    parts.push(`Chapter ${c.idx + 1}\n${c.title}`)
    parts.push(c.content)
  }

  return NextResponse.json({
    personId: book.person_id,
    title: book.title,
    status: book.status,
    chapters: chapters?.length ?? 0,
    plannedChapters: Array.isArray(book.outline) ? book.outline.length : null,
    md: parts.join('\n\n'),
  })
}
