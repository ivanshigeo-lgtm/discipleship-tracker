'use client'

import { useState, useEffect, useMemo } from 'react'
import { addEngagement, addMeetingParticipants, getPeople } from '../lib/supabaseQueries'
import { useAuth } from '../contexts/AuthContext'
import type { MeetingType, Person } from '../types/database'
import { type Recurrence, RECURRENCE_OPTIONS, recurrenceDates, recurrenceLabel } from '../lib/recurrence'
import { newSeriesId } from '../lib/engagementSeries'

const MEETING_TYPES: MeetingType[] = ['One2One', 'Making Disciples', 'Coffee', 'Church Community', 'Empowering Leaders']

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export default function AddNextStepForm({
  personId,
  personName,
  onAdded
}: {
  personId: string
  personName: string
  onAdded: () => void
}) {
  const { profile } = useAuth()
  const [description, setDescription] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')
  const [location, setLocation] = useState('')
  const [meetingType, setMeetingType] = useState<MeetingType | ''>('')
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // "Also invite" — additional people in the meeting. They get an invite and the
  // meeting shows on their page once they confirm. (The profile person is always
  // included; the creator owns it.)
  const [people, setPeople] = useState<Person[]>([])
  const [inviteeIds, setInviteeIds] = useState<string[]>([])
  const [inviteSearch, setInviteSearch] = useState('')
  useEffect(() => {
    getPeople().then(({ data }) => { if (data) setPeople(data as Person[]) })
  }, [])
  const inviteMatches = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase()
    if (!q) return []
    return people
      .filter(p => p.id !== personId && p.id !== profile?.id && !inviteeIds.includes(p.id))
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [inviteSearch, people, personId, profile?.id, inviteeIds])
  const inviteeNames = (id: string) => people.find(p => p.id === id)?.name ?? 'Someone'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description) return

    setLoading(true)
    setError('')

    // Build the list of dates to schedule
    const dates: string[] =
      recurrence !== 'none' && followUpDate && repeatUntil
        ? recurrenceDates(followUpDate, repeatUntil, recurrence)
        : [followUpDate || '']
    const seriesId = dates.length > 1 ? newSeriesId() : null

    for (const date of dates) {
      const { data: newEngagement, error: insertError } = await addEngagement({
        person_id: personId,
        created_by_person_id: profile?.id ?? null,
        description,
        follow_up_date: date || null,
        follow_up_time: followUpTime || null,
        location: location.trim() || null,
        meeting_type: meetingType || null,
        status: 'Pending',
        series_id: seriesId,
      })

      if (insertError) {
        setError(insertError.message || 'Failed to add engagement')
        setLoading(false)
        return
      }

      // Invite everyone in the meeting (the profile person + any extras). They
      // confirm before it appears on their own engagement page; the creator owns
      // it and sees it regardless.
      if (newEngagement) {
        await addMeetingParticipants(newEngagement.id, [personId, ...inviteeIds], 'invited')
      }

      // Sync with Google Calendar if coach has it connected
      if (newEngagement && profile && date) {
        try {
          await fetch('/api/calendar/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'create',
              coachPersonId: profile.id,
              engagementId: newEngagement.id,
              personName,
              engagement: {
                description,
                follow_up_date: date,
                follow_up_time: followUpTime || null,
                location: location.trim() || null,
                meeting_type: meetingType || null,
              },
            }),
          })
        } catch (err) {
          console.error('Calendar sync error:', err)
        }
      }
    }

    setDescription('')
    setFollowUpDate('')
    setFollowUpTime('')
    setLocation('')
    setMeetingType('')
    setRecurrence('none')
    setRepeatUntil('')
    setInviteeIds([])
    setInviteSearch('')
    onAdded()
    setLoading(false)
  }

  const inputClass = "rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"

  const repeatCount =
    recurrence !== 'none' && followUpDate && repeatUntil
      ? recurrenceDates(followUpDate, repeatUntil, recurrence).length
      : 0

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      {error && <p className="text-xs text-[#F2728A]">{error}</p>}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Next step..."
          className={`${inputClass} flex-1`}
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="cn-btn cn-btn-primary shrink-0 !px-3 !py-1.5 !text-xs"
        >
          {loading ? '…' : repeatCount > 1 ? `Add ${repeatCount}` : 'Add'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <select
          value={meetingType}
          onChange={(e) => setMeetingType(e.target.value as MeetingType | '')}
          className={`${inputClass} w-36`}
        >
          <option value="">Meeting type...</option>
          {MEETING_TYPES.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          className={`${inputClass} w-28`}
        />
        <input
          type="time"
          value={followUpTime}
          onChange={(e) => setFollowUpTime(e.target.value)}
          className={`${inputClass} w-24`}
        />
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location..."
          className={`${inputClass} flex-1 min-w-[100px]`}
        />
      </div>

      {/* Also-invite row — add more people to this meeting */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-xs text-[var(--fg-3)]">With</span>
        <span className="rounded-full bg-[var(--indigo)] px-2 py-0.5 text-[10px] font-medium text-[var(--fg-2)]">{personName}</span>
        {inviteeIds.map(id => (
          <span key={id} className="flex items-center gap-1 rounded-full bg-[rgba(91,141,247,.15)] px-2 py-0.5 text-[10px] font-medium text-[var(--fg-1)]">
            {inviteeNames(id)}
            <button type="button" onClick={() => setInviteeIds(prev => prev.filter(x => x !== id))} className="text-[var(--fg-3)] hover:text-[var(--fg-1)]">×</button>
          </span>
        ))}
        <div className="relative">
          <input
            type="text"
            value={inviteSearch}
            onChange={(e) => setInviteSearch(e.target.value)}
            placeholder="+ invite someone…"
            className={`${inputClass} w-36`}
          />
          {inviteMatches.length > 0 && (
            <div className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] shadow-lg">
              {inviteMatches.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setInviteeIds(prev => [...prev, p.id]); setInviteSearch('') }}
                  className="block w-full px-2.5 py-1.5 text-left text-xs text-[var(--fg-1)] hover:bg-[var(--indigo-2)]"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recurrence row — pick a cadence; disabled until a date is chosen */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <span className="text-xs text-[var(--fg-3)]">Repeats</span>
        <select
          value={recurrence}
          disabled={!followUpDate}
          onChange={(e) => {
            const v = e.target.value as Recurrence
            setRecurrence(v)
            if (v === 'none') setRepeatUntil('')
          }}
          className={`${inputClass} w-44 ${followUpDate ? '' : 'cursor-not-allowed opacity-40'}`}
        >
          {RECURRENCE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {recurrence !== 'none' && followUpDate && (
          <>
            <span className="text-xs text-[var(--fg-3)]">until</span>
            <input
              type="date"
              value={repeatUntil}
              min={addDaysStr(followUpDate, 1)}
              onChange={(e) => setRepeatUntil(e.target.value)}
              className={`${inputClass} w-28`}
              required
            />
            {repeatCount > 1 && (
              <span className="text-[10px] text-[var(--fg-3)]">
                {recurrenceLabel(recurrence, followUpDate)} · {repeatCount} meetings
              </span>
            )}
          </>
        )}
        {!followUpDate && (
          <span className="text-[10px] text-[var(--fg-3)]">set a date first</span>
        )}
      </div>
    </form>
  )
}
