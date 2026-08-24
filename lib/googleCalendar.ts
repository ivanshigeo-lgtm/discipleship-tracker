import { google } from 'googleapis'
import type { Credentials } from 'google-auth-library'
import { getSupabaseAdmin } from './supabaseServer'
import {
  calendarToday,
  calendarWriteSkipReason,
  deleteEventParams,
  engagementEventInsertParams,
  engagementEventSummary,
  googleAccountBlockedReason,
  groupEventSummary,
  groupRecurringEventParams,
  isGoogleNotFound,
  mergeGoogleTokens,
  persistRefreshedGoogleTokens,
  type StoredGoogleTokens,
} from './googleCalendarLogic'

const REDIRECT_URI = 'https://discipleship-tracker-ten.vercel.app/api/auth/google/callback'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('Missing Google OAuth credentials:', { clientId: !!clientId, clientSecret: !!clientSecret })
    throw new Error('Google OAuth not configured')
  }

  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

export function getAuthUrl(personId: string) {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state: personId,
  })
}

export async function getTokensFromCode(code: string) {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function readGoogleAccountEmail(tokens: Credentials): Promise<string | null> {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials(tokens)
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data } = await oauth2.userinfo.get()
    return data.email ?? null
  } catch (error) {
    console.error('Failed to read Google account email:', error)
    return null
  }
}

export async function saveGoogleTokens(personId: string, tokens: StoredGoogleTokens) {
  const existing = await getGoogleTokens(personId)
  const merged = mergeGoogleTokens(existing ?? {}, tokens)
  const supabase = getSupabaseAdmin()
  const row: Record<string, unknown> = {
    person_id: personId,
    access_token: merged.access_token,
    expiry_date: merged.expiry_date ? new Date(merged.expiry_date).toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  // Never PUT a null refresh_token — Google omits it on refresh, and a failed
  // re-read of the existing row must not wipe the stored refresh token.
  if (merged.refresh_token) {
    row.refresh_token = merged.refresh_token
  }
  if (merged.google_account_email) {
    row.google_account_email = merged.google_account_email
  }

  const { error } = await supabase
    .from('google_calendar_tokens')
    .upsert(row, { onConflict: 'person_id' })

  if (error) {
    console.error('Error saving Google tokens:', error)
    throw error
  }
}

export async function getGoogleTokens(personId: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()

  if (error) {
    console.error('Error getting Google tokens:', error)
    return null
  }

  return data
}

export async function deleteGoogleTokens(personId: string) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('google_calendar_tokens')
    .delete()
    .eq('person_id', personId)

  if (error) {
    console.error('Error deleting Google tokens:', error)
    throw error
  }
}

export async function getAuthedCalendar(personId: string) {
  const tokens = await getGoogleTokens(personId)
  if (calendarWriteSkipReason(tokens)) return null

  const blocked = googleAccountBlockedReason(tokens.google_account_email)
  if (blocked) {
    throw new Error(blocked)
  }

  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: tokens.access_token ?? undefined,
    refresh_token: tokens.refresh_token ?? undefined,
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : undefined,
  })

  // Refresh (if needed) and persist BEFORE any Calendar API call. The
  // on('tokens') listener is fire-and-forget; on Vercel the isolate can freeze
  // before that save finishes, so we cannot rely on it to keep expiry_date current.
  await persistRefreshedGoogleTokens({
    stored: tokens,
    nowMs: Date.now(),
    getAccessToken: async () => {
      const { token } = await oauth2Client.getAccessToken()
      return {
        token: token ?? oauth2Client.credentials.access_token ?? null,
        expiry_date: oauth2Client.credentials.expiry_date ?? null,
        refresh_token: oauth2Client.credentials.refresh_token ?? null,
      }
    },
    save: async (merged) => {
      await saveGoogleTokens(personId, merged)
      oauth2Client.setCredentials({
        access_token: merged.access_token ?? undefined,
        refresh_token: merged.refresh_token ?? undefined,
        expiry_date: merged.expiry_date ?? undefined,
      })
    },
  })

  if (!tokens.google_account_email) {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const { data } = await oauth2.userinfo.get()
      if (data.email) {
        const emailBlock = googleAccountBlockedReason(data.email)
        if (emailBlock) throw new Error(emailBlock)
        await saveGoogleTokens(personId, { google_account_email: data.email })
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Events must not be written')) {
        throw error
      }
      console.error('Could not backfill google_account_email:', error)
    }
  }

  oauth2Client.on('tokens', (newTokens) => {
    void saveGoogleTokens(personId, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expiry_date: newTokens.expiry_date,
    }).catch((err) => {
      console.error('Failed to persist Google tokens from on(tokens):', err)
    })
  })

  return google.calendar({ version: 'v3', auth: oauth2Client })
}

export async function createCalendarEvent(
  personId: string,
  event: {
    summary: string
    description?: string
    location?: string
    startDate: string
    startTime?: string
    endTime?: string
  }
) {
  const calendar = await getAuthedCalendar(personId)
  if (!calendar) return null

  const response = await calendar.events.insert(engagementEventInsertParams(event))
  return response.data.id ?? null
}

export async function updateCalendarEvent(
  personId: string,
  eventId: string,
  event: {
    summary: string
    description?: string
    location?: string
    startDate: string
    startTime?: string
    endTime?: string
  }
) {
  const calendar = await getAuthedCalendar(personId)
  if (!calendar) return false

  await calendar.events.update({
    ...engagementEventInsertParams(event),
    eventId,
  })
  return true
}

