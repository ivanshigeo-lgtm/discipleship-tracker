'use client'

import { useEffect, useState } from 'react'
import { getEngagementsByPerson, getConfirmedEngagementIds, updateEngagement, deleteEngagement, addEngagement } from '../lib/supabaseQueries'
import type { Engagement, MeetingType } from '../types/database'
import { type Recurrence, RECURRENCE_OPTIONS, recurrenceDates, recurrenceLabel } from '../lib/recurrence'

const MEETING_TYPES: MeetingType[] = ['One2One', 'Making Disciples', 'Coffee', 'Church Community', 'Empowering Leaders']

type EditingEngagement = {
  description: string
  meeting_type: MeetingType | ''
  follow_up_date: string
  follow_up_time: string
  location: string
  notes: string
  recurrence: Recurrence
  repeatUntil: string
  // When the date/time moves and the meeting has future recurring siblings:
  // move just this one, or this and all future ones (explicit choice).
  applyScope: 'one' | 'future'
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000)
}

// Future recurring siblings of a 1:1 — same person and meeting type, still
// Pending, dated after this one. There is no series id; this mirrors the
// native app's sibling rule for "apply to all future".
function futureSiblings(all: Engagement[], eng: Engagement): Engagement[] {
  if (!eng.follow_up_date) return []
  return all.filter(e =>
    e.id !== eng.id &&
    e.status === 'Pending' &&
    e.person_id === eng.person_id &&
    (e.meeting_type ?? null) === (eng.meeting_type ?? null) &&
    !!e.follow_up_date && e.follow_up_date > eng.follow_up_date!
  )
}

// Future occurrences only (the engagement being edited already covers `start`).
function repeatCopies(start: string, until: string, rec: Recurrence): string[] {
  return recurrenceDates(start, until, rec).filter(d => d > start)
}

