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
} from '../lib/supabaseQueries'
import type { Person, PersonVictoryGroupWithPerson, Stage, VictoryGroup } from '../types/database'
import GroupAttendancePanel from './GroupAttendancePanel'
import StageLevelBadge from './StageLevelBadge'

const meetingDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const stageRank: Record<Stage, number> = { Empower: 0, Equip: 1, Establish: 2, Engage: 3 }

export default function VictoryGroupsList({
  onChanged,
  startWithForm = false,
}: {
  onChanged?: () => void
  startWithForm?: boolean
}) {
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [allPeople, setAllPeople] = useState<Person[]>([])
  const [membersByGroup, setMembersByGroup] = useState<Record<string, PersonVictoryGroupWithPerson[]>>({})
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [openAttendanceGroupId, setOpenAttendanceGroupId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(startWithForm)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [meetingDay, setMeetingDay] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const resetForm = () => {
    setName('')
    setMeetingDay('')
    setMeetingTime('')
    setEditingGroupId(null)
    setShowForm(false)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
    if (openGroupId === groupId) setOpenAttendanceGroupId(null)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4 gap-3">
        <h3 className="font-semibold text-gray-900">Grace Groups</h3>
        <button
          onClick={() => {
            if (showForm) resetForm()
            else setShowForm(true)
          }}
          className="text-sm px-3 py-1.5 bg-black text-white rounded-lg whitespace-nowrap"
        >
          {showForm ? 'Cancel' : '+ Add Group'}
        </button>
      </div>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-5 space-y-3 border border-gray-200 rounded-xl p-3 bg-gray-50">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Group Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Group name"
              className="w-full border border-gray-300 bg-white p-2.5 rounded-lg text-sm text-gray-900 placeholder:text-gray-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Recurring Meeting Day</label>
            <select
              value={meetingDay}
              onChange={e => setMeetingDay(e.target.value)}
              className="w-full border border-gray-300 bg-white p-2.5 rounded-lg text-sm text-gray-900"
            >
              <option value="">Choose day</option>
              {meetingDays.map(day => <option key={day} value={day}>{day}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Recurring Meeting Time</label>
            <input
              type="time"
              value={meetingTime}
              onChange={e => setMeetingTime(e.target.value)}
              className="w-full border border-gray-300 bg-white p-2.5 rounded-lg text-sm text-gray-900"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {loading ? 'Saving...' : editingGroupId ? 'Save Group' : 'Add Group'}
          </button>
        </form>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-gray-700">No Grace Groups yet.</p>
      ) : (
        <div className="space-y-4">
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

            return (
              <div key={group.id} className="p-4 border border-gray-200 rounded-xl bg-white space-y-3 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 break-words">{group.name}</div>
                      <div className="text-sm text-gray-700 mt-1 break-words">
                        {group.meeting_day || group.meeting_time ? (
                          <span>
                            {group.meeting_day ?? 'Recurring'}{group.meeting_time ? ` @ ${group.meeting_time}` : ''}
                          </span>
                        ) : (
                          <span>No recurring time set</span>
                        )}
                      </div>
                      <div className="mt-2 text-xs font-semibold text-gray-700">
                        {memberships.length} {memberships.length === 1 ? 'member' : 'members'}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-full border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700">
                      {isOpen ? '−' : '+'}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-gray-200 pt-3">
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenAttendanceGroupId(openAttendanceGroupId === group.id ? null : group.id)
                        }}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                          openAttendanceGroupId === group.id
                            ? 'border-black bg-black text-white'
                            : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        <span>Attendance</span>
                        <span className="text-lg leading-none">{openAttendanceGroupId === group.id ? '−' : '+'}</span>
                      </button>

                      {openAttendanceGroupId === group.id && (
                        <div className="rounded-xl border border-gray-300 bg-white p-2">
                          <GroupAttendancePanel group={group} memberships={sortedMemberships} />
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleEdit(group)
                        }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                      >
                        Edit Group
                      </button>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-gray-700 mb-2">Members</div>
                      {sortedMemberships.length === 0 ? (
                        <p className="text-sm text-gray-700">No people assigned yet.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {sortedMemberships.map(membership => {
                            const person = membership.people
                            if (!person) return null

                            return (
                              <div key={membership.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0 space-y-2">
                                    <div className="break-words text-sm font-semibold text-gray-900">{person.name}</div>
                                    <StageLevelBadge stage={person.current_stage} />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleRemovePerson(group.id, person.id)
                                    }}
                                    className="self-start rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 sm:self-center"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>


                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Add Person to Group</label>
                      <select
                        value=""
                        onChange={(event) => {
                          event.stopPropagation()
                          handleAssignPerson(group.id, event.target.value)
                        }}
                        className="w-full border border-gray-300 bg-white p-2.5 rounded-lg text-sm text-gray-900"
                      >
                        <option value="">Choose person</option>
                        {availablePeople.map(person => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                    </div>
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
