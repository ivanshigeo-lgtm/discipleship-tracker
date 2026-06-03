'use client'

import { useEffect, useMemo, useState } from 'react'
import { getGroupAttendance, upsertGroupAttendance } from '../lib/supabaseQueries'
import type { GroupAttendance, PersonVictoryGroupWithPerson, VictoryGroup } from '../types/database'
import StageLevelBadge from './StageLevelBadge'

const dayNameToIndex: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

const toDateInputValue = (date: Date) => date.toISOString().split('T')[0]
const parseLocalDate = (date: string) => new Date(`${date}T00:00:00`)

const getMostRecentMeetingDate = (meetingDay: string | null, createdAt: string) => {
  const today = new Date()
  const createdDate = parseLocalDate(toDateInputValue(new Date(createdAt)))

  if (!meetingDay || dayNameToIndex[meetingDay] === undefined) {
    return toDateInputValue(today < createdDate ? createdDate : today)
  }

  const targetDay = dayNameToIndex[meetingDay]
  const date = new Date(today)
  const daysSinceMeetingDay = (date.getDay() - targetDay + 7) % 7
  date.setDate(date.getDate() - daysSinceMeetingDay)

  if (date < createdDate) {
    const firstMeetingDate = new Date(createdDate)
    const daysUntilMeetingDay = (targetDay - firstMeetingDate.getDay() + 7) % 7
    firstMeetingDate.setDate(firstMeetingDate.getDate() + daysUntilMeetingDay)
    return toDateInputValue(firstMeetingDate)
  }

  return toDateInputValue(date)
}

const isMeetingDay = (date: string, meetingDay: string | null) => {
  if (!meetingDay || dayNameToIndex[meetingDay] === undefined) return true
  return parseLocalDate(date).getDay() === dayNameToIndex[meetingDay]
}

