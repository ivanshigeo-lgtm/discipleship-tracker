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
} from '../lib/supabaseQueries'
import type { Engagement, ActionItem, PrayerRequest } from '../types/database'

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
  const [items, setItems] = useState<ActionItem[]>([])
  const [prayers, setPrayers] = useState<PrayerRequest[]>([])
  const [newAction, setNewAction] = useState('')
  const [newPrayer, setNewPrayer] = useState('')
  const [newPraise, setNewPraise] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const [a, p] = await Promise.all([
      getActionItemsByEngagement(engagement.id),
      getPrayerRequestsByEngagement(engagement.id),
    ])
    if (a.data) setItems(a.data as ActionItem[])
    if (p.data) setPrayers(p.data as PrayerRequest[])
    setLoading(false)
  }

  useEffect(() => { load() }, [engagement.id])

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
  const dateLabel = engagement.follow_up_date
    ? new Date(engagement.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null

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
              {[engagement.meeting_type, dateLabel, engagement.follow_up_time, engagement.location].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-xl text-[var(--fg-3)] hover:text-[var(--fg-1)]">×</button>
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
                {/* Trailing blank — only creates a new item once filled */}
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 shrink-0 rounded border border-dashed border-[var(--line-2)]" />
                  <input
                    type="text"
                    value={newAction}
                    onChange={e => setNewAction(e.target.value)}
                    onBlur={commitNewAction}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitNewAction() } }}
                    placeholder="Add an action point…"
                    className="flex-1 bg-transparent text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none"
                  />
                </div>
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
