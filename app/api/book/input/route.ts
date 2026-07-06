import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Voice/text answers the author records against the book draft's
// [FOR THE INTERVIEW] gap markers.

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('personId')
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })
  const { data, error } = await supabase
    .from('book_inputs')
    .select('marker_key, question, answer, updated_at')
    .eq('person_id', personId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inputs: data ?? [] })
}

export async function POST(request: NextRequest) {
  const { personId, markerKey, question, answer } = await request.json()
  if (!personId || !markerKey || typeof answer !== 'string') {
    return NextResponse.json({ error: 'personId, markerKey, answer required' }, { status: 400 })
  }
  const { error } = await supabase
    .from('book_inputs')
    .upsert(
      {
        person_id: personId,
        marker_key: markerKey,
        question: (question ?? '').slice(0, 2000),
        answer: answer.slice(0, 20000),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'person_id,marker_key' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