export default function GroupAttendancePanel({
  group,
  memberships,
}: {
  group: VictoryGroup
  memberships: PersonVictoryGroupWithPerson[]
}) {
  const [meetingDate, setMeetingDate] = useState(getMostRecentMeetingDate(group.meeting_day, group.created_at))
  const [attendance, setAttendance] = useState<GroupAttendance[]>([])
  const [draftAttendance, setDraftAttendance] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const members = useMemo(() => memberships
    .map(membership => membership.people)
    .filter((person): person is NonNullable<typeof person> => Boolean(person)), [memberships])

  const createdDate = toDateInputValue(new Date(group.created_at))
  const dateIsBeforeGroupCreated = meetingDate < createdDate
  const dateIsCorrectMeetingDay = isMeetingDay(meetingDate, group.meeting_day)

  const attendanceForDate = (personId: string, date: string) => {
    return attendance.find(record => record.person_id === personId && record.meeting_date === date)
  }

  const loadAttendance = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await getGroupAttendance(group.id)
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setAttendance((data ?? []) as GroupAttendance[])
    setLoading(false)
  }

  useEffect(() => {
    loadAttendance()
  }, [group.id])

  useEffect(() => {
    const nextDraft: Record<string, boolean> = {}
    members.forEach(person => {
      nextDraft[person.id] = attendanceForDate(person.id, meetingDate)?.attended ?? false
    })
    setDraftAttendance(nextDraft)
    setMessage('')
  }, [attendance, meetingDate, members])

  const submittedMeetingDates = () => {
    const created = parseLocalDate(createdDate)
    const selected = parseLocalDate(meetingDate)
    const dates = new Set<string>()

    attendance.forEach(record => {
      const recordDate = parseLocalDate(record.meeting_date)
      if (
        record.victory_group_id === group.id &&
        recordDate >= created &&
        recordDate <= selected &&
        isMeetingDay(record.meeting_date, group.meeting_day)
      ) {
        dates.add(record.meeting_date)
      }
    })

    return Array.from(dates).sort((a, b) => b.localeCompare(a))
  }

  const missedMeetingDatesInRow = (personId: string) => {
    let missedCount = 0

    for (const date of submittedMeetingDates()) {
      const record = attendanceForDate(personId, date)
      if (!record) continue
      if (record.attended) break
      missedCount += 1
    }

    return missedCount
  }

  const warningClass = (missedCount: number) => {
    if (missedCount >= 3) return 'border-red-300 bg-red-50'
    if (missedCount >= 2) return 'border-yellow-300 bg-yellow-50'
    return 'border-gray-200 bg-white'
  }

  const warningText = (missedCount: number) => {
    if (missedCount >= 3) return `${missedCount} submitted meetings missed`
    if (missedCount >= 2) return `${missedCount} submitted meetings missed`
    return 'Good'
  }

  const handleSubmitAttendance = async () => {
    setMessage('')
    setError('')

    if (dateIsBeforeGroupCreated) {
      setError('Attendance cannot be submitted before this Grace Group was created.')
      return
    }

    if (!dateIsCorrectMeetingDay) {
      setError(`This Grace Group meets on ${group.meeting_day}. Choose a ${group.meeting_day} date.`)
      return
    }

    setSaving(true)

    const results = await Promise.all(
      members.map(person =>
        upsertGroupAttendance({
          victory_group_id: group.id,
          person_id: person.id,
          meeting_date: meetingDate,
          attended: draftAttendance[person.id] ?? false,
        })
      )
    )

    const failed = results.find(result => result.error)
    if (failed?.error) {
      setError(failed.error.message)
      setSaving(false)
      await loadAttendance()
      return
    }

    setAttendance(currentAttendance => {
      const withoutCurrentDate = currentAttendance.filter(record => record.meeting_date !== meetingDate)
      const savedRecords = results
        .map(result => result.data)
        .filter((record): record is GroupAttendance => Boolean(record))
      return [...withoutCurrentDate, ...savedRecords]
    })

    setMessage(`Attendance submitted for ${new Date(`${meetingDate}T00:00:00`).toLocaleDateString()}.`)
    setSaving(false)
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
      <div className="space-y-3">
        <div>
          <div className="text-base font-semibold text-gray-900">Weekly Attendance</div>
          <div className="mt-1 text-xs leading-5 text-gray-700">
            Absences only count for submitted {group.meeting_day ? `${group.meeting_day} ` : ''}meetings after this group was created.
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-gray-700">Meeting date</span>
          <input
            type="date"
            value={meetingDate}
            min={createdDate}
            onChange={event => setMeetingDate(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900"
          />
        </label>
        {group.meeting_day && !dateIsCorrectMeetingDay && (
          <p className="rounded-lg border border-yellow-200 bg-yellow-50 p-2 text-xs font-medium text-yellow-800">
            This group meets on {group.meeting_day}. Pick a {group.meeting_day} to submit attendance.
          </p>
        )}
      </div>

      {error && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          <p>{error}</p>
          <p className="text-xs">
            If this mentions <span className="font-semibold">group_attendance</span>, run the attendance SQL migration in Supabase first.
          </p>
        </div>
      )}

      {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p>}

      {loading && !error && <p className="text-sm text-gray-700">Loading attendance...</p>}

      {!loading && !error && members.length === 0 && (
        <p className="text-sm text-gray-700">Add members before tracking attendance.</p>
      )}

      {!loading && !error && members.length > 0 && (
        <div className="space-y-2">
          {members.map(person => {
            const missedCount = missedMeetingDatesInRow(person.id)
            const checked = draftAttendance[person.id] ?? false

            return (
              <div key={person.id} className={`rounded-lg border px-3 py-2.5 ${warningClass(missedCount)}`}>
                <label className="block space-y-2">
                  <div className="space-y-2">
                    <div className="break-words text-sm font-semibold leading-5 text-gray-900">{person.name}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StageLevelBadge stage={person.current_stage} />
                      <div className="text-xs font-medium text-gray-700">{warningText(missedCount)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-white/70 px-2 py-1.5">
                    <span className="text-xs font-semibold text-gray-700">Present</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving || dateIsBeforeGroupCreated || !dateIsCorrectMeetingDay}
                      onChange={event => setDraftAttendance(current => ({
                        ...current,
                        [person.id]: event.target.checked,
                      }))}
                      className="h-5 w-5 rounded border-gray-300 text-black"
                    />
                  </div>
                </label>
              </div>
            )
          })}

          <button
            type="button"
            onClick={handleSubmitAttendance}
            disabled={saving || dateIsBeforeGroupCreated || !dateIsCorrectMeetingDay}
            className="mt-3 w-full rounded-lg bg-black px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Submitting...' : 'Submit Attendance'}
          </button>
        </div>
      )}
    </div>
  )
}
