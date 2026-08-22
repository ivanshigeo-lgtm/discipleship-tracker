// Shared meeting-time helpers for overdue attendance and cancelled-archive.
// Dates are local YYYY-MM-DD, matching the rest of the agenda.

export function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Instant the meeting is considered over. With a clock time, that's that
// local time; without one, the next local midnight (end of the calendar day).
export function meetingEndsAt(date: string, time: string | null | undefined): Date {
  const d = new Date(date + 'T00:00:00')
  if (time) {
    const [h, m] = time.split(':').map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) {
      d.setHours(h, m, 0, 0)
      return d
    }
  }
  d.setDate(d.getDate() + 1)
  return d
}

export function isMeetingOverdue(
  date: string | null | undefined,
  time: string | null | undefined,
  now = new Date(),
): boolean {
  if (!date) return false
  return now.getTime() >= meetingEndsAt(date, time).getTime()
}

const DAY_MS = 24 * 60 * 60 * 1000

// Hide cancelled meetings from the default list once the owner has had a day
// to reopen them. Prefer cancelled_at (24h). Rows cancelled before that
// column existed fall back to "meeting date is before today".
export function isCancelledArchived(
  cancelledAt: string | null | undefined,
  followUpDate: string | null | undefined,
  now = new Date(),
): boolean {
  if (cancelledAt) return now.getTime() - new Date(cancelledAt).getTime() >= DAY_MS
  if (!followUpDate) return true
  return followUpDate < localDateStr(now)
}
