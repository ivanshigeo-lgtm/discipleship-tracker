import { supabase } from './supabaseClient'
import type {
  Person,
  Engagement,
  PrayerRequest,
  VictoryGroup,
  Stage,
  StageChecklistItem,
  GroupAttendance,
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

export const addPerson = async (person: Omit<Person, 'id' | 'created_at' | 'updated_at' | 'auth_user_id' | 'is_admin' | 'testimony_text' | 'testimony_video_url'>) => {
  const { data, error } = await supabase
    .from('people')
    .insert({ ...person, auth_user_id: null, is_admin: false, updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data, error }
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

export const deletePerson = async (personId: string) => {
  const { data, error } = await supabase
    .from('people')
    .delete()
    .eq('id', personId)
    .select('id')
    .maybeSingle()

  if (error) return { data, error }

  if (!data) {
    return {
      data,
      error: {
        message: 'Profile was not deleted. Supabase may be missing a delete policy for people.',
      },
    }
  }

  return { data, error: null }
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
    .select('*')
    .eq('person_id', personId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export const getAllPrayerRequests = () =>
  dedup('getAllPrayerRequests', async () => {
    const { data, error } = await supabase
      .from('prayer_requests')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  })

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
    .select('*')
    .neq('visibility', 'private')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) return { data: null, error }
  if (isAdmin) return { data, error: null }

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
    if (p.visibility === 'constellation') return true
    if (p.visibility === 'coach') return downline.has(p.person_id)
    if (p.visibility === 'group') return groupMembers.has(p.person_id)
    return false
  })
  return { data: filtered, error: null }
}

// A person's whole prayer life: their own requests/praises (every visibility,
// incl. private) PLUS everything they pray over for others (the wall). Deduped.
// The same set on My Journey and the coach dashboard.
export const getPrayerLifeForPerson = async (personId: string, isAdmin: boolean) => {
  const [own, wall] = await Promise.all([
    getPrayerRequestsByPerson(personId),
    getPrayerWallForViewer(personId, isAdmin),
  ])
  const byId = new Map<string, PrayerRequest>()
  for (const p of ((own.data as PrayerRequest[]) ?? [])) byId.set(p.id, p)
  for (const p of ((wall.data as PrayerRequest[]) ?? [])) if (!byId.has(p.id)) byId.set(p.id, p)
  const merged = Array.from(byId.values()).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  return { data: merged, error: own.error || wall.error }
}

export const addPrayerRequest = async (
  request: Omit<PrayerRequest, 'id' | 'created_at' | 'updated_at' | 'visibility' | 'is_praise' | 'engagement_id'> &
    Partial<Pick<PrayerRequest, 'visibility' | 'is_praise' | 'engagement_id'>>
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

export const addVictoryGroup = async (group: Omit<VictoryGroup, 'id' | 'created_at' | 'google_calendar_event_id'>) => {
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

export const getGroupsForPerson = async (personId: string) => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .select('id, person_id, victory_group_id, created_at, victory_groups(id, name, meeting_day, meeting_time, created_at)')
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

// ==================== DISCIPLESHIP CONNECTIONS ====================
export const getDiscipleshipConnections = async (disciplerPersonId: string) => {
  const { data, error } = await supabase
    .from('discipleship_connections')
    .select('*')
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
export const getSoapJournals = async (personId: string, limit?: number) => {
  let query = supabase
    .from('soap_journals')
    .select('*')
    .eq('person_id', personId)
    .order('journal_date', { ascending: false })

  if (limit) {
    query = query.limit(limit)
  }

  const { data, error } = await query
  return { data, error }
}

export const getSoapJournalByDate = async (personId: string, date: string) => {
  const { data, error } = await supabase
    .from('soap_journals')
    .select('*')
    .eq('person_id', personId)
    .eq('journal_date', date)
    .maybeSingle()
  return { data, error }
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
  const { data, error } = await supabase
    .from('discipleship_connections')
    .select('*, discipler:people!discipler_person_id(*)')
    .eq('disciple_person_id', personId)
    .maybeSingle()
  return { data, error }
}

export const getMyGroups = async (personId: string) => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .select('*, victory_groups(*)')
    .eq('person_id', personId)
  return { data, error }
}

// ==================== MY JOURNEY ====================
export const getSharedSoaps = async (limit = 12) => {
  const { data, error } = await supabase
    .from('soap_journals')
    .select('id, journal_date, scripture_reference, ocr_text, summary, visibility, created_at, people(name)')
    .eq('visibility', 'constellation')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

export const getSharedPraises = async (limit = 12) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('id, request, is_praise, status, created_at, people(name)')
    .eq('visibility', 'constellation')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

const SHARED_SOAP_COLS = 'id, person_id, journal_date, scripture_reference, ocr_text, summary, visibility, created_at, people(name)'

// SOAPs a coach's disciples shared with their coach (visibility = 'coach').
export const getCoachSharedSoaps = async (coachPersonId: string, limit = 20) => {
  const { data: conns, error: connErr } = await supabase
    .from('discipleship_connections')
    .select('disciple_person_id')
    .eq('discipler_person_id', coachPersonId)
  if (connErr) return { data: null, error: connErr }
  const ids = (conns ?? []).map(c => c.disciple_person_id).filter(Boolean)
  if (ids.length === 0) return { data: [], error: null }
  const { data, error } = await supabase
    .from('soap_journals')
    .select(SHARED_SOAP_COLS)
    .eq('visibility', 'coach')
    .in('person_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

// SOAPs shared with the Grace Group(s) this person belongs to (visibility =
// 'group'), from any fellow member.
export const getGroupSharedSoaps = async (personId: string, limit = 20) => {
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
    .from('soap_journals')
    .select(SHARED_SOAP_COLS)
    .eq('visibility', 'group')
    .in('person_id', pids)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

const SHARED_PRAYER_COLS = 'id, person_id, request, is_praise, status, answer_notes, visibility, created_at, people(name)'

// Prayers/praises a coach's disciples shared with their coach (visibility='coach').
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

export const getMyMessages = async (personId: string, limit = 30) => {
  const { data, error } = await supabase
    .from('messages')
    .select('*, from:people!messages_from_person_id_fkey(id, name, current_stage)')
    .eq('to_person_id', personId)
    .order('created_at', { ascending: false })
    .limit(limit)
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