export async function deleteCalendarEvent(personId: string, eventId: string) {
  const calendar = await getAuthedCalendar(personId)
  if (!calendar) return false

  try {
    await calendar.events.delete(deleteEventParams(eventId))
    return true
  } catch (error) {
    if (isGoogleNotFound(error)) return true
    throw error
  }
}

const DAY_TO_RRULE: Record<string, string> = {
  'Sunday': 'SU',
  'Monday': 'MO',
  'Tuesday': 'TU',
  'Wednesday': 'WE',
  'Thursday': 'TH',
  'Friday': 'FR',
  'Saturday': 'SA',
}

function getNextDayDate(dayName: string): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = new Date()
  const todayIndex = today.getDay()
  const targetIndex = days.indexOf(dayName)

  let daysUntil = targetIndex - todayIndex
  if (daysUntil <= 0) daysUntil += 7

  const nextDate = new Date(today)
  nextDate.setDate(today.getDate() + daysUntil)

  return nextDate.toISOString().split('T')[0]
}

export async function createRecurringCalendarEvent(
  personId: string,
  event: {
    summary: string
    description?: string
    dayOfWeek: string
    time?: string
  }
) {
  const calendar = await getAuthedCalendar(personId)
  if (!calendar) return null

  const rruleDay = DAY_TO_RRULE[event.dayOfWeek]
  if (!rruleDay) return null

  const response = await calendar.events.insert(groupRecurringEventParams({
    summary: event.summary,
    description: event.description,
    startDate: getNextDayDate(event.dayOfWeek),
    time: event.time,
    rruleDay,
  }))
  return response.data.id ?? null
}

export async function updateRecurringCalendarEvent(
  personId: string,
  eventId: string,
  event: {
    summary: string
    description?: string
    dayOfWeek: string
    time?: string
  }
) {
  const calendar = await getAuthedCalendar(personId)
  if (!calendar) return false

  const rruleDay = DAY_TO_RRULE[event.dayOfWeek]
  if (!rruleDay) return false

  await calendar.events.update({
    ...groupRecurringEventParams({
      summary: event.summary,
      description: event.description,
      startDate: getNextDayDate(event.dayOfWeek),
      time: event.time,
      rruleDay,
    }),
    eventId,
  })
  return true
}

export type CalendarBackfillResult = {
  created: number
  failed: number
  skipped: number
  errors: string[]
}

export async function backfillMissingCalendarEvents(personId: string): Promise<CalendarBackfillResult> {
  const result: CalendarBackfillResult = { created: 0, failed: 0, skipped: 0, errors: [] }
  const tokens = await getGoogleTokens(personId)
  if (calendarWriteSkipReason(tokens)) {
    result.skipped = 1
    result.errors.push('not_connected')
    return result
  }

  const supabase = getSupabaseAdmin()
  const today = calendarToday()

  const { data: engagements, error: engError } = await supabase
    .from('engagements')
    .select('id, person_id, description, follow_up_date, follow_up_time, location, meeting_type, notes')
    .eq('created_by_person_id', personId)
    .gte('follow_up_date', today)
    .neq('status', 'Cancelled')
    .is('google_calendar_event_id', null)

  if (engError) {
    throw engError
  }

  const personIds = [...new Set((engagements ?? []).map((row) => row.person_id as string))]
  const names = new Map<string, string>()
  if (personIds.length > 0) {
    const { data: people } = await supabase.from('people').select('id, name').in('id', personIds)
    for (const person of people ?? []) {
      names.set(person.id as string, person.name as string)
    }
  }

  for (const row of engagements ?? []) {
    if (!row.follow_up_date) {
      result.skipped += 1
      continue
    }
    try {
      const eventId = await createCalendarEvent(personId, {
        summary: engagementEventSummary(
          names.get(row.person_id as string) || 'Someone',
          row.description as string | null,
          row.meeting_type as string | null,
        ),
        description: (row.notes as string | null) || undefined,
        location: (row.location as string | null) || undefined,
        startDate: row.follow_up_date as string,
        startTime: (row.follow_up_time as string | null) || undefined,
      })
      if (!eventId) {
        result.failed += 1
        result.errors.push(`engagement ${row.id}: not_connected`)
        continue
      }
      const { error: updateError } = await supabase
        .from('engagements')
        .update({ google_calendar_event_id: eventId })
        .eq('id', row.id)
      if (updateError) throw updateError
      result.created += 1
    } catch (error) {
      result.failed += 1
      result.errors.push(`engagement ${row.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const { data: groups, error: groupError } = await supabase
    .from('victory_groups')
    .select('id, name, meeting_day, meeting_time')
    .eq('owner_person_id', personId)
    .is('google_calendar_event_id', null)
    .not('meeting_day', 'is', null)

  if (groupError) {
    throw groupError
  }

  for (const group of groups ?? []) {
    try {
      const eventId = await createRecurringCalendarEvent(personId, {
        summary: groupEventSummary(group.name as string),
        description: 'Weekly Grace Group meeting',
        dayOfWeek: group.meeting_day as string,
        time: (group.meeting_time as string | null) || undefined,
      })
      if (!eventId) {
        result.failed += 1
        result.errors.push(`group ${group.id}: create_failed`)
        continue
      }
      const { error: updateError } = await supabase
        .from('victory_groups')
        .update({ google_calendar_event_id: eventId })
        .eq('id', group.id)
      if (updateError) throw updateError
      result.created += 1
    } catch (error) {
      result.failed += 1
      result.errors.push(`group ${group.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return result
}
