// Time-of-day display.
//
// engagements.follow_up_time, victory_groups.meeting_time and
// group_meeting_statuses.rescheduled_time are all Postgres `time` columns, so
// PostgREST hands back "17:30:00" (or "17:30" when written without seconds).
// Coaches read clock time, so every *display* runs through fmtTime12.
//
// Note the asymmetry: <input type="time"> requires the raw 24-hour "HH:MM",
// so form state stays unformatted and only the rendered label is converted.
export function fmtTime12(t: string | null | undefined): string | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
