import {
  addEngagement,
  addMeetingParticipants,
  getEngagementParticipantIds,
  updateEngagement,
} from './supabaseQueries'
import { MAX_OCCURRENCES, nextOccurrenceDates, type Recurrence } from './recurrence'
import { newSeriesId, type LastOfSeriesInfo } from './engagementSeries'
import type { Engagement } from '../types/database'

export async function extendEngagementSeries(opts: {
  last: Engagement
  info: LastOfSeriesInfo
  count: number
  personName: string
  coachPersonId: string | null
}): Promise<{ error: { message: string } | null; createdIds: string[] }> {
  const lastDate = opts.last.follow_up_date
  if (!lastDate) return { error: { message: 'This meeting has no date to extend from.' }, createdIds: [] }

  const count = Math.min(MAX_OCCURRENCES, Math.max(1, Math.floor(opts.count)))
  const cadence = opts.info.cadence
  const dates = nextOccurrenceDates(lastDate, count, cadence)
  if (dates.length === 0) return { error: { message: 'Could not compute more dates for this cadence.' }, createdIds: [] }

  const seriesId = opts.info.seriesId || opts.last.series_id || newSeriesId()
  const toStamp = [opts.last.id, ...opts.info.siblingIds]
  if (!opts.last.series_id || toStamp.some(Boolean)) {
    await Promise.all(toStamp.map(id => updateEngagement(id, { series_id: seriesId })))
  }

  const { data: existingParticipants } = await getEngagementParticipantIds(opts.last.id)
  const inviteIds = Array.from(new Set([opts.last.person_id, ...(existingParticipants ?? [])]))

  const createdIds: string[] = []
  for (const date of dates) {
    const { data: newEng, error } = await addEngagement({
      person_id: opts.last.person_id,
      created_by_person_id: opts.last.created_by_person_id ?? opts.coachPersonId ?? null,
      description: opts.last.description,
      follow_up_date: date,
      follow_up_time: opts.last.follow_up_time ?? null,
      location: opts.last.location ?? null,
      meeting_type: opts.last.meeting_type ?? null,
      status: 'Pending',
      series_id: seriesId,
    })
    if (error || !newEng) {
      return { error: error ?? { message: 'Failed to add a new occurrence.' }, createdIds }
    }
    createdIds.push(newEng.id)
    await addMeetingParticipants(newEng.id, inviteIds, 'invited')
    if (opts.coachPersonId) {
      try {
        await fetch('/api/calendar/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            coachPersonId: opts.coachPersonId,
            engagementId: newEng.id,
            personName: opts.personName,
            engagement: {
              description: opts.last.description,
              follow_up_date: date,
              follow_up_time: opts.last.follow_up_time ?? null,
              location: opts.last.location ?? null,
              meeting_type: opts.last.meeting_type ?? null,
            },
          }),
        })
      } catch (err) {
        console.error('Calendar sync error for series extend:', err)
      }
    }
  }

  return { error: null, createdIds }
}

export type { Recurrence }
