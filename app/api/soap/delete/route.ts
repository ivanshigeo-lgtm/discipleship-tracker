import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'

// Cross-app SOAP delete — forwards a delete of an iSOAP-owned entry to iSOAP (the
// system of record), so a SOAP written on either app can be removed from either
// app and both see it gone. Same shared-secret auth (ISOAP_INGEST_SECRET). iSOAP
// deletes the one row by id under an ownership guard; only that entry is touched.
//
// Body (JSON): { personId, entryId }
// Returns iSOAP's { deleted, entry_id } response.

const ISOAP_DELETE_URL = (
  process.env.ISOAP_INGEST_URL || 'https://api.isoap.app/api/entries/ingest'
).replace(/\/ingest$/, '/delete')

export async function POST(request: NextRequest) {
  const secret = process.env.ISOAP_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ISOAP_INGEST_SECRET not configured' }, { status: 500 })
  }

  let body: { personId?: string; entryId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { personId, entryId } = body
  if (!personId || !entryId) {
    return NextResponse.json({ error: 'personId and entryId required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: link } = await admin
    .from('isoap_links')
    .select('isoap_user_id')
    .eq('wc_person_id', personId)
    .maybeSingle()
  if (!link?.isoap_user_id) {
    return NextResponse.json({ error: 'person is not linked to an iSOAP account' }, { status: 400 })
  }

  let resp: Response
  try {
    resp = await fetch(ISOAP_DELETE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
      body: JSON.stringify({ isoap_user_id: link.isoap_user_id, entry_id: entryId }),
    })
  } catch (e) {
    console.error('iSOAP delete fetch failed:', e)
    return NextResponse.json({ error: 'iSOAP delete unreachable' }, { status: 502 })
  }

  const result = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    console.error('iSOAP delete error:', resp.status, result)
    return NextResponse.json({ error: result?.error || 'iSOAP delete failed' }, { status: resp.status })
  }
  return NextResponse.json(result)
}
