import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60

// Read path for the visibility overlay. Returns the iSOAP-sourced SOAP entries
// that disciples explicitly shared at a given level (isoap_entry_visibility),
// mapped into the same shape the local shared-SOAP feeds use, so both merge in
// the dashboard. Three scopes, each with its own authorization rule:
//
//   • coach         — entries flagged 'coach' by the coach's disciples
//                     (discipleship_connections). Body needs coachPersonId.
//   • group         — entries flagged 'group' by any approved co-member of the
//                     viewer's Grace Group(s). Body needs personId.
//   • constellation — entries flagged 'constellation' by anyone (church-wide,
//                     the GBC wall). No author restriction; no id needed.
//
// Every scope also delivers the viewer's OWN shares back to them — sharing an
// entry should make it visible on your own feed, not just your audience's.
// Rows authored by the viewer carry `own: true` plus, for targeted group
// shares, `target_group_names` so the feed can label WHO it's shared with.
//
// In every case the content is fetched from each author's OWN iSOAP account
// (user_id-scoped) via entry_ids — nothing outside the shared set is ever read
// or signed. iSOAP itself is untouched; it has no coach/group concept.
//
// Body (JSON): { scope?: 'coach'|'group'|'constellation', coachPersonId?, personId?, limit? }
// scope defaults to 'coach' for backward compatibility.

const ISOAP_LIST_URL = (
  process.env.ISOAP_INGEST_URL || 'https://api.isoap.app/api/entries/ingest'
).replace(/\/ingest$/, '/list')

type Level = 'coach' | 'group' | 'constellation'

type SharedRow = {
  id: string
  person_id: string
  journal_date: string | null
  scripture_reference: string | null
  ocr_text: string | null
  summary: string | null
  visibility: Level
  created_at: string
  people: { name: string } | null
  photo_url: string | null
  isoap: true
  own?: boolean
  target_group_names?: string[] | null
}

