// Curriculum model for the "time to Empowered leader" forecast.
// The required path to become an Empowered (group-leading) disciple is the four
// chapter-based booklets below plus five non-chapter milestones. Leadership 113
// (1yr) and Leadership 215 (2yr) are supplementary and intentionally excluded.

import type { Booklet, Stage, MeetingType } from '../types/database'

export type BookletDef = {
  key: Booklet
  label: string
  chapters: number
  stage: Stage
  // The engagement meeting_type used to estimate cadence from the calendar.
  meetingType: MeetingType
}

export const BOOKLETS: BookletDef[] = [
  { key: 'One2One',               label: 'One2One',               chapters: 12, stage: 'Establish', meetingType: 'One2One' },
  { key: 'Church Community',      label: 'Church Community',      chapters: 5,  stage: 'Establish', meetingType: 'Church Community' },
  { key: 'Making Disciples',      label: 'Making Disciples',      chapters: 9,  stage: 'Equip',     meetingType: 'Making Disciples' },
  { key: 'Empowering Leadership', label: 'Empowering Leadership', chapters: 6,  stage: 'Empower',   meetingType: 'Empowering Leaders' },
]

export const TOTAL_CHAPTERS = BOOKLETS.reduce((sum, b) => sum + b.chapters, 0) // 32

export const CURRICULUM_MEETING_TYPES: MeetingType[] = BOOKLETS.map(b => b.meetingType)

// The 4E stage a group is working in, derived from the booklet it focuses on.
export function bookletStage(focus: Booklet | null): Stage | null {
  return BOOKLETS.find(b => b.key === focus)?.stage ?? null
}

export type MilestoneKey = 'saved' | 'baptized' | 'small_group' | 'serving_ministry' | 'assisting_group'

export type MilestoneDef = { key: MilestoneKey; label: string }

export const MILESTONES: MilestoneDef[] = [
  { key: 'saved',            label: 'Saved' },
  { key: 'baptized',         label: 'Baptized' },
  { key: 'small_group',      label: 'In a small group' },
  { key: 'serving_ministry', label: 'Serving in a ministry' },
  { key: 'assisting_group',  label: 'Assisting in a small group' },
]

// Checklist labels that satisfy milestones (in addition to profile date fields).
export const SERVING_MINISTRY_LABEL = 'Begin Serving in a Ministry/Mission'
export const ASSISTING_GROUP_LABEL = 'Assist in Leading Small Group'
export const SALVATION_LABEL = 'Confirm salvation / spiritual birthday'
export const BAPTISM_LABEL = 'Water baptism conversation'
export const SMALL_GROUP_LABEL = 'Connect to Small Group'
