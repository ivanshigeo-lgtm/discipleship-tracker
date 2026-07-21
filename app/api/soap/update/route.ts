import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 120

// Cross-app SOAP edit — forwards an edit of an iSOAP-owned entry to iSOAP (the
// system of record), so a SOAP written on either app can be edited from either
// app and both see the change. Same shared-secret auth (ISOAP_INGEST_SECRET).
// iSOAP updates the one row by id under an ownership guard; nothing is deleted.
//
// Body (JSON): { personId, entryId, entry_date?, scripture?, body?, ocr_text?,
//   photo_base64?, content_type? } — only the fields sent are changed.
// Returns iSOAP's { entry_id, entry } response.

const ISOAP_UPDATE_URL = (
  process.env.ISOAP_INGEST_URL || 'https://api.isoap.app/api/entries/ingest'
).replace(/\/ingest$/, '/update')

export async function POST(request: NextRequest) {
  const secret = process.env.ISOAP_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ISOAP_INGEST_SECRET not configured' }, { status: 500 })
  }

  let body: {
    personId?: string
    entryId?: string
    entry_date?: string
    scripture?: string | null
    body?: string | null
    ocr_text?: string | null
    photo_base64?: string
    content_type?: string
  }
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

  // Forward only the fields the caller sent (leave the rest untouched in iSOAP).
  const payload: Record<string, unknown> = {
    isoap_user_id: link.isoap_user_id,
    entry_id: entryId,
  }
  if (body.entry_date !== undefined) payload.entry_date = body.entry_date
  if (body.scripture !== undefined) payload.scripture = body.scripture
  if (body.body !== undefined) payload.body = body.body
  if (body.ocr_text !== undefined) payload.ocr_text = body.ocr_text
  if (body.photo_base64 !== undefined) {
    payload.photo_base64 = body.photo_base64
    payload.content_type = body.content_type || 'image/jpeg'
  }

  let resp: Response
  try {
    resp = await fetch(ISOAP_UPDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    console.error('iSOAP update fetch failed:', e)
    return NextResponse.json({ error: 'iSOAP update unreachable' }, { status: 502 })
  }

  const result = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    console.error('iSOAP update error:', resp.status, result)
    return NextResponse.json({ error: result?.error || 'iSOAP update failed' }, { status: resp.status })
  }
  return NextResponse.json(result)
}
