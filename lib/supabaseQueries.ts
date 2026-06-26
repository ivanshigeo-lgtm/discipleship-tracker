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

// ==================== PEOPLE ====================
export const getPeople = async (stage?: Stage | Stage[]) => {
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
}

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
  return updatePerson(personId, { current_stage: newStage })
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

export const getAllEngagements = async () => {
  const { data, error } = await supabase
    .from('engagements')
    .select('*')
    .order('follow_up_date', { ascending: true, nullsFirst: false })
  return { data, error }
}

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

export const getAllPrayerRequests = async () => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
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

export const addPraise = async (personId: string, testimony: string, engagementId: string | null = null) => {
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

export const getAllActionItems = async () => {
  const { data, error } = await supabase
    .from('engagement_action_items')
    .select('*')
    .order('created_at', { ascending: false })
  return { data, error }
}

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
export const getVictoryGroups = async () => {
  const { data, error } = await supabase
    .from('victory_groups')
    .select('*')
    .order('name', { ascending: true })
  return { data, error }
}

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
export const getAllGroupMemberships = async () => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .select('person_id, victory_group_id')
  return { data, error }
}

// ==================== BOOKLET PROGRESS ====================
export const getAllBookletProgress = async () => {
  const { data, error } = await supabase
    .from('booklet_progress')
    .select('*')
  return { data, error }
}

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

export const addPersonToVictoryGroup = async (personId: string, victoryGroupId: string) => {
  const { data, error } = await supabase
    .from('person_victory_groups')
    .insert({ person_id: personId, victory_group_id: victoryGroupId })
    .select('id, person_id, victory_group_id, created_at')
    .single()
  return { data, error }
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

export const getAllStageChecklistItems = async () => {
  const { data, error } = await supabase
    .from('stage_checklist_items')
    .select('*')
    .order('person_id', { ascending: true })
    .order('stage', { ascending: true })
  return { data, error }
}

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

export const getAllDiscipleshipConnections = async () => {
  const { data, error } = await supabase
    .from('discipleship_connections')
    .select('*')
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
    .limit(60)

  if (error || !data) return { streak: 0, error }

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < data.length; i++) {
    const journalDate = new Date(data[i].journal_date)
    journalDate.setHours(0, 0, 0, 0)

    const expectedDate = new Date(today)
    expectedDate.setDate(today.getDate() - i)

    if (journalDate.getTime() === expectedDate.getTime()) {
      streak++
    } else if (i === 0 && journalDate.getTime() === expectedDate.getTime() - 86400000) {
      continue
    } else {
      break
    }
  }

  return { streak, error: null }
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
