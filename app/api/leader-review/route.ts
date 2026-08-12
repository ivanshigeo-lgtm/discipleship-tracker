// Leader Review scorecard, assembled server-side and filtered to what the
// caller is allowed to see. Both the web card and the native card read this.
//
// Why this runs on the server rather than in the client like the old card:
// RLS is still read-permissive church-wide (Phase 1 locked down writes only),
// so "a leader sees only their own scorecard" cannot be enforced by a client
// that simply chooses not to render other people. buildLeaderReview() decides
// what goes in the payload from the caller's identity — an admin gets every
// leader's card, anyone else gets the team totals plus their own card, and the
// rest never leaves the server.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildLeaderReview, type LeaderReviewRows } from '../../../lib/leaderReview'

export const runtime = 'nodejs'
// Always recomputed: the card is a live read of this week, never a snapshot.
export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Supabase caps a select at 1000 rows; these tables are already past that.
async function all<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function POST(request: NextRequest) {
  let accessToken: string | undefined
  try {
    ;({ accessToken } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: { user } } = await admin.auth.getUser(accessToken)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: person } = await admin
    .from('people')
    .select('id, is_admin, is_test, current_stage')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!person) return NextResponse.json({ error: 'No profile for this account' }, { status: 403 })

  try {
    const [
      people, groups, memberships, connections, engagements,
      pipelineEvents, attendance, soapVisibility, soapLinks, meetingStatuses,
    ] = await Promise.all([
      all('people', 'id,name,current_stage,status,is_test,is_admin'),
      all('victory_groups', 'id,name,owner_person_id,meeting_day,meeting_days,is_test'),
      all('person_victory_groups', 'person_id,victory_group_id,status'),
      all('discipleship_connections', 'discipler_person_id,disciple_person_id'),
      all('engagements', 'id,person_id,created_by_person_id,meeting_type,status,follow_up_date,follow_up_time,location,description'),
      all('pipeline_events', 'person_id,to_stage,from_stage,created_at'),
      all('group_attendance', 'person_id,victory_group_id,meeting_date,attended'),
      all('isoap_entry_visibility', 'isoap_entry_id,wc_person_id,journal_date'),
      all('isoap_links', 'wc_person_id'),
      all('group_meeting_status', 'victory_group_id,meeting_date,status,rescheduled_to'),
    ])

    const payload = buildLeaderReview(
      {
        people, groups, memberships, connections, engagements,
        pipelineEvents, attendance, soapVisibility, soapLinks, meetingStatuses,
      } as unknown as LeaderReviewRows,
      { id: person.id, isAdmin: Boolean(person.is_admin), isTest: Boolean(person.is_test) },
    )

    return NextResponse.json({ ok: true, ...payload })
  } catch (e) {
    console.error('leader-review failed:', e)
    return NextResponse.json({ error: 'Could not build the leader review' }, { status: 500 })
  }
}
