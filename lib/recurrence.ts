// Recurrence cadences for scheduling engagements. Each cadence expands a start
// date (bounded by an "until" date) into a list of occurrence dates (YYYY-MM-DD).
// Occurrences are materialized as individual engagement rows on creation.

export type Recurrence =
  | 'none'
  | 'weekly'
  | 'biweekly'
  | 'triweekly'
  | 'monthly'
  | 'monthly-weekday'

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every other week' },
  { value: 'triweekly', label: 'Every 3 weeks' },
  { value: 'monthly', label: 'Every month (same date)' },
  { value: 'monthly-weekday', label: 'Monthly (same weekday)' },
]

const WEEKS_PER: Partial<Record<Recurrence, number>> = { weekly: 1, biweekly: 2, triweekly: 3 }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th']
export const MAX_OCCURRENCES = 60 // safety cap

function parse(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function lastDayOfMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate()
}

// The Nth occurrence of `weekday` in a month; for ordinal 5 ("last") falls back
// to the final occurrence when there's no true 5th.
function nthWeekdayOfMonth(year: number, monthIdx: number, weekday: number, ordinal: number): Date {
  const first = new Date(year, monthIdx, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  let day = 1 + offset + (ordinal - 1) * 7
  if (day > lastDayOfMonth(year, monthIdx)) day -= 7 // no Nth → use the last one
  return new Date(year, monthIdx, day)
}

// Which occurrence of its own weekday a date is within its month (1–5).
function weekdayOrdinal(d: Date): number {
  return Math.floor((d.getDate() - 1) / 7) + 1
}

// A human label for the chosen cadence, given the start date (for weekday/date detail).
export function recurrenceLabel(rec: Recurrence, startStr: string): string {
  const base = RECURRENCE_OPTIONS.find(o => o.value === rec)?.label ?? ''
  if (!startStr) return base
  const d = parse(startStr)
  if (rec === 'monthly-weekday') return `Every ${ORDINALS[weekdayOrdinal(d)]} ${WEEKDAYS[d.getDay()]}`
  if (rec === 'monthly') return `Every month on the ${d.getDate()}${daySuffix(d.getDate())}`
  return base
}

function daySuffix(n: number): string {
  if (n >= 11 && n <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

// Weekly cadences across multiple weekdays (a 1:1 that meets Tue AND Thu):
// each selected weekday runs as its own series — every `weeks` weeks from its
// first occurrence on or after `start`. Non-weekly cadences and an empty day
// list fall back to the single-series expansion.
export function recurrenceDatesMultiDay(start: string, until: string, rec: Recurrence, weekdays: number[]): string[] {
  const weeks = WEEKS_PER[rec]
  if (!start || !weeks || weekdays.length === 0) return recurrenceDates(start, until, rec)
  if (!until || until < start) return [start]

  const startDate = parse(start)
  const untilDate = parse(until)
  const out = new Set<string>()
  for (const wd of weekdays) {
    let cur = addDays(startDate, (wd - startDate.getDay() + 7) % 7)
    while (cur <= untilDate && out.size < MAX_OCCURRENCES) {
      out.add(fmt(cur))
      cur = addDays(cur, weeks * 7)
    }
  }
  return [...out].sort()
}

// Expand a recurrence into occurrence dates from `start` up to and including
// `until`. 'none' (or a missing until) yields just the start date.
export function recurrenceDates(start: string, until: string, rec: Recurrence): string[] {
  if (!start) return ['']
  if (rec === 'none' || !until || until < start) return [start]

  const startDate = parse(start)
  const untilDate = parse(until)
  const out: string[] = []

  const weeks = WEEKS_PER[rec]
  if (weeks) {
    let cur = startDate
    while (cur <= untilDate && out.length < MAX_OCCURRENCES) {
      out.push(fmt(cur))
      cur = addDays(cur, weeks * 7)
    }
    return out
  }

  if (rec === 'monthly') {
    const day = startDate.getDate()
    let y = startDate.getFullYear()
    let m = startDate.getMonth()
    while (out.length < MAX_OCCURRENCES) {
      const clamped = Math.min(day, lastDayOfMonth(y, m))
      const d = new Date(y, m, clamped)
      if (d > untilDate) break
      if (d >= startDate) out.push(fmt(d))
      m++
      if (m > 11) { m = 0; y++ }
    }
    return out
  }

  if (rec === 'monthly-weekday') {
    const weekday = startDate.getDay()
    const ordinal = weekdayOrdinal(startDate)
    let y = startDate.getFullYear()
    let m = startDate.getMonth()
    while (out.length < MAX_OCCURRENCES) {
      const d = nthWeekdayOfMonth(y, m, weekday, ordinal)
      if (d > untilDate) break
      if (d >= startDate) out.push(fmt(d))
      m++
      if (m > 11) { m = 0; y++ }
    }
    return out
  }

  return [start]
}

// Dates strictly after `after` for `count` more occurrences of `rec`.
// Used when extending a finite series ("add 4 more weeks") without an until-date.
export function nextOccurrenceDates(after: string, count: number, rec: Recurrence): string[] {
  if (!after || rec === 'none' || count <= 0) return []
  const n = Math.min(Math.floor(count), MAX_OCCURRENCES)
  const untilDate = parse(after)
  untilDate.setFullYear(untilDate.getFullYear() + 6)
  return recurrenceDates(after, fmt(untilDate), rec).filter(d => d > after).slice(0, n)
}
