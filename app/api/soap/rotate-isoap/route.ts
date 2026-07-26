import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 120

// Cross-app SOAP rotate — forwards a rotate of an iSOAP-owned photo to iSOAP (the
// system of record), so a SOAP photo captured on either app can be turned upright
// from either app and both see it rotated. The sibling /api/soap/rotate handles
// LOCAL soap_journals photos; this route handles entries whose id lives in iSOAP
// (freshly captured pages ingest into iSOAP, so their id is NOT a soap_journals
// id — /api/soap/rotate 404'd on them and the button did nothing). Same
// shared-secret auth (ISOAP_INGEST_SECRET). iSOAP rotates the stored image in
// place under an ownership guard; only that entry's photo is touched.
//
// Body (JSON): { personId, entryId, direction? }  (direction 'cw' | 'ccw')
// Returns iSOAP's { ok, entry_id } response.

const ISOAP_ROTATE_URL = (
  process.env.ISOAP_INGEST_URL || 'https://api.isoap.app/api/entries/ingest'
).replace(/\/ingest$/, '/rotate')

export async function POST(request: NextRequest) {
  const secret = process.env.ISOAP_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ISOAP_INGEST_SECRET not configured' }, { status: 500 })
  }

  let body: { personId?: string; entryId?: string; direction?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { personId, entryId, direction } = body
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
    resp = await fetch(ISOAP_ROTATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
      body: JSON.stringify({
        isoap_user_id: link.isoap_user_id,
        entry_id: entryId,
        direction: direction === 'ccw' ? 'ccw' : 'cw',
      }),
    })
  } catch (e) {
    console.error('iSOAP rotate fetch failed:', e)
    return NextResponse.json({ error: 'iSOAP rotate unreachable' }, { status: 502 })
  }

  const result = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    console.error('iSOAP rotate error:', resp.status, result)
    return NextResponse.json({ error: result?.error || 'iSOAP rotate failed' }, { status: resp.status })
  }
  return NextResponse.json(result)
}
