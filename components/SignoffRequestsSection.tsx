'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPendingLevelSignoffs, getAllPendingLevelSignoffs, approveLevelSignoff, sendMessage } from '../lib/supabaseQueries'
import type { LevelSignoff } from '../types/database'

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

// Coach view: disciples who finished a level and are asking for sign-off.
// Approving unlocks their next level and sends them a congrats message.
export default function SignoffRequestsSection({
  coachId,
  isAdmin = false,
  refreshKey,
  onChanged,
}: {
  coachId: string
  isAdmin?: boolean
  refreshKey?: number
  onChanged?: () => void
}) {
  const [requests, setRequests] = useState<PendingSignoff[]>([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = isAdmin ? await getAllPendingLevelSignoffs() : await getPendingLevelSignoffs(coachId)
    if (data) setRequests(data as PendingSignoff[])
    setLoading(false)
  }, [coachId, isAdmin])

  useEffect(() => { load() }, [load, refreshKey])

  const approve = async (req: PendingSignoff) => {
    setSavingId(req.id)
    const congrats = (drafts[req.id] ?? DEFAULT_CONGRATS[req.stage] ?? 'Well done — signed off!').trim()
    const { error } = await approveLevelSignoff(req.id, coachId, congrats)
    if (!error) {
      // Tell the disciple, so it lands in their messages too.
      await sendMessage(coachId, req.person_id, 'note', `${req.stage} sign-off ✦ — ${congrats}`)
      setRequests(prev => prev.filter(r => r.id !== req.id))
      onChanged?.()
    }
    setSavingId(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
      </div>
    )
  }

  if (requests.length === 0) return null

  return (
    <section className="cn-card mb-6 p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="cn-h3">Level sign-off requests</h2>
        <span className="cn-chip !py-0.5 !text-xs">{requests.length}</span>
      </div>
      <p className="mb-4 text-sm text-[var(--fg-2)]">
        These disciples finished a level and are waiting on you to sign off so the next one unlocks.
      </p>
      <div className="space-y-3">
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
    </section>
  )
}
