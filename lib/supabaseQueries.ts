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

export const addPerson = async (person: Omit<Person, 'id' | 'created_at' | 'updated_at' | 'auth_user_id'>) => {
  const { data, error } = await supabase
    .from('people')
    .insert({ ...person, auth_user_id: null, updated_at: new Date().toISOString() })
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

export const addEngagement = async (engagement: Omit<Engagement, 'id' | 'created_at' | 'notes' | 'completed_at' | 'action_completed' | 'action_completed_at'> & { follow_up_time?: string | null; location?: string | null }) => {
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

export const addPrayerRequest = async (request: Omit<PrayerRequest, 'id' | 'created_at' | 'updated_at'>) => {
  const { data, error } = await supabase
    .from('prayer_requests')
    .insert({ ...request, updated_at: new Date().toISOString() })
    .select()
    .single()
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

export const addVictoryGroup = async (group: Omit<VictoryGroup, 'id' | 'created_at'>) => {
  const { data, error } = await supabase
    .from('victory_groups')
    .insert(group)
    .select()
    .single()
  return { data, error }
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
