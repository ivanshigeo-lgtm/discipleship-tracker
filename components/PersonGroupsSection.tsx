'use client'

import { useEffect, useState } from 'react'
import {
  addPersonToVictoryGroup,
  getGroupsForPerson,
  getVictoryGroups,
  removePersonFromVictoryGroup,
} from '../lib/supabaseQueries'
import type { PersonVictoryGroupWithGroup, VictoryGroup } from '../types/database'
import { daysOf, fmtDaysShort } from '../lib/meetingDays'

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
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-[rgba(240,114,159,.15)] p-2 text-xs text-[#F2728A]">{error}</p>}

      {memberships.length === 0 ? (
        <p className="rounded-lg bg-[var(--indigo-2)] p-2.5 text-xs text-[var(--fg-3)]">Not part of any groups yet.</p>
      ) : (
        <div className="space-y-1.5">
          {memberships.map(membership => {
            const group = membership.victory_groups
            if (!group) return null

            return (
              <div key={membership.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-2.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--fg-1)]">{group.name}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--fg-3)]">
                    {daysOf(group).length || group.meeting_time ? (
                      <span>{fmtDaysShort(daysOf(group))}{group.meeting_time ? ` @ ${group.meeting_time}` : ''}</span>
                    ) : (
                      <span>No time set</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveGroup(group.id)}
                  disabled={saving}
                  className="text-[10px] text-[#F2728A] hover:underline disabled:opacity-60"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-1.5">
        <select
          value={selectedGroupId}
          onChange={event => setSelectedGroupId(event.target.value)}
          disabled={saving}
          className="flex-1 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none disabled:opacity-60"
        >
          <option value="">+ Add to group...</option>
          {availableGroups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name}{daysOf(group).length ? ` — ${fmtDaysShort(daysOf(group))}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAddGroup}
          disabled={saving || !selectedGroupId}
          className="cn-btn cn-btn-primary shrink-0 !px-3 !py-1.5 !text-xs"
        >
          Add
        </button>
      </div>
    </div>
  )
}
