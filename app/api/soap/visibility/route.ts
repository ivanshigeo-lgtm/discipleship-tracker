import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'

// Coach-visibility overlay — the disciple's opt-in control for iSOAP-sourced
// SOAP entries. iSOAP (the system of record) has no concept of coaches, so
// sharing is recorded WikiChurch-side in isoap_entry_visibility, keyed by the
// iSOAP entry id. Absence of a row = private (the safe default); a coach never
// sees an entry unless its author explicitly raised its visibility here.
//
// Body (JSON): { personId, isoap_entry_id, journal_date?, visibility }
//   visibility ∈ 'private' | 'coach' | 'group' | 'constellation'
//   'private' clears any override (deletes the row).
//
// NOTE: like the sibling SOAP routes this trusts personId (no auth guard yet —
// revisit for prod). Cross-owner spoofing is neutralised downstream: the coach
// read is scoped to the disciple's own iSOAP account (user_id), so a row that
// claims someone else's entry id simply matches nothing.

const LEVELS = ['private', 'coach', 'group', 'constellation'] as const
type Level = (typeof LEVELS)[number]

export async function POST(request: NextRequest) {
  let body: {
    personId?: string
    isoap_entry_id?: string
    journal_date?: string | null
    visibility?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const personId = body.personId
  const isoapEntryId = body.isoap_entry_id
  const visibility = body.visibility as Level | undefined
  if (!personId || !isoapEntryId) {
    return NextResponse.json({ error: 'personId and isoap_entry_id required' }, { status: 400 })
  }
  if (!visibility || !LEVELS.includes(visibility)) {
    return NextResponse.json({ error: 'visibility must be private|coach|group|constellation' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // 'private' = no override → remove any existing row. Scoped to wc_person_id so
  // a person can only ever clear their own share.
  if (visibility === 'private') {
    const { error } = await admin
      .from('isoap_entry_visibility')
      .delete()
      .eq('isoap_entry_id', isoapEntryId)
      .eq('wc_person_id', personId)
    if (error) {
      console.error('visibility clear failed:', error.message)
      return NextResponse.json({ error: 'Could not update sharing' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, visibility: 'private' })
  }

  const { error } = await admin.from('isoap_entry_visibility').upsert(
    {
      isoap_entry_id: isoapEntryId,
      wc_person_id: personId,
      visibility,
      journal_date: body.journal_date ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'isoap_entry_id' }
  )
  if (error) {
    console.error('visibility upsert failed:', error.message)
    return NextResponse.json({ error: 'Could not update sharing' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, visibility })
}
