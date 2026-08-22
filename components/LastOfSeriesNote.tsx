'use client'

import { useState } from 'react'
import { ackSeriesEndPrompt } from '../lib/supabaseQueries'
import { extendEngagementSeries } from '../lib/extendEngagementSeries'
import { recurrenceLabel } from '../lib/recurrence'
import type { LastOfSeriesInfo } from '../lib/engagementSeries'
import type { Engagement } from '../types/database'

export default function LastOfSeriesNote({
  engagement,
  info,
  personName,
  coachPersonId,
  onExtended,
  onDismissed,
}: {
  engagement: Engagement
  info: LastOfSeriesInfo
  personName: string
  coachPersonId: string | null
  onExtended: () => void
  onDismissed: () => void
}) {
  const [mode, setMode] = useState<'note' | 'extend'>('note')
  const [count, setCount] = useState(4)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const dismiss = async () => {
    setBusy(true)
    setErr('')
    if (coachPersonId) {
      const { error } = await ackSeriesEndPrompt(coachPersonId, engagement.id)
      if (error) {
        setErr(error.message)
        setBusy(false)
        return
      }
    }
    setBusy(false)
    onDismissed()
  }

  const extend = async () => {
    setBusy(true)
    setErr('')
    const { error } = await extendEngagementSeries({
      last: engagement,
      info,
      count,
      personName,
      coachPersonId,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onExtended()
  }

  return (
    <div
      className="rounded-lg border px-2.5 py-2"
      style={{ borderColor: 'rgba(244,182,80,.4)', background: 'rgba(244,182,80,.08)' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="text-[11px] font-semibold text-[var(--fg-1)]">
        Last meeting of this series
      </div>
      <p className="mt-0.5 text-[10px] text-[var(--fg-3)]">
        {recurrenceLabel(info.cadence, info.lastDate)} · {info.occurrenceCount} {info.occurrenceCount === 1 ? 'meeting' : 'meetings'} so far. Reminders stop after this one unless you add more.
      </p>

      {mode === 'note' ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode('extend')}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--engage)', color: 'var(--void)' }}
          >
            Add more meetings
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="cn-chip !text-[11px]"
          >
            {busy ? '…' : 'Not now'}
          </button>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--fg-2)]">
            Add
            <input
              type="number"
              min={1}
              max={60}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              className="w-14 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
            more
          </label>
          <button
            type="button"
            onClick={extend}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-[11px] font-semibold transition-all disabled:opacity-50"
            style={{ background: 'var(--engage)', color: 'var(--void)' }}
          >
            {busy ? 'Adding…' : `Add ${count}`}
          </button>
          <button type="button" onClick={() => setMode('note')} disabled={busy} className="cn-chip !text-[11px]">
            Back
          </button>
        </div>
      )}
      {err && <p className="mt-1.5 text-[10px] text-[#F2728A]">{err}</p>}
    </div>
  )
}
