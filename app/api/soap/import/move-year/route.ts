import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Re-file an entire import batch under a different year, keeping each entry's
// month/day. Used when the pages carry a written year that disagrees with the
// year picked at import time.

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

export async function POST(request: NextRequest) {
  const { batchId, toYear } = await request.json()
  const yr = Number(toYear)
  if (!batchId || !Number.isInteger(yr) || yr < 1990 || yr > 2100) {
    return NextResponse.json({ error: 'batchId and a valid toYear required' }, { status: 400 })
  }

  const { data: rows, error } = await supabase
    .from('soap_journals')
    .select('id, journal_date')
    .eq('import_batch_id', batchId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let moved = 0
  for (const row of (rows ?? []) as { id: string; journal_date: string }[]) {
    const [, m, d] = row.journal_date.split('-')
    // Feb 29 → Feb 28 when the target year isn't a leap year.
    const day = m === '02' && d === '29' && !isLeap(yr) ? '28' : d
    const { error: upErr } = await supabase
      .from('soap_journals')
      .update({ journal_date: `${yr}-${m}-${day}`, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (!upErr) moved++
  }

  return NextResponse.json({ moved, total: rows?.length ?? 0 })
}
