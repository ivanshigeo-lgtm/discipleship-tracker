import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Answered-prayer pairs for a person, newest answers first.
export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('personId')
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })

  const [{ data: pairs }, { count: scannedCount }, { count: entryCount }] = await Promise.all([
    supabase
      .from('answered_prayers')
      .select('*')
      .eq('person_id', personId)
      .neq('status', 'dismissed')
      .order('answer_date', { ascending: false }),
    supabase
      .from('prayer_scan_items')
      .select('journal_id', { count: 'exact', head: true })
      .eq('person_id', personId),
    supabase
      .from('soap_journals')
      .select('id', { count: 'exact', head: true })
      .eq('person_id', personId)
      .not('ocr_text', 'is', null),
  ])

  return NextResponse.json({
    pairs: pairs ?? [],
    scanned: scannedCount ?? 0,
    totalEntries: entryCount ?? 0,
  })
}

// Curate a pair: confirm it (it's real) or dismiss it (bad match).
export async function POST(request: NextRequest) {
  const { id, status } = await request.json()
  if (!id || !['confirmed', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'id and status (confirmed|dismissed) required' }, { status: 400 })
  }
  const { error } = await supabase.from('answered_prayers').update({ status }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
