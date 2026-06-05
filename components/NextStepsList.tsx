'use client'

import { useEffect, useState } from 'react'
import { getEngagementsByPerson, updateEngagement, deleteEngagement } from '../lib/supabaseQueries'
import type { Engagement } from '../types/database'

export default function NextStepsList({
  personId,
  refreshKey,
  onUpdate,
}: {
  personId: string
  refreshKey: number
  onUpdate?: () => void
}) {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<string>('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadEngagements = async () => {
    const { data } = await getEngagementsByPerson(personId)
    if (data) setEngagements(data)
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

  const handleSaveNotes = async (eng: Engagement) => {
    setSavingId(eng.id)
    const { data, error } = await updateEngagement(eng.id, { notes: editingNotes.trim() || null })

    if (error) {
      console.error('Failed to save notes:', error)
      alert(`Failed to save: ${error.message || 'Check Supabase RLS policies for engagements UPDATE'}`)
    } else if (data) {
      setEngagements(current =>
        current.map(e =>
          e.id === eng.id ? { ...e, notes: editingNotes.trim() || null } : e
        )
      )
      onUpdate?.()
    } else {
      alert('Save failed: No data returned. Check Supabase RLS UPDATE policy for engagements.')
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
      setEditingNotes('')
    } else {
      setExpandedId(eng.id)
      setEditingNotes(eng.notes ?? '')
    }
  }

  if (engagements.length === 0) {
    return <p className="text-xs text-[var(--fg-3)] italic">No engagements scheduled yet.</p>
  }

  const pending = engagements.filter(e => e.status === 'Pending')
  const completed = engagements.filter(e => e.status === 'Completed')

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
              isExpanded={expandedId === eng.id}
              editingNotes={editingNotes}
              savingId={savingId}
              onToggleComplete={() => handleToggleComplete(eng)}
              onExpand={() => handleExpand(eng)}
              onNotesChange={setEditingNotes}
              onSaveNotes={() => handleSaveNotes(eng)}
              onDelete={() => handleDelete(eng.id)}
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
              isExpanded={expandedId === eng.id}
              editingNotes={editingNotes}
              savingId={savingId}
              onToggleComplete={() => handleToggleComplete(eng)}
              onExpand={() => handleExpand(eng)}
              onNotesChange={setEditingNotes}
              onSaveNotes={() => handleSaveNotes(eng)}
              onDelete={() => handleDelete(eng.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EngagementCard({
  eng,
  isExpanded,
  editingNotes,
  savingId,
  onToggleComplete,
  onExpand,
  onNotesChange,
  onSaveNotes,
  onDelete,
}: {
  eng: Engagement
  isExpanded: boolean
  editingNotes: string
  savingId: string | null
  onToggleComplete: () => void
  onExpand: () => void
  onNotesChange: (notes: string) => void
  onSaveNotes: () => void
  onDelete: () => void
}) {
  const isCompleted = eng.status === 'Completed'
  const isSaving = savingId === eng.id

  return (
    <div
      className="overflow-hidden rounded-xl border transition-all"
      style={{
        borderColor: isCompleted ? 'rgba(54,214,195,.3)' : 'var(--line-1)',
        background: isCompleted ? 'rgba(54,214,195,.05)' : 'var(--indigo-2)',
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
                style={{ textDecoration: isCompleted ? 'line-through' : 'none', opacity: isCompleted ? 0.7 : 1 }}
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
            </div>
          </button>
        </div>

        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            background: isCompleted ? 'rgba(54,214,195,.15)' : 'rgba(244,182,80,.15)',
            color: isCompleted ? 'var(--establish)' : 'var(--engage)',
          }}
        >
          {isCompleted ? 'Met' : 'Pending'}
        </span>
      </div>

      {isExpanded && (
        <div className="border-t border-[var(--line-1)] bg-[var(--indigo)] p-3">
          <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
            Points of Action
          </label>
          <textarea
            value={editingNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Action items and next steps from this meeting..."
            className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2.5 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            rows={3}
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onDelete}
              disabled={isSaving}
              className="text-[10px] text-[#F2728A] hover:underline disabled:opacity-60"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={onSaveNotes}
              disabled={isSaving}
              className="cn-btn cn-btn-primary !px-3 !py-1.5 !text-xs"
            >
              {isSaving ? 'Saving...' : 'Save Actions'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
