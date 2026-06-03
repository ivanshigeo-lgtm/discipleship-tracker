'use client'

import { useEffect, useState } from 'react'
import { getVictoryGroups, updatePersonVictoryGroup } from '../lib/supabaseQueries'
import type { VictoryGroup } from '../types/database'

export default function VictoryGroupSelect({
  personId,
  currentGroupId,
  onChanged,
}: {
  personId: string
  currentGroupId: string | null
  onChanged: () => void
}) {
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState(currentGroupId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadGroups = async () => {
      const { data, error } = await getVictoryGroups()
      if (error) {
        setError(error.message)
        return
      }
      if (data) setGroups(data)
    }

    loadGroups()
  }, [])

  useEffect(() => {
    setSelectedGroupId(currentGroupId ?? '')
  }, [currentGroupId])

  const handleChange = async (value: string) => {
    setSelectedGroupId(value)
    setSaving(true)
    setError('')

    const { error } = await updatePersonVictoryGroup(personId, value || null)
    if (error) {
      setError(error.message)
    } else {
      onChanged()
    }

    setSaving(false)
  }

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-900 mb-2">Grace Group</label>
      <select
        value={selectedGroupId}
        onChange={(event) => handleChange(event.target.value)}
        disabled={saving}
        className="w-full border border-gray-300 bg-white p-2.5 rounded-lg text-sm text-gray-900 disabled:opacity-60"
      >
        <option value="">Not assigned to a group</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
            {group.meeting_day ? ` — ${group.meeting_day}` : ''}
            {group.meeting_time ? ` at ${group.meeting_time}` : ''}
          </option>
        ))}
      </select>
      {saving && <p className="text-xs text-gray-700 mt-1">Saving group...</p>}
      {error && <p className="text-xs text-red-700 mt-1">{error}</p>}
    </div>
  )
}
