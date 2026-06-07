'use client'

import { useEffect, useState } from 'react'
import { getPrayerRequestsByPerson, markPrayerAnswered, updatePrayerAnswerNotes, updatePrayerRequestText, deletePrayerRequest } from '../lib/supabaseQueries'
import type { PrayerRequest } from '../types/database'

export default function PrayerRequestsList({
  personId,
  refreshKey = 0,
  onUpdate,
}: {
  personId: string
  refreshKey?: number
  onUpdate?: () => void
}) {
  const [requests, setRequests] = useState<PrayerRequest[]>([])
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const [answerNotes, setAnswerNotes] = useState('')
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editingNotesText, setEditingNotesText] = useState('')
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null)
  const [editingRequestText, setEditingRequestText] = useState('')
  const [savingRequestId, setSavingRequestId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadRequests = async () => {
    try {
      const result = await Promise.race([
        getPrayerRequestsByPerson(personId),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])
      if (result.error) {
        setError(result.error.message)
        return
      }
      if (result.data) setRequests(result.data)
    } catch (err) {
      console.error('PrayerRequestsList load error:', err)
      setError('Failed to load prayer requests')
    }
  }

  useEffect(() => {
    loadRequests()
  }, [personId, refreshKey])

  const handleStartAnswering = (id: string) => {
    setAnsweringId(id)
    setAnswerNotes('')
  }

  const handleCancelAnswering = () => {
    setAnsweringId(null)
    setAnswerNotes('')
  }

  const handleConfirmAnswered = async (id: string) => {
    setError('')

    const { error } = await markPrayerAnswered(id, answerNotes.trim() || null)
    if (error) {
      setError(error.message)
    } else {
      await loadRequests()
      onUpdate?.()
    }

    setAnsweringId(null)
    setAnswerNotes('')
  }

  const handleStartEditingRequest = (request: PrayerRequest) => {
    setEditingRequestId(request.id)
    setEditingRequestText(request.request)
  }

  const handleSaveRequest = async (id: string) => {
    if (!editingRequestText.trim()) {
      setError('Prayer request cannot be empty.')
      return
    }

    setSavingRequestId(id)
    setError('')

    const { error } = await updatePrayerRequestText(id, editingRequestText.trim())
    if (error) {
      setError(error.message)
    } else {
      await loadRequests()
      onUpdate?.()
    }

    setSavingRequestId(null)
    setEditingRequestId(null)
    setEditingRequestText('')
  }

  const handleStartEditingNotes = (request: PrayerRequest) => {
    setEditingNotesId(request.id)
    setEditingNotesText(request.answer_notes || '')
  }

  const handleSaveNotes = async (id: string) => {
    setSavingNotesId(id)
    setError('')

    const { error } = await updatePrayerAnswerNotes(id, editingNotesText.trim() || null)
    if (error) {
      setError(error.message)
    } else {
      await loadRequests()
      onUpdate?.()
    }

    setSavingNotesId(null)
    setEditingNotesId(null)
    setEditingNotesText('')
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete this prayer request?')
    if (!confirmed) return

    setDeletingId(id)
    setError('')

    const { error } = await deletePrayerRequest(id)
    if (error) {
      setError(error.message)
    } else {
      setRequests(currentRequests => currentRequests.filter(request => request.id !== id))
      onUpdate?.()
    }

    setDeletingId(null)
  }

  const prayingRequests = requests.filter(request => request.status === 'Active')
  const answeredRequests = requests.filter(request => request.status === 'Answered')

  const inputClass = "w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] p-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-[rgba(240,114,159,.15)] p-2 text-xs text-[#F2728A]">{error}</p>
      )}

      {/* Current Prayer List */}
      <div className="rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Current Prayers</span>
          <span className="rounded-full bg-[rgba(91,141,247,.2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--equip)]">
            {prayingRequests.length}
          </span>
        </div>

        {prayingRequests.length === 0 ? (
          <p className="text-xs text-[var(--fg-3)] italic">No current prayers.</p>
        ) : (
          <div className="space-y-1.5">
            {prayingRequests.map(request => (
              <div key={request.id} className="rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-2.5">
                {editingRequestId === request.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingRequestText}
                      onChange={(e) => setEditingRequestText(e.target.value)}
                      placeholder="Prayer request..."
                      className={inputClass}
                      rows={2}
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleSaveRequest(request.id)}
                        disabled={savingRequestId === request.id}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-60"
                        style={{ background: 'rgba(91,141,247,.15)', color: 'var(--equip)' }}
                      >
                        {savingRequestId === request.id ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingRequestId(null)
                          setEditingRequestText('')
                        }}
                        className="text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : answeringId === request.id ? (
                  <div className="space-y-2">
                    <div className="text-xs text-[var(--fg-1)]">{request.request}</div>
                    <textarea
                      value={answerNotes}
                      onChange={(e) => setAnswerNotes(e.target.value)}
                      placeholder="How was this prayer answered? (optional)"
                      className={inputClass}
                      rows={2}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleConfirmAnswered(request.id)}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors"
                        style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
                      >
                        Confirm Answered
                      </button>
                      <button
                        onClick={handleCancelAnswering}
                        className="text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      onClick={() => handleStartEditingRequest(request)}
                      className="cursor-pointer text-xs text-[var(--fg-1)] hover:text-[var(--fg-2)]"
                      title="Click to edit"
                    >
                      {request.request}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={() => handleStartAnswering(request.id)}
                        disabled={deletingId === request.id}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-60"
                        style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
                      >
                        Answered
                      </button>
                      <button
                        onClick={() => handleStartEditingRequest(request)}
                        className="text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(request.id)}
                        disabled={deletingId === request.id}
                        className="text-[10px] text-[#F2728A] hover:underline disabled:opacity-60"
                      >
                        {deletingId === request.id ? '...' : '×'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Answered Prayer / Praise Reports */}
      <div className="rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Answered / Praise</span>
          <span className="rounded-full bg-[rgba(54,214,195,.2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--establish)]">
            {answeredRequests.length}
          </span>
        </div>

        {answeredRequests.length === 0 ? (
          <p className="text-xs text-[var(--fg-3)] italic">No answered prayers yet.</p>
        ) : (
          <div className="space-y-1.5">
            {answeredRequests.map(request => (
              <div
                key={request.id}
                className="rounded-lg border p-2.5"
                style={{ borderColor: 'rgba(54,214,195,.3)', background: 'rgba(54,214,195,.08)' }}
              >
                <div className="text-xs text-[var(--fg-1)]">{request.request}</div>

                {/* Answer notes display/edit */}
                {editingNotesId === request.id ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editingNotesText}
                      onChange={(e) => setEditingNotesText(e.target.value)}
                      placeholder="How was this prayer answered?"
                      className={inputClass}
                      rows={2}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleSaveNotes(request.id)}
                        disabled={savingNotesId === request.id}
                        className="rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-60"
                        style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
                      >
                        {savingNotesId === request.id ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingNotesId(null)
                          setEditingNotesText('')
                        }}
                        className="text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {request.answer_notes && (
                      <div className="mt-1.5 rounded-lg bg-[rgba(54,214,195,.1)] p-2 text-xs text-[var(--fg-2)] italic">
                        "{request.answer_notes}"
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--establish)]">
                          {request.answered_date ? new Date(request.answered_date + 'T00:00:00').toLocaleDateString() : 'Answered'}
                        </span>
                        <button
                          onClick={() => handleStartEditingNotes(request)}
                          className="text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                        >
                          {request.answer_notes ? 'Edit note' : '+ Add note'}
                        </button>
                      </div>
                      <button
                        onClick={() => handleDelete(request.id)}
                        disabled={deletingId === request.id}
                        className="text-[10px] text-[#F2728A] hover:underline disabled:opacity-60"
                      >
                        {deletingId === request.id ? '...' : '×'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
