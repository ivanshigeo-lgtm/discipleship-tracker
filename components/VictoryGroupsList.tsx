'use client'

import { useEffect, useRef, useState } from 'react'
import {
  addPersonToVictoryGroup,
  addVictoryGroup,
  getPeople,
  getPeopleByVictoryGroup,
  getVictoryGroups,
  removePersonFromVictoryGroup,
  updateVictoryGroup,
  updateVictoryGroupOwner,
  upsertGroupAttendance,
  getGroupAttendance,
  getGroupMeetingStatuses,
  upsertGroupMeetingStatus,
  clearGroupMeetingStatus,
} from '../lib/supabaseQueries'
import type { Person, PersonVictoryGroupWithPerson, Stage, VictoryGroup, GroupAttendance, GroupMeetingStatus, GroupFocus } from '../types/database'
import { stageLabels } from '../lib/stageLabels'
import { WEEKDAY_NAMES, daysOf, fmtDaysShort, nextOccurrenceDate, weekdayOf, shiftDayInSchedule } from '../lib/meetingDays'
import { GROUP_FOCUS_OPTIONS, bookletStage } from '../lib/curriculum'
import { useAuth } from '../contexts/AuthContext'
import { fmtTime12 } from '../lib/formatTime'

const stageRank: Record<Stage, number> = { Empower: 0, Equip: 1, Establish: 2, Engage: 3 }

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

const toDateInputValue = (date: Date) => date.toISOString().split('T')[0]

// Attendance-history derivations, mirroring the native app's history sheet: consecutive
// missed-meeting streak per member (stops at first attended), and per-meeting totals.
function computeAttendanceHistory(records: GroupAttendance[], memberships: PersonVictoryGroupWithPerson[]) {
  const dates = [...new Set(records.map(r => r.meeting_date))].sort().reverse() // newest-first
  const byPerson = new Map<string, Map<string, boolean>>()
  records.forEach(r => {
    let m = byPerson.get(r.person_id)
    if (!m) { m = new Map(); byPerson.set(r.person_id, m) }
    m.set(r.meeting_date, r.attended)
  })
  const missedStreak = (pid: string) => {
    const m = byPerson.get(pid); let s = 0
    for (const d of dates) { if (m?.get(d)) break; s++ }
    return s
  }
  const attendedTotal = (pid: string) => {
    const m = byPerson.get(pid); if (!m) return 0
    let n = 0; for (const d of dates) if (m.get(d)) n++; return n
  }
  const members = memberships
    .map(ms => ms.people)
    .filter((p): p is Person => Boolean(p))
    .map(p => ({ person: p, streak: missedStreak(p.id), attended: attendedTotal(p.id) }))
  const meetings = dates.map(d => ({
    date: d,
    present: records.filter(r => r.meeting_date === d && r.attended).length,
    recorded: records.filter(r => r.meeting_date === d).length,
  }))
  return { dates, members, meetings }
}
// Absence-streak warning color: amber at 2 in a row, rose at 3+ (matches native).
const attnWarnFor = (s: number) =>
  s >= 3 ? { color: '#F2728A', label: `${s} missed in a row` }
  : s === 2 ? { color: '#F4B650', label: '2 missed in a row' }
  : null
const fmtHistDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
// meeting_time / rescheduled_time come back as HH:MM or HH:MM:SS (Postgres time).
const fmtTime = (t: string) => fmtTime12(t) ?? t

