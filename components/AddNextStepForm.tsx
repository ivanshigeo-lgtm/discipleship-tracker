'use client'

import { useState } from 'react'
import { addEngagement } from '../lib/supabaseQueries'
import { useAuth } from '../contexts/AuthContext'
import type { MeetingType } from '../types/database'

const MEETING_TYPES: MeetingType[] = ['One2One', 'Making Disciples', 'Coffee', 'Church Community', 'Empowering Leaders']

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split('T')[0]
}

function weeklyDates(start: string, until: string): string[] {
  const dates: string[] = [start]
  let current = start
  while (true) {
    const next = addWeeks(current, 1)
    if (next > until) break
    dates.push(next)
    current = next
  }
  return dates
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
  const [repeatWeekly, setRepeatWeekly] = useState(false)
  const [repeatUntil, setRepeatUntil] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description) return

    setLoading(true)
    setError('')

    // Build the list of dates to schedule
    const dates: string[] =
      repeatWeekly && followUpDate && repeatUntil
        ? weeklyDates(followUpDate, repeatUntil)
        : [followUpDate || '']

    for (const date of dates) {
      const { data: newEngagement, error: insertError } = await addEngagement({
        person_id: personId,
        description,
        follow_up_date: date || null,
        follow_up_time: followUpTime || null,
        location: location.trim() || null,
        meeting_type: meetingType || null,
        status: 'Pending',
      })

      if (insertError) {
        setError(insertError.message || 'Failed to add engagement')
        setLoading(false)
        return
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
    setRepeatWeekly(false)
    setRepeatUntil('')
    onAdded()
    setLoading(false)
  }

  const inputClass = "rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"

  const repeatCount =
    repeatWeekly && followUpDate && repeatUntil
      ? weeklyDates(followUpDate, repeatUntil).length
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

      {/* Repeat row — always visible; checkbox disabled until a date is chosen */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <label className={`flex items-center gap-1.5 ${followUpDate ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}>
          <input
            type="checkbox"
            checked={repeatWeekly}
            disabled={!followUpDate}
            onChange={(e) => {
              setRepeatWeekly(e.target.checked)
              if (!e.target.checked) setRepeatUntil('')
            }}
            className="h-3.5 w-3.5 rounded border-[var(--line-2)] accent-[var(--equip)]"
          />
          <span className="text-xs text-[var(--fg-2)]">Repeat weekly</span>
        </label>
        {repeatWeekly && followUpDate && (
          <>
            <span className="text-xs text-[var(--fg-3)]">until</span>
            <input
              type="date"
              value={repeatUntil}
              min={addWeeks(followUpDate, 1)}
              onChange={(e) => setRepeatUntil(e.target.value)}
              className={`${inputClass} w-28`}
              required={repeatWeekly}
            />
            {repeatCount > 1 && (
              <span className="text-[10px] text-[var(--fg-3)]">
                {repeatCount} meetings
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
