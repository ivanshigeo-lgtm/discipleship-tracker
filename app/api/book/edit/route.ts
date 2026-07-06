import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Per-paragraph edits to the book draft. Keyed by a hash of the ORIGINAL
// paragraph text, so edits ride on top of the static manuscript and naturally
// retire when a revision replaces the paragraph.

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('personId')
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })
  const { data, error } = await supabase
    .from('book_edits')
    .select('block_key, edited_text, deleted')
    .eq('person_id', personId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ edits: data ?? [] })
}

export async function POST(request: NextRequest) {
  const { personId, blockKey, editedText, deleted, restore, originalExcerpt } = await request.json()
  if (!personId || !blockKey) {
    return NextResponse.json({ error: 'personId and blockKey required' }, { status: 400 })
  }

  // Restore = forget the edit entirely; the original paragraph returns.
  if (restore) {
    const { error } = await supabase
      .from('book_edits')
      .delete()
      .eq('person_id', personId)
      .eq('block_key', blockKey)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase
    .from('book_edits')
    .upsert(
      {
        person_id: personId,
        block_key: blockKey,
        original_excerpt: (originalExcerpt ?? '').slice(0, 300),
        edited_text: deleted ? null : String(editedText ?? '').slice(0, 20000),
        deleted: Boolean(deleted),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'person_id,block_key' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
