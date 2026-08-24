import { NextRequest, NextResponse } from 'next/server'
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createRecurringCalendarEvent,
  updateRecurringCalendarEvent,
  getGoogleTokens
} from '../../../../lib/googleCalendar'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'
import { engagementEventSummary, groupEventSummary } from '../../../../lib/googleCalendarLogic'

function syncFailureResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'sync_failed'
  const refreshFailed = /token refresh|invalid_grant|reconnect|no refresh_token/i.test(message)
  const blocked = /ivanshigeo@gmail.com/i.test(message)
  console.error('Calendar sync error:', error)
  return NextResponse.json(
    {
      synced: false,
      reason: blocked ? 'blocked_account' : refreshFailed ? 'token_refresh_failed' : 'sync_failed',
      error: message,
    },
    { status: 500 },
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, type, coachPersonId } = body

  console.log('[calendar-sync] hit', { action, type, coachPersonId })

  if (!coachPersonId) {
    console.log('[calendar-sync] missing coachPersonId')
    return NextResponse.json({ error: 'Missing coachPersonId' }, { status: 400 })
  }

  const tokens = await getGoogleTokens(coachPersonId)
  console.log('[calendar-sync] tokens:', tokens ? 'found' : 'none', 'for', coachPersonId)
  if (!tokens) {
    return NextResponse.json({ synced: false, reason: 'not_connected' })
  }

  const supabase = getSupabaseAdmin()

  try {
    // Handle Grace Groups (recurring events)
    if (type === 'group') {
      const { groupId, group } = body

      if (action === 'create' || action === 'update') {
        if (!group.meeting_day) {
          return NextResponse.json({ synced: false, reason: 'no_day' })
        }

        const eventData = {
          summary: groupEventSummary(group.name),
          description: `Weekly Grace Group meeting`,
          dayOfWeek: group.meeting_day,
          time: group.meeting_time || undefined,
        }

        if (action === 'create') {
          console.log('[calendar-sync] creating recurring group event', eventData)
          const eventId = await createRecurringCalendarEvent(coachPersonId, eventData)
          console.log('[calendar-sync] createRecurringCalendarEvent result:', eventId)
          if (eventId) {
            await supabase
              .from('victory_groups')
              .update({ google_calendar_event_id: eventId })
              .eq('id', groupId)
            return NextResponse.json({ synced: true, eventId })
          }
          return NextResponse.json({ synced: false, reason: 'group_event_create_failed' })
        } else if (action === 'update' && group.google_calendar_event_id) {
          const success = await updateRecurringCalendarEvent(
            coachPersonId,
            group.google_calendar_event_id,
            eventData
          )
          return NextResponse.json({ synced: success })
        }
      } else if (action === 'delete' && group.google_calendar_event_id) {
        const success = await deleteCalendarEvent(coachPersonId, group.google_calendar_event_id)
        if (success && groupId) {
          await supabase
            .from('victory_groups')
            .update({ google_calendar_event_id: null })
            .eq('id', groupId)
        }
        return NextResponse.json({ synced: success })
      }

      return NextResponse.json({ synced: false })
    }

    // Handle Engagements (single events)
    const { engagementId, personName, engagement } = body

    if (action === 'create' || action === 'update') {
      if (!engagement.follow_up_date) {
        return NextResponse.json({ synced: false, reason: 'no_date' })
      }

      const summary = engagementEventSummary(
        personName,
        engagement.description,
        engagement.meeting_type,
      )
      const eventData = {
        summary,
        description: engagement.notes || undefined,
        location: engagement.location || undefined,
        startDate: engagement.follow_up_date,
        startTime: engagement.follow_up_time || undefined,
      }

      if (action === 'create') {
        console.log('[calendar-sync] creating event', eventData)
        const eventId = await createCalendarEvent(coachPersonId, eventData)
        console.log('[calendar-sync] createCalendarEvent result:', eventId)
        if (eventId) {
          await supabase
            .from('engagements')
            .update({ google_calendar_event_id: eventId })
            .eq('id', engagementId)
          return NextResponse.json({ synced: true, eventId })
        }
        return NextResponse.json({ synced: false, reason: 'event_create_failed' })
      } else if (action === 'update' && engagement.google_calendar_event_id) {
        const success = await updateCalendarEvent(coachPersonId, engagement.google_calendar_event_id, eventData)
        return NextResponse.json({ synced: success })
      }
    } else if (action === 'delete' && engagement.google_calendar_event_id) {
      const success = await deleteCalendarEvent(coachPersonId, engagement.google_calendar_event_id)
      if (success && engagementId) {
        await supabase
          .from('engagements')
          .update({ google_calendar_event_id: null })
          .eq('id', engagementId)
      }
      return NextResponse.json({ synced: success })
    }

    return NextResponse.json({ synced: false })
  } catch (error) {
    return syncFailureResponse(error)
  }
}
