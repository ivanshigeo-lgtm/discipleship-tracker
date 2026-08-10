// Private read-back of the /assessment visit count. Admin-only: the caller
// passes their Supabase access token, we resolve it to a people row and require
// is_admin (Jonavan is the sole admin). Counting happens in the
// assessment_visit_stats() SQL function so distinct-visitor math is done in PG.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  let accessToken: string | undefined
  try {
    ;({ accessToken } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: { user } } = await admin.auth.getUser(accessToken)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: person } = await admin
    .from('people')
    .select('is_admin')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!person?.is_admin) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  const [{ data: stats, error }, { data: leads, error: leadsError }] = await Promise.all([
    admin.rpc('assessment_visit_stats'),
    admin.rpc('assessment_leads'),
  ])
  if (error || leadsError) {
    console.error('visit-stats rpc failed:', error ?? leadsError)
    return NextResponse.json({ error: 'Could not load stats' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, stats, leads })
}