// Determine which authors' shares this request may read, per scope. Returns the
// list of allowed author person-ids, or `null` for church-wide (constellation)
// where no author restriction applies. A non-null empty array means "authorized
// but no one qualifies" → the caller returns an empty feed. For 'group', also
// returns the viewer's own group ids (approved memberships ∪ groups they own —
// leaders may lack a membership row) so targeted shares can be filtered to
// groups the VIEWER is actually in.
async function resolveAuthors(
  admin: ReturnType<typeof getSupabaseAdmin>,
  scope: Level,
  coachPersonId: string | undefined,
  personId: string | undefined
): Promise<{ authorIds: string[] | null; gids?: string[] } | { error: string }> {
  if (scope === 'constellation') return { authorIds: null }

  if (scope === 'coach') {
    if (!coachPersonId) return { error: 'coachPersonId required' }
    // Relationship = authorization: this coach's disciples, plus the viewer
    // themselves so their own coach-shares land back on their own feed.
    const { data: conns, error } = await admin
      .from('discipleship_connections')
      .select('disciple_person_id')
      .eq('discipler_person_id', coachPersonId)
    if (error) return { error: 'Could not read connections' }
    return {
      authorIds: Array.from(
        new Set(
          [...(conns ?? []).map((c) => c.disciple_person_id), coachPersonId].filter(Boolean)
        )
      ),
    }
  }

  // scope === 'group': approved co-members of the viewer's Grace Group(s).
  // The viewer's groups = approved memberships ∪ groups they own (a leader may
  // have no person_victory_groups row of their own).
  if (!personId) return { error: 'personId required' }
  const [{ data: myGroups, error: gErr }, { data: ownedGroups, error: oErr }] =
    await Promise.all([
      admin
        .from('person_victory_groups')
        .select('victory_group_id')
        .eq('person_id', personId)
        .eq('status', 'approved'),
      admin.from('victory_groups').select('id').eq('owner_person_id', personId),
    ])
  if (gErr || oErr) return { error: 'Could not read groups' }
  const gids = Array.from(
    new Set(
      [
        ...(myGroups ?? []).map((g) => g.victory_group_id),
        ...(ownedGroups ?? []).map((g) => g.id),
      ].filter(Boolean)
    )
  )
  if (gids.length === 0) return { authorIds: [], gids }
  const { data: members, error: mErr } = await admin
    .from('person_victory_groups')
    .select('person_id')
    .in('victory_group_id', gids)
    .eq('status', 'approved')
  if (mErr) return { error: 'Could not read group members' }
  // Include the viewer even when no membership row exists (owner-only case) so
  // their own group-shares always come back to them.
  return {
    authorIds: Array.from(
      new Set([...(members ?? []).map((m) => m.person_id), personId].filter(Boolean))
    ),
    gids,
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.ISOAP_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'ISOAP_INGEST_SECRET not configured' }, { status: 500 })
  }

  let body: { scope?: string; coachPersonId?: string; personId?: string; limit?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const scope: Level =
    body.scope === 'group' || body.scope === 'constellation' ? body.scope : 'coach'
  const limit = Math.min(Math.max(body.limit ?? 20, 1), 100)

  const admin = getSupabaseAdmin()

  // 1. Who may this request read? (authorization, per scope)
  const resolved = await resolveAuthors(admin, scope, body.coachPersonId, body.personId)
  if ('error' in resolved) {
    const status = resolved.error.endsWith('required') ? 400 : 500
    return NextResponse.json({ error: resolved.error }, { status })
  }
  const { authorIds } = resolved
  const viewerGids = 'gids' in resolved ? resolved.gids ?? [] : []
  // Authorized but nobody qualifies (e.g. coach with no disciples, or viewer in
  // no group) → empty feed. `null` = church-wide, which never short-circuits.
  if (authorIds !== null && authorIds.length === 0) return NextResponse.json({ entries: [] })

  // 2. Which iSOAP entries were shared at this level? Pull a generous buffer,
  //    ordered newest-first; the final slice is applied after content is fetched.
  let shareQuery = admin
    .from('isoap_entry_visibility')
    .select('isoap_entry_id, wc_person_id, journal_date, victory_group_id, victory_group_ids')
    .eq('visibility', scope)
    .order('journal_date', { ascending: false })
    .limit(limit * 4)
  if (authorIds !== null) shareQuery = shareQuery.in('wc_person_id', authorIds)
  const { data: shares, error: shareErr } = await shareQuery
  if (shareErr) {
    return NextResponse.json({ error: 'Could not read shares' }, { status: 500 })
  }
  if (!shares?.length) return NextResponse.json({ entries: [] })

  // Group shared entry ids by disciple. A share targeted at specific group(s)
  // is only delivered when the VIEWER is in at least one of them; untargeted
  // 'group' shares broadcast to all the author's co-members. The author is in
  // every group they target (enforced at write), so their own shares always
  // pass. For the viewer's own group shares, remember the targets so the feed
  // can label who the entry is shared with.
  const viewerId = (scope === 'coach' ? body.coachPersonId : body.personId) ?? body.personId ?? null
  const idsByPerson = new Map<string, string[]>()
  const ownTargetsByEntry = new Map<string, string[] | null>() // null = all my groups
  for (const s of shares) {
    if (!s.isoap_entry_id || !s.wc_person_id) continue
    const targets: string[] | null = s.victory_group_ids?.length
      ? s.victory_group_ids
      : s.victory_group_id
        ? [s.victory_group_id]
        : null
    if (scope === 'group' && targets && !targets.some((g) => viewerGids.includes(g))) continue
    if (scope === 'group' && viewerId && s.wc_person_id === viewerId) {
      ownTargetsByEntry.set(s.isoap_entry_id, targets)
    }
    const arr = idsByPerson.get(s.wc_person_id) ?? []
    arr.push(s.isoap_entry_id)
    idsByPerson.set(s.wc_person_id, arr)
  }
  const personIds = Array.from(idsByPerson.keys())

  // 3. Names + iSOAP identities for those disciples, plus names for any groups
  //    the viewer's own shares target (for the "shared with" label).
  const ownTargetGids = Array.from(
    new Set(Array.from(ownTargetsByEntry.values()).flat().filter(Boolean) as string[])
  )
  const [{ data: people }, { data: links }, { data: targetGroups }] = await Promise.all([
    admin.from('people').select('id, name').in('id', personIds),
    admin.from('isoap_links').select('wc_person_id, isoap_user_id').in('wc_person_id', personIds),
    ownTargetGids.length
      ? admin.from('victory_groups').select('id, name').in('id', ownTargetGids)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const nameById = new Map((people ?? []).map((p) => [p.id, p.name as string]))
  const isoapUserById = new Map(
    (links ?? []).map((l) => [l.wc_person_id, l.isoap_user_id as string])
  )
  const groupNameById = new Map((targetGroups ?? []).map((g) => [g.id, g.name as string]))

  // 4. Fetch each disciple's shared entries from iSOAP (their own account only),
  //    in parallel. Best-effort per disciple — one failure doesn't sink the feed.
  type IsoapEntry = {
    id: string
    entry_date: string
    scripture?: string | null
    ocr_text?: string | null
    body?: string | null
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
        const own = viewerId !== null && pid === viewerId
        return entries.map((e) => ({
          id: e.id,
          person_id: pid,
          journal_date: e.entry_date ?? null,
          scripture_reference: e.scripture ?? null,
          // A photo entry's words are ocr_text; a typed entry's are body. The
          // feed shows whichever the entry has — without this, typed SOAPs
          // surfaced as empty "Shared a SOAP" cards.
          ocr_text: e.ocr_text ?? e.body ?? null,
          summary: null,
          visibility: scope,
          created_at: e.created_at,
          people: name ? { name } : null,
          photo_url: e.photo_url ?? null,
          isoap: true as const,
          ...(own && {
            own: true,
            ...(scope === 'group' && {
              target_group_names:
                ownTargetsByEntry
                  .get(e.id)
                  ?.map((g) => groupNameById.get(g))
                  .filter((n): n is string => !!n) ?? null,
            }),
          }),
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
