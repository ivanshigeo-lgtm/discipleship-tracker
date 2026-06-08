import { google } from 'googleapis'
import { getSupabaseAdmin } from './supabaseServer'

const REDIRECT_URI = 'https://discipleship-tracker-ten.vercel.app/api/auth/google/callback'

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
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: personId,
  })
}

export async function getTokensFromCode(code: string) {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function saveGoogleTokens(personId: string, tokens: {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
}) {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('google_calendar_tokens')
    .upsert({
      person_id: personId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'person_id' })

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
  if (!tokens) return null

  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : undefined,
  })

  // Handle token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    await saveGoogleTokens(personId, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expiry_date: newTokens.expiry_date,
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

  const startDateTime = event.startTime
    ? `${event.startDate}T${event.startTime}:00`
    : `${event.startDate}T09:00:00`

  const endDateTime = event.endTime
    ? `${event.startDate}T${event.endTime}:00`
    : event.startTime
      ? `${event.startDate}T${addHour(event.startTime)}:00`
      : `${event.startDate}T10:00:00`

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: {
          dateTime: startDateTime,
          timeZone: 'Pacific/Honolulu',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'Pacific/Honolulu',
        },
      },
    })
    return response.data.id
  } catch (error) {
    console.error('Error creating calendar event:', error)
    return null
  }
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

  const startDateTime = event.startTime
    ? `${event.startDate}T${event.startTime}:00`
    : `${event.startDate}T09:00:00`

  const endDateTime = event.endTime
    ? `${event.startDate}T${event.endTime}:00`
    : event.startTime
      ? `${event.startDate}T${addHour(event.startTime)}:00`
      : `${event.startDate}T10:00:00`

  try {
    await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: {
          dateTime: startDateTime,
          timeZone: 'Pacific/Honolulu',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'Pacific/Honolulu',
        },
      },
    })
    return true
  } catch (error) {
    console.error('Error updating calendar event:', error)
    return false
  }
}

export async function deleteCalendarEvent(personId: string, eventId: string) {
  const calendar = await getAuthedCalendar(personId)
  if (!calendar) return false

  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    })
    return true
  } catch (error) {
    console.error('Error deleting calendar event:', error)
    return false
  }
}

function addHour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const newHours = (hours + 1) % 24
  return `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
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

  const startDate = getNextDayDate(event.dayOfWeek)
  const startTime = event.time || '19:00'
  const endTime = addHour(startTime)

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: {
          dateTime: `${startDate}T${startTime}:00`,
          timeZone: 'Pacific/Honolulu',
        },
        end: {
          dateTime: `${startDate}T${endTime}:00`,
          timeZone: 'Pacific/Honolulu',
        },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay}`],
      },
    })
    return response.data.id
  } catch (error) {
    console.error('Error creating recurring calendar event:', error)
    return null
  }
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

  const startDate = getNextDayDate(event.dayOfWeek)
  const startTime = event.time || '19:00'
  const endTime = addHour(startTime)

  try {
    await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: {
        summary: event.summary,
        description: event.description,
        start: {
          dateTime: `${startDate}T${startTime}:00`,
          timeZone: 'Pacific/Honolulu',
        },
        end: {
          dateTime: `${startDate}T${endTime}:00`,
          timeZone: 'Pacific/Honolulu',
        },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${rruleDay}`],
      },
    })
    return true
  } catch (error) {
    console.error('Error updating recurring calendar event:', error)
    return false
  }
}