export default function NextStepsList({
  personId,
  personName,
  coachPersonId,
  refreshKey,
  onUpdate,
  onOpenEngagement,
}: {
  personId: string
  personName: string
  coachPersonId?: string
  refreshKey: number
  onUpdate?: () => void
  onOpenEngagement?: (engagement: Engagement, personName: string) => void
}) {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<EditingEngagement | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadEngagements = async () => {
    try {
      const result = await Promise.race([
        getEngagementsByPerson(personId),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])
      let engs = result.data ?? []
      // You only see meetings you created or have confirmed being part of — even
      // when looking at someone you co-coach with another leader.
      if (coachPersonId) {
        const { data: cids } = await getConfirmedEngagementIds(coachPersonId)
        const confirmed = new Set(cids ?? [])
        engs = engs.filter(e => e.created_by_person_id === coachPersonId || confirmed.has(e.id))
      }
      setEngagements(engs)
    } catch (err) {
      console.error('NextStepsList load error:', err)
    }
  }

  useEffect(() => {
    loadEngagements()
  }, [personId, refreshKey])

  const handleToggleComplete = async (eng: Engagement) => {
    setSavingId(eng.id)
    const newStatus = eng.status === 'Completed' ? 'Pending' : 'Completed'

    const { data, error } = await updateEngagement(eng.id, { status: newStatus })

    if (error) {
      console.error('Failed to update engagement:', error.message || error.code || JSON.stringify(error))
      alert(`Failed to update: ${error.message || 'Check Supabase RLS policies'}`)
    } else if (data) {
      setEngagements(current =>
        current.map(e =>
          e.id === eng.id ? { ...e, status: newStatus } : e
        )
      )
      onUpdate?.()
    } else {
      setEngagements(current =>
        current.map(e =>
          e.id === eng.id ? { ...e, status: newStatus } : e
        )
      )
      onUpdate?.()
    }
    setSavingId(null)
  }

  const handleSave = async (eng: Engagement) => {
    if (!editingData) return
    setSavingId(eng.id)

    const updates = {
      description: editingData.description.trim(),
      meeting_type: editingData.meeting_type || null,
      follow_up_date: editingData.follow_up_date || null,
      follow_up_time: editingData.follow_up_time || null,
      location: editingData.location.trim() || null,
      notes: editingData.notes.trim() || null,
    }

    const { data, error } = await updateEngagement(eng.id, updates)

    if (error) {
      console.error('Failed to save:', error)
      alert(`Failed to save: ${error.message || 'Check Supabase RLS policies'}`)
    } else if (data) {
      const updatedEng = { ...eng, ...updates }
      setEngagements(current =>
        current.map(e => e.id === eng.id ? updatedEng : e)
      )
      // "This and all future meetings": shift each future sibling by the same
      // number of days this one moved, and carry the new time along.
      if (
        editingData.applyScope === 'future' &&
        eng.follow_up_date && updates.follow_up_date &&
        (updates.follow_up_date !== eng.follow_up_date || (updates.follow_up_time ?? '') !== (eng.follow_up_time ?? ''))
      ) {
        const delta = daysBetween(eng.follow_up_date, updates.follow_up_date)
        for (const sib of futureSiblings(engagements, eng)) {
          await updateEngagement(sib.id, {
            follow_up_date: delta ? addDaysStr(sib.follow_up_date!, delta) : sib.follow_up_date,
            follow_up_time: updates.follow_up_time || sib.follow_up_time,
          })
        }
        await loadEngagements()
      }
      setExpandedId(null)
      setEditingData(null)
      onUpdate?.()

      // Sync this engagement with Google Calendar
      if (coachPersonId && updates.follow_up_date) {
        try {
          await fetch('/api/calendar/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: eng.google_calendar_event_id ? 'update' : 'create',
              coachPersonId,
              engagementId: eng.id,
              personName,
              engagement: {
                ...updates,
                google_calendar_event_id: eng.google_calendar_event_id,
              },
            }),
          })
        } catch (err) {
          console.error('Calendar sync error:', err)
        }
      }

      // Create recurring copies (occurrences after this one)
      if (editingData.recurrence !== 'none' && updates.follow_up_date && editingData.repeatUntil) {
        const repeatDates = repeatCopies(updates.follow_up_date, editingData.repeatUntil, editingData.recurrence)
        for (const date of repeatDates) {
          const { data: newEng } = await addEngagement({
            person_id: eng.person_id,
            created_by_person_id: eng.created_by_person_id ?? coachPersonId ?? null,
            description: updates.description,
            follow_up_date: date,
            follow_up_time: updates.follow_up_time || null,
            location: updates.location || null,
            meeting_type: updates.meeting_type || null,
            status: 'Pending',
          })
          if (newEng && coachPersonId) {
            try {
              await fetch('/api/calendar/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'create',
                  coachPersonId,
                  engagementId: newEng.id,
                  personName,
                  engagement: { ...updates, follow_up_date: date },
                }),
              })
            } catch (err) {
              console.error('Calendar sync error for repeat:', err)
            }
          }
        }
        await loadEngagements()
      }
    }
    setSavingId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this engagement?')) return
    setSavingId(id)
    const { error } = await deleteEngagement(id)
    if (!error) {
      setEngagements(current => current.filter(e => e.id !== id))
      onUpdate?.()
    }
    setSavingId(null)
  }

  const handleExpand = (eng: Engagement) => {
    if (expandedId === eng.id) {
      setExpandedId(null)
      setEditingData(null)
    } else {
      setExpandedId(eng.id)
      setEditingData({
        description: eng.description,
        meeting_type: eng.meeting_type || '',
        follow_up_date: eng.follow_up_date || '',
        follow_up_time: eng.follow_up_time || '',
        location: eng.location || '',
        notes: eng.notes || '',
        recurrence: 'none',
        repeatUntil: '',
        applyScope: 'one',
      })
    }
  }

  const handleSyncToCalendar = async (eng: Engagement) => {
    if (!coachPersonId || !eng.follow_up_date) return
    setSavingId(eng.id)

    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          coachPersonId,
          engagementId: eng.id,
          personName,
          engagement: {
            description: eng.description,
            follow_up_date: eng.follow_up_date,
            follow_up_time: eng.follow_up_time,
            location: eng.location,
            meeting_type: eng.meeting_type,
            notes: eng.notes,
          },
        }),
      })
      const data = await res.json()
      if (data.synced && data.eventId) {
        setEngagements(current =>
          current.map(e => e.id === eng.id ? { ...e, google_calendar_event_id: data.eventId } : e)
        )
      } else {
        console.error('Calendar sync failed:', data)
        alert(`Calendar sync failed: ${data.reason || 'unknown error'}. Check that Google Calendar is connected.`)
      }
    } catch (err) {
      console.error('Calendar sync error:', err)
      alert('Calendar sync failed. Please try again.')
    }
    setSavingId(null)
  }

  if (engagements.length === 0) {
    return <p className="text-xs text-[var(--fg-3)] italic">No engagements scheduled yet.</p>
  }

  const pending = engagements.filter(e => e.status === 'Pending')
  const completed = engagements.filter(e => e.status === 'Completed')
  // Cancelled meetings stay visible here (red badge, out of the pending count) so
  // the coach can always find one and Reopen it — they're hidden from My Meetings.
  const cancelled = engagements.filter(e => e.status === 'Cancelled')

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
            Upcoming ({pending.length})
          </div>
          {pending.map(eng => (
            <EngagementCard
              key={eng.id}
              eng={eng}
              futureSiblingCount={futureSiblings(engagements, eng).length}
              isExpanded={expandedId === eng.id}
              editingData={editingData}
              savingId={savingId}
              canSyncCalendar={!!coachPersonId && !!eng.follow_up_date && !eng.google_calendar_event_id}
              onToggleComplete={() => handleToggleComplete(eng)}
              onExpand={() => handleExpand(eng)}
              onOpen={() => onOpenEngagement?.(eng, personName)}
              onEditingChange={setEditingData}
              onSave={() => handleSave(eng)}
              onDelete={() => handleDelete(eng.id)}
              onSyncToCalendar={() => handleSyncToCalendar(eng)}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
            Completed ({completed.length})
          </div>
          {completed.map(eng => (
            <EngagementCard
              key={eng.id}
              eng={eng}
              futureSiblingCount={futureSiblings(engagements, eng).length}
              isExpanded={expandedId === eng.id}
              editingData={editingData}
              savingId={savingId}
              canSyncCalendar={!!coachPersonId && !!eng.follow_up_date && !eng.google_calendar_event_id}
              onToggleComplete={() => handleToggleComplete(eng)}
              onExpand={() => handleExpand(eng)}
              onOpen={() => onOpenEngagement?.(eng, personName)}
              onEditingChange={setEditingData}
              onSave={() => handleSave(eng)}
              onDelete={() => handleDelete(eng.id)}
              onSyncToCalendar={() => handleSyncToCalendar(eng)}
            />
          ))}
        </div>
      )}

      {cancelled.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
            Cancelled ({cancelled.length})
          </div>
          {cancelled.map(eng => (
            <EngagementCard
              key={eng.id}
              eng={eng}
              futureSiblingCount={futureSiblings(engagements, eng).length}
              isExpanded={expandedId === eng.id}
              editingData={editingData}
              savingId={savingId}
              canSyncCalendar={!!coachPersonId && !!eng.follow_up_date && !eng.google_calendar_event_id}
              onToggleComplete={() => handleToggleComplete(eng)}
              onExpand={() => handleExpand(eng)}
              onOpen={() => onOpenEngagement?.(eng, personName)}
              onEditingChange={setEditingData}
              onSave={() => handleSave(eng)}
              onDelete={() => handleDelete(eng.id)}
              onSyncToCalendar={() => handleSyncToCalendar(eng)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EngagementCard({
  eng,
  futureSiblingCount,
  isExpanded,
  editingData,
  savingId,
  canSyncCalendar,
  onToggleComplete,
  onExpand,
  onOpen,
  onEditingChange,
  onSave,
  onDelete,
  onSyncToCalendar,
}: {
  eng: Engagement
  futureSiblingCount: number
  isExpanded: boolean
  editingData: EditingEngagement | null
  savingId: string | null
  canSyncCalendar: boolean
  onToggleComplete: () => void
  onExpand: () => void
  onOpen: () => void
  onEditingChange: (data: EditingEngagement | null) => void
  onSave: () => void
  onDelete: () => void
  onSyncToCalendar: () => void
}) {
  const isCompleted = eng.status === 'Completed'
  const isCancelled = eng.status === 'Cancelled'
  const isSaving = savingId === eng.id

  const updateField = <K extends keyof EditingEngagement>(field: K, value: EditingEngagement[K]) => {
    if (editingData) {
      onEditingChange({ ...editingData, [field]: value })
    }
  }

  return (
    <div
      className="overflow-hidden rounded-xl border transition-all"
      style={{
        borderColor: isCancelled ? 'rgba(240,114,159,.3)' : isCompleted ? 'rgba(54,214,195,.3)' : 'var(--line-1)',
        background: isCancelled ? 'rgba(240,114,159,.05)' : isCompleted ? 'rgba(54,214,195,.05)' : 'var(--indigo-2)',
      }}
    >
      <div className="flex items-start gap-3 p-3">
        <button
          type="button"
          onClick={onToggleComplete}
          disabled={isSaving}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all disabled:opacity-60"
          style={{
            borderColor: isCompleted ? 'var(--establish)' : 'var(--line-2)',
            background: isCompleted ? 'var(--establish)' : 'transparent',
          }}
          title={isCompleted ? 'Mark as pending' : 'Mark as met'}
        >
          {isCompleted && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6L5 8.5L9.5 4" stroke="var(--void)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onExpand}
            className="w-full text-left"
          >
            <div className="flex items-center gap-2">
              {eng.meeting_type && (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(91,141,247,.15)', color: 'var(--equip)' }}>
                  {eng.meeting_type}
                </span>
              )}
              <span
                className="text-sm text-[var(--fg-1)]"
                style={{ textDecoration: isCompleted || isCancelled ? 'line-through' : 'none', opacity: isCompleted || isCancelled ? 0.7 : 1 }}
              >
                {eng.description}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--fg-3)]">
              {eng.follow_up_date && (
                <span>{new Date(eng.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              )}
              {eng.follow_up_time && (
                <span>@ {eng.follow_up_time}</span>
              )}
              {eng.location && (
                <span className="text-[var(--fg-2)]">{eng.location}</span>
              )}
              {eng.completed_at && (
                <span style={{ color: 'var(--establish)' }}>
                  Met {new Date(eng.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {eng.notes && <span className="text-[var(--equip)]">Has actions</span>}
              {eng.google_calendar_event_id && <span className="text-[var(--fg-3)]">📅 Synced</span>}
            </div>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-full border border-[var(--line-2)] px-2.5 py-1 text-[10px] font-semibold text-[var(--fg-2)] hover:border-[var(--gbm-cobalt-bright)] hover:text-[var(--fg-1)]"
            title="Open action, prayer & praise points"
          >
            Open
          </button>
          {canSyncCalendar && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSyncToCalendar(); }}
              disabled={isSaving}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--gbm-cobalt-bright)] hover:bg-[rgba(91,141,247,.1)] disabled:opacity-50"
              title="Add to Google Calendar"
            >
              📅 Sync
            </button>
          )}
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: isCancelled ? 'rgba(240,114,159,.15)' : isCompleted ? 'rgba(54,214,195,.15)' : 'rgba(244,182,80,.15)',
              color: isCancelled ? '#F0729F' : isCompleted ? 'var(--establish)' : 'var(--engage)',
            }}
          >
            {isCancelled ? 'Cancelled' : isCompleted ? 'Met' : 'Pending'}
          </span>
        </div>
      </div>

      {isExpanded && editingData && (
        <div className="space-y-3 border-t border-[var(--line-1)] bg-[var(--indigo)] p-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
              Description
            </label>
            <input
              type="text"
              value={editingData.description}
              onChange={(e) => updateField('description', e.target.value)}
              className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-2 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                Type
              </label>
              <select
                value={editingData.meeting_type}
                onChange={(e) => updateField('meeting_type', e.target.value as MeetingType | '')}
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-2 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              >
                <option value="">No type</option>
                {MEETING_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                Location
              </label>
              <input
                type="text"
                value={editingData.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="Where"
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                Date
              </label>
              <input
                type="date"
                value={editingData.follow_up_date}
                onChange={(e) => updateField('follow_up_date', e.target.value)}
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-2 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                Time
              </label>
              <input
                type="time"
                value={editingData.follow_up_time}
                onChange={(e) => updateField('follow_up_time', e.target.value)}
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-2 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              />
            </div>
          </div>

          {/* Recurrence */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--fg-3)]">Repeats</span>
            <select
              value={editingData.recurrence}
              disabled={!editingData.follow_up_date}
              onChange={(e) => {
                const v = e.target.value as Recurrence
                onEditingChange({ ...editingData, recurrence: v, repeatUntil: v === 'none' ? '' : editingData.repeatUntil })
              }}
              className={`rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-1.5 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none ${editingData.follow_up_date ? '' : 'cursor-not-allowed opacity-40'}`}
            >
              {RECURRENCE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {editingData.recurrence !== 'none' && editingData.follow_up_date && (
              <>
                <span className="text-xs text-[var(--fg-3)]">until</span>
                <input
                  type="date"
                  value={editingData.repeatUntil}
                  min={addDaysStr(editingData.follow_up_date, 1)}
                  onChange={(e) => onEditingChange({ ...editingData, repeatUntil: e.target.value })}
                  className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-1.5 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                />
                {editingData.repeatUntil && repeatCopies(editingData.follow_up_date, editingData.repeatUntil, editingData.recurrence).length > 0 && (
                  <span className="text-[10px] text-[var(--fg-3)]">
                    {recurrenceLabel(editingData.recurrence, editingData.follow_up_date)} · {repeatCopies(editingData.follow_up_date, editingData.repeatUntil, editingData.recurrence).length} more
                  </span>
                )}
              </>
            )}
            {!editingData.follow_up_date && (
              <span className="text-[10px] text-[var(--fg-3)]">set a date first</span>
            )}
          </div>

          {/* Rescheduling a recurring 1:1 — explicit choice of which meetings move. */}
          {eng.status === 'Pending' && futureSiblingCount > 0 && eng.follow_up_date && editingData.follow_up_date &&
            (editingData.follow_up_date !== eng.follow_up_date || editingData.follow_up_time !== (eng.follow_up_time ?? '')) && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Apply to</span>
              {([
                ['one', `Just this meeting (${new Date(eng.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`],
                ['future', `This and all ${futureSiblingCount} future ${futureSiblingCount === 1 ? 'meeting' : 'meetings'}`],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => updateField('applyScope', val)}
                  className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-all ${editingData.applyScope === val ? 'border-[var(--gbm-cobalt-bright)] bg-[rgba(91,141,247,.15)] text-[var(--fg-1)]' : 'border-[var(--line-2)] bg-[var(--indigo-2)] text-[var(--fg-2)] hover:border-[var(--line-3)]'}`}
                >
                  {editingData.applyScope === val ? '● ' : '○ '}{label}
                </button>
              ))}
              {editingData.applyScope === 'future' && (
                <p className="text-[10px] text-[var(--fg-3)]">Each future meeting shifts by the same number of days{editingData.follow_up_time ? ` and moves to ${editingData.follow_up_time}` : ''}.</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
              Points of Action
            </label>
            <textarea
              value={editingData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder="Action items and next steps..."
              className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2.5 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onDelete}
              disabled={isSaving}
              className="text-[10px] text-[#F2728A] hover:underline disabled:opacity-60"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onExpand}
                className="rounded-lg border border-[var(--line-2)] px-3 py-1.5 text-xs text-[var(--fg-2)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving || !editingData.description.trim()}
                className="cn-btn cn-btn-primary !px-3 !py-1.5 !text-xs"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
