export type Stage = 'Engage' | 'Establish' | 'Equip' | 'Empower'
export type ShareVisibility = 'private' | 'coach' | 'group' | 'constellation'
export type ChecklistCategory = 'Tool' | 'Action Step'
export type MeetingType = 'One2One' | 'Making Disciples' | 'Coffee' | 'Church Community' | 'Empowering Leaders'

// Chapter-based booklets on the path to Empowered leadership.
export type Booklet = 'One2One' | 'Church Community' | 'Making Disciples' | 'Empowering Leadership'

// What a Grace Group focuses on: a curriculum booklet, or a non-chapter
// material (SOAPS = Engage rhythm; Purple Book / Message Notes = Establish
// studies).
export type GroupFocus = Booklet | 'SOAPS' | 'Purple Book' | 'Message Notes'

export type BookletProgress = {
  id: string
  person_id: string
  booklet: Booklet
  current_chapter: number
  updated_at: string
}

// Latest spiritual-gifts assessment result per person (one row per person).
// responses/scores/top_gifts are stored as jsonb; shapes mirror lib/spiritualGifts.ts.
export type SpiritualGiftsResult = {
  id: string
  person_id: string
  responses: Record<string, number>
  scores: unknown[]
  top_gifts: unknown[]
  completed_at: string | null
  last_edited_by: string | null
  created_at: string
  updated_at: string
}

// Latest Big Five (OCEAN) personality result per person (one row per person).
// responses/scores are stored as jsonb; shapes mirror lib/bigFive.ts. No
// top_gifts equivalent — the Big Five has a fixed set of five traits.
export type BigFiveResult = {
  id: string
  person_id: string
  responses: Record<string, number>
  scores: unknown[]
  completed_at: string | null
  last_edited_by: string | null
  created_at: string
  updated_at: string
}

// Latest Passion Assessment (GBC) result per person (one row per person).
// Unlike gifts/Big Five this is NOT scored — `answers` (jsonb) holds the five
// reflections plus the ranked top-3 people-groups and issues (see lib/passion.ts).
export type PassionResult = {
  id: string
  person_id: string
  answers: unknown
  completed_at: string | null
  last_edited_by: string | null
  created_at: string
  updated_at: string
}

// A single ranked ministry suggestion inside a MinistryFitResult.
export type MinistryFitSuggestion = {
  ministry: string   // the ministry name (matches an entry in lib/ministries.ts)
  rationale: string  // why this person fits, grounded in their 3 assessments
  fitScore: number   // 0–100, higher = stronger fit
}

// An AI-proposed brand-new ministry the church does not yet have.
export type MinistryFitNewIdea = {
  name: string       // proposed ministry name
  rationale: string  // why it fits this person's wiring / the need it meets
}

// AI ministry-fit summary per person (capstone). Machine-generated server-side by
// /api/ministry-fit from the three Equip assessments, auto-generated once all three
// are complete, and shared (read) with both the person and their coach.
export type MinistryFitResult = {
  id: string
  person_id: string
  summary: string
  suggestions: MinistryFitSuggestion[]
  new_ministry_ideas: MinistryFitNewIdea[]
  inputs_hash: string | null
  model: string | null
  generated_at: string
  created_at: string
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
  // The coach who created/owns this engagement. With person_id, these are the
  // two "involved" parties — the only ones (besides admins) who can see it.
  created_by_person_id: string | null
  description: string
  follow_up_date: string | null
  follow_up_time: string | null
  location: string | null
  meeting_type: MeetingType | null
  // 'Cancelled' = a meeting that was scheduled but didn't happen. It stays
  // visible (with a red badge) but is excluded from overdue / needs-attention /
  // "met this week" tallies. Reopening flips it back to 'Pending'.
  status: 'Pending' | 'Completed' | 'Cancelled'
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
  engagement_id: string | null
  media_url: string | null
  created_at: string
  updated_at: string
}

// A logged stage transition, for pipeline velocity.
export type PipelineEvent = {
  id: string
  person_id: string
  from_stage: Stage | null
  to_stage: Stage
  created_at: string
}

// Checkable action point captured inside an engagement.
export type ActionItem = {
  id: string
  engagement_id: string
  text: string
  completed: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type VictoryGroup = {
  id: string
  name: string
  meeting_day: string | null
  meeting_time: string | null
  google_calendar_event_id: string | null
  owner_person_id: string | null
  focus: GroupFocus | null
  created_at: string
  last_edited_by: string | null
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

// Per-occurrence override for a recurring Grace Group meeting. Groups have no
// per-occurrence row otherwise (occurrences are derived from
// victory_groups.meeting_day/time), so cancelling or rescheduling a SINGLE
// meeting lands here, keyed by the ORIGINAL meeting_date. Rescheduling ALL
// future occurrences instead edits victory_groups.meeting_day/time directly.
export type GroupMeetingStatus = {
  id: string
  victory_group_id: string
  meeting_date: string          // the original occurrence date
  status: 'cancelled' | 'rescheduled'
  rescheduled_to: string | null  // new date when status='rescheduled'
  rescheduled_time: string | null
  note: string | null
  created_by_person_id: string | null
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
  // A disciple may have multiple coaches; at most one connection is the primary.
  // DB-defaulted (false) + partial-unique across a disciple, so optional on insert.
  is_primary?: boolean
  // The disciple's actual journey stage (joined), for deriving Engage progress.
  disciple?: { current_stage: Stage } | null
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
  // Bulk-import fields (default on the DB; optional here so normal creation
  // paths don't have to set them). date_precision='year' = undated import filed
  // under the year (journal_date = YYYY-01-01), excluded from calendar day-dots.
  date_precision?: 'day' | 'year'
  source?: 'manual' | 'imported'
  import_batch_id?: string | null
  import_seq?: number | null
  // Set when an undated import is intentionally left under its year ("misc"),
  // so it drops out of the "needs a date" review.
  date_reviewed?: boolean
  // All page photos for a multi-page entry (a SOAP that spans notebook pages).
  // photo_url stays the first page for backward compatibility.
  photo_urls?: string[] | null
  // Worker claim on a pending import photo; a recent timestamp means the
  // self-driving import chain is actively reading this page.
  processing_started_at?: string | null
  // True when this row was read from iSOAP (the SOAP system of record) rather
  // than the local soap_journals table. Editable from WikiChurch via
  // /api/soap/update (which forwards the edit to iSOAP by entry id).
  isoap?: boolean
}

export type LevelSignoff = {
  id: string
  person_id: string
  stage: Stage
  status: 'requested' | 'approved'
  congrats_message: string | null
  requested_at: string
  approved_at: string | null
  approved_by: string | null
  created_at: string
}

export type Message = {
  id: string
  from_person_id: string
  to_person_id: string
  kind: 'greeting' | 'prayer' | 'note'
  body: string
  read_at: string | null
  archived_at: string | null
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
