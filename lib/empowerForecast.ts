// "Time to Empowered leader" forecast.
//
// For an emerging leader, estimates how long until they cross into Empower based
// on chapters remaining across the four required booklets and their actual
// meeting cadence from the engagement calendar. Milestones (saved, baptized,
// etc.) gate readiness but don't add time to the clock — chapters drive it.

import type { Person, Engagement, BookletProgress, Booklet } from '../types/database'
import {
  BOOKLETS,
  TOTAL_CHAPTERS,
  MILESTONES,
  CURRICULUM_MEETING_TYPES,
  type MilestoneKey,
} from './curriculum'

const DAY_MS = 1000 * 60 * 60 * 24
const DEFAULT_WEEKS_PER_CHAPTER = 1 // user's "~one chapter a week" estimate
const MIN_WEEKS_PER_CHAPTER = 0.5
const MAX_WEEKS_PER_CHAPTER = 4

export type MilestoneStatus = Record<MilestoneKey, boolean>

export type BookletStatus = {
  key: Booklet
  label: string
  chapters: number
  current: number
  remaining: number
  done: boolean
}

export type EmpowerForecast = {
  person: Person
  booklets: BookletStatus[]
  currentBooklet: BookletStatus | null
  chaptersDone: number
  chaptersTotal: number
  chaptersLeft: number
  weeksPerChapter: number
  cadenceFromData: boolean
  etaWeeks: number
  projectedDate: Date | null
  milestones: { key: MilestoneKey; label: string; met: boolean }[]
  milestonesMet: number
  milestonesTotal: number
  unmetMilestones: string[]
  isReady: boolean
  percentComplete: number
}

// Median gap (in weeks) between a person's completed curriculum meetings, used
// as weeks-per-chapter. Falls back to the flat estimate when there's too little
// history to be meaningful.
function weeksPerChapterFor(engagements: Engagement[]): { weeks: number; fromData: boolean } {
  const dates = engagements
    .filter(e => e.status === 'Completed' && e.meeting_type && CURRICULUM_MEETING_TYPES.includes(e.meeting_type))
    .map(e => e.completed_at || e.follow_up_date)
    .filter((d): d is string => !!d)
    .map(d => new Date(d + (d.length === 10 ? 'T00:00:00' : '')).getTime())
    .sort((a, b) => a - b)

  if (dates.length < 3) return { weeks: DEFAULT_WEEKS_PER_CHAPTER, fromData: false }

  const gaps: number[] = []
  for (let i = 1; i < dates.length; i++) {
    const days = (dates[i] - dates[i - 1]) / DAY_MS
    if (days > 0) gaps.push(days)
  }
  if (gaps.length === 0) return { weeks: DEFAULT_WEEKS_PER_CHAPTER, fromData: false }

  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const medianDays = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2
  const weeks = Math.min(MAX_WEEKS_PER_CHAPTER, Math.max(MIN_WEEKS_PER_CHAPTER, medianDays / 7))
  return { weeks, fromData: true }
}

export function computeForecast(
  person: Person,
  progressRows: BookletProgress[],
  milestones: MilestoneStatus,
  engagements: Engagement[],
  now: Date = new Date(),
): EmpowerForecast {
  const byBooklet = new Map(progressRows.map(p => [p.booklet, p.current_chapter]))

  const booklets: BookletStatus[] = BOOKLETS.map(b => {
    const current = Math.min(b.chapters, Math.max(0, byBooklet.get(b.key) ?? 0))
    return {
      key: b.key,
      label: b.label,
      chapters: b.chapters,
      current,
      remaining: b.chapters - current,
      done: current >= b.chapters,
    }
  })

  const chaptersDone = booklets.reduce((sum, b) => sum + b.current, 0)
  const chaptersLeft = TOTAL_CHAPTERS - chaptersDone
  const currentBooklet = booklets.find(b => !b.done) ?? null

  const { weeks: weeksPerChapter, fromData } = weeksPerChapterFor(engagements)
  const etaWeeks = Math.round(chaptersLeft * weeksPerChapter)
  const projectedDate =
    chaptersLeft > 0 ? new Date(now.getTime() + etaWeeks * 7 * DAY_MS) : null

  const milestoneList = MILESTONES.map(m => ({ key: m.key, label: m.label, met: !!milestones[m.key] }))
  const milestonesMet = milestoneList.filter(m => m.met).length
  const unmetMilestones = milestoneList.filter(m => !m.met).map(m => m.label)

  const isReady = chaptersLeft === 0 && milestonesMet === MILESTONES.length

  // Single progress number across all 32 chapters + 5 milestones (37 units).
  const totalUnits = TOTAL_CHAPTERS + MILESTONES.length
  const percentComplete = Math.round(((chaptersDone + milestonesMet) / totalUnits) * 100)

  return {
    person,
    booklets,
    currentBooklet,
    chaptersDone,
    chaptersTotal: TOTAL_CHAPTERS,
    chaptersLeft,
    weeksPerChapter,
    cadenceFromData: fromData,
    etaWeeks,
    projectedDate,
    milestones: milestoneList,
    milestonesMet,
    milestonesTotal: MILESTONES.length,
    unmetMilestones,
    isReady,
    percentComplete,
  }
}

// Short label for a projected date, e.g. "late Aug" / "mid Sep 2027".
export function projectedLabel(date: Date | null, now: Date = new Date()): string {
  if (!date) return 'now'
  const month = date.toLocaleString('en-US', { month: 'short' })
  const day = date.getDate()
  const part = day <= 10 ? 'early' : day <= 20 ? 'mid' : 'late'
  const yearSuffix = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : ''
  return `${part} ${month}${yearSuffix}`
}
