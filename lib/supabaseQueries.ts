import { supabase } from './supabaseClient'
import type {
  Person,
  Engagement,
  PrayerRequest,
  VictoryGroup,
  Stage,
  StageChecklistItem,
  GroupAttendance,
  GroupMeetingStatus,
  DiscipleshipConnection,
  SoapJournal,
  InviteToken,
  ShareVisibility,
  Booklet,
} from '../types/database'

// In-flight request de-duplication. When several components mount at once and
// each calls the same read (e.g. getPeople), they share ONE network request
// instead of firing N. The entry clears as soon as the request settles, so
// reads after a write always start fresh — no staleness.
const _inflight = new Map<string, Promise<unknown>>()
function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = _inflight.get(key)
  if (existing) return existing as Promise<T>
  const p = fn().finally(() => { _inflight.delete(key) })
  _inflight.set(key, p)
  return p
}

// ==================== PEOPLE ====================
export const getPeople = (stage?: Stage | Stage[]) =>
  dedup(`getPeople:${Array.isArray(stage) ? stage.join(',') : stage ?? ''}`, async () => {
    let query = supabase
      .from('people')
      .select('*')
      .order('created_at', { ascending: false })

    if (Array.isArray(stage) && stage.length > 0) {
      query = query.in('current_stage', stage)
    } else if (stage) {
      query = query.eq('current_stage', stage)
    }

    const { data, error } = await query
    return { data, error }
  })

export const addPerson = async (
  person: Omit<Person, 'id' | 'created_at' | 'updated_at' | 'auth_user_id' | 'is_admin' | 'testimony_text' | 'testimony_video_url'>,
  // Whoever inputs a person becomes their coach. Without this connection a
  // non-admin can't see the person they just added — "My Constellation" only
  // shows your own downline.
  coachPersonId?: string
) => {
  const { data, error } = await supabase
    .from('people')
    .insert({ ...person, auth_user_id: null, is_admin: false, updated_at: new Date().toISOString() })
    .select()
    .single()
  if (!error && data && coachPersonId) {
    const { error: connError } = await supabase
      .from('discipleship_connections')
      .insert({
        discipler_person_id: coachPersonId,
        disciple_person_id: data.id,
        disciple_name: person.name,
        relationship_notes: null,
        status: 'Identified',
        updated_at: new Date().toISOString(),
      })
    if (connError) console.error('Auto coach-connection failed:', connError)
  }
  return { data, error }
}

// A lightweight duplicate check for the coach-side Add Person form. The DB only
// enforces uniqueness on auth_user_id and on the email of *claimed* profiles, so
// two unclaimed rows with the same email (or name) slip through and become the
// dup we keep having to merge by hand. This surfaces likely matches BEFORE the
// blind insert so the coach can connect to the existing person instead.
export type DuplicatePersonCandidate = Pick<Person, 'id' | 'name' | 'email' | 'current_stage' | 'auth_user_id'>

export const findPotentialDuplicatePeople = async ({
  name,
  email,
}: {
  name: string
  email?: string | null
}): Promise<{ data: DuplicatePersonCandidate[]; error: null }> => {
  const trimmedName = name.trim()
  const trimmedEmail = email?.trim() ?? ''
  const cols = 'id, name, email, current_stage, auth_user_id'
  // Keyed by id so an email+name double match isn't listed twice.
  const matches = new Map<string, DuplicatePersonCandidate>()

  // Email is the strongest signal — ilike with no wildcards = case-insensitive equality.
  if (trimmedEmail) {
    const { data } = await supabase.from('people').select(cols).ilike('email', trimmedEmail).limit(5)
    for (const p of (data ?? []) as DuplicatePersonCandidate[]) matches.set(p.id, p)
  }
  // Name catches dups that were added without an email.
  if (trimmedName) {
    const { data } = await supabase.from('people').select(cols).ilike('name', trimmedName).limit(5)
    for (const p of (data ?? []) as DuplicatePersonCandidate[]) matches.set(p.id, p)
  }
  return { data: Array.from(matches.values()), error: null }
}

export const updatePerson = async (
  personId: string,
  updates: Partial<Omit<Person, 'id' | 'created_at' | 'updated_at'>>
) => {
  const { data, error } = await supabase
    .from('people')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', personId)
    .select()
    .maybeSingle()

  if (error) return { data, error }

  if (!data) {
    return {
      data,
      error: {
        message: 'Profile was not updated. Supabase may be missing an update policy for people.',
      },
    }
  }

  return { data, error: null }
}

// PRIORITY is per-coach and private (person_priorities table), NOT a shared flag
// on people. Each coach flags their own disciples; RLS hides one coach's stars
// from every other coach. Returns the set of person ids THIS coach has starred.
export const getMyPriorityPersonIds = async (coachPersonId: string) => {
  const { data, error } = await supabase
    .from('person_priorities')
    .select('person_id')
    .eq('coach_person_id', coachPersonId)
  const ids = new Set<string>(((data as { person_id: string }[]) ?? []).map(r => r.person_id))
  return { ids, error }
}

// Toggle this coach's private priority flag for a person: insert a row to star,
// delete it to unstar. Idempotent (unique coach+person; ignoreDuplicates).
export const setPersonPriority = async (
  coachPersonId: string,
  personId: string,
  on: boolean
) => {
  if (on) {
    const { error } = await supabase
      .from('person_priorities')
      .upsert(
        { coach_person_id: coachPersonId, person_id: personId },
        { onConflict: 'coach_person_id,person_id', ignoreDuplicates: true }
      )
    return { error }
  }
  const { error } = await supabase
    .from('person_priorities')
    .delete()
    .eq('coach_person_id', coachPersonId)
    .eq('person_id', personId)
  return { error }
}

export const updatePersonStage = async (personId: string, newStage: Stage) => {
  // Capture the prior stage so the transition can be logged for velocity.
  const { data: prior } = await supabase
    .from('people')
    .select('current_stage')
    .eq('id', personId)
    .maybeSingle()
  const result = await updatePerson(personId, { current_stage: newStage })
  const fromStage = (prior as { current_stage?: Stage } | null)?.current_stage ?? null
  if (!result.error && fromStage !== newStage) {
    await supabase.from('pipeline_events').insert({ person_id: personId, from_stage: fromStage, to_stage: newStage })
  }
  return result
}

export const getPipelineEvents = async () => {
  const { data, error } = await supabase
    .from('pipeline_events')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}

// Goes through the server so NO ACTION references (prayers they authored,
// engagements/sign-offs they created for others) are cleared or de-attributed
// first — a plain client-side delete fails on those, and RLS stops a non-admin
// coach from clearing another person's authored prayers. The route re-checks
// authorization with this caller's own JWT (can_edit_person).
export const deletePerson = async (personId: string) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { data: null, error: { message: 'Not signed in.' } }
  }
  try {
    const res = await fetch('/api/people/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: session.access_token, personId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: { message: json.error || 'Profile was not deleted.' } }
    }
    return { data: { id: personId }, error: null }
  } catch {
    return { data: null, error: { message: 'Profile was not deleted. Please try again.' } }
  }
}

// Folds a duplicate person into a keeper. All data movement happens inside the
// merge_people() DB function (one transaction, service-role only) behind
// /api/people/merge; the route re-checks authorization (admin/approved-Empower,
// or can_edit_person on both). Refuses to merge two claimed profiles.
export const mergePeople = async (keepId: string, dupId: string) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { data: null, error: { message: 'Not signed in.' } }
  }
  try {
    const res = await fetch('/api/people/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: session.access_token, keepId, dupId }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: { message: json.error || 'Profiles were not merged.' } }
    }
    return { data: json as { ok: boolean; kept: string; removed: string }, error: null }
  } catch {
    return { data: null, error: { message: 'Profiles were not merged. Please try again.' } }
  }
}

