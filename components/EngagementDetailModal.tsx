'use client'

import { useEffect, useState } from 'react'
import {
  getActionItemsByEngagement,
  addActionItem,
  updateActionItem,
  deleteActionItem,
  getPrayerRequestsByEngagement,
  addPrayerRequest,
  addPraise,
  updateEngagement,
  getEngagementsByPerson,
  getSeriesEndAcks,
} from '../lib/supabaseQueries'
import { useAuth } from '../contexts/AuthContext'
import type { Engagement, ActionItem, PrayerRequest } from '../types/database'
import { fmtTime12 } from '../lib/formatTime'
import { lastOfSeriesFor, type LastOfSeriesInfo } from '../lib/engagementSeries'
import LastOfSeriesNote from './LastOfSeriesNote'

export default function EngagementDetailModal({
  engagement,
  personName,
  onClose,
  onChanged,
}: {
  engagement: Engagement
  personName: string
  onClose: () => void
  onChanged?: () => void
}) {
  const { profile } = useAuth()
  const [items, setItems] = useState<ActionItem[]>([])
  const [prayers, setPrayers] = useState<PrayerRequest[]>([])
  const [newAction, setNewAction] = useState('')
  const [newPrayer, setNewPrayer] = useState('')
  const [newPraise, setNewPraise] = useState('')
  const [loading, setLoading] = useState(true)

  // Reschedule
  const [rescheduling, setRescheduling] = useState(false)
  const [dateVal, setDateVal] = useState(engagement.follow_up_date ?? '')
  const [timeVal, setTimeVal] = useState(engagement.follow_up_time ?? '')
  const [savingReschedule, setSavingReschedule] = useState(false)

  // Cancel / reopen. A cancelled meeting stays visible but drops out of the
  // overdue / needs-attention / "met this week" tallies (mirrors native).
  const [status, setStatus] = useState<Engagement['status']>(engagement.status)
  const [togglingCancel, setTogglingCancel] = useState(false)
  const cancelled = status === 'Cancelled'
  const [seriesInfo, setSeriesInfo] = useState<LastOfSeriesInfo | null>(null)
  const [seriesAcked, setSeriesAcked] = useState(false)

  const toggleCancel = async () => {
    const next: Engagement['status'] = cancelled ? 'Pending' : 'Cancelled'
    setTogglingCancel(true)
    const { error } = await updateEngagement(engagement.id, {
      status: next,
      cancelled_at: next === 'Cancelled' ? new Date().toISOString() : null,
    })
    if (error) {
      alert(`Couldn't ${cancelled ? 'reopen' : 'cancel'} meeting: ${error.message || 'Unknown error'}`)
    } else {
      setStatus(next)
      onChanged?.()
    }
    setTogglingCancel(false)
  }

  const handleReschedule = async () => {
    setSavingReschedule(true)
    const newDate = dateVal || null
    const newTime = timeVal || null
    await updateEngagement(engagement.id, { follow_up_date: newDate, follow_up_time: newTime })

    // If the date moved and this looks like a repeating meeting, offer to shift
    // every FUTURE sibling too (same person + meeting_type, still Pending, dated
    // on/after the original). Engagements carry no series id, so siblings are a
    // heuristic — same as the native app.
    const origDate = engagement.follow_up_date
    const dayDelta = origDate && newDate
      ? Math.round((new Date(newDate + 'T00:00:00').getTime() - new Date(origDate + 'T00:00:00').getTime()) / 86_400_000)
      : 0
    if (dayDelta !== 0 && engagement.meeting_type) {
      const { data } = await getEngagementsByPerson(engagement.person_id)
      const siblings = (data as Engagement[] | null ?? []).filter(e =>
        e.id !== engagement.id &&
        e.status === 'Pending' &&
        e.follow_up_date && origDate && e.follow_up_date >= origDate &&
        (engagement.series_id
          ? e.series_id === engagement.series_id
          : e.meeting_type === engagement.meeting_type)
      )
      if (siblings.length > 0 && window.confirm(
        `Shift the other ${siblings.length} repeated “${engagement.meeting_type}” meeting${siblings.length === 1 ? '' : 's'} by ${dayDelta > 0 ? '+' : ''}${dayDelta} day${Math.abs(dayDelta) === 1 ? '' : 's'} too?\n\nOK = all future meetings · Cancel = just this one`
      )) {
        await Promise.all(siblings.map(e => {
          const shifted = new Date(e.follow_up_date + 'T00:00:00')
          shifted.setDate(shifted.getDate() + dayDelta)
          const shiftedStr = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-${String(shifted.getDate()).padStart(2, '0')}`
          return updateEngagement(e.id, { follow_up_date: shiftedStr, follow_up_time: newTime ?? e.follow_up_time })
        }))
      }
    }

    // Keep the linked Google Calendar event in sync, if any.
    if (engagement.google_calendar_event_id && profile?.id) {
      try {
        await fetch('/api/calendar/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            coachPersonId: profile.id,
            engagementId: engagement.id,
            personName,
            engagement: { ...engagement, follow_up_date: newDate, follow_up_time: newTime },
          }),
        })
      } catch { /* best-effort calendar sync */ }
    }
    setSavingReschedule(false)
    setRescheduling(false)
    onChanged?.()
  }

  const load = async () => {
    const [a, p, sibs] = await Promise.all([
      getActionItemsByEngagement(engagement.id),
      getPrayerRequestsByEngagement(engagement.id),
      getEngagementsByPerson(engagement.person_id),
    ])
    if (a.data) setItems(a.data as ActionItem[])
    if (p.data) setPrayers(p.data as PrayerRequest[])
    const ownerId = engagement.created_by_person_id
    if (ownerId && ownerId === profile?.id) {
      setSeriesInfo(lastOfSeriesFor(engagement, (sibs.data as Engagement[] | null) ?? [], ownerId))
      const { data: acks } = await getSeriesEndAcks(ownerId)
      setSeriesAcked((acks ?? []).includes(engagement.id))
    } else {
      setSeriesInfo(null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [engagement.id, profile?.id])

  // ── Action points ──────────────────────────────────────────────────────────
  const commitNewAction = async () => {
    const text = newAction.trim()
    if (!text) return
    setNewAction('')
    const { data } = await addActionItem(engagement.id, text, items.length)
    if (data) setItems(prev => [...prev, data as ActionItem])
    onChanged?.()
  }

  const toggleItem = async (item: ActionItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i))
    await updateActionItem(item.id, { completed: !item.completed })
    onChanged?.()
  }

  const editItemText = async (item: ActionItem, text: string) => {
    const trimmed = text.trim()
    if (trimmed === item.text) return
    if (!trimmed) {
      setItems(prev => prev.filter(i => i.id !== item.id))
      await deleteActionItem(item.id)
    } else {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, text: trimmed } : i))
      await updateActionItem(item.id, { text: trimmed })
    }
    onChanged?.()
  }

  // ── Prayer / praise points ──────────────────────────────────────────────────
  const addPrayer = async () => {
    const text = newPrayer.trim()
    if (!text) return
    setNewPrayer('')
    const { data } = await addPrayerRequest({
      person_id: engagement.person_id,
      request: text,
      status: 'Active',
      answered_date: null,
      answer_notes: null,
      engagement_id: engagement.id,
    })
    if (data) setPrayers(prev => [...prev, data as PrayerRequest])
    onChanged?.()
  }

  const addPraisePoint = async () => {
    const text = newPraise.trim()
    if (!text) return
    setNewPraise('')
    const { data } = await addPraise(engagement.person_id, text, engagement.id)
    if (data) setPrayers(prev => [...prev, data as PrayerRequest])
    onChanged?.()
  }

  const prayerPoints = prayers.filter(p => !p.is_praise)
  const praisePoints = prayers.filter(p => p.is_praise)

  const inputClass = 'w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none'
  const dateLabel = dateVal
    ? new Date(dateVal + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : 'No date set'

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-lg rounded-2xl border border-[var(--line-1)] bg-[var(--indigo)] p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--establish)]">Engagement · {personName}</p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-[var(--fg-1)]">
              {engagement.description || engagement.meeting_type || 'Meeting'}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--fg-3)]">
              {[engagement.meeting_type, dateLabel, fmtTime12(timeVal), engagement.location].filter(Boolean).join(' · ')}
            </p>
            {cancelled && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(240,114,159,.15)', color: '#F0729F' }}>
                Cancelled
              </span>
            )}
            {seriesInfo && !seriesAcked && status === 'Pending' && (
              <div className="mt-2">
                <LastOfSeriesNote
                  engagement={engagement}
                  info={seriesInfo}
                  personName={personName}
                  coachPersonId={profile?.id ?? null}
                  onExtended={() => { setSeriesInfo(null); onChanged?.() }}
                  onDismissed={() => setSeriesAcked(true)}
                />
              </div>
            )}
            {!rescheduling ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRescheduling(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fg-2)] transition-colors hover:border-[var(--gbm-cobalt-bright)] hover:text-[var(--fg-1)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={toggleCancel}
                  disabled={togglingCancel}
                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                  style={cancelled
                    ? { borderColor: 'var(--line-2)', color: 'var(--fg-2)', background: 'var(--indigo-2)' }
                    : { borderColor: 'rgba(240,114,159,.4)', color: '#F0729F', background: 'rgba(240,114,159,.1)' }}
                >
                  {togglingCancel ? '…' : cancelled ? 'Reopen meeting' : 'Cancel meeting'}
                </button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={dateVal}
                  onChange={e => setDateVal(e.target.value)}
                  className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                />
                <input
                  type="time"
                  value={timeVal}
                  onChange={e => setTimeVal(e.target.value)}
                  className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                />
                <button type="button" onClick={handleReschedule} disabled={savingReschedule} className="cn-btn cn-btn-primary !px-2.5 !py-1 !text-xs disabled:opacity-50">
                  {savingReschedule ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRescheduling(false); setDateVal(engagement.follow_up_date ?? ''); setTimeVal(engagement.follow_up_time ?? '') }}
                  className="cn-chip !text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="cn-chip shrink-0">Close</button>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-[var(--fg-3)]">Loading…</p>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Action points */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--equip)]">Action points</h3>
              <div className="space-y-1.5">
                {items.map(item => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleItem(item)}
                      className="h-4 w-4 shrink-0 rounded border-[var(--line-2)] bg-[var(--indigo-2)] accent-[var(--equip)]"
                    />
                    <input
                      type="text"
                      defaultValue={item.text}
                      onBlur={e => editItemText(item, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className={`flex-1 bg-transparent text-sm focus:outline-none ${item.completed ? 'text-[var(--fg-3)] line-through' : 'text-[var(--fg-1)]'}`}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="text"
                  value={newAction}
                  onChange={e => setNewAction(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitNewAction() } }}
                  placeholder="Add an action point…"
                  className={inputClass}
                />
                <button type="button" onClick={commitNewAction} disabled={!newAction.trim()} className="cn-btn cn-btn-primary shrink-0 !px-3 !text-xs disabled:opacity-50">Add</button>
              </div>
            </section>

            {/* Prayer points */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#9B80FF' }}>Prayer points</h3>
              <div className="space-y-1">
                {prayerPoints.map(p => (
                  <p key={p.id} className="rounded-lg bg-[var(--indigo-2)] px-3 py-1.5 text-sm text-[var(--fg-1)]">{p.request}</p>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="text"
                  value={newPrayer}
                  onChange={e => setNewPrayer(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPrayer() } }}
                  placeholder="What are you praying for?"
                  className={inputClass}
                />
                <button type="button" onClick={addPrayer} disabled={!newPrayer.trim()} className="cn-btn cn-btn-primary shrink-0 !px-3 !text-xs disabled:opacity-50">Add</button>
              </div>
            </section>

            {/* Praise points */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--establish)' }}>Praise points</h3>
              <div className="space-y-1">
                {praisePoints.map(p => (
                  <p key={p.id} className="rounded-lg bg-[var(--indigo-2)] px-3 py-1.5 text-sm text-[var(--fg-1)]">{p.request}</p>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="text"
                  value={newPraise}
                  onChange={e => setNewPraise(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPraisePoint() } }}
                  placeholder="What are you praising God for?"
                  className={inputClass}
                />
                <button type="button" onClick={addPraisePoint} disabled={!newPraise.trim()} className="cn-btn cn-btn-primary shrink-0 !px-3 !text-xs disabled:opacity-50">Add</button>
              </div>
            </section>

            <p className="text-[10px] text-[var(--fg-3)]">Prayer &amp; praise points also appear on the Prayer Wall.</p>
          </div>
        )}
      </div>
    </div>
  )
}
