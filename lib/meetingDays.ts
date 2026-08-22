// Multi-day weekly schedules: a group can meet on several days per week
// (victory_groups.meeting_days), with meeting_day kept in sync as the first
// day for legacy readers. These helpers are the single source of truth for
// reading a group's day list and computing occurrences from it.

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type HasMeetingDays = { meeting_day: string | null; meeting_days?: string[] | null }

// A group's weekly meeting days, in week order. Falls back to the legacy
// single meeting_day for rows written before the plural column existed.
export const daysOf = (g: HasMeetingDays): string[] => {
  const days = g.meeting_days?.length ? g.meeting_days : g.meeting_day ? [g.meeting_day] : []
  return [...new Set(days)]
    .filter(d => WEEKDAY_NAMES.includes(d))
    .sort((a, b) => WEEKDAY_NAMES.indexOf(a) - WEEKDAY_NAMES.indexOf(b))
}

// "Tuesday" → "Tue"; ["Tuesday","Thursday"] → "Tue & Thu"; three or more →
// "Mon, Wed & Fri". Single day stays full-length ("Tuesday") to match the
// existing single-day display everywhere.
export const fmtDaysShort = (days: string[]): string => {
  if (days.length === 0) return ''
  if (days.length === 1) return days[0]
  const short = days.map(d => d.slice(0, 3))
  return `${short.slice(0, -1).join(', ')} & ${short[short.length - 1]}`
}

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Next occurrence (today or later) of a single weekly day, as local YYYY-MM-DD.
export const nextOccurrenceOfDay = (day: string): string | null => {
  const target = WEEKDAY_NAMES.indexOf(day)
  if (target < 0) return null
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7))
  return toLocalDateStr(d)
}

// The soonest upcoming occurrence across all of a group's meeting days —
// the occurrence a per-meeting cancel/reschedule acts on.
export const nextOccurrenceDate = (days: string[]): string | null => {
  const dates = days.map(nextOccurrenceOfDay).filter((d): d is string => d !== null)
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null
}

// All occurrences of the group's days within [today, today + daysAhead], as
// local YYYY-MM-DD strings sorted ascending. Used by agendas that surface one
// card per meeting (a Tue & Thu group has two cards in a 7-day window).
export const occurrencesWithin = (days: string[], daysAhead: number): string[] => {
  return occurrencesAroundToday(days, 0, daysAhead)
}

// Occurrences of the group's days from `daysBack` days ago through `daysAhead`
// days from today (inclusive). Used to find overdue group sessions that still
// need attendance, without treating unbounded D-groups as a finite series.
export const occurrencesAroundToday = (days: string[], daysBack: number, daysAhead: number): string[] => {
  const targets = new Set(days.map(d => WEEKDAY_NAMES.indexOf(d)).filter(i => i >= 0))
  if (targets.size === 0) return []
  const out: string[] = []
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - Math.max(0, daysBack))
  const n = Math.max(0, daysBack) + Math.max(0, daysAhead)
  for (let i = 0; i <= n; i++) {
    if (targets.has(d.getDay())) out.push(toLocalDateStr(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// The weekday name for a 'YYYY-MM-DD' date.
export const weekdayOf = (dateStr: string): string => WEEKDAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()]

// An "all future weeks" reschedule of one occurrence: the occurrence's weekday
// is replaced by the new date's weekday, leaving the group's other days alone
// (a Tue & Thu group rescheduling Thursday→Friday becomes Tue & Fri). Returns
// the payload for updateVictoryGroup, keeping meeting_day = first day in sync.
export const shiftDayInSchedule = (days: string[], occDate: string, newDate: string): { meeting_day: string | null; meeting_days: string[] } => {
  const next = [...new Set(days.map(d => (d === weekdayOf(occDate) ? weekdayOf(newDate) : d)))]
    .sort((a, b) => WEEKDAY_NAMES.indexOf(a) - WEEKDAY_NAMES.indexOf(b))
  return { meeting_day: next[0] ?? null, meeting_days: next }
}
