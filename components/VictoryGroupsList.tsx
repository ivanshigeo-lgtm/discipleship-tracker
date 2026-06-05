'use client'

import { useEffect, useState } from 'react'
import {
  addPersonToVictoryGroup,
  addVictoryGroup,
  getPeople,
  getPeopleByVictoryGroup,
  getVictoryGroups,
  removePersonFromVictoryGroup,
  updateVictoryGroup,
  upsertGroupAttendance,
  getGroupAttendance,
} from '../lib/supabaseQueries'
import type { Person, PersonVictoryGroupWithPerson, Stage, VictoryGroup, GroupAttendance } from '../types/database'
import { stageLabels } from '../lib/stageLabels'

const meetingDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const stageRank: Record<Stage, number> = { Empower: 0, Equip: 1, Establish: 2, Engage: 3 }

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

const toDateInputValue = (date: Date) => date.toISOString().split('T')[0]

export default function VictoryGroupsList({
  onChanged,
  startWithForm = false,
  onPersonClick,
  onAddNewPerson,
}: {
  onChanged?: () => void
  startWithForm?: boolean
  onPersonClick?: (person: Person) => void
  onAddNewPerson?: () => void
}) {
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [allPeople, setAllPeople] = useState<Person[]>([])
  const [membersByGroup, setMembersByGroup] = useState<Record<string, PersonVictoryGroupWithPerson[]>>({})
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [attendanceGroupId, setAttendanceGroupId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(startWithForm)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [meetingDay, setMeetingDay] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(toDateInputValue(new Date()))
  const [draftAttendance, setDraftAttendance] = useState<Record<string, boolean>>({})
  const [existingAttendance, setExistingAttendance] = useState<GroupAttendance[]>([])
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [attendanceMessage, setAttendanceMessage] = useState('')

  const loadData = async () => {
    const [{ data: groupsData, error: groupsError }, { data: peopleData, error: peopleError }] = await Promise.all([
      getVictoryGroups(),
      getPeople(),
    ])

    if (groupsError) setError(groupsError.message)
    if (peopleError) setError(peopleError.message)

    const nextGroups = (groupsData ?? []) as VictoryGroup[]
    const nextPeople = (peopleData ?? []) as Person[]
    setGroups(nextGroups)
    setAllPeople(nextPeople)

    const groupedMembers: Record<string, PersonVictoryGroupWithPerson[]> = {}
    for (const group of nextGroups) {
      const { data } = await getPeopleByVictoryGroup(group.id)
      groupedMembers[group.id] = (data ?? []) as unknown as PersonVictoryGroupWithPerson[]
    }
    setMembersByGroup(groupedMembers)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Load existing attendance when entering attendance mode or changing date
  useEffect(() => {
    if (attendanceGroupId) {
      loadAttendanceForGroup(attendanceGroupId)
    }
  }, [attendanceGroupId, attendanceDate])

  const loadAttendanceForGroup = async (groupId: string) => {
    const { data } = await getGroupAttendance(groupId)
    const records = (data ?? []) as GroupAttendance[]
    setExistingAttendance(records)

    // Initialize draft with existing attendance for this date
    const memberships = membersByGroup[groupId] ?? []
    const draft: Record<string, boolean> = {}
    memberships.forEach(m => {
      if (m.people) {
        const existing = records.find(r => r.person_id === m.people!.id && r.meeting_date === attendanceDate)
        draft[m.people.id] = existing?.attended ?? false
      }
    })
    setDraftAttendance(draft)
    setAttendanceMessage('')
  }

  const resetForm = () => {
    setName('')
    setMeetingDay('')
    setMeetingTime('')
    setEditingGroupId(null)
    setShowForm(false)
    setError('')
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError('')

    const payload = {
      name: name.trim(),
      meeting_day: meetingDay || null,
      meeting_time: meetingTime || null,
    }

    const result = editingGroupId
      ? await updateVictoryGroup(editingGroupId, payload)
      : await addVictoryGroup(payload)

    if (result.error) {
      setError(result.error.message)
    } else {
      resetForm()
      await loadData()
      onChanged?.()
    }

    setLoading(false)
  }

  const handleEdit = (group: VictoryGroup) => {
    setEditingGroupId(group.id)
    setName(group.name)
    setMeetingDay(group.meeting_day ?? '')
    setMeetingTime(group.meeting_time ?? '')
    setShowForm(true)
  }

  const handleAssignPerson = async (groupId: string, personId: string) => {
    if (!personId) return

    setError('')
    const { error } = await addPersonToVictoryGroup(personId, groupId)
    if (error) {
      setError(error.message)
      return
    }

    await loadData()
    onChanged?.()
  }

  const handleRemovePerson = async (groupId: string, personId: string) => {
    setError('')
    const { error } = await removePersonFromVictoryGroup(personId, groupId)
    if (error) {
      setError(error.message)
      return
    }

    await loadData()
    onChanged?.()
  }

  const toggleGroup = (groupId: string) => {
    setOpenGroupId(openGroupId === groupId ? null : groupId)
    if (openGroupId === groupId) {
      setAttendanceGroupId(null)
    }
  }

  const toggleAttendanceMode = (groupId: string) => {
    if (attendanceGroupId === groupId) {
      setAttendanceGroupId(null)
      setDraftAttendance({})
      setAttendanceMessage('')
    } else {
      setAttendanceGroupId(groupId)
      setAttendanceDate(toDateInputValue(new Date()))
    }
  }

  const handleSubmitAttendance = async (groupId: string) => {
    setSavingAttendance(true)
    setAttendanceMessage('')

    const memberships = membersByGroup[groupId] ?? []
    const members = memberships.map(m => m.people).filter((p): p is Person => Boolean(p))

    const results = await Promise.all(
      members.map(person =>
        upsertGroupAttendance({
          victory_group_id: groupId,
          person_id: person.id,
          meeting_date: attendanceDate,
          attended: draftAttendance[person.id] ?? false,
        })
      )
    )

    const failed = results.find(r => r.error)
    if (failed?.error) {
      setError(failed.error.message)
    } else {
      const presentCount = Object.values(draftAttendance).filter(Boolean).length
      setAttendanceMessage(`Saved: ${presentCount}/${members.length} present on ${new Date(attendanceDate + 'T00:00:00').toLocaleDateString()}`)
    }

    setSavingAttendance(false)
  }

  return (
    <div className="rounded-2xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--fg-1)]">Grace Groups</h3>
        <div className="flex items-center gap-1.5">
          {showForm && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !name.trim()}
              className="cn-btn cn-btn-primary !px-2.5 !py-1 !text-xs"
            >
              {loading ? 'Saving...' : editingGroupId ? 'Save' : 'Add'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (showForm) resetForm()
              else setShowForm(true)
            }}
            className={showForm ? 'cn-chip !text-xs' : 'cn-btn cn-btn-primary !px-2.5 !py-1 !text-xs'}
          >
            {showForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-2 rounded-lg bg-[rgba(240,114,159,.15)] p-2 text-xs text-[#F2728A]">
          {error}
        </p>
      )}

      {showForm && (
        <div className="mb-3 rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Group name"
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              />
            </div>
            <select
              value={meetingDay}
              onChange={e => setMeetingDay(e.target.value)}
              className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            >
              <option value="">Day</option>
              {meetingDays.map(day => <option key={day} value={day}>{day}</option>)}
            </select>
            <input
              type="time"
              value={meetingTime}
              onChange={e => setMeetingTime(e.target.value)}
              className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">No Grace Groups yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {groups.map(group => {
            const memberships = membersByGroup[group.id] ?? []
            const sortedMemberships = [...memberships].sort((a, b) => {
              const aPerson = a.people
              const bPerson = b.people
              if (!aPerson || !bPerson) return 0
              return stageRank[aPerson.current_stage] - stageRank[bPerson.current_stage] || aPerson.name.localeCompare(bPerson.name)
            })
            const memberIds = new Set(memberships.map(membership => membership.person_id))
            const availablePeople = allPeople.filter(person => !memberIds.has(person.id))
            const isOpen = openGroupId === group.id
            const isAttendanceMode = attendanceGroupId === group.id

            return (
              <div
                key={group.id}
                className={`overflow-hidden rounded-lg border border-[var(--line-1)] transition-all ${isOpen ? 'sm:col-span-2' : ''}`}
                style={{
                  background: 'var(--indigo)',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
                >
                  <span className="truncate text-sm font-semibold text-[var(--fg-1)]">{group.name}</span>
                  <span className="shrink-0 text-[10px] text-[var(--fg-3)]">
                    {group.meeting_day ?? ''}{group.meeting_time ? ` @ ${group.meeting_time}` : ''} · {memberships.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-[var(--line-1)] p-2.5">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleAttendanceMode(group.id)
                        }}
                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all"
                        style={{
                          borderColor: isAttendanceMode ? 'var(--gbm-cobalt-bright)' : 'var(--line-2)',
                          background: isAttendanceMode ? 'var(--gbm-cobalt-bright)' : 'var(--indigo-2)',
                          color: 'var(--fg-1)',
                        }}
                      >
                        {isAttendanceMode ? 'Cancel' : 'Attendance'}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleEdit(group)
                        }}
                        className="flex-1 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-1)] transition-all hover:border-[var(--line-3)]"
                      >
                        Edit
                      </button>
                    </div>

                    {isAttendanceMode && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--fg-2)]">Date:</span>
                        <input
                          type="date"
                          value={attendanceDate}
                          onChange={e => setAttendanceDate(e.target.value)}
                          className="flex-1 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                        />
                      </div>
                    )}

                    <div>
                      <div className="mb-1.5 text-xs font-semibold text-[var(--fg-2)]">
                        {isAttendanceMode ? 'Check who attended:' : 'Members'}
                      </div>
                      {sortedMemberships.length === 0 ? (
                        <p className="text-xs text-[var(--fg-3)]">No members yet.</p>
                      ) : (
                        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                          {sortedMemberships.map(membership => {
                            const person = membership.people
                            if (!person) return null

                            const stageColor = STAGE_COLORS[person.current_stage]
                            const initials = person.name
                              .split(' ')
                              .map(n => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()
                            const isChecked = draftAttendance[person.id] ?? false

                            return (
                              <div
                                key={membership.id}
                                className={`flex items-center justify-between gap-2 rounded-lg border bg-[var(--indigo-2)] px-2 py-1.5 transition-all ${
                                  isAttendanceMode && isChecked ? 'border-[var(--establish)]' : 'border-[var(--line-1)]'
                                }`}
                                onClick={isAttendanceMode ? () => {
                                  setDraftAttendance(prev => ({ ...prev, [person.id]: !prev[person.id] }))
                                } : undefined}
                                style={{ cursor: isAttendanceMode ? 'pointer' : 'default' }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {isAttendanceMode && (
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        setDraftAttendance(prev => ({ ...prev, [person.id]: !prev[person.id] }))
                                      }}
                                      onClick={e => e.stopPropagation()}
                                      className="h-4 w-4 shrink-0 rounded border-[var(--line-2)] bg-[var(--indigo)] accent-[var(--establish)]"
                                    />
                                  )}
                                  <div
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                                    style={{
                                      border: `2px solid ${stageColor}`,
                                      color: stageColor,
                                    }}
                                  >
                                    {initials}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      onPersonClick?.(person)
                                    }}
                                    className="min-w-0 text-left hover:opacity-80"
                                  >
                                    <div className="truncate text-xs font-semibold text-[var(--fg-1)] hover:underline">{person.name}</div>
                                    <div className="text-[10px]" style={{ color: stageColor }}>
                                      {stageLabels[person.current_stage].name}
                                    </div>
                                  </button>
                                </div>
                                {!isAttendanceMode && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleRemovePerson(group.id, person.id)
                                    }}
                                    className="shrink-0 text-[10px] text-[#F2728A] hover:underline"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {isAttendanceMode ? (
                      <div className="space-y-2">
                        {attendanceMessage && (
                          <p className="rounded-lg bg-[rgba(54,214,195,.15)] px-2 py-1.5 text-xs text-[var(--establish)]">
                            {attendanceMessage}
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSubmitAttendance(group.id)}
                          disabled={savingAttendance}
                          className="w-full rounded-lg py-2 text-xs font-semibold transition-all disabled:opacity-50"
                          style={{
                            background: 'var(--establish)',
                            color: 'var(--void)',
                          }}
                        >
                          {savingAttendance ? 'Saving...' : `Submit Attendance (${Object.values(draftAttendance).filter(Boolean).length}/${sortedMemberships.length})`}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <select
                          value=""
                          onChange={(event) => {
                            event.stopPropagation()
                            if (event.target.value === '__NEW__') {
                              onAddNewPerson?.()
                            } else if (event.target.value) {
                              handleAssignPerson(group.id, event.target.value)
                            }
                          }}
                          className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                        >
                          <option value="">+ Add person...</option>
                          <option value="__NEW__" className="font-semibold">✦ Create new person...</option>
                          {availablePeople.map(person => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
