import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60

// Reads a person's SOAP journal FROM iSOAP (the system of record) and maps it
// into WikiChurch's SoapJournal shape, so the journey UI can merge these with
// any remaining local soap_journals rows. Only linked people (isoap_links) have
// an iSOAP journal; unlinked people get an empty list and fall back to local.
//
// Body (JSON): { personId, includeText?: boolean, limit?: number }
// Returns { entries: SoapJournal[] } (visibility defaults to 'private' — the
// coach-visibility overlay is a separate build).

const ISOAP_LIST_URL = (
  process.env.ISOAP_INGEST_URL || 'https://api.isoap.app/api/entries/ingest'
).replace(/\/ingest$/, '/list')

export async function POST(request: NextRequest) {
  const secret = process.env.ISOAP_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ISOAP_INGEST_SECRET not configured' }, { status: 500 })
  }

  let body: { personId?: string; includeText?: boolean; limit?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const personId = body.personId
  if (!personId) {
    return NextResponse.json({ error: 'personId required' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()

  const { data: link } = await admin
    .from('isoap_links')
    .select('isoap_user_id')
    .eq('wc_person_id', personId)
    .maybeSingle()

  // Not linked → no iSOAP journal; caller uses local soap_journals only.
  if (!link?.isoap_user_id) {
    return NextResponse.json({ entries: [] })
  }

  let resp: Response
  try {
    resp = await fetch(ISOAP_LIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
      body: JSON.stringify({
        isoap_user_id: link.isoap_user_id,
        include_text: !!body.includeText,
        limit: body.limit,
      }),
    })
  } catch (e) {
    console.error('iSOAP list unreachable:', e)
    return NextResponse.json({ error: 'iSOAP list unreachable' }, { status: 502 })
  }

  const json = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    console.error('iSOAP list error:', resp.status, json)
    return NextResponse.json({ error: json?.error || 'iSOAP list failed' }, { status: resp.status })
  }

  type IsoapEntry = {
    id: string
    kind?: string | null
    entry_date: string
    date_precision?: string
    date_reviewed?: boolean | null
    scripture?: string | null
    ocr_text?: string | null
    body?: string | null
    photo_url?: string | null
    created_at: string
    updated_at: string
  }
  const mapped = ((json.entries as IsoapEntry[]) ?? [])
    .filter((e) => !!e.entry_date) // can't place a truly-undated entry on the timeline
    .map((e) => ({
    id: e.id,
    person_id: personId,
    journal_date: e.entry_date,
    photo_url: e.photo_url ?? null,
    photo_urls: null,
    // Text-only entries carry their content in `body`; photo entries in `ocr_text`.
    // Fold both into ocr_text so the existing display + search path renders them.
    ocr_text: e.ocr_text ?? e.body ?? null,
    scripture_reference: e.scripture ?? null,
    summary: null,
    visibility: 'private' as 'private' | 'coach' | 'group' | 'constellation',
    // Group ids a 'group'-shared entry targets; null = all my groups. Lets
    // clients preload the share picker with the current selection.
    victory_group_ids: null as string[] | null,
    date_precision: (e.date_precision === 'year' ? 'year' : 'day') as 'day' | 'year',
    date_reviewed: e.date_reviewed ?? false,
    source: 'imported' as const,
    created_at: e.created_at,
    updated_at: e.updated_at,
    // Marks the row as living in iSOAP, not soap_journals — so edit/delete paths
    // can route correctly later. Harmless extra field for read-only rendering.
    isoap: true,
  }))

  // Coach-visibility overlay: iSOAP entries default to private, but the disciple
  // may have opted specific entries into sharing (isoap_entry_visibility). This
  // is a self-view, so reflect the owner's chosen level back to them — the coach
  // read path (/api/soap/shared) enforces who may actually see a shared entry.
  // Fetch by person, not by entry id: a decade-scale journal is thousands of
  // ids, and an .in() that long overflows the request URL and fails silently —
  // which showed every entry as "Just me". Overlay rows only exist for entries
  // the person actually shared, so the per-person set is always small.
  if (mapped.length > 0) {
    const { data: overrides, error: ovErr } = await admin
      .from('isoap_entry_visibility')
      .select('isoap_entry_id, visibility, victory_group_ids, victory_group_id')
      .eq('wc_person_id', personId)
    if (ovErr) console.error('visibility overlay read failed:', ovErr)
    if (overrides?.length) {
      const byId = new Map(overrides.map((o) => [o.isoap_entry_id, o]))
      for (const m of mapped) {
        const o = byId.get(m.id)
        if (!o) continue
        const v = o.visibility
        if (v === 'coach' || v === 'group' || v === 'constellation') {
          m.visibility = v
          // Stored group targets, so share pickers can preload the current
          // selection instead of reopening blind to "All my groups".
          m.victory_group_ids = o.victory_group_ids?.length
            ? o.victory_group_ids
            : o.victory_group_id
              ? [o.victory_group_id]
              : null
        }
      }
    }
  }

  return NextResponse.json({ entries: mapped })
}
