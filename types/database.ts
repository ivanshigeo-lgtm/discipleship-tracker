export type Stage = 'Engage' | 'Establish' | 'Equip' | 'Empower'
export type ShareVisibility = 'private' | 'coach' | 'group' | 'constellation'
export type ChecklistCategory = 'Tool' | 'Action Step'
export type MeetingType = 'One2One' | 'Making Disciples' | 'Coffee' | 'Church Community' | 'Empowering Leaders'

// Chapter-based booklets on the path to Empowered leadership.
export type Booklet = 'One2One' | 'Church Community' | 'Making Disciples' | 'Empowering Leadership'

export type BookletProgress = {
  id: string
  person_id: string
  booklet: Booklet
  current_chapter: number
  updated_at: string
}

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
  priority: boolean
  victory_group_id: string | null
  auth_user_id: string | null
  is_admin: boolean
  testimony_text: string | null
  testimony_video_url: string | null
  created_at: string
  updated_at: string
}

export type Engagement = {
  id: string
  person_id: string
  description: string
  follow_up_date: string | null
  follow_up_time: string | null
  location: string | null
  meeting_type: MeetingType | null
  status: 'Pending' | 'Completed'
  notes: string | null
  completed_at: string | null
  action_completed: boolean
  action_completed_at: string | null
  google_calendar_event_id: string | null
  created_at: string
}

export type PrayerRequest = {
  id: string
  person_id: string
  request: string
  status: 'Active' | 'Answered'
  answered_date: string | null
  answer_notes: string | null
  visibility: ShareVisibility
  is_praise: boolean
  created_at: string
  updated_at: string
}

export type VictoryGroup = {
  id: string
  name: string
  meeting_day: string | null
  meeting_time: string | null
  google_calendar_event_id: string | null
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

export type SoapJournal = {
  id: string
  person_id: string
  journal_date: string
  photo_url: string | null
  ocr_text: string | null
  scripture_reference: string | null
  summary: string | null
  visibility: ShareVisibility
  created_at: string
  updated_at: string
}

export type Message = {
  id: string
  from_person_id: string
  to_person_id: string
  kind: 'greeting' | 'prayer' | 'note'
  body: string
  read_at: string | null
  created_at: string
}

export type Conversation = {
  id: string
  name: string | null
  created_at: string
  updated_at: string
}

export type ConversationMember = {
  id: string
  conversation_id: string
  person_id: string
  last_read_at: string | null
  joined_at: string
}

export type ConversationMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export type ConversationSummary = {
  id: string
  name: string | null
  updatedAt: string
  members: { id: string; name: string }[]
  lastMessage: { body: string; sender_id: string; created_at: string } | null
  lastReadAt: string | null
  unreadCount: number
}

export type InviteToken = {
  id: string
  person_id: string
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
}
