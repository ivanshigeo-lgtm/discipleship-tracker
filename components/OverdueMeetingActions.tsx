'use client'

import { useState } from 'react'
import { updateEngagement } from '../lib/supabaseQueries'
import type { Engagement } from '../types/database'

export default function OverdueMeetingActions({
  engagement,
  personName,
  coachPersonId,
  onChanged,
}: {
  engagement: Engagement
  personName: string
  coachPersonId: string | null
  onChanged: () => void
}) {
  const [mode, setMode] = useState<null | 'reschedule'>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rsDate, setRsDate] = useState(engagement.follow_up_date ?? '')
  const [rsTime, setRsTime] = useState(engagement.follow_up_time?.slice(0, 5) ?? '')

  const syncCalendar = async (next: { follow_up_date: string | null; follow_up_time: string | null }) => {
    if (!coachPersonId || !next.follow_up_date) return
    try {
      await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: engagement.google_calendar_event_id ? 'update' : 'create',
          coachPersonId,
          engagementId: engagement.id,
          personName,
          engagement: {
            ...engagement,
            ...next,
            google_calendar_event_id: engagement.google_calendar_event_id,
          },
        }),
      })
    } catch { /* best-effort */ }
  }

  const complete = async () => {
    setBusy(true); setErr('')
    const { error } = await updateEngagement(engagement.id, {
      status: 'Completed',
      completed_at: new Date().toISOString(),
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onChanged()
  }

  const cancel = async () => {
    setBusy(true); setErr('')
    const { error } = await updateEngagement(engagement.id, {
      status: 'Cancelled',
      cancelled_at: new Date().toISOString(),
    })
    if (error) { setBusy(false); setErr(error.message); return }
    if (coachPersonId && engagement.google_calendar_event_id) {
      try {
        await fetch('/api/calendar/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete',
            coachPersonId,
            engagementId: engagement.id,
            engagement: { google_calendar_event_id: engagement.google_calendar_event_id },
          }),
        })
      } catch { /* best-effort */ }
    }
    setBusy(false)
    onChanged()
  }

  const saveReschedule = async () => {
    if (!rsDate) return
    setBusy(true); setErr('')
    const next = { follow_up_date: rsDate, follow_up_time: rsTime || null }
    const { error } = await updateEngagement(engagement.id, next)
    if (error) { setBusy(false); setErr(error.message); return }
    await syncCalendar(next)
    setBusy(false)
    setMode(null)
    onChanged()
  }

  return (
    <div className="mt-2" onClick={e => e.stopPropagation()}>
      {mode === null ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={complete}
            disabled={busy}
            className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all disabled:opacity-50"
            style={{ borderColor: 'var(--establish)', color: 'var(--establish)', background: 'rgba(54,214,195,.1)' }}
          >
            {busy ? '…' : '✓ Completed'}
          </button>
          <button
            type="button"
            onClick={() => { setRsDate(engagement.follow_up_date ?? ''); setRsTime(engagement.follow_up_time?.slice(0, 5) ?? ''); setMode('reschedule') }}
            disabled={busy}
            className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-2 py-1 text-[11px] font-semibold text-[var(--fg-1)] transition-all hover:border-[var(--gbm-cobalt-bright)] disabled:opacity-50"
          >
            Reschedule
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all disabled:opacity-50"
            style={{ borderColor: 'rgba(240,114,159,.4)', color: '#F0729F', background: 'rgba(240,114,159,.1)' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-2">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
            New date & time
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="date" value={rsDate} onChange={e => setRsDate(e.target.value)} className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none" />
            <input type="time" value={rsTime} onChange={e => setRsTime(e.target.value)} className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none" />
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" onClick={saveReschedule} disabled={busy || !rsDate} className="cn-btn cn-btn-primary !px-2.5 !py-1 !text-xs disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setMode(null)} disabled={busy} className="cn-chip !text-xs">Back</button>
          </div>
        </div>
      )}
      {err && <p className="mt-1.5 text-[10px] text-[#F2728A]">{err}</p>}
    </div>
  )
}
