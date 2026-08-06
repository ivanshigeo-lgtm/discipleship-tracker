import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 120

// Cross-app SOAP ingest — forwards a WikiChurch daily-SOAP capture to iSOAP,
// which is the single system of record for journal entries. iSOAP owns identity
// provisioning + the OCR pipeline; we never hold the iSOAP service-role key.
// Auth to iSOAP is a shared secret (ISOAP_INGEST_SECRET == iSOAP's INGEST_SECRET).
//
// Three identity-resolution modes (see isoap_links):
//   • explicit link  — a pre-seeded isoap_links row → target that iSOAP user.
//   • provision-new  — no link → iSOAP resolves-or-creates by email; on create
//                      we persist the returned isoap_user_id back into isoap_links.
//
// entry_date (the user-chosen day) is authoritative — iSOAP will not let the
// date OCR'd off the page override it.

const ISOAP_INGEST_URL =
  process.env.ISOAP_INGEST_URL || 'https://api.isoap.app/api/entries/ingest'

export async function POST(request: NextRequest) {
  const secret = process.env.ISOAP_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ISOAP_INGEST_SECRET not configured' }, { status: 500 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const textField = formData.get('text')
  const text = typeof textField === 'string' ? textField.trim() : ''
  const personId = formData.get('personId') as string | null
  const journalDate = formData.get('journal_date') as string | null
  const scriptureField = formData.get('scripture')
  const scripture = typeof scriptureField === 'string' && scriptureField.trim() ? scriptureField.trim() : null
  // Multi-page captures: pages after the first arrive one per request and are
  // appended to the entry the first page created (see iSOAP ingest).
  const appendField = formData.get('append_to_entry_id')
  const appendToEntryId = typeof appendField === 'string' && appendField.trim() ? appendField.trim() : null

  if (!personId || (!file && !text)) {
    return NextResponse.json({ error: 'personId and (file or text) required' }, { status: 400 })
  }
  if (file && file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (10MB max)' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  // 1. Resolve the person's email (used for provision-new + link bookkeeping).
  const { data: person, error: personErr } = await admin
    .from('people')
    .select('email')
    .eq('id', personId)
    .single()
  if (personErr || !person) {
    return NextResponse.json({ error: 'person not found' }, { status: 404 })
  }
  const email = (person.email ?? '').trim()

  // 2. Look for an explicit identity link.
  const { data: link } = await admin
    .from('isoap_links')
    .select('isoap_user_id, isoap_email')
    .eq('wc_person_id', personId)
    .maybeSingle()

  // Build the identity target for iSOAP.
  const target: { isoap_user_id?: string; email?: string; password?: string } = {}
  if (link?.isoap_user_id) {
    target.isoap_user_id = link.isoap_user_id
  } else if (email) {
    target.email = email
    target.password = process.env.ISOAP_PROVISION_PASSWORD || undefined
  } else {
    return NextResponse.json(
      { error: 'no iSOAP link and person has no email to provision with' },
      { status: 400 }
    )
  }

  // 3. Base64 the photo bytes (photo entries only).
  const photoBase64 = file
    ? Buffer.from(await file.arrayBuffer()).toString('base64')
    : null

  // 4. Forward to iSOAP — a photo capture (photo_base64) or a typed entry (text).
  let resp: Response
  try {
    resp = await fetch(ISOAP_INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-secret': secret,
      },
      body: JSON.stringify({
        ...target,
        ...(photoBase64
          ? { photo_base64: photoBase64, content_type: file!.type || 'image/jpeg' }
          : { text }),
        scripture,
        entry_date: journalDate || undefined,
        append_to_entry_id: appendToEntryId || undefined,
      }),
    })
  } catch (e) {
    console.error('iSOAP ingest fetch failed:', e)
    return NextResponse.json({ error: 'iSOAP ingest unreachable' }, { status: 502 })
  }

  const result = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    console.error('iSOAP ingest error:', resp.status, result)
    return NextResponse.json(
      { error: result?.error || 'iSOAP ingest failed' },
      { status: resp.status }
    )
  }

  // 5. If iSOAP provisioned a new account, persist the link so future entries
  //    from this person go straight to that account (idempotent upsert).
  if (result?.provisioned && result?.isoap_user_id) {
    const { error: linkErr } = await admin.from('isoap_links').upsert(
      {
        wc_person_id: personId,
        isoap_user_id: result.isoap_user_id,
        isoap_email: email || null,
      },
      { onConflict: 'wc_person_id' }
    )
    if (linkErr) console.error('isoap_links upsert failed:', linkErr.message)
  }

  return NextResponse.json(result)
}
