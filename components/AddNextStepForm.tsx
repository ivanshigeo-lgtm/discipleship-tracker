'use client'

import { useState } from 'react'
import { addEngagement } from '../lib/supabaseQueries'
import type { MeetingType } from '../types/database'

const MEETING_TYPES: MeetingType[] = ['One2One', 'Making Disciples', 'Coffee', 'Church Community', 'Empowering Leaders']

export default function AddNextStepForm({
  personId,
  onAdded
}: {
  personId: string
  onAdded: () => void
}) {
  const [description, setDescription] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')
  const [location, setLocation] = useState('')
  const [meetingType, setMeetingType] = useState<MeetingType | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description) return

    setLoading(true)
    setError('')

    const { error: insertError } = await addEngagement({
      person_id: personId,
      description,
      follow_up_date: followUpDate || null,
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

    setDescription('')
    setFollowUpDate('')
    setFollowUpTime('')
    setLocation('')
    setMeetingType('')
    onAdded()
    setLoading(false)
  }

  const inputClass = "rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"

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
          Add
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
    </form>
  )
}
