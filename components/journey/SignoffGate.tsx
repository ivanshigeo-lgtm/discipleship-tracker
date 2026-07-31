'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPendingLevelSignoffs, getAllPendingLevelSignoffs, approveLevelSignoff, sendMessage } from '../../lib/supabaseQueries'
import type { LevelSignoff } from '../../types/database'

type PendingSignoff = LevelSignoff & { person?: { id: string; name: string; current_stage: string } | null }

const STAGE_COLOR: Record<string, string> = {
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
  Engage: '#F4B650',
}

const DEFAULT_CONGRATS: Record<string, string> = {
  Establish: 'You’ve put down strong roots — so proud of you. On to Equip!',
  Equip: 'You’re equipped to serve and build others up. Keep going — Empower is next!',
  Empower: 'You’re ready to lead and raise up others. Now go and make disciples!',
  Engage: 'You’ve completed the journey and are making disciples of your own. A new star is lit through you. 🎉',
}

// Full-screen HOME gate: the single loud, unmissable spot for pending sign-offs.
// It blocks the home screen and can only be left two intentional ways —
// approving each request, or pressing "Not now" (which drops the request to the
// quiet fallback, the Message Center inbox, until the next visit). There is NO
// backdrop-click / Esc dismiss on purpose. Mirrors native signoff-gate.tsx.
export default function SignoffGate({
  coachId,
  isAdmin = false,
  onDismiss,
  onChanged,
}: {
  coachId: string
  isAdmin?: boolean
  onDismiss: () => void
  onChanged?: () => void
}) {
  const [requests, setRequests] = useState<PendingSignoff[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = isAdmin ? await getAllPendingLevelSignoffs() : await getPendingLevelSignoffs(coachId)
    setRequests((data as PendingSignoff[]) ?? [])
    setLoading(false)
  }, [coachId, isAdmin])

  useEffect(() => { load() }, [load])

  // Nothing pending (or the last one was just approved) → the gate has no reason
  // to block; step aside automatically.
  useEffect(() => {
    if (!loading && requests.length === 0) onDismiss()
  }, [loading, requests.length, onDismiss])

  const approve = async (req: PendingSignoff) => {
    setSavingId(req.id)
    const congrats = (drafts[req.id] ?? DEFAULT_CONGRATS[req.stage] ?? 'Well done — signed off!').trim()
    const { error } = await approveLevelSignoff(req.id, coachId, congrats)
    if (!error) {
      await sendMessage(coachId, req.person_id, 'note', `${req.stage} sign-off ✦ — ${congrats}`)
      setRequests(prev => prev.filter(r => r.id !== req.id))
      onChanged?.()
    }
    setSavingId(null)
  }

  // Don't paint the full-screen scrim until we know there's something to show —
  // avoids a blocking flash on every home load for coaches with nothing pending.
  if (loading || requests.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[rgba(6,8,20,.92)] p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Level sign-off requests waiting on you"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)]"
        style={{ boxShadow: 'var(--elev-2)' }}
      >
        <div className="border-b border-[var(--line-1)] px-6 pb-4 pt-6 text-center">
          <div className="text-2xl">✦</div>
          <h2 className="cn-h2 mt-1">
            {requests.length === 1 ? 'A disciple is waiting on you' : `${requests.length} disciples are waiting on you`}
          </h2>
          <p className="mt-1 text-sm text-[var(--fg-2)]">
            They finished a level and need your sign-off before the next one unlocks.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {requests.map(req => {
            const color = STAGE_COLOR[req.stage] ?? 'var(--fg-1)'
            const isEngage = req.stage === 'Engage'
            return (
              <div key={req.id} className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--fg-1)]">{req.person?.name ?? 'A disciple'}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}22`, color }}>
                    {isEngage ? 'Completed Engage — final sign-off' : `Completed ${req.stage}`}
                  </span>
                </div>
                <textarea
                  value={drafts[req.id] ?? DEFAULT_CONGRATS[req.stage] ?? ''}
                  onChange={e => setDrafts(d => ({ ...d, [req.id]: e.target.value }))}
                  rows={2}
                  placeholder="Write a congrats message…"
                  className="mt-2 w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => approve(req)}
                    disabled={savingId === req.id}
                    className="rounded-lg px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                    style={{ background: color, color: 'var(--void)' }}
                  >
                    {savingId === req.id ? 'Signing off…' : isEngage ? 'Sign off & congratulate 🎉' : 'Sign off & unlock next →'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-[var(--line-1)] px-6 py-4 text-center">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-[var(--fg-3)] underline-offset-2 hover:text-[var(--fg-2)] hover:underline"
          >
            Not now — remind me later
          </button>
          <p className="mt-1 text-[11px] text-[var(--fg-3)]">You’ll still find these in your messages.</p>
        </div>
      </div>
    </div>
  )
}
