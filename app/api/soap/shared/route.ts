import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60

// Coach read path for the coach-visibility overlay. Returns the iSOAP-sourced
// SOAP entries a coach's disciples have explicitly shared with their coach
// (isoap_entry_visibility.visibility = 'coach'), mapped into the same shape the
// local getCoachSharedSoaps feed uses, so both merge in the coach dashboard.
//
// Authorization is enforced here, server-side:
//   • only disciples connected to this coach (discipleship_connections),
//   • only their entries flagged 'coach' in the overlay,
//   • fetched from each disciple's OWN iSOAP account (user_id-scoped) via
//     entry_ids — so nothing outside the shared set is ever read or signed.
// iSOAP itself is untouched; it has no coach concept.
//
// Body (JSON): { coachPersonId, limit? }

const ISOAP_LIST_URL = (
  process.env.ISOAP_INGEST_URL || 'https://api.isoap.app/api/entries/ingest'
).replace(/\/ingest$/, '/list')

type SharedRow = {
  id: string
  person_id: string
  journal_date: string | null
  scripture_reference: string | null
  ocr_text: string | null
  summary: string | null
  visibility: 'coach'
  created_at: string
  people: { name: string } | null
  photo_url: string | null
  isoap: true
}

export async function POST(request: NextRequest) {
  const secret = process.env.ISOAP_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ISOAP_INGEST_SECRET not configured' }, { status: 500 })
  }

  let body: { coachPersonId?: string; limit?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const coachPersonId = body.coachPersonId
  if (!coachPersonId) {
    return NextResponse.json({ error: 'coachPersonId required' }, { status: 400 })
  }
  const limit = Math.min(Math.max(body.limit ?? 20, 1), 100)

  const admin = getSupabaseAdmin()

  // 1. Who does this coach disciple? (relationship = authorization)
  const { data: conns, error: connErr } = await admin
    .from('discipleship_connections')
    .select('disciple_person_id')
    .eq('discipler_person_id', coachPersonId)
  if (connErr) {
    return NextResponse.json({ error: 'Could not read connections' }, { status: 500 })
  }
  const discipleIds = Array.from(
    new Set((conns ?? []).map((c) => c.disciple_person_id).filter(Boolean))
  )
  if (discipleIds.length === 0) return NextResponse.json({ entries: [] })

  // 2. Which of their iSOAP entries did they share with their coach?
  //    Pull a generous buffer, ordered newest-first; the final slice is applied
  //    after content is fetched.
  const { data: shares, error: shareErr } = await admin
    .from('isoap_entry_visibility')
    .select('isoap_entry_id, wc_person_id, journal_date')
    .in('wc_person_id', discipleIds)
    .eq('visibility', 'coach')
    .order('journal_date', { ascending: false })
    .limit(limit * 4)
  if (shareErr) {
    return NextResponse.json({ error: 'Could not read shares' }, { status: 500 })
  }
  if (!shares?.length) return NextResponse.json({ entries: [] })

  // Group shared entry ids by disciple.
  const idsByPerson = new Map<string, string[]>()
  for (const s of shares) {
    if (!s.isoap_entry_id || !s.wc_person_id) continue
    const arr = idsByPerson.get(s.wc_person_id) ?? []
    arr.push(s.isoap_entry_id)
    idsByPerson.set(s.wc_person_id, arr)
  }
  const personIds = Array.from(idsByPerson.keys())

  // 3. Names + iSOAP identities for those disciples.
  const [{ data: people }, { data: links }] = await Promise.all([
    admin.from('people').select('id, name').in('id', personIds),
    admin.from('isoap_links').select('wc_person_id, isoap_user_id').in('wc_person_id', personIds),
  ])
  const nameById = new Map((people ?? []).map((p) => [p.id, p.name as string]))
  const isoapUserById = new Map(
    (links ?? []).map((l) => [l.wc_person_id, l.isoap_user_id as string])
  )

  // 4. Fetch each disciple's shared entries from iSOAP (their own account only),
  //    in parallel. Best-effort per disciple — one failure doesn't sink the feed.
  type IsoapEntry = {
    id: string
    entry_date: string
    scripture?: string | null
    ocr_text?: string | null
    photo_url?: string | null
    created_at: string
  }

  const perPerson = await Promise.all(
    personIds.map(async (pid): Promise<SharedRow[]> => {
      const isoapUserId = isoapUserById.get(pid)
      const entryIds = idsByPerson.get(pid)
      if (!isoapUserId || !entryIds?.length) return []
      try {
        const resp = await fetch(ISOAP_LIST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ingest-secret': secret },
          body: JSON.stringify({
            isoap_user_id: isoapUserId,
            include_text: true,
            entry_ids: entryIds,
          }),
        })
        if (!resp.ok) return []
        const json = await resp.json().catch(() => ({}))
        const entries = (json.entries as IsoapEntry[]) ?? []
        const name = nameById.get(pid) ?? null
        return entries.map((e) => ({
          id: e.id,
          person_id: pid,
          journal_date: e.entry_date ?? null,
          scripture_reference: e.scripture ?? null,
          ocr_text: e.ocr_text ?? null,
          summary: null,
          visibility: 'coach' as const,
          created_at: e.created_at,
          people: name ? { name } : null,
          photo_url: e.photo_url ?? null,
          isoap: true as const,
        }))
      } catch {
        return []
      }
    })
  )

  const entries = perPerson
    .flat()
    .sort((a, b) => {
      const da = a.journal_date ?? ''
      const db = b.journal_date ?? ''
      return da === db ? b.id.localeCompare(a.id) : db.localeCompare(da)
    })
    .slice(0, limit)

  return NextResponse.json({ entries })
}
