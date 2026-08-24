// Finite recurring *engagement* series (not standing victory_groups).
//
// New series stamp a shared `series_id` on every occurrence row. Rows created
// before that column existed have no id, so we recover a series by grouping
// sibling rows (same owner, person, description, time, meeting type) whose
// dates follow a regular cadence. The last *pending* date in a cluster of 2+
// is the last remaining occurrence — that's where the in-app "add more" note
// appears, and only for the creator (`created_by_person_id`).
//
// Every finite engagement meeting_type qualifies (One2One, Making Disciples,
// Church Community, Empowering Leaders, Coffee, untyped, …). Standing unbounded
// Grace Groups live in `victory_groups` (no end date) and are never clustered
// here.

import { type Recurrence, nextOccurrenceDates } from './recurrence'

export type SeriesOccurrence = {
  id: string
  person_id: string
  created_by_person_id: string | null
  description: string
  follow_up_date: string | null
  follow_up_time: string | null
  meeting_type: string | null
  status: 'Pending' | 'Completed' | 'Cancelled'
  series_id?: string | null
}

export type LastOfSeriesInfo = {
  engagementId: string
  seriesId: string | null
  cadence: Recurrence
  siblingIds: string[]
  occurrenceCount: number
  lastDate: string
}

export type HeuristicCluster = {
  rows: SeriesOccurrence[]
  cadence: Recurrence
  dates: string[]
}

export type SeriesBackfillAssignment = {
  seriesId: string
  cadence: Recurrence
  engagementIds: string[]
  lastDate: string
  meetingType: string | null
}

export function newSeriesId(): string {
  return crypto.randomUUID()
}