export default function VictoryGroupsList({
  onChanged,
  startWithForm = false,
  onPersonClick,
  onAddNewPerson,
}: {
  onChanged?: () => void
  startWithForm?: boolean
  onPersonClick?: (person: Person) => void
  onAddNewPerson?: (name?: string) => void
}) {
  const { profile } = useAuth()
  // GBC = all groups; My Constellation / My People = only groups I own (the person-set
  // distinction below scopes the weekly-attendance metric, mirroring the native app).
  const [scope, setScope] = useState<'gbc' | 'mine' | 'direct'>('mine')
  // Searchable owner picker: which group's picker is open + its filter text.
  const [ownerPickerGroupId, setOwnerPickerGroupId] = useState<string | null>(null)
  const [ownerSearch, setOwnerSearch] = useState('')
  // Searchable add-member picker.
  const [memberPickerGroupId, setMemberPickerGroupId] = useState<string | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const memberSearchRef = useRef<HTMLInputElement>(null)
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [allPeople, setAllPeople] = useState<Person[]>([])
  const [membersByGroup, setMembersByGroup] = useState<Record<string, PersonVictoryGroupWithPerson[]>>({})
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const [attendanceGroupId, setAttendanceGroupId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(startWithForm)
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [formDays, setFormDays] = useState<string[]>([])
  const [meetingTime, setMeetingTime] = useState('')
  const [focus, setFocus] = useState<GroupFocus | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [syncingGroupId, setSyncingGroupId] = useState<string | null>(null)

  const syncGroupToCalendar = async (action: 'create' | 'update' | 'delete', groupId: string, group: Partial<VictoryGroup>) => {
    if (!profile) return
    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'group',
          action,
          coachPersonId: profile.id,
          groupId,
          group,
        }),
      })
      return await res.json()
    } catch (err) {
      console.error('Calendar sync error:', err)
      return null
    }
  }

  const handleSyncGroupToCalendar = async (group: VictoryGroup) => {
    if (!group.meeting_day || syncingGroupId) return
    setSyncingGroupId(group.id)
    const result = await syncGroupToCalendar(
      group.google_calendar_event_id ? 'update' : 'create',
      group.id,
      group
    )
    if (result?.synced && result?.eventId) {
      setGroups(current =>
        current.map(g => g.id === group.id ? { ...g, google_calendar_event_id: result.eventId } : g)
      )
    }
    setSyncingGroupId(null)
  }

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(toDateInputValue(new Date()))
  const [draftAttendance, setDraftAttendance] = useState<Record<string, boolean>>({})
  const [existingAttendance, setExistingAttendance] = useState<GroupAttendance[]>([])
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [attendanceMessage, setAttendanceMessage] = useState('')

  // Attendance-history view (per group): all rows for the open group, newest-first.
  const [historyGroupId, setHistoryGroupId] = useState<string | null>(null)
  const [historyRecords, setHistoryRecords] = useState<GroupAttendance[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Per-occurrence cancel/reschedule overrides for the current meeting of each
  // group (keyed by victory_group_id + original meeting_date).
  const [groupStatuses, setGroupStatuses] = useState<GroupMeetingStatus[]>([])
  const [rsGroupId, setRsGroupId] = useState<string | null>(null) // which group's reschedule form is open
  const [rsDate, setRsDate] = useState('')
  const [rsTime, setRsTime] = useState('')
  // Explicit scope choice: move just this occurrence, or shift the standing
  // schedule for every future week. No default-hidden checkbox — the user
  // picks one of the two before saving.
  const [rsScope, setRsScope] = useState<'one' | 'all'>('one')
  const [rsSaving, setRsSaving] = useState(false)

  const statusFor = (groupId: string, occDate: string) =>
    groupStatuses.find(s => s.victory_group_id === groupId && s.meeting_date === occDate) ?? null

  const reloadStatuses = async () => {
    const { data } = await getGroupMeetingStatuses()
    setGroupStatuses((data ?? []) as GroupMeetingStatus[])
  }

  const cancelOccurrence = async (group: VictoryGroup, occDate: string) => {
    const { error } = await upsertGroupMeetingStatus({
      victory_group_id: group.id,
      meeting_date: occDate,
      status: 'cancelled',
      created_by_person_id: profile?.id ?? null,
    })
    if (error) { setError(error.message); return }
    await reloadStatuses()
    onChanged?.()
  }

  const reopenOccurrence = async (group: VictoryGroup, occDate: string) => {
    const { error } = await clearGroupMeetingStatus(group.id, occDate)
    if (error) { setError(error.message); return }
    setRsGroupId(null)
    await reloadStatuses()
    onChanged?.()
  }

  const openReschedule = (group: VictoryGroup, occDate: string) => {
    const st = statusFor(group.id, occDate)
    setRsGroupId(group.id)
    setRsDate(st?.rescheduled_to ?? occDate)
    setRsTime(st?.rescheduled_time ?? group.meeting_time ?? '')
    setRsScope('one')
    setError('')
  }

  const saveReschedule = async (group: VictoryGroup, occDate: string) => {
    if (!rsDate) return
    setRsSaving(true)
    if (rsScope === 'all') {
      // Shift the standing schedule for every future occurrence — only this
      // occurrence's weekday moves; a multi-day group keeps its other days.
      // Clear any one-off override so this occurrence follows the new schedule.
      const schedule = shiftDayInSchedule(daysOf(group), occDate, rsDate)
      const res = await updateVictoryGroup(group.id, { ...schedule, meeting_time: rsTime || null })
      if (!res.error) await clearGroupMeetingStatus(group.id, occDate)
      if (res.error) setError(res.error.message)
      else if (group.google_calendar_event_id) {
        await syncGroupToCalendar('update', group.id, { ...group, ...schedule, meeting_time: rsTime || null })
      }
    } else {
      const { error } = await upsertGroupMeetingStatus({
        victory_group_id: group.id,
        meeting_date: occDate,
        status: 'rescheduled',
        rescheduled_to: rsDate,
        rescheduled_time: rsTime || null,
        created_by_person_id: profile?.id ?? null,
      })
      if (error) setError(error.message)
    }
    setRsSaving(false)
    setRsGroupId(null)
    await Promise.all([reloadStatuses(), loadData()])
    onChanged?.()
  }

  const loadData = async () => {
    try {
      const [{ data: groupsData, error: groupsError }, { data: peopleData, error: peopleError }, { data: statusesData }] = await Promise.race([
        Promise.all([
          getVictoryGroups(),
          getPeople(),
          getGroupMeetingStatuses(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])

      if (groupsError) setError(groupsError.message)
      if (peopleError) setError(peopleError.message)
      setGroupStatuses((statusesData ?? []) as GroupMeetingStatus[])

      const nextGroups = (groupsData ?? []) as VictoryGroup[]
      const nextPeople = (peopleData ?? []) as Person[]
      setGroups(nextGroups)
      setAllPeople(nextPeople)

      // Fetch all groups' members in parallel instead of one-at-a-time (N+1).
      const memberResults = await Promise.all(nextGroups.map(g => getPeopleByVictoryGroup(g.id)))
      const groupedMembers: Record<string, PersonVictoryGroupWithPerson[]> = {}
      nextGroups.forEach((group, i) => {
        groupedMembers[group.id] = (memberResults[i].data ?? []) as unknown as PersonVictoryGroupWithPerson[]
      })
      setMembersByGroup(groupedMembers)
    } catch (err) {
      console.error('VictoryGroupsList load error:', err)
      setError('Failed to load groups')
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Load full attendance history when a group's history view opens.
  useEffect(() => {
    if (!historyGroupId) return
    let cancelled = false
    setHistoryLoading(true)
    getGroupAttendance(historyGroupId).then(({ data }) => {
      if (cancelled) return
      setHistoryRecords((data ?? []) as GroupAttendance[])
      setHistoryLoading(false)
    })
    return () => { cancelled = true }
  }, [historyGroupId])

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
    setFormDays([])
    setMeetingTime('')
    setFocus('')
    setEditingGroupId(null)
    setShowForm(false)
    setError('')
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError('')

    // meeting_day = first selected day, kept in sync for legacy readers.
    const sortedDays = [...formDays].sort((a, b) => WEEKDAY_NAMES.indexOf(a) - WEEKDAY_NAMES.indexOf(b))
    const payload = {
      name: name.trim(),
      meeting_day: sortedDays[0] ?? null,
      meeting_days: sortedDays.length ? sortedDays : null,
      meeting_time: meetingTime || null,
      focus: (focus || null) as GroupFocus | null,
    }

    const result = editingGroupId
      ? await updateVictoryGroup(editingGroupId, payload)
      : await addVictoryGroup({ ...payload, owner_person_id: profile?.id ?? null })

    if (result.error) {
      setError(result.error.message)
    } else {
      // Sync to Google Calendar if group has a meeting day
      if (payload.meeting_day && result.data) {
        const groupData = Array.isArray(result.data) ? result.data[0] : result.data
        if (groupData) {
          await syncGroupToCalendar(
            editingGroupId ? 'update' : 'create',
            groupData.id || editingGroupId!,
            groupData
          )
        }
      }
      resetForm()
      await loadData()
      onChanged?.()
    }

    setLoading(false)
  }

  const handleEdit = (group: VictoryGroup) => {
    // Exit attendance mode if active
    if (attendanceGroupId === group.id) {
      setAttendanceGroupId(null)
      setDraftAttendance({})
      setAttendanceMessage('')
    }
    // Open the edit form
    setEditingGroupId(group.id)
    setName(group.name)
    setFormDays(daysOf(group))
    setMeetingTime(group.meeting_time ?? '')
    setFocus(group.focus ?? '')
    setShowForm(true)
    // Make sure the group stays open to show members
    setOpenGroupId(group.id)
  }

  const handleAssignPerson = async (groupId: string, personId: string) => {
    if (!personId) return
    const person = allPeople.find(p => p.id === personId)

    setError('')
    setMemberSearch('')
    // Optimistically add the member and keep the group + picker open. We do NOT
    // reload here — a full reload re-renders the panel (losing focus and feeling
    // like the box closed). The optimistic state is authoritative until the next
    // natural reload.
    if (person) {
      setMembersByGroup(prev => ({
        ...prev,
        [groupId]: [
          ...(prev[groupId] ?? []),
          { id: `temp-${personId}`, person_id: personId, victory_group_id: groupId, created_at: new Date().toISOString(), people: person } as PersonVictoryGroupWithPerson,
        ],
      }))
    }
    setTimeout(() => memberSearchRef.current?.focus(), 0)

    const { error } = await addPersonToVictoryGroup(personId, groupId)
    if (error) {
      setError(error.message)
      // Roll back the optimistic add on failure.
      setMembersByGroup(prev => ({
        ...prev,
        [groupId]: (prev[groupId] ?? []).filter(m => m.person_id !== personId),
      }))
      return
    }
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

  const handleSetOwner = async (groupId: string, ownerPersonId: string) => {
    if (!ownerPersonId) return
    setOwnerPickerGroupId(null)
    setOwnerSearch('')
    setError('')
    const { error } = await updateVictoryGroupOwner(groupId, ownerPersonId)
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
      setHistoryGroupId(null)
    }
  }

  const toggleAttendanceMode = (groupId: string) => {
    if (attendanceGroupId === groupId) {
      setAttendanceGroupId(null)
      setDraftAttendance({})
      setAttendanceMessage('')
    } else {
      setHistoryGroupId(null) // attendance + history are mutually exclusive
      setAttendanceGroupId(groupId)
      setAttendanceDate(toDateInputValue(new Date()))
    }
  }

  const toggleHistoryMode = (groupId: string) => {
    if (historyGroupId === groupId) {
      setHistoryGroupId(null)
    } else {
      setAttendanceGroupId(null) // leave attendance mode when viewing history
      setDraftAttendance({})
      setAttendanceMessage('')
      setHistoryRecords([])
      setHistoryGroupId(groupId)
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

  // GBC shows every group; My Constellation / My People show only groups I own.
  const visibleGroups = scope === 'gbc'
    ? groups
    : groups.filter(g => g.owner_person_id === profile?.id)
  const personName = (id: string | null) => allPeople.find(p => p.id === id)?.name ?? 'Unassigned'

  return (
    <div className="rounded-2xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--fg-1)]">Grace Groups</h3>
          {/* GBC = all groups; Mine/My People = groups I own (person-scoped metric) */}
          <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-0.5">
            {([['gbc', 'GBC Constellation'], ['mine', 'My Constellation'], ['direct', 'My People']] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setScope(val)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all ${scope === val ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
            {/* Meeting days — tap to toggle; a group can meet several days a week. */}
            <div className="col-span-2 flex flex-wrap items-center gap-1">
              {WEEKDAY_NAMES.map(day => {
                const on = formDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setFormDays(prev => on ? prev.filter(d => d !== day) : [...prev, day])}
                    className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition-all ${on ? 'border-[var(--gbm-cobalt-bright)] bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'border-[var(--line-2)] bg-[var(--indigo-2)] text-[var(--fg-2)] hover:border-[var(--line-3)]'}`}
                  >
                    {day.slice(0, 3)}
                  </button>
                )
              })}
            </div>
            <input
              type="time"
              value={meetingTime}
              onChange={e => setMeetingTime(e.target.value)}
              className="col-span-2 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
            {/* Focus: which booklet this group takes people through (sets the 4E stage) */}
            <select
              value={focus}
              onChange={e => setFocus(e.target.value as GroupFocus | '')}
              className="col-span-2 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            >
              <option value="">Focus — General (no booklet)</option>
              {GROUP_FOCUS_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label} → {o.stage}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {visibleGroups.length === 0 ? (
        <p className="text-sm text-[var(--fg-2)]">
          {scope !== 'gbc'
            ? 'You don’t own any groups yet. Switch to GBC Constellation to see and claim existing groups, or add one.'
            : 'No Grace Groups yet.'}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleGroups.map(group => {
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
            const isHistoryMode = historyGroupId === group.id
            // Only the group's owner (or an admin) can edit the group.
            const canManage = !!profile?.is_admin || group.owner_person_id === profile?.id
            // History derivations only apply to the group whose history is loaded.
            const history = isHistoryMode ? computeAttendanceHistory(historyRecords, sortedMemberships) : null

            return (
              <div
                key={group.id}
                className={`overflow-hidden rounded-lg border border-[var(--line-1)] transition-all ${isOpen ? 'sm:col-span-2' : ''}`}
                style={{
                  background: 'var(--indigo)',
                }}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="flex flex-1 items-center justify-between gap-2 px-2.5 py-1.5 text-left"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--fg-1)]">{group.name}</span>
                        {group.focus && bookletStage(group.focus) && (
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{ background: `${STAGE_COLORS[bookletStage(group.focus)!]}22`, color: STAGE_COLORS[bookletStage(group.focus)!] }}
                            title={`${group.focus} · ${bookletStage(group.focus)}`}
                          >
                            {bookletStage(group.focus)} · {group.focus}
                          </span>
                        )}
                      </span>
                      {/* Who owns the group, and who last touched it (audit). */}
                      <span className="truncate text-[10px] text-[var(--fg-3)]">
                        Led by <span className="text-[var(--fg-2)]">{personName(group.owner_person_id)}</span>
                        {group.last_edited_by && (
                          <> · edited by <span className="text-[var(--fg-2)]">{personName(group.last_edited_by)}</span></>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--fg-3)]">
                      {group.google_calendar_event_id && <span title="Synced to Google Calendar">📅 </span>}
                      {fmtDaysShort(daysOf(group))}{group.meeting_time ? ` @ ${fmtTime(group.meeting_time)}` : ''} · {memberships.length}
                    </span>
                  </button>
                  {canManage && group.meeting_day && !group.google_calendar_event_id && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleSyncGroupToCalendar(group) }}
                      disabled={syncingGroupId === group.id}
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--gbm-cobalt-bright)] hover:bg-[rgba(91,141,247,.1)] disabled:opacity-50"
                      title="Add to Google Calendar"
                    >
                      {syncingGroupId === group.id ? '…' : '📅 Sync'}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t border-[var(--line-1)] p-2.5">
                    <div className="flex gap-2">
                      {canManage && (
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
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleHistoryMode(group.id)
                        }}
                        className="flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all"
                        style={{
                          borderColor: isHistoryMode ? 'var(--gbm-cobalt-bright)' : 'var(--line-2)',
                          background: isHistoryMode ? 'var(--gbm-cobalt-bright)' : 'var(--indigo-2)',
                          color: 'var(--fg-1)',
                        }}
                      >
                        {isHistoryMode ? 'Close history' : 'History'}
                      </button>
                      {canManage && (
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
                      )}
                    </div>
                    {!canManage && (
                      <p className="text-[11px] text-[var(--fg-3)]">View only — only {personName(group.owner_person_id)} can edit this group.</p>
                    )}

                    {/* Ownership: a group lives in its owner's constellation */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[var(--fg-3)]">Owner:</span>
                      <span className="font-semibold text-[var(--fg-1)]">{personName(group.owner_person_id)}</span>
                      {canManage && (
                        <div className="relative ml-auto" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setOwnerSearch('')
                              setOwnerPickerGroupId(ownerPickerGroupId === group.id ? null : group.id)
                            }}
                            className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-[11px] font-medium text-[var(--fg-1)] hover:border-[var(--gbm-cobalt-bright)]"
                          >
                            {group.owner_person_id ? 'Transfer…' : 'Assign owner…'}
                          </button>
                          {ownerPickerGroupId === group.id && (
                            <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] shadow-lg">
                              <input
                                type="text"
                                autoFocus
                                value={ownerSearch}
                                onChange={(e) => setOwnerSearch(e.target.value)}
                                placeholder="Search name…"
                                className="w-full border-b border-[var(--line-1)] bg-[var(--indigo-2)] px-3 py-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none"
                              />
                              <div className="max-h-48 overflow-auto">
                                {allPeople
                                  .filter(p => p.id !== group.owner_person_id && p.name.toLowerCase().includes(ownerSearch.trim().toLowerCase()))
                                  .slice(0, 50)
                                  .map(p => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => handleSetOwner(group.id, p.id)}
                                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-[var(--fg-1)] transition-colors hover:bg-[var(--indigo-2)]"
                                    >
                                      <span className="truncate">{p.name}</span>
                                      <span className="shrink-0 text-[10px] text-[var(--fg-3)]">{p.current_stage}</span>
                                    </button>
                                  ))}
                                {allPeople.filter(p => p.id !== group.owner_person_id && p.name.toLowerCase().includes(ownerSearch.trim().toLowerCase())).length === 0 && (
                                  <p className="px-3 py-2 text-xs text-[var(--fg-3)]">No matches</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* This week's meeting — per-occurrence cancel / reschedule.
                        "All future meetings" instead shifts the group's standing
                        day/time. Mirrors the native group action sheet. */}
                    {daysOf(group).length > 0 && !isAttendanceMode && !isHistoryMode && (() => {
                      const occ = nextOccurrenceDate(daysOf(group))
                      if (!occ) return null
                      const st = statusFor(group.id, occ)
                      const isRsOpen = rsGroupId === group.id
                      return (
                        <div className="rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Next meeting</div>
                              {st?.status === 'cancelled' ? (
                                <div className="text-xs font-semibold" style={{ color: '#F2728A' }}>{fmtHistDate(occ)} · Cancelled</div>
                              ) : st?.status === 'rescheduled' && st.rescheduled_to ? (
                                <div className="text-xs text-[var(--fg-1)]">
                                  <span className="text-[var(--fg-3)] line-through">{fmtHistDate(occ)}</span>
                                  {' → '}
                                  <span className="font-semibold" style={{ color: 'var(--establish)' }}>
                                    {fmtHistDate(st.rescheduled_to)}{st.rescheduled_time ? ` @ ${fmtTime(st.rescheduled_time)}` : ''}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-xs font-semibold text-[var(--fg-1)]">{fmtHistDate(occ)}{group.meeting_time ? ` @ ${fmtTime(group.meeting_time)}` : ''}</div>
                              )}
                            </div>
                            {canManage && (
                              <div className="flex shrink-0 items-center gap-1.5">
                                {st ? (
                                  <button type="button" onClick={() => reopenOccurrence(group, occ)} className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-2 py-1 text-[11px] font-semibold text-[var(--fg-1)] hover:border-[var(--gbm-cobalt-bright)]">Undo</button>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => openReschedule(group, occ)} className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-2 py-1 text-[11px] font-semibold text-[var(--fg-1)] hover:border-[var(--gbm-cobalt-bright)]">Reschedule</button>
                                    <button type="button" onClick={() => cancelOccurrence(group, occ)} className="rounded-lg border px-2 py-1 text-[11px] font-semibold" style={{ borderColor: 'rgba(240,114,159,.4)', color: '#F0729F', background: 'rgba(240,114,159,.1)' }}>Cancel</button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {isRsOpen && (
                            <>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <input type="date" value={rsDate} onChange={e => setRsDate(e.target.value)} className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none" />
                                <input type="time" value={rsTime} onChange={e => setRsTime(e.target.value)} className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none" />
                              </div>
                              {/* Explicit scope — the user picks which meetings move before saving. */}
                              <div className="mt-1.5 flex flex-col gap-1">
                                {([
                                  ['one', `Just this meeting (${fmtHistDate(occ)})`],
                                  ['all', `All future ${weekdayOf(occ)}s${rsDate ? ` → ${weekdayOf(rsDate)}s` : ''}`],
                                ] as const).map(([val, label]) => (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => setRsScope(val)}
                                    className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-all ${rsScope === val ? 'border-[var(--gbm-cobalt-bright)] bg-[rgba(91,141,247,.15)] text-[var(--fg-1)]' : 'border-[var(--line-2)] bg-[var(--indigo)] text-[var(--fg-2)] hover:border-[var(--line-3)]'}`}
                                  >
                                    {rsScope === val ? '● ' : '○ '}{label}
                                  </button>
                                ))}
                              </div>
                              {rsScope === 'all' && rsDate && (
                                <p className="mt-1 text-[10px] text-[var(--fg-3)]">
                                  Moves the group’s regular {weekdayOf(occ)} meeting to {weekdayOf(rsDate)}{rsTime ? ` @ ${rsTime}` : ''} every week{daysOf(group).length > 1 ? ' — other meeting days stay the same' : ''}.
                                </p>
                              )}
                              <div className="mt-2 flex items-center gap-1.5">
                                <button type="button" onClick={() => saveReschedule(group, occ)} disabled={rsSaving || !rsDate} className="cn-btn cn-btn-primary !px-2.5 !py-1 !text-xs disabled:opacity-50">{rsSaving ? 'Saving…' : 'Save'}</button>
                                <button type="button" onClick={() => setRsGroupId(null)} className="cn-chip !text-xs">Cancel</button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })()}

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

                    {/* Attendance history — who came to past meetings, absence streaks. */}
                    {isHistoryMode && (
                      <div>
                        {historyLoading ? (
                          <p className="py-4 text-center text-xs text-[var(--fg-3)]">Loading history…</p>
                        ) : !history || history.dates.length === 0 ? (
                          <p className="text-xs text-[var(--fg-3)]">No meetings recorded yet. Take attendance to start tracking who comes.</p>
                        ) : (
                          <div className="space-y-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                              {history.dates.length} {history.dates.length === 1 ? 'meeting' : 'meetings'} recorded
                            </div>
                            <div>
                              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Members</div>
                              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                {history.members.map(({ person, streak, attended }) => {
                                  const stageColor = STAGE_COLORS[person.current_stage]
                                  const warn = attnWarnFor(streak)
                                  const initials = person.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
                                  return (
                                    <div
                                      key={person.id}
                                      className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5"
                                      style={{
                                        borderColor: warn ? warn.color : 'var(--line-1)',
                                        background: warn ? `${warn.color}14` : 'var(--indigo-2)',
                                      }}
                                    >
                                      <div className="flex min-w-0 items-center gap-2">
                                        <div
                                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                                          style={{ border: `2px solid ${stageColor}`, color: stageColor }}
                                        >
                                          {initials}
                                        </div>
                                        <div className="min-w-0">
                                          <div className="truncate text-xs font-semibold text-[var(--fg-1)]">{person.name}</div>
                                          {warn && <div className="text-[10px] font-medium" style={{ color: warn.color }}>{warn.label}</div>}
                                        </div>
                                      </div>
                                      <span className="shrink-0 text-[11px] font-semibold text-[var(--fg-2)]">{attended}/{history.dates.length}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                            <div>
                              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Meetings</div>
                              <div className="space-y-1">
                                {history.meetings.map(m => (
                                  <div key={m.date} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] px-2 py-1.5">
                                    <span className="truncate text-xs text-[var(--fg-1)]">{fmtHistDate(m.date)}</span>
                                    <span className="shrink-0 text-[11px] font-semibold text-[var(--fg-2)]">{m.present}/{m.recorded} present</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!isHistoryMode && (
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
                                {!isAttendanceMode && canManage && (
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
                    )}

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
                    ) : canManage && !isHistoryMode ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setMemberSearch('')
                            setMemberPickerGroupId(memberPickerGroupId === group.id ? null : group.id)
                          }}
                          className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-left text-xs font-medium text-[var(--fg-1)] hover:border-[var(--gbm-cobalt-bright)]"
                        >
                          {memberPickerGroupId === group.id ? '× Close' : '+ Add person...'}
                        </button>
                        {memberPickerGroupId === group.id && (() => {
                          const q = memberSearch.trim().toLowerCase()
                          const matches = availablePeople.filter(person => person.name.toLowerCase().includes(q)).slice(0, 50)
                          return (
                            <div className="mt-1 rounded-xl border border-[var(--line-2)] bg-[var(--indigo)]">
                              <input
                                ref={memberSearchRef}
                                type="text"
                                autoFocus
                                value={memberSearch}
                                onChange={(e) => setMemberSearch(e.target.value)}
                                placeholder="Search name…"
                                className="w-full rounded-t-xl border-b border-[var(--line-1)] bg-[var(--indigo-2)] px-3 py-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none"
                              />
                              <div className="max-h-56 overflow-auto">
                                {matches.map(person => (
                                  <button
                                    key={person.id}
                                    type="button"
                                    onClick={() => handleAssignPerson(group.id, person.id)}
                                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-[var(--fg-1)] transition-colors hover:bg-[var(--indigo-2)]"
                                  >
                                    <span className="truncate">{person.name}</span>
                                    <span className="shrink-0 text-[10px] text-[var(--fg-3)]">{person.current_stage}</span>
                                  </button>
                                ))}
                                {matches.length === 0 && (
                                  <p className="px-3 py-2 text-xs text-[var(--fg-3)]">
                                    {memberSearch.trim() ? `No one found for “${memberSearch.trim()}”.` : 'Type to search, or create a new person.'}
                                  </p>
                                )}
                                {/* Create a new person (pre-fills the typed name) */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const name = memberSearch.trim()
                                    setMemberPickerGroupId(null)
                                    setMemberSearch('')
                                    onAddNewPerson?.(name || undefined)
                                  }}
                                  className="flex w-full items-center gap-1 border-t border-[var(--line-1)] px-3 py-2 text-left text-xs font-semibold text-[var(--gbm-cobalt-bright)] transition-colors hover:bg-[var(--indigo-2)]"
                                >
                                  ✦ {memberSearch.trim() ? `Create “${memberSearch.trim()}”` : 'Create new person…'}
                                </button>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    ) : null}
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
