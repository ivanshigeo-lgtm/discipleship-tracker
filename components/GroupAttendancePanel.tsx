'use client'

import { useEffect, useMemo, useState } from 'react'
import { getGroupAttendance, upsertGroupAttendance } from '../lib/supabaseQueries'
import type { GroupAttendance, PersonVictoryGroupWithPerson, Stage, VictoryGroup } from '../types/database'
import { stageLabels } from '../lib/stageLabels'

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

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

  const warningStyle = (missedCount: number) => {
    if (missedCount >= 3) return { borderColor: 'rgba(240,114,159,.4)', background: 'rgba(240,114,159,.1)' }
    if (missedCount >= 2) return { borderColor: 'rgba(244,182,80,.4)', background: 'rgba(244,182,80,.1)' }
    return { borderColor: 'var(--line-1)', background: 'var(--indigo)' }
  }

  const warningText = (missedCount: number) => {
    if (missedCount >= 3) return { text: `${missedCount} meetings missed`, color: '#F2728A' }
    if (missedCount >= 2) return { text: `${missedCount} meetings missed`, color: '#F4B650' }
    return { text: 'Good', color: 'var(--establish)' }
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
    <div className="space-y-3">
      <div className="space-y-3">
        <div>
          <div className="text-sm font-semibold text-[var(--fg-1)]">Weekly Attendance</div>
          <div className="mt-1 text-xs leading-5 text-[var(--fg-3)]">
            Absences only count for submitted {group.meeting_day ? `${group.meeting_day} ` : ''}meetings after this group was created.
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--fg-2)]">Meeting date</span>
          <input
            type="date"
            value={meetingDate}
            min={createdDate}
            onChange={event => setMeetingDate(event.target.value)}
            className="w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-2.5 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          />
        </label>
        {group.meeting_day && !dateIsCorrectMeetingDay && (
          <p className="rounded-xl bg-[rgba(244,182,80,.15)] p-2.5 text-xs font-medium text-[#F4B650]">
            This group meets on {group.meeting_day}. Pick a {group.meeting_day} to submit attendance.
          </p>
        )}
      </div>

      {error && (
        <div className="space-y-2 rounded-xl bg-[rgba(240,114,159,.15)] p-3 text-sm text-[#F2728A]">
          <p>{error}</p>
          <p className="text-xs opacity-80">
            If this mentions <span className="font-semibold">group_attendance</span>, run the attendance SQL migration in Supabase first.
          </p>
        </div>
      )}

      {message && (
        <p className="rounded-xl bg-[rgba(54,214,195,.15)] p-2.5 text-sm text-[var(--establish)]">{message}</p>
      )}

      {loading && !error && <p className="text-sm text-[var(--fg-2)]">Loading attendance...</p>}

      {!loading && !error && members.length === 0 && (
        <p className="text-sm text-[var(--fg-2)]">Add members before tracking attendance.</p>
      )}

      {!loading && !error && members.length > 0 && (
        <div className="space-y-2">
          {members.map(person => {
            const missedCount = missedMeetingDatesInRow(person.id)
            const checked = draftAttendance[person.id] ?? false
            const stageColor = STAGE_COLORS[person.current_stage]
            const warning = warningText(missedCount)
            const style = warningStyle(missedCount)

            const initials = person.name
              .split(' ')
              .map(n => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()

            return (
              <div
                key={person.id}
                className="rounded-xl border p-3"
                style={style}
              >
                <label className="block space-y-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        background: 'var(--indigo-2)',
                        border: `2px solid ${stageColor}`,
                        color: stageColor,
                      }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-semibold text-[var(--fg-1)]">{person.name}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs" style={{ color: stageColor }}>
                          {stageLabels[person.current_stage].name}
                        </span>
                        <span className="text-xs" style={{ color: warning.color }}>
                          {warning.text}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-[var(--indigo-2)] px-3 py-2">
                    <span className="text-xs font-semibold text-[var(--fg-2)]">Present</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={saving || dateIsBeforeGroupCreated || !dateIsCorrectMeetingDay}
                      onChange={event => setDraftAttendance(current => ({
                        ...current,
                        [person.id]: event.target.checked,
                      }))}
                      className="h-5 w-5 rounded border-[var(--line-2)] bg-[var(--indigo)] accent-[var(--gbm-cobalt-bright)]"
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
            className="mt-2 w-full rounded-xl py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: 'var(--gbm-cobalt-bright)',
              color: 'var(--fg-1)',
              boxShadow: '0 0 16px rgba(46,85,230,.3)',
            }}
          >
            {saving ? 'Submitting...' : 'Submit Attendance'}
          </button>
        </div>
      )}
    </div>
  )
}
