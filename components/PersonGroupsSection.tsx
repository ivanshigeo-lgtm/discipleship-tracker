'use client'

import { useEffect, useState } from 'react'
import {
  addPersonToVictoryGroup,
  getGroupsForPerson,
  getVictoryGroups,
  removePersonFromVictoryGroup,
} from '../lib/supabaseQueries'
import type { PersonVictoryGroupWithGroup, VictoryGroup } from '../types/database'

export default function PersonGroupsSection({
  personId,
  onChanged,
}: {
  personId: string
  onChanged: () => void
}) {
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [memberships, setMemberships] = useState<PersonVictoryGroupWithGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadData = async () => {
    const [{ data: groupsData, error: groupsError }, { data: membershipsData, error: membershipsError }] = await Promise.all([
      getVictoryGroups(),
      getGroupsForPerson(personId),
    ])

    if (groupsError) setError(groupsError.message)
    if (membershipsError) setError(membershipsError.message)

    setGroups((groupsData ?? []) as VictoryGroup[])
    setMemberships((membershipsData ?? []) as unknown as PersonVictoryGroupWithGroup[])
  }

  useEffect(() => {
    loadData()
  }, [personId])

  const handleAddGroup = async () => {
    if (!selectedGroupId) return

    setSaving(true)
    setError('')

    const { error } = await addPersonToVictoryGroup(personId, selectedGroupId)
    if (error) {
      setError(error.message)
    } else {
      setSelectedGroupId('')
      await loadData()
      onChanged()
    }

    setSaving(false)
  }

  const handleRemoveGroup = async (groupId: string) => {
    setSaving(true)
    setError('')

    const { error } = await removePersonFromVictoryGroup(personId, groupId)
    if (error) {
      setError(error.message)
    } else {
      await loadData()
      onChanged()
    }

    setSaving(false)
  }

  const joinedGroupIds = new Set(memberships.map(membership => membership.victory_group_id))
  const availableGroups = groups.filter(group => !joinedGroupIds.has(group.id))

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div>
        <div className="mb-2 text-sm font-semibold text-gray-900">Groups this person is part of</div>
        {memberships.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">Not part of any groups yet.</p>
        ) : (
          <div className="space-y-2">
            {memberships.map(membership => {
              const group = membership.victory_groups
              if (!group) return null

              return (
                <div key={membership.id} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{group.name}</div>
                      <div className="mt-1 text-sm text-gray-700">
                        {group.meeting_day || group.meeting_time ? (
                          <span>{group.meeting_day ?? 'Recurring'}{group.meeting_time ? ` at ${group.meeting_time}` : ''}</span>
                        ) : (
                          <span>No recurring time set</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(group.id)}
                      disabled={saving}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
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
        <label className="mb-1 block text-sm font-semibold text-gray-900">Add to another group</label>
        <div className="flex gap-2">
          <select
            value={selectedGroupId}
            onChange={event => setSelectedGroupId(event.target.value)}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-300 bg-white p-2.5 text-sm text-gray-900 disabled:opacity-60"
          >
            <option value="">Choose group</option>
            {availableGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}{group.meeting_day ? ` — ${group.meeting_day}` : ''}{group.meeting_time ? ` at ${group.meeting_time}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddGroup}
            disabled={saving || !selectedGroupId}
            className="rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
