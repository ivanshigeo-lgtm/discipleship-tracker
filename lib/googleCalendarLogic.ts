/** Pure Google Calendar sync helpers — token refresh, event payloads, account guards. */

export const CALENDAR_ID = 'primary'
export const CALENDAR_TIMEZONE = 'Pacific/Honolulu'
export const SEND_UPDATES = 'none' as const
export const IVAN_PERSONAL_GMAIL = 'ivanshigeo@gmail.com'
const REFRESH_SKEW_MS = 60_000

export type StoredGoogleTokens = {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: string | number | Date | null
  google_account_email?: string | null
}

export type MergedGoogleTokens = {
  access_token: string | null
  refresh_token: string | null
  expiry_date: number | null
  google_account_email: string | null
}

export function calendarWriteSkipReason(
  tokens: StoredGoogleTokens | null | undefined,
): 'not_connected' | null {
  if (!tokens) return 'not_connected'
  if (!tokens.access_token && !tokens.refresh_token) return 'not_connected'
  return null
}

export function googleAccountBlockedReason(googleEmail: string | null | undefined): string | null {
  if (!googleEmail) return null
  if (googleEmail.trim().toLowerCase() === IVAN_PERSONAL_GMAIL) {
    return `${IVAN_PERSONAL_GMAIL} is Ivan's personal calendar, not the church calendar. Connect the church Gmail (jasato@gmail.com for Jonavan) instead. Events must not be written to ${IVAN_PERSONAL_GMAIL}.`
  }
  return null
}

export function googleAccountMismatchWarning(opts: {
  googleEmail: string | null | undefined
  personEmail: string | null | undefined
}): string | null {
  const google = opts.googleEmail?.trim().toLowerCase()
  const person = opts.personEmail?.trim().toLowerCase()
  if (!google || !person) return null
  if (google === person) return null
  return `Connected Google account ${google} does not match ${person}. Events will be written to ${google}.`
}

export function accessTokenNeedsRefresh(
  expiryDate: StoredGoogleTokens['expiry_date'],
  nowMs: number,
  skewMs = REFRESH_SKEW_MS,
): boolean {
  if (expiryDate == null || expiryDate === '') return true
  const expiryMs = typeof expiryDate === 'number' ? expiryDate : new Date(expiryDate).getTime()
  if (!Number.isFinite(expiryMs)) return true
  return expiryMs <= nowMs + skewMs
}

function expiryToMs(value: StoredGoogleTokens['expiry_date']): number | null {
  if (value == null || value === '') return null
  const ms = typeof value === 'number' ? value : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function mergeGoogleTokens(
  existing: StoredGoogleTokens,
  incoming: StoredGoogleTokens,
): MergedGoogleTokens {
  return {
    access_token: incoming.access_token ?? existing.access_token ?? null,
    refresh_token: incoming.refresh_token ?? existing.refresh_token ?? null,
    expiry_date: expiryToMs(incoming.expiry_date) ?? expiryToMs(existing.expiry_date),
    google_account_email: incoming.google_account_email ?? existing.google_account_email ?? null,
  }
}

export async function persistRefreshedGoogleTokens(opts: {
  stored: StoredGoogleTokens
  nowMs: number
  getAccessToken: () => Promise<{
    token?: string | null
    expiry_date?: number | null
    refresh_token?: string | null
  }>
  save: (merged: MergedGoogleTokens) => Promise<void>
}): Promise<{ refreshed: boolean }> {
  const hasUsableAccess =
    Boolean(opts.stored.access_token) && !accessTokenNeedsRefresh(opts.stored.expiry_date, opts.nowMs)
  if (hasUsableAccess) {
    return { refreshed: false }
  }
  if (!opts.stored.refresh_token) {
    throw new Error('Google access token expired and no refresh_token is stored. Reconnect Google Calendar.')
  }

  let incoming: { token?: string | null; expiry_date?: number | null; refresh_token?: string | null }
  try {
    incoming = await opts.getAccessToken()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Google token refresh failed: ${message}`)
  }

  const merged = mergeGoogleTokens(opts.stored, {
    access_token: incoming.token,
    refresh_token: incoming.refresh_token,
    expiry_date: incoming.expiry_date,
  })
  if (!merged.access_token) {
    throw new Error('Google token refresh returned no access_token. Reconnect Google Calendar.')
  }

  try {
    await opts.save(merged)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to persist refreshed Google tokens: ${message}`)
  }

  return { refreshed: true }
}

export function normalizeClockTime(time?: string | null): string | undefined {
  if (!time) return undefined
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return undefined
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

export function addHour(time: string): string {
  const normalized = normalizeClockTime(time) ?? '09:00'
  const [hours, minutes] = normalized.split(':').map(Number)
  const newHours = ((hours ?? 0) + 1) % 24
  return `${newHours.toString().padStart(2, '0')}:${(minutes ?? 0).toString().padStart(2, '0')}`
}

export function engagementEventSummary(
  personName: string,
  description?: string | null,
  meetingType?: string | null,
): string {
  return `${personName}: ${description || meetingType || 'Meeting'}`
}

export function groupEventSummary(groupName: string): string {
  return `Grace Group: ${groupName}`
}

export function calendarToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CALENDAR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

type TimedEvent = {
  summary: string
  description?: string
  location?: string
  startDate: string
  startTime?: string
  endTime?: string
}

function timedDateTimes(event: TimedEvent): { startDateTime: string; endDateTime: string } {
  const startTime = normalizeClockTime(event.startTime) ?? '09:00'
  const endTime = normalizeClockTime(event.endTime) ?? addHour(startTime)
  return {
    startDateTime: `${event.startDate}T${startTime}:00`,
    endDateTime: `${event.startDate}T${endTime}:00`,
  }
}

export function engagementEventInsertParams(event: TimedEvent) {
  const { startDateTime, endDateTime } = timedDateTimes(event)
  return {
    calendarId: CALENDAR_ID,
    sendUpdates: SEND_UPDATES,
    requestBody: {
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: { dateTime: startDateTime, timeZone: CALENDAR_TIMEZONE },
      end: { dateTime: endDateTime, timeZone: CALENDAR_TIMEZONE },
    },
  }
}

export function deleteEventParams(eventId: string) {
  return {
    calendarId: CALENDAR_ID,
    eventId,
    sendUpdates: SEND_UPDATES,
  }
}

export function groupRecurringEventParams(event: {
  summary: string
  description?: string
  startDate: string
  time?: string
  rruleDay: string
}) {
  const startTime = normalizeClockTime(event.time) ?? '19:00'
  const endTime = addHour(startTime)
  return {
    calendarId: CALENDAR_ID,
    sendUpdates: SEND_UPDATES,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: `${event.startDate}T${startTime}:00`, timeZone: CALENDAR_TIMEZONE },
      end: { dateTime: `${event.startDate}T${endTime}:00`, timeZone: CALENDAR_TIMEZONE },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${event.rruleDay}`],
    },
  }
}

export function isGoogleNotFound(error: unknown): boolean {
  const err = error as { code?: number | string; status?: number; response?: { status?: number } }
  const status = err?.response?.status ?? err?.status ?? err?.code
  return status === 404 || status === '404'
}