// PostgREST may hand back "09:00" or "09:00:00" for the same clock time.
export function normalizeFollowUpTime(t: string | null | undefined): string {
  if (!t) return ''
  const parts = t.trim().split(':')
  if (parts.length < 2) return t.trim()
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t.trim()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function normalizeMeetingType(t: string | null | undefined): string {
  return (t ?? '').trim().toLowerCase()
}

export function heuristicSeriesKey(e: SeriesOccurrence): string {
  return [
    e.created_by_person_id ?? '',
    e.person_id,
    (e.description ?? '').trim(),
    normalizeFollowUpTime(e.follow_up_time),
    normalizeMeetingType(e.meeting_type),
  ].join('\u0001')
}

function parse(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

export function inferCadence(sortedDates: string[]): Recurrence | null {
  if (sortedDates.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < sortedDates.length; i++) {
    const g = daysBetween(sortedDates[i - 1]!, sortedDates[i]!)
    if (g > 0) gaps.push(g)
  }
  if (gaps.length === 0) return null
  const med = median(gaps)
  if (med >= 6 && med <= 8) return 'weekly'
  if (med >= 13 && med <= 16) return 'biweekly'
  if (med >= 19 && med <= 23) return 'triweekly'
  if (med >= 26 && med <= 35) {
    const weekdays = sortedDates.map(d => parse(d).getDay())
    const daysOfMonth = sortedDates.map(d => parse(d).getDate())
    const sameWeekday = weekdays.every(w => w === weekdays[0])
    const sameCalendarDay = daysOfMonth.every(d => Math.abs(d - daysOfMonth[0]!) <= 1 || d >= 28)
    if (sameWeekday && !sameCalendarDay) return 'monthly-weekday'
    return 'monthly'
  }
  return null
}

function expectedStepDays(rec: Recurrence): number {
  switch (rec) {
    case 'weekly': return 7
    case 'biweekly': return 14
    case 'triweekly': return 21
    case 'monthly':
    case 'monthly-weekday': return 30
    default: return 7
  }
}

function clusterByCadence(sortedDates: string[], rec: Recurrence): string[][] {
  if (sortedDates.length === 0) return []
  const maxGap = expectedStepDays(rec) * 3 + 3
  const clusters: string[][] = []
  let cur: string[] = [sortedDates[0]!]
  for (let i = 1; i < sortedDates.length; i++) {
    const gap = daysBetween(cur[cur.length - 1]!, sortedDates[i]!)
    if (gap <= maxGap) cur.push(sortedDates[i]!)
    else {
      clusters.push(cur)
      cur = [sortedDates[i]!]
    }
  }
  clusters.push(cur)
  return clusters
}

function dated(rows: SeriesOccurrence[]): SeriesOccurrence[] {
  return rows.filter(r => !!r.follow_up_date)
}

// Recover finite series from rows that have no series_id. Same grouping used
// at read time and by the one-time backfill. Does not look at victory_groups.
export function clusterHeuristicSeries(rows: SeriesOccurrence[]): HeuristicCluster[] {
  const heuristic = new Map<string, SeriesOccurrence[]>()
  for (const e of rows) {
    if (e.series_id) continue
    const key = heuristicSeriesKey(e)
    const arr = heuristic.get(key) ?? []
    arr.push(e)
    heuristic.set(key, arr)
  }

  const out: HeuristicCluster[] = []
  for (const group of heuristic.values()) {
    const dates = [...new Set(dated(group).map(r => r.follow_up_date!))].sort()
    const cadence = inferCadence(dates)
    if (!cadence) continue
    for (const clusterDates of clusterByCadence(dates, cadence)) {
      if (clusterDates.length < 2) continue
      const dateSet = new Set(clusterDates)
      const clusterRows = group.filter(r => r.follow_up_date && dateSet.has(r.follow_up_date))
      const clusterCadence = inferCadence(clusterDates) ?? cadence
      out.push({ rows: clusterRows, cadence: clusterCadence, dates: clusterDates })
    }
  }
  return out
}

export function backfillSeriesAssignments(
  rows: SeriesOccurrence[],
  newId: () => string = newSeriesId,
): SeriesBackfillAssignment[] {
  return clusterHeuristicSeries(rows.filter(r => !r.series_id)).map(cluster => ({
    seriesId: newId(),
    cadence: cluster.cadence,
    engagementIds: cluster.rows.map(r => r.id),
    lastDate: cluster.dates[cluster.dates.length - 1]!,
    meetingType: cluster.rows[0]?.meeting_type ?? null,
  }))
}

function lastPendingOf(rows: SeriesOccurrence[], cadence: Recurrence): LastOfSeriesInfo | null {
  const withDates = dated(rows)
  if (withDates.length < 2) return null
  const inferred = inferCadence([...new Set(withDates.map(r => r.follow_up_date!))].sort()) ?? cadence
  const pending = withDates.filter(r => r.status === 'Pending')
  if (pending.length === 0) return null
  pending.sort((a, b) => a.follow_up_date!.localeCompare(b.follow_up_date!) || a.id.localeCompare(b.id))
  const last = pending[pending.length - 1]!
  const seriesId = rows.find(r => r.series_id)?.series_id ?? null
  return {
    engagementId: last.id,
    seriesId,
    cadence: inferred,
    siblingIds: rows.filter(r => r.id !== last.id).map(r => r.id),
    occurrenceCount: withDates.length,
    lastDate: last.follow_up_date!,
  }
}

function pushInfo(
  out: Map<string, LastOfSeriesInfo>,
  rows: SeriesOccurrence[],
  ownerPersonId: string,
  cadence: Recurrence,
) {
  const info = lastPendingOf(rows, cadence)
  if (!info) return
  const last = rows.find(r => r.id === info.engagementId)
  if (!last?.created_by_person_id || last.created_by_person_id !== ownerPersonId) return
  out.set(info.engagementId, info)
}

// Map of last-pending-occurrence id → series info, for the given series owner.
export function lastOfSeriesById(
  engagements: SeriesOccurrence[],
  ownerPersonId: string | null | undefined,
): Map<string, LastOfSeriesInfo> {
  const out = new Map<string, LastOfSeriesInfo>()
  if (!ownerPersonId) return out

  const withSeries = new Map<string, SeriesOccurrence[]>()
  const withoutSeries: SeriesOccurrence[] = []
  for (const e of engagements) {
    if (e.series_id) {
      const arr = withSeries.get(e.series_id) ?? []
      arr.push(e)
      withSeries.set(e.series_id, arr)
    } else {
      withoutSeries.push(e)
    }
  }

  for (const rows of withSeries.values()) {
    const dates = [...new Set(dated(rows).map(r => r.follow_up_date!))].sort()
    const cadence = inferCadence(dates) ?? 'weekly'
    pushInfo(out, rows, ownerPersonId, cadence)
  }

  for (const cluster of clusterHeuristicSeries(withoutSeries)) {
    pushInfo(out, cluster.rows, ownerPersonId, cluster.cadence)
  }

  return out
}

export function lastOfSeriesFor(
  engagement: SeriesOccurrence,
  all: SeriesOccurrence[],
  ownerPersonId: string | null | undefined,
): LastOfSeriesInfo | null {
  return lastOfSeriesById(all, ownerPersonId).get(engagement.id) ?? null
}

export { nextOccurrenceDates }