// Side-by-side context for the merge review: who coaches this person, what
// groups they're in, and how much checklist history each row carries — enough
// to tell the "real" profile from the accidental re-add.
export type MergeCompareInfo = {
  coaches: { name: string; isPrimary: boolean }[]
  groups: string[]
  checklistCount: number
}

export const getMergeCompareInfo = async (personId: string): Promise<MergeCompareInfo> => {
  const [connRes, groupRes, checklistRes] = await Promise.all([
    supabase
      .from('discipleship_connections')
      .select('is_primary, discipler:people!discipler_person_id(name)')
      .eq('disciple_person_id', personId),
    supabase
      .from('person_victory_groups')
      .select('victory_groups(name)')
      .eq('person_id', personId),
    supabase
      .from('stage_checklist_items')
      .select('id', { count: 'exact', head: true })
      .eq('person_id', personId),
  ])
  const coaches = ((connRes.data ?? []) as unknown as { is_primary: boolean; discipler: { name: string } | null }[])
    .filter(c => c.discipler?.name)
    .map(c => ({ name: c.discipler!.name, isPrimary: c.is_primary }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const groups = ((groupRes.data ?? []) as unknown as { victory_groups: { name: string } | null }[])
    .map(g => g.victory_groups?.name)
    .filter((name): name is string => Boolean(name))
  return { coaches, groups, checklistCount: checklistRes.count ?? 0 }
}

export const updatePersonVictoryGroup = async (personId: string, victoryGroupId: string | null) => {
  const { data, error } = await supabase
    .from('people')
    .update({ victory_group_id: victoryGroupId, updated_at: new Date().toISOString() })
    .eq('id', personId)
    .select()
    .single()
  return { data, error }
}

// ==================== ENGAGEMENTS (Next Steps) ====================
export const getEngagementsByPerson = async (personId: string) => {
  const { data, error } = await supabase
    .from('engagements')
    .select('*')
    .eq('person_id', personId)
    .order('follow_up_date', { ascending: true, nullsFirst: false })
  return { data, error }
}

// Every meeting a person should see: ones they OWN (created) plus ones they've
// CONFIRMED being part of. A meeting they were only invited to (not yet
// confirmed) is NOT here — it lives in getPendingMeetingInvites until they act.
export const getEngagementsForPerson = async (personId: string) => {
  const { data: confirmedRows } = await supabase
    .from('engagement_participants')
    .select('engagement_id')
    .eq('person_id', personId)
    .eq('status', 'confirmed')
  const ids = (confirmedRows ?? []).map(r => r.engagement_id).filter(Boolean)
  const orParts = [`created_by_person_id.eq.${personId}`]
  if (ids.length) orParts.push(`id.in.(${ids.join(',')})`)
  const { data, error } = await supabase
    .from('engagements')
    .select('*')
    .or(orParts.join(','))
    .order('follow_up_date', { ascending: true, nullsFirst: false })
  return { data, error }
}

// Meetings someone has been invited to but hasn't confirmed/declined yet.
export const getPendingMeetingInvites = async (personId: string) => {
  const { data: rows } = await supabase
    .from('engagement_participants')
    .select('engagement_id')
    .eq('person_id', personId)
    .eq('status', 'invited')
  const ids = (rows ?? []).map(r => r.engagement_id).filter(Boolean)
  if (ids.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('engagements')
    .select('*')
    .in('id', ids)
    .order('follow_up_date', { ascending: true, nullsFirst: false })
  return { data, error }
}

// All participants of a meeting + their confirm status (for the owner to see
// who's in and who's confirmed).
export const getMeetingParticipants = async (engagementId: string) => {
  const { data, error } = await supabase
    .from('engagement_participants')
    .select('person_id, status, people(name)')
    .eq('engagement_id', engagementId)
  return { data, error }
}

// Invite people to a meeting (status 'invited' so they must confirm). The
// creator never needs an invite — they own it.
export const addMeetingParticipants = async (engagementId: string, personIds: string[], status: 'invited' | 'confirmed' = 'invited') => {
  const unique = Array.from(new Set(personIds.filter(Boolean)))
  if (unique.length === 0) return { error: null }
  const rows = unique.map(pid => ({ engagement_id: engagementId, person_id: pid, status }))
  const { error } = await supabase
    .from('engagement_participants')
    .upsert(rows, { onConflict: 'engagement_id,person_id', ignoreDuplicates: true })
  return { error }
}

// The engagement ids a person has CONFIRMED being part of — for filtering a
// shared "all engagements" list down to a person's own meetings.
export const getConfirmedEngagementIds = async (personId: string) => {
  const { data, error } = await supabase
    .from('engagement_participants')
    .select('engagement_id')
    .eq('person_id', personId)
    .eq('status', 'confirmed')
  return { data: (data ?? []).map(r => r.engagement_id as string), error }
}

export const setMeetingInviteStatus = async (engagementId: string, personId: string, status: 'confirmed' | 'declined') => {
  const { error } = await supabase
    .from('engagement_participants')
    .update({ status })
    .eq('engagement_id', engagementId)
    .eq('person_id', personId)
  return { error }
}

export const getAllEngagements = () =>
  dedup('getAllEngagements', async () => {
    const { data, error } = await supabase
      .from('engagements')
      .select('*')
      .order('follow_up_date', { ascending: true, nullsFirst: false })
    return { data, error }
  })

export const addEngagement = async (engagement: Omit<Engagement, 'id' | 'created_at' | 'notes' | 'completed_at' | 'action_completed' | 'action_completed_at' | 'google_calendar_event_id'> & { follow_up_time?: string | null; location?: string | null }) => {
  const { data, error } = await supabase
    .from('engagements')
    .insert({ ...engagement, action_completed: false, action_completed_at: null })
    .select()
    .single()
  return { data, error }
}

export const updateEngagement = async (id: string, updates: Partial<Omit<Engagement, 'id' | 'person_id' | 'created_at'>>) => {
  const { data, error } = await supabase
    .from('engagements')
    .update(updates)
    .eq('id', id)
    .select()
  return { data: data?.[0] ?? null, error }
}

export const deleteEngagement = async (id: string) => {
  const { error } = await supabase
    .from('engagements')
    .delete()
    .eq('id', id)
  return { error }
}

export const markActionCompleted = async (id: string, completed: boolean) => {
  const { data, error } = await supabase
    .from('engagements')
    .update({
      action_completed: completed,
      action_completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ==================== PRAYER REQUESTS ====================
export const getPrayerRequestsByPerson = async (personId: string) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('*, people!person_id(name, current_stage)')
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
  return { data, error }
}

// The Prayer Wall only shows requests/praises explicitly shared to everyone.
export const getConstellationPrayerRequests = () =>
  dedup('getConstellationPrayerRequests', async () => {
    const { data, error } = await supabase
      .from('prayer_requests')
      .select('*')
      .eq('visibility', 'constellation')
      .order('created_at', { ascending: false })
    return { data, error }
  })

// A coach's Prayer Wall: every prayer/praise they're allowed to see — never
// anyone's private ones. Admins see all shared; a coach sees prayers shared to
// everyone (constellation), shared with them by people in their coaching tree
// (coach), and shared with a Grace Group they belong to (group).
export const getPrayerWallForViewer = async (viewerPersonId: string, isAdmin: boolean) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('*, people!person_id(name, current_stage)')
    // Fully-private model: the wall shows YOUR OWN prayers (own + ones you
    // created) plus anything explicitly shared to you. RLS already blocks other
    // people's private rows from ever coming back, so no filter on visibility
    // here — own private prayers must reach the wall. No admin see-all.
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) return { data: null, error }

  const { data: downlineRows } = await supabase.rpc('get_downline', { coach_person_id: viewerPersonId })
  const downline = new Set<string>((downlineRows ?? []).map((d: { person_id: string }) => d.person_id))
  downline.add(viewerPersonId)

  const { data: myGroups } = await supabase
    .from('person_victory_groups').select('victory_group_id').eq('person_id', viewerPersonId).eq('status', 'approved')
  const gids = (myGroups ?? []).map(g => g.victory_group_id).filter(Boolean)
  let groupMembers = new Set<string>()
  if (gids.length) {
    const { data: members } = await supabase
      .from('person_victory_groups').select('person_id').in('victory_group_id', gids).eq('status', 'approved')
    groupMembers = new Set((members ?? []).map(m => m.person_id).filter(Boolean))
  }

  const filtered = (data ?? []).filter(p => {
    // Always show your own prayers and ones you logged for others.
    if (p.person_id === viewerPersonId || p.created_by_person_id === viewerPersonId) return true
    if (p.visibility === 'constellation') return true
    if (p.visibility === 'coach') return downline.has(p.person_id)
    if (p.visibility === 'group') return groupMembers.has(p.person_id)
    return false
  })
  return { data: filtered, error: null }
}

// A person's OWN private prayer wall: ONLY the prayers/praises they authored
// (created_by = me), whoever they're about. Confirmed with user (2026-07-31):
// prayers are author-only — the person you pray FOR must never see it, and you
// never see anyone else's. A prayer written about you by someone else does NOT
// appear here (that's theirs, not yours). RLS enforces the same rule server-side.
// (The `_isAdmin` arg is kept for a stable signature but grants no extra access.)
export const getPrayerLifeForPerson = async (personId: string, _isAdmin: boolean) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('*, people!person_id(name, current_stage)')
    .eq('created_by_person_id', personId)
    .order('created_at', { ascending: false })
  return { data: (data as PrayerRequest[]) ?? [], error }
}

export const addPrayerRequest = async (
  request: Omit<PrayerRequest, 'id' | 'created_at' | 'updated_at' | 'visibility' | 'is_praise' | 'engagement_id' | 'media_url' | 'created_by_person_id'> &
    Partial<Pick<PrayerRequest, 'visibility' | 'is_praise' | 'engagement_id' | 'media_url' | 'created_by_person_id'>>
) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .insert({ ...request, updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data, error }
}

export const addPraise = async (
  personId: string,
  testimony: string,
  engagementId: string | null = null,
  visibility?: 'private' | 'coach' | 'group' | 'constellation'
) => {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('prayer_requests')
    .insert({
      person_id: personId,
      request: testimony,
      status: 'Answered',
      answered_date: today,
      answer_notes: null,
      is_praise: true,
      engagement_id: engagementId,
      ...(visibility ? { visibility } : {}),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  return { data, error }
}

// ==================== ENGAGEMENT ACTION ITEMS ====================
export const getActionItemsByEngagement = async (engagementId: string) => {
  const { data, error } = await supabase
    .from('engagement_action_items')
    .select('*')
    .eq('engagement_id', engagementId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  return { data, error }
}

export const addActionItem = async (engagementId: string, text: string, sortOrder: number) => {
  const { data, error } = await supabase
    .from('engagement_action_items')
    .insert({ engagement_id: engagementId, text, sort_order: sortOrder })
    .select()
    .single()
  return { data, error }
}

export const updateActionItem = async (id: string, updates: { text?: string; completed?: boolean }) => {
  const { data, error } = await supabase
    .from('engagement_action_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deleteActionItem = async (id: string) => {
  const { error } = await supabase.from('engagement_action_items').delete().eq('id', id)
  return { error }
}

export const getAllActionItems = () =>
  dedup('getAllActionItems', async () => {
    const { data, error } = await supabase
      .from('engagement_action_items')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  })

export const getPrayerRequestsByEngagement = async (engagementId: string) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('*')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: true })
  return { data, error }
}

export const markPrayerAnswered = async (id: string, answerNotes?: string | null) => {
  const answeredDate = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('prayer_requests')
    .update({
      status: 'Answered',
      answered_date: answeredDate,
      answer_notes: answerNotes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, status, answered_date, answer_notes')
    .maybeSingle()

  if (error) return { data, error }

  if (!data) {
    return {
      data,
      error: {
        message: 'Prayer request was not updated. Supabase may be missing an update policy for prayer_requests.',
      },
    }
  }

  return { data, error: null }
}

export const updatePrayerAnswerNotes = async (id: string, answerNotes: string | null) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .update({
      answer_notes: answerNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, answer_notes')
    .maybeSingle()

  if (error) return { data, error }

  if (!data) {
    return {
      data,
      error: {
        message: 'Prayer request was not updated.',
      },
    }
  }

  return { data, error: null }
}

export const updatePrayerRequestText = async (id: string, request: string) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .update({
      request,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, request')
    .maybeSingle()

  if (error) return { data, error }

  if (!data) {
    return {
      data,
      error: {
        message: 'Prayer request was not updated.',
      },
    }
  }

  return { data, error: null }
}

export const deletePrayerRequest = async (id: string) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) return { data, error }

  if (!data) {
    return {
      data,
      error: {
        message: 'Prayer request was not deleted. Supabase may be missing a delete policy for prayer_requests.',
      },
    }
  }

  return { data, error: null }
}

// ==================== VICTORY GROUPS ====================
export const getVictoryGroups = () =>
  dedup('getVictoryGroups', async () => {
    const { data, error } = await supabase
      .from('victory_groups')
      .select('*')
      .order('name', { ascending: true })
    return { data, error }
  })

export const addVictoryGroup = async (group: Omit<VictoryGroup, 'id' | 'created_at' | 'google_calendar_event_id' | 'last_edited_by'>) => {
  const { data, error } = await supabase
    .from('victory_groups')
    .insert(group)
    .select()
    .single()
  return { data, error }
}

export const updateVictoryGroupOwner = async (groupId: string, ownerPersonId: string | null) => {
  return updateVictoryGroup(groupId, { owner_person_id: ownerPersonId })
}

export const updateVictoryGroup = async (groupId: string, updates: Partial<Omit<VictoryGroup, 'id' | 'created_at'>>) => {
  const { data, error } = await supabase
    .from('victory_groups')
    .update(updates)
    .eq('id', groupId)
    .select()
    .maybeSingle()

  if (error) return { data, error }

  if (!data) {
    return {
      data,
      error: {
        message: 'Grace Group was not updated. Supabase may be missing an update policy for victory_groups.',
      },
    }
  }

  return { data, error: null }
}

// ==================== GROUP MEMBERSHIPS ====================
export const getAllGroupMemberships = () =>
  dedup('getAllGroupMemberships', async () => {
    const { data, error } = await supabase
      .from('person_victory_groups')
      .select('person_id, victory_group_id')
    return { data, error }
  })

// ==================== BOOKLET PROGRESS ====================
export const getAllBookletProgress = () =>
  dedup('getAllBookletProgress', async () => {
    const { data, error } = await supabase
      .from('booklet_progress')
      .select('*')
    return { data, error }
  })

export const getBookletProgress = async (personId: string) => {
  const { data, error } = await supabase
    .from('booklet_progress')
    .select('*')
    .eq('person_id', personId)
  return { data, error }
}

export const upsertBookletProgress = async (
  personId: string,
  booklet: Booklet,
  currentChapter: number,
) => {
  const { data, error } = await supabase
    .from('booklet_progress')
    .upsert(
      {
        person_id: personId,
        booklet,
        current_chapter: currentChapter,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'person_id,booklet' }
    )
    .select()
    .single()
  return { data, error }
}

// ==================== SPIRITUAL GIFTS ====================
export const getSpiritualGiftsResult = async (personId: string) => {
  const { data, error } = await supabase
    .from('spiritual_gifts_results')
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()
  return { data, error }
}

export const upsertSpiritualGiftsResult = async (
  personId: string,
  responses: Record<number, number>,
  scores: unknown[],
  topGifts: unknown[],
) => {
  const { data, error } = await supabase
    .from('spiritual_gifts_results')
    .upsert(
      {
        person_id: personId,
        responses,
        scores,
        top_gifts: topGifts,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'person_id' }
    )
    .select()
    .single()
  return { data, error }
}

// ==================== BIG FIVE (OCEAN) ====================
export const getBigFiveResult = async (personId: string) => {
  const { data, error } = await supabase
    .from('big_five_results')
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()
  return { data, error }
}

export const upsertBigFiveResult = async (
  personId: string,
  responses: Record<number, number>,
  scores: unknown[],
) => {
  const { data, error } = await supabase
    .from('big_five_results')
    .upsert(
      {
        person_id: personId,
        responses,
        scores,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'person_id' }
    )
    .select()
    .single()
  return { data, error }
}

// ==================== PASSION ASSESSMENT (GBC) ====================
export const getPassionResult = async (personId: string) => {
  const { data, error } = await supabase
    .from('passion_results')
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()
  return { data, error }
}

export const upsertPassionResult = async (
  personId: string,
  answers: unknown,
) => {
  const { data, error } = await supabase
    .from('passion_results')
    .upsert(
      {
        person_id: personId,
        answers,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'person_id' }
    )
    .select()
    .single()
  return { data, error }
}

// Ministry-fit summary (capstone). Read-only from the client — the row is generated
// server-side by /api/ministry-fit (service-role). Returns null data if not yet
// generated. RLS allows the person and their coach (downline) to read.
export const getMinistryFitResult = async (personId: string) => {
  const { data, error } = await supabase
    .from('ministry_fit_results')
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()
  return { data, error }
}

// The groups this person may target a SOAP share to: approved memberships ∪
// groups they own (a leader may have no membership row of their own). Mirrors
// the native app's getMyShareGroups and the server-side check in
// /api/soap/visibility, so the picker never offers a group the share would be
// rejected for.
export const getMyShareGroups = async (personId: string): Promise<{ id: string; name: string }[]> => {
  const [{ data: memberRows }, { data: ownedRows }] = await Promise.all([
    supabase
      .from('person_victory_groups')
      .select('status, victory_groups(id, name)')
      .eq('person_id', personId)
      .eq('status', 'approved'),
    supabase.from('victory_groups').select('id, name').eq('owner_person_id', personId),
  ])
  const byId = new Map<string, string>()
  for (const r of ownedRows ?? []) byId.set(r.id, r.name)
  for (const r of memberRows ?? []) {
    const g = r.victory_groups as unknown as { id: string; name: string } | null
    if (g) byId.set(g.id, g.name)
  }
  return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export const getGroupsForPerson = async (personId: string) => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .select('id, person_id, victory_group_id, created_at, victory_groups(id, name, meeting_day, meeting_days, meeting_time, created_at)')
    .eq('person_id', personId)
    .order('created_at', { ascending: true })
  return { data, error }
}

export const getPeopleByVictoryGroup = async (groupId: string) => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .select('id, person_id, victory_group_id, created_at, people(id, name, email, phone, current_stage, spiritual_birthday, baptism_date, notes, status, victory_group_id, created_at, updated_at)')
    .eq('victory_group_id', groupId)
    .order('created_at', { ascending: true })
  return { data, error }
}

export const addPersonToVictoryGroup = async (
  personId: string,
  victoryGroupId: string,
  status: 'pending' | 'approved' = 'approved'
) => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .insert({ person_id: personId, victory_group_id: victoryGroupId, status })
    .select('id, person_id, victory_group_id, created_at, status')
    .single()
  return { data, error }
}

// Pending join requests for the groups a given person owns (for the owner to
// approve). Includes the requesting person + the group.
export const getPendingGroupRequests = async (ownerPersonId: string) => {
  const { data: owned, error: oErr } = await supabase
    .from('victory_groups')
    .select('id')
    .eq('owner_person_id', ownerPersonId)
  if (oErr) return { data: null, error: oErr }
  const groupIds = (owned ?? []).map(g => g.id)
  if (groupIds.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('person_victory_groups')
    .select('id, person_id, victory_group_id, created_at, status, people(name), victory_groups(name)')
    .eq('status', 'pending')
    .in('victory_group_id', groupIds)
    .order('created_at', { ascending: true })
  return { data, error }
}

export const setGroupMembershipStatus = async (membershipId: string, status: 'pending' | 'approved') => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .update({ status })
    .eq('id', membershipId)
    .select()
    .single()
  return { data, error }
}

export const deleteGroupMembership = async (membershipId: string) => {
  const { error } = await supabase.from('person_victory_groups').delete().eq('id', membershipId)
  return { error }
}

export const removePersonFromVictoryGroup = async (personId: string, victoryGroupId: string) => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .delete()
    .eq('person_id', personId)
    .eq('victory_group_id', victoryGroupId)
    .select('id')
    .maybeSingle()
  return { data, error }
}

// ==================== 4E STAGE CHECKLISTS ====================
export const getStageChecklistItems = async (personId: string) => {
  const { data, error } = await supabase
    .from('stage_checklist_items')
    .select('*')
    .eq('person_id', personId)
    .order('stage', { ascending: true })
    .order('category', { ascending: true })
    .order('created_at', { ascending: true })
  return { data, error }
}

export const getAllStageChecklistItems = () =>
  dedup('getAllStageChecklistItems', async () => {
    const { data, error } = await supabase
      .from('stage_checklist_items')
      .select('*')
      .order('person_id', { ascending: true })
      .order('stage', { ascending: true })
    return { data, error }
  })

export const upsertStageChecklistItem = async (
  item: Omit<StageChecklistItem, 'id' | 'created_at' | 'updated_at' | 'completed_at'>
) => {
  const { data, error } = await supabase
    .from('stage_checklist_items')
    .upsert(
      {
        ...item,
        completed_at: item.completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'person_id,stage,category,label' }
    )
    .select()
    .single()
  return { data, error }
}

export const updateStageChecklistItem = async (id: string, completed: boolean) => {
  const { data, error } = await supabase
    .from('stage_checklist_items')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ==================== GROUP ATTENDANCE ====================
export const getGroupAttendance = async (groupId: string) => {
  const { data, error } = await supabase
    .from('group_attendance')
    .select('*')
    .eq('victory_group_id', groupId)
    .order('meeting_date', { ascending: false })
  return { data, error }
}

// Rolling-window attendance across ALL groups: every attended row on/after `since`
// (a local 'YYYY-MM-DD'). Returns person_id so callers can de-dupe a member who
// attends multiple groups; scope filtering happens in the UI via allowedPersonIds.
// Powers the "N attended this week" metric in the Groups view.
export const getRecentGroupAttendance = async (since: string) => {
  const { data, error } = await supabase
    .from('group_attendance')
    .select('person_id, victory_group_id, meeting_date, attended')
    .gte('meeting_date', since)
    .eq('attended', true)
  return { data, error }
}

export const upsertGroupAttendance = async (
  attendance: Omit<GroupAttendance, 'id' | 'created_at' | 'updated_at'>
) => {
  const { data, error } = await supabase
    .from('group_attendance')
    .upsert(
      {
        ...attendance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'victory_group_id,person_id,meeting_date' }
    )
    .select()
    .single()
  return { data, error }
}

// ==================== GROUP MEETING STATUS (per-occurrence cancel/reschedule) ====================
// A recurring group meeting has no per-occurrence row; these override a SINGLE
// occurrence, keyed by its original meeting_date. See GroupMeetingStatus type.
export const getGroupMeetingStatuses = async () => {
  const { data, error } = await supabase
    .from('group_meeting_status')
    .select('id, victory_group_id, meeting_date, status, rescheduled_to, rescheduled_time, note, created_by_person_id, created_at, updated_at')
  return { data, error }
}

// Upsert one group's status for one original meeting_date. onConflict matches the
// unique (victory_group_id, meeting_date) so re-submitting overwrites.
export const upsertGroupMeetingStatus = async (record: {
  victory_group_id: string
  meeting_date: string
  status: 'cancelled' | 'rescheduled'
  rescheduled_to?: string | null
  rescheduled_time?: string | null
  note?: string | null
  created_by_person_id?: string | null
}) => {
  const { data, error } = await supabase
    .from('group_meeting_status')
    .upsert({ ...record, updated_at: new Date().toISOString() }, { onConflict: 'victory_group_id,meeting_date' })
    .select()
    .single()
  return { data, error }
}

// Undo a cancel/reschedule — the occurrence reverts to its normal day/time.
export const clearGroupMeetingStatus = async (victoryGroupId: string, meetingDate: string) => {
  const { error } = await supabase
    .from('group_meeting_status')
    .delete()
    .eq('victory_group_id', victoryGroupId)
    .eq('meeting_date', meetingDate)
  return { error }
}

// ==================== DISCIPLESHIP CONNECTIONS ====================
export const getDiscipleshipConnections = async (disciplerPersonId: string) => {
  // Pull each disciple's actual current_stage too, so the Engage steps reflect
  // real progress (not the often-stale connection status).
  const { data, error } = await supabase
    .from('discipleship_connections')
    .select('*, disciple:people!disciple_person_id(current_stage)')
    .eq('discipler_person_id', disciplerPersonId)
    .order('created_at', { ascending: true })
  return { data, error }
}

export const getAllDiscipleshipConnections = () =>
  dedup('getAllDiscipleshipConnections', async () => {
    const { data, error } = await supabase
      .from('discipleship_connections')
      .select('*')
    return { data, error }
  })

// Pending self-service connection requests awaiting this coach's acceptance
// (from open web signup — a disciple entered this coach's code). The coach
// accepts them in their Engagements feed.
export const getPendingConnectionRequests = async (coachPersonId: string) => {
  const { data, error } = await supabase
    .from('discipleship_connections')
    .select('id, disciple_name, disciple_person_id, created_at')
    .eq('discipler_person_id', coachPersonId)
    .eq('pending', true)
    .order('created_at', { ascending: false })
  return { data, error }
}

export const addDiscipleshipConnection = async (
  connection: Omit<DiscipleshipConnection, 'id' | 'created_at' | 'updated_at'>
) => {
  const { data, error } = await supabase
    .from('discipleship_connections')
    .insert({ ...connection, updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data, error }
}

export const updateDiscipleshipConnectionDiscipler = async (id: string, disciplerPersonId: string) => {
  const { data, error } = await supabase
    .from('discipleship_connections')
    .update({ discipler_person_id: disciplerPersonId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const updateDiscipleshipConnectionStatus = async (
  id: string,
  status: DiscipleshipConnection['status']
) => {
  const { data, error } = await supabase
    .from('discipleship_connections')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deleteDiscipleshipConnection = async (id: string) => {
  const { data, error } = await supabase
    .from('discipleship_connections')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) return { data, error }

  if (!data) {
    return {
      data,
      error: {
        message: 'Connection was not removed. Supabase may be missing a delete policy for discipleship_connections.',
      },
    }
  }

  return { data, error: null }
}

// ==================== SOAP JOURNALS ====================
// Every column EXCEPT ocr_text. With a decade imported the OCR text alone is
// ~1MB — half the journey page's entire download — and it's only needed for
// search/excerpts, so it hydrates separately (getSoapJournalTexts) after paint.
const SOAP_LITE_COLUMNS =
  'id, person_id, journal_date, photo_url, photo_urls, scripture_reference, summary, visibility, date_precision, source, import_batch_id, import_seq, date_reviewed, processing_started_at, created_at, updated_at'

// iSOAP is the SOAP system of record. For linked people, pull their journal
// from there and map it into SoapJournal shape so it can be merged with any
// remaining local soap_journals rows. Best-effort: any failure yields [] and
// the local rows still render.
const fetchIsoapJournals = async (
  personId: string,
  includeText: boolean,
  limit?: number
): Promise<SoapJournal[]> => {
  try {
    const res = await fetch('/api/soap/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, includeText, limit }),
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.entries as SoapJournal[]) ?? []
  } catch {
    return []
  }
}

// Newest-first, with a stable id tiebreak — matches the DB ordering so merged
// local + iSOAP rows interleave correctly.
const sortSoapDesc = (rows: SoapJournal[]) =>
  rows.sort((a, b) => {
    const da = a.journal_date ?? ''
    const db = b.journal_date ?? ''
    return da === db ? b.id.localeCompare(a.id) : db.localeCompare(da)
  })

const getSoapJournalsPaged = async (personId: string, columns: string, limit?: number) => {
  const includeText = columns === '*'
  // Kick off the iSOAP read in parallel with the local read.
  const isoapPromise = fetchIsoapJournals(personId, includeText, limit)

  // Supabase caps every response at 1,000 rows. With a decade imported
  // (~2,000 entries) a single select silently truncates at ~March 2024 —
  // page through unless the caller asked for an explicit smaller limit.
  let local: SoapJournal[]
  if (limit) {
    const { data, error } = await supabase
      .from('soap_journals')
      .select(columns)
      .eq('person_id', personId)
      .order('journal_date', { ascending: false })
      .limit(limit)
    if (error) return { data: null, error }
    local = (data as unknown as SoapJournal[]) ?? []
  } else {
    // Count first, then fetch every page IN PARALLEL — with a decade imported
    // (~2,000 rows, MBs of text) sequential pages made the journey page crawl.
    const { count, error: countErr } = await supabase
      .from('soap_journals')
      .select('id', { count: 'exact', head: true })
      .eq('person_id', personId)
    if (countErr) return { data: null, error: countErr }

    const pages = Math.max(1, Math.ceil((count ?? 0) / 1000))
    const results = await Promise.all(
      Array.from({ length: pages }, (_, i) =>
        supabase
          .from('soap_journals')
          .select(columns)
          .eq('person_id', personId)
          .order('journal_date', { ascending: false })
          .order('id', { ascending: false }) // stable tiebreak so pages don't overlap
          .range(i * 1000, i * 1000 + 999)
      )
    )
    local = []
    for (const r of results) {
      if (r.error) return { data: local.length ? local : null, error: r.error }
      local.push(...((r.data as unknown as SoapJournal[]) ?? []))
    }
  }

  // Dedup for the transition: the same decade of handwritten SOAP was imported
  // into BOTH apps independently, so a linked person's local soap_journals and
  // iSOAP journal_entries overlap by date. iSOAP is the system of record, so on
  // any shared date the iSOAP row wins; local rows survive only on dates iSOAP
  // has nothing for (e.g. entries never migrated). Collapses once soap_journals
  // is migrated and retired.
  const isoap = await isoapPromise
  const isoapDates = new Set(isoap.map((e) => e.journal_date))
  const localOnly = local.filter((r) => !isoapDates.has(r.journal_date))
  const merged = sortSoapDesc([...localOnly, ...isoap])
  return { data: limit ? merged.slice(0, limit) : merged, error: null }
}

export const getSoapJournals = async (personId: string, limit?: number) =>
  getSoapJournalsPaged(personId, '*', limit)

// Fast first load: all rows, minus the OCR text (rows arrive with ocr_text undefined).
export const getSoapJournalsLite = async (personId: string, limit?: number) =>
  getSoapJournalsPaged(personId, SOAP_LITE_COLUMNS, limit)

// Second phase: id + ocr_text for rows that have text, merged into the
// already-loaded lite rows so search and excerpts still work.
export const getSoapJournalTexts = async (personId: string) => {
  const { count, error: countErr } = await supabase
    .from('soap_journals')
    .select('id', { count: 'exact', head: true })
    .eq('person_id', personId)
    .not('ocr_text', 'is', null)
  if (countErr) return { data: null, error: countErr }

  const pages = Math.max(1, Math.ceil((count ?? 0) / 1000))
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      supabase
        .from('soap_journals')
        .select('id, ocr_text')
        .eq('person_id', personId)
        .not('ocr_text', 'is', null)
        .order('journal_date', { ascending: false })
        .order('id', { ascending: false })
        .range(i * 1000, i * 1000 + 999)
    )
  )
  const all: { id: string; ocr_text: string }[] = []
  for (const r of results) {
    if (r.error) return { data: all.length ? all : null, error: r.error }
    all.push(...((r.data as { id: string; ocr_text: string }[]) ?? []))
  }
  // Fold in iSOAP entry text so cross-app entries are searchable too.
  const isoap = await fetchIsoapJournals(personId, true)
  for (const e of isoap) {
    if (e.ocr_text) all.push({ id: e.id, ocr_text: e.ocr_text })
  }
  return { data: all, error: null }
}

export const getSoapJournalByDate = async (personId: string, date: string) => {
  // A day can now hold multiple entries (imports split multi-entry photos), so
  // return the first rather than assuming exactly one.
  const { data, error } = await supabase
    .from('soap_journals')
    .select('*')
    .eq('person_id', personId)
    .eq('journal_date', date)
    .order('created_at', { ascending: true })
    .limit(1)
  return { data: data?.[0] ?? null, error }
}

export const addSoapJournal = async (
  journal: Omit<SoapJournal, 'id' | 'created_at' | 'updated_at'>
) => {
  const { data, error } = await supabase
    .from('soap_journals')
    .insert({ ...journal, updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data, error }
}

export const updateSoapJournal = async (
  id: string,
  updates: Partial<Omit<SoapJournal, 'id' | 'person_id' | 'created_at' | 'updated_at'>>
) => {
  const { data, error } = await supabase
    .from('soap_journals')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deleteSoapJournal = async (id: string) => {
  const { error } = await supabase.from('soap_journals').delete().eq('id', id)
  return { error }
}

// Bulk "never ask about dates again" for LOCAL rows — iSOAP-owned rows go
// through /api/soap/update with entryIds instead (disjoint id spaces).
export const bulkMarkSoapDateReviewed = async (ids: string[]) => {
  if (ids.length === 0) return { error: null }
  const { error } = await supabase
    .from('soap_journals')
    .update({ date_reviewed: true, updated_at: new Date().toISOString() })
    .in('id', ids)
  return { error }
}

// The imported entry immediately before this one (by page order) — the likely
// "start" of a left→right entry that got split.
export const getPrevImportedEntry = async (personId: string, importSeq: number) => {
  const { data, error } = await supabase
    .from('soap_journals')
    .select('*')
    .eq('person_id', personId)
    .eq('source', 'imported')
    .lt('import_seq', importSeq)
    .order('import_seq', { ascending: false })
    .limit(1)
  return { data: data?.[0] ?? null, error }
}

// Merge one entry's text/photos into another, then delete the merged-away entry.
export const mergeSoapEntries = async (intoId: string, fromEntry: SoapJournal) => {
  const { data: into } = await supabase.from('soap_journals').select('*').eq('id', intoId).single()
  if (!into) return { error: { message: 'Target entry not found' } }
  const target = into as SoapJournal
  const mergedText = [target.ocr_text, fromEntry.ocr_text].filter(Boolean).join('\n\n')
  const mergedPhotos = Array.from(new Set([
    ...(target.photo_urls ?? (target.photo_url ? [target.photo_url] : [])),
    ...(fromEntry.photo_urls ?? (fromEntry.photo_url ? [fromEntry.photo_url] : [])),
  ]))
  const { error: upErr } = await supabase.from('soap_journals')
    .update({ ocr_text: mergedText, photo_urls: mergedPhotos, updated_at: new Date().toISOString() })
    .eq('id', intoId)
  if (upErr) return { error: upErr }
  const { error: delErr } = await supabase.from('soap_journals').delete().eq('id', fromEntry.id)
  return { error: delErr }
}

export const getSoapStreak = async (personId: string) => {
  const { data, error } = await supabase
    .from('soap_journals')
    .select('journal_date')
    .eq('person_id', personId)
    .order('journal_date', { ascending: false })
    .limit(366)

  if (error || !data) return { streak: 0, current: 0, error }

  // Compare local date strings (never parse the stored date as UTC — that
  // shifts a day in negative-offset timezones like Hawaii). setDate handles
  // month/DST rollover. Returns the LONGEST run (`streak`) and the CURRENT run
  // ending today/yesterday (`current`).
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const logged = new Set(data.map(d => d.journal_date))
  const days = Array.from(logged).sort() // ascending YYYY-MM-DD

  // Longest run.
  let best = 0
  let run = 0
  let prev: string | null = null
  for (const day of days) {
    if (prev) {
      const next = new Date(prev + 'T00:00:00')
      next.setDate(next.getDate() + 1)
      run = fmt(next) === day ? run + 1 : 1
    } else {
      run = 1
    }
    if (run > best) best = run
    prev = day
  }

  // Current run ending today (or yesterday, as a grace day if today isn't
  // logged yet).
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!logged.has(fmt(cursor))) cursor.setDate(cursor.getDate() - 1)
  let current = 0
  while (logged.has(fmt(cursor))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }

  return { streak: best, current, error: null }
}

// ==================== INVITE TOKENS ====================
export const createInviteToken = async (personId: string) => {
  const token = crypto.randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const { data, error } = await supabase
    .from('invite_tokens')
    .insert({
      person_id: personId,
      token,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single()
  return { data, error }
}

export const getInviteToken = async (token: string) => {
  const { data, error } = await supabase
    .from('invite_tokens')
    .select('*, people(*)')
    .eq('token', token)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return { data, error }
}

export const markInviteTokenUsed = async (token: string) => {
  const { data, error } = await supabase
    .from('invite_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)
    .select()
    .single()
  return { data, error }
}

export const linkAuthUserToPerson = async (personId: string, authUserId: string) => {
  const { data, error } = await supabase
    .from('people')
    .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
    .eq('id', personId)
    .select()
    .single()
  return { data, error }
}

// ==================== DISCIPLE JOURNEY HELPERS ====================
export const getMyCoach = async (personId: string) => {
  // A disciple may have several coaches. "My coach" resolves to the primary one
  // (is_primary), falling back to the earliest connection when none is flagged.
  const { data, error } = await supabase
    .from('discipleship_connections')
    .select('*, discipler:people!discipler_person_id(*)')
    .eq('disciple_person_id', personId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
  return { data: data?.[0] ?? null, error }
}

export const getMyGroups = async (personId: string) => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .select('*, victory_groups(*)')
    .eq('person_id', personId)
  return { data, error }
}

// Groups this person OWNS (leads), independent of membership — the owner of a
// group may not be listed as a member of it.
export const getGroupsOwnedByPerson = async (personId: string) => {
  const { data, error } = await supabase
    .from('victory_groups')
    .select('id')
    .eq('owner_person_id', personId)
  return { data, error }
}

// ==================== MY JOURNEY ====================
// SOAPs shared church-wide (visibility = 'constellation', the GBC wall), merged
// from both local soap_journals and iSOAP (the system of record). Mirrors
// getCoachSharedSoaps. Helpers below are referenced at call time (post module
// init), so their later declaration in this file is fine.
export const getSharedSoaps = async (limit = 12) => {
  const isoapPromise = fetchIsoapSharedSoaps({ scope: 'constellation', limit })
  const { data, error } = await supabase
    .from('soap_journals')
    .select(SHARED_SOAP_COLS)
    .eq('visibility', 'constellation')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { data, error }

  const isoap = await isoapPromise
  const merged = sortSharedByDate([
    ...((data as unknown as { journal_date: string | null; id: string }[]) ?? []),
    ...(isoap as unknown as { journal_date: string | null; id: string }[]),
  ]).slice(0, limit)
  return { data: merged, error: null }
}

export const getSharedPraises = async (limit = 12) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('id, request, is_praise, status, created_at, people!person_id(name)')
    .eq('visibility', 'constellation')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

const SHARED_SOAP_COLS = 'id, person_id, journal_date, scripture_reference, ocr_text, summary, visibility, created_at, photo_url, people(name)'

// iSOAP-sourced SOAPs shared at a given level. iSOAP has no coach/group concept,
// so the share level lives in WikiChurch's isoap_entry_visibility overlay; the
// server route (/api/soap/shared) authorizes the request per scope and fetches
// only the shared entries (their content lives in iSOAP). Body carries the scope
// ('coach'|'group'|'constellation') plus whatever id that scope needs. Best-
// effort: any failure yields [] so a shared feed never breaks on the iSOAP hop.
const fetchIsoapSharedSoaps = async (body: Record<string, unknown>) => {
  try {
    const res = await fetch('/api/soap/shared', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.entries as Record<string, unknown>[]) ?? []
  } catch {
    return []
  }
}

// Newest-journal-date-first, tiebreak id — the order used to interleave merged
// local + iSOAP shared rows into one devotional feed.
const sortSharedByDate = <T extends { journal_date: string | null; id: string }>(rows: T[]) =>
  rows.sort((a, b) => {
    const da = a.journal_date ?? ''
    const db = b.journal_date ?? ''
    return da === db ? String(b.id).localeCompare(String(a.id)) : db.localeCompare(da)
  })

// SOAPs a coach's disciples shared with their coach (visibility = 'coach'),
// from both local soap_journals and iSOAP (the system of record).
export const getCoachSharedSoaps = async (coachPersonId: string, limit = 20) => {
  const isoapPromise = fetchIsoapSharedSoaps({ scope: 'coach', coachPersonId, limit })

  const { data: conns, error: connErr } = await supabase
    .from('discipleship_connections')
    .select('disciple_person_id')
    .eq('discipler_person_id', coachPersonId)
  if (connErr) return { data: null, error: connErr }
  const ids = (conns ?? []).map(c => c.disciple_person_id).filter(Boolean)
  if (ids.length === 0) return { data: await isoapPromise, error: null }
  const { data, error } = await supabase
    .from('soap_journals')
    .select(SHARED_SOAP_COLS)
    .eq('visibility', 'coach')
    .in('person_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { data, error }

  const isoap = await isoapPromise
  const merged = sortSharedByDate([
    ...((data as unknown as { journal_date: string | null; id: string }[]) ?? []),
    ...(isoap as unknown as { journal_date: string | null; id: string }[]),
  ]).slice(0, limit)
  return { data: merged, error: null }
}

// SOAPs shared with the Grace Group(s) this person belongs to (visibility =
// 'group'), from any fellow member — merged from both local soap_journals and
// iSOAP (the system of record). Mirrors getCoachSharedSoaps.
export const getGroupSharedSoaps = async (personId: string, limit = 20) => {
  const isoapPromise = fetchIsoapSharedSoaps({ scope: 'group', personId, limit })

  const { data: myGroups, error: gErr } = await supabase
    .from('person_victory_groups')
    .select('victory_group_id')
    .eq('person_id', personId)
    .eq('status', 'approved')
  if (gErr) return { data: null, error: gErr }
  const gids = (myGroups ?? []).map(g => g.victory_group_id).filter(Boolean)
  if (gids.length === 0) return { data: await isoapPromise, error: null }
  const { data: members, error: mErr } = await supabase
    .from('person_victory_groups')
    .select('person_id')
    .in('victory_group_id', gids)
    .eq('status', 'approved')
  if (mErr) return { data: null, error: mErr }
  const pids = Array.from(new Set((members ?? []).map(m => m.person_id).filter(Boolean)))
  if (pids.length === 0) return { data: await isoapPromise, error: null }
  const { data, error } = await supabase
    .from('soap_journals')
    .select(SHARED_SOAP_COLS)
    .eq('visibility', 'group')
    .in('person_id', pids)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { data, error }

  const isoap = await isoapPromise
  const merged = sortSharedByDate([
    ...((data as unknown as { journal_date: string | null; id: string }[]) ?? []),
    ...(isoap as unknown as { journal_date: string | null; id: string }[]),
  ]).slice(0, limit)
  return { data: merged, error: null }
}

const SHARED_PRAYER_COLS = 'id, person_id, request, is_praise, status, answer_notes, visibility, media_url, created_at, people!person_id(name)'

// Prayers/praises a coach's disciples shared with their coach (visibility='coach').
// ── Per-viewer state of shared feed items (archived = recoverable via "Show
// archived"; deleted = permanently hidden for this viewer — never touches the
// author's row). target_id spans two id spaces (soap_journals or iSOAP), so no FK.
export type FeedTargetType = 'soap' | 'prayer_request'

export const getFeedItemStates = async (personId: string, targetType: FeedTargetType) => {
  const { data, error } = await supabase
    .from('feed_item_states')
    .select('target_id, state')
    .eq('person_id', personId)
    .eq('target_type', targetType)
  const archived = new Set<string>()
  const deleted = new Set<string>()
  for (const r of data ?? []) (r.state === 'deleted' ? deleted : archived).add(r.target_id as string)
  return { archived, deleted, error }
}

export const setFeedItemState = async (
  personId: string,
  targetType: FeedTargetType,
  targetId: string,
  state: 'archived' | 'deleted',
) => {
  const { error } = await supabase
    .from('feed_item_states')
    .upsert(
      { person_id: personId, target_type: targetType, target_id: targetId, state },
      { onConflict: 'person_id,target_type,target_id' },
    )
  return { error }
}

export const clearFeedItemState = async (personId: string, targetType: FeedTargetType, targetId: string) => {
  const { error } = await supabase
    .from('feed_item_states')
    .delete()
    .eq('person_id', personId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
  return { error }
}

// Prayers/praises a person has authored and shared out (to coach/group/GBC).
export const getSentPrayers = async (personId: string, limit = 50) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select(SHARED_PRAYER_COLS)
    .eq('created_by_person_id', personId)
    .neq('visibility', 'private')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

// Prayers/praises shared to the whole constellation (GBC).
export const getConstellationSharedPrayers = async (limit = 30) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select(SHARED_PRAYER_COLS)
    .eq('visibility', 'constellation')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

export const getCoachSharedPrayers = async (coachPersonId: string, limit = 30) => {
  const { data: conns, error: connErr } = await supabase
    .from('discipleship_connections')
    .select('disciple_person_id')
    .eq('discipler_person_id', coachPersonId)
  if (connErr) return { data: null, error: connErr }
  const ids = (conns ?? []).map(c => c.disciple_person_id).filter(Boolean)
  if (ids.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('prayer_requests')
    .select(SHARED_PRAYER_COLS)
    .eq('visibility', 'coach')
    .in('person_id', ids)
    // Only prayers a disciple AUTHORED and sent up — not the coach's own wall
    // prayers (which they created for the people they pray for).
    .neq('created_by_person_id', coachPersonId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

// Prayers/praises shared with the Grace Group(s) this person belongs to.
export const getGroupSharedPrayers = async (personId: string, limit = 30) => {
  const { data: myGroups, error: gErr } = await supabase
    .from('person_victory_groups')
    .select('victory_group_id')
    .eq('person_id', personId)
    .eq('status', 'approved')
  if (gErr) return { data: null, error: gErr }
  const gids = (myGroups ?? []).map(g => g.victory_group_id).filter(Boolean)
  if (gids.length === 0) return { data: [], error: null }
  const { data: members, error: mErr } = await supabase
    .from('person_victory_groups')
    .select('person_id')
    .in('victory_group_id', gids)
    .eq('status', 'approved')
  if (mErr) return { data: null, error: mErr }
  const pids = Array.from(new Set((members ?? []).map(m => m.person_id).filter(Boolean)))
  if (pids.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('prayer_requests')
    .select(SHARED_PRAYER_COLS)
    .eq('visibility', 'group')
    .in('person_id', pids)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

export const addJourneyPrayerRequest = async (
  personId: string,
  request: string,
  visibility: ShareVisibility,
  isPraise: boolean
) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .insert({
      person_id: personId,
      request,
      status: 'Active',
      visibility,
      is_praise: isPraise,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()
  return { data, error }
}

export const getSoapLeaderboard = async () => {
  const { data, error } = await supabase.rpc('soap_leaderboard')
  return { data, error }
}

export const getAttendanceLeaderboard = async () => {
  const { data, error } = await supabase.rpc('attendance_leaderboard')
  return { data, error }
}

export const saveTestimony = async (
  personId: string,
  updates: { testimony_text?: string | null; testimony_video_url?: string | null }
) => {
  const { data, error } = await supabase
    .from('people')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', personId)
    .select()
    .maybeSingle()
  return { data, error }
}

// ==================== MESSAGES ====================
export const sendMessage = async (
  fromPersonId: string,
  toPersonId: string,
  kind: 'greeting' | 'prayer' | 'note',
  body: string
) => {
  const { data, error } = await supabase
    .from('messages')
    .insert({ from_person_id: fromPersonId, to_person_id: toPersonId, kind, body })
    .select()
    .single()
  return { data, error }
}

// ==================== LEVEL SIGN-OFFS ====================
// A coach signs off on a completed level before the next unlocks.
export const getLevelSignoffs = async (personId: string) => {
  const { data, error } = await supabase
    .from('level_signoffs')
    .select('*')
    .eq('person_id', personId)
  return { data, error }
}

export const requestLevelSignoff = async (personId: string, stage: string) => {
  const { data, error } = await supabase
    .from('level_signoffs')
    .upsert(
      { person_id: personId, stage, status: 'requested', requested_at: new Date().toISOString(), approved_at: null, approved_by: null, congrats_message: null },
      { onConflict: 'person_id,stage' }
    )
    .select()
    .single()
  return { data, error }
}

// Pending sign-off requests across a coach's disciples (for the coach view).
export const getPendingLevelSignoffs = async (coachPersonId: string) => {
  const { data: conns, error: connErr } = await supabase
    .from('discipleship_connections')
    .select('disciple_person_id')
    .eq('discipler_person_id', coachPersonId)
  if (connErr) return { data: null, error: connErr }
  const discipleIds = (conns ?? []).map(c => c.disciple_person_id).filter(Boolean)
  if (discipleIds.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('level_signoffs')
    .select('*, person:people!level_signoffs_person_id_fkey(id, name, current_stage)')
    .eq('status', 'requested')
    .in('person_id', discipleIds)
    .order('requested_at', { ascending: true })
  return { data, error }
}

// All pending sign-off requests (admin view — across every disciple).
export const getAllPendingLevelSignoffs = async () => {
  const { data, error } = await supabase
    .from('level_signoffs')
    .select('*, person:people!level_signoffs_person_id_fkey(id, name, current_stage)')
    .eq('status', 'requested')
    .order('requested_at', { ascending: true })
  return { data, error }
}

export const approveLevelSignoff = async (id: string, coachPersonId: string, congrats: string) => {
  const { data, error } = await supabase
    .from('level_signoffs')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: coachPersonId, congrats_message: congrats || null })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const getMyMessages = async (
  personId: string,
  opts: { limit?: number; archived?: boolean } = {}
) => {
  const { limit = 30, archived = false } = opts
  let q = supabase
    .from('messages')
    .select('*, from:people!messages_from_person_id_fkey(id, name, current_stage)')
    .eq('to_person_id', personId)
  q = archived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
  return { data, error }
}

export const markMessageRead = async (id: string) => {
  const { data, error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .select()
  return { data: data?.[0] ?? null, error }
}

// How many messages this person has archived — drives whether the inbox shows a
// "Show archived" affordance (kept reachable even when the live inbox empties).
export const countArchivedMessages = async (personId: string) => {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('to_person_id', personId)
    .not('archived_at', 'is', null)
  return { count: count ?? 0, error }
}

// Soft-hide a message from the inbox (recoverable via "Show archived").
export const archiveMessage = async (id: string) => {
  const { error } = await supabase
    .from('messages')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
  return { error }
}

// Return an archived message to the live inbox.
export const unarchiveMessage = async (id: string) => {
  const { error } = await supabase
    .from('messages')
    .update({ archived_at: null })
    .eq('id', id)
  return { error }
}

// Permanently remove a message the person received (RLS scopes this to the
// recipient — see supabase/migrations/20260730130000_messages_archive_delete.sql).
export const deleteMessage = async (id: string) => {
  const { error } = await supabase.from('messages').delete().eq('id', id)
  return { error }
}

// ── Conversation messaging ─────────────────────────────────────

export const getMyConversations = async (personId: string) => {
  const { data: memberships, error } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at')
    .eq('person_id', personId)

  if (error || !memberships?.length) return { data: [], error }

  const convIds = memberships.map((m: any) => m.conversation_id)

  const [{ data: convData }, { data: memberData }, { data: msgData }] = await Promise.all([
    supabase.from('conversations').select('id, name, updated_at').in('id', convIds).order('updated_at', { ascending: false }),
    supabase.from('conversation_members').select('conversation_id, person_id, people!person_id(id, name)').in('conversation_id', convIds),
    supabase.from('conversation_messages').select('id, conversation_id, body, sender_id, created_at').in('conversation_id', convIds).order('created_at', { ascending: false }),
  ])

  const result = (convData ?? []).map((conv: any) => {
    const myMembership = memberships.find((m: any) => m.conversation_id === conv.id)
    const members = (memberData ?? [])
      .filter((m: any) => m.conversation_id === conv.id)
      .map((m: any) => m.people)
      .filter(Boolean) as { id: string; name: string }[]
    const lastMessage = (msgData ?? []).find((m: any) => m.conversation_id === conv.id) ?? null
    const unreadCount = (msgData ?? [])
      .filter((m: any) => m.conversation_id === conv.id && m.sender_id !== personId)
      .filter((m: any) => !myMembership?.last_read_at || m.created_at > myMembership.last_read_at)
      .length
    return {
      id: conv.id as string,
      name: conv.name as string | null,
      updatedAt: conv.updated_at as string,
      members,
      lastMessage: lastMessage ? { body: lastMessage.body, sender_id: lastMessage.sender_id, created_at: lastMessage.created_at } : null,
      lastReadAt: myMembership?.last_read_at ?? null,
      unreadCount,
    }
  })

  return { data: result, error: null }
}

export const getOrCreateDM = async (personAId: string, personBId: string) => {
  const { data, error } = await supabase.rpc('get_or_create_dm', { person_a: personAId, person_b: personBId })
  return { conversationId: data as string | null, error }
}

export const createGroupConversation = async (name: string, memberIds: string[]) => {
  const { data: conv, error } = await supabase.from('conversations').insert({ name }).select().single()
  if (error || !conv) return { data: null, error }
  await supabase.from('conversation_members').insert(memberIds.map(id => ({ conversation_id: conv.id, person_id: id })))
  return { data: conv as { id: string; name: string }, error: null }
}

export const getConversationMessages = async (conversationId: string, limit = 100) => {
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, conversation_id, sender_id, body, created_at, sender:people!sender_id(id, name)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data: data ? [...data].reverse() : data, error }
}

export const sendConversationMessage = async (conversationId: string, senderId: string, body: string) => {
  const { data, error } = await supabase
    .from('conversation_messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body })
    .select()
    .single()
  return { data, error }
}

export const markConversationRead = async (conversationId: string, personId: string) => {
  const { error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('person_id', personId)
  return { error }
}

export const deleteConversationMessage = async (messageId: string) => {
  const { error } = await supabase.from('conversation_messages').delete().eq('id', messageId)
  return { error }
}

export const deleteConversation = async (conversationId: string) => {
  await supabase.from('conversation_messages').delete().eq('conversation_id', conversationId)
  await supabase.from('conversation_members').delete().eq('conversation_id', conversationId)
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId)
  return { error }
}

export const searchPeople = async (query: string, limit = 12) => {
  const { data, error } = await supabase
    .from('people')
    .select('id, name, current_stage')
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(limit)
  return { data, error }
}
