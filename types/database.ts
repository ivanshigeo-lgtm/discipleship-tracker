export type Stage = 'Engage' | 'Establish' | 'Equip' | 'Empower'
export type ChecklistCategory = 'Tool' | 'Action Step'

export type Person = {
  id: string
  name: string
  email: string | null
  phone: string | null
  current_stage: Stage
  spiritual_birthday: string | null
  baptism_date: string | null
  notes: string | null
  status: 'Active' | 'Inactive'
  victory_group_id: string | null
  created_at: string
  updated_at: string
}

export type Engagement = {
  id: string
  person_id: string
  description: string
  follow_up_date: string | null
  status: 'Pending' | 'Completed'
  created_at: string
}

export type PrayerRequest = {
  id: string
  person_id: string
  request: string
  status: 'Active' | 'Answered'
  answered_date: string | null
  created_at: string
  updated_at: string
}

export type VictoryGroup = {
  id: string
  name: string
  meeting_day: string | null
  meeting_time: string | null
  created_at: string
}

export type PersonVictoryGroup = {
  id: string
  person_id: string
  victory_group_id: string
  created_at: string
}

export type PersonVictoryGroupWithGroup = PersonVictoryGroup & {
  victory_groups: VictoryGroup | null
}

export type PersonVictoryGroupWithPerson = PersonVictoryGroup & {
  people: Person | null
}

export type StageChecklistItem = {
  id: string
  person_id: string
  stage: Stage
  category: ChecklistCategory
  label: string
  completed: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type GroupAttendance = {
  id: string
  victory_group_id: string
  person_id: string
  meeting_date: string
  attended: boolean
  created_at: string
  updated_at: string
}

export type DiscipleshipConnection = {
  id: string
  discipler_person_id: string
  disciple_person_id: string | null
  disciple_name: string
  relationship_notes: string | null
  status: 'Identified' | 'One2One Started' | 'Actively Discipling'
  created_at: string
  updated_at: string
}
