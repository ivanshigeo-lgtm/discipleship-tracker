'use client'

import { useEffect, useState } from 'react'
import { getPendingLevelSignoffs, approveLevelSignoff, sendMessage } from '../lib/supabaseQueries'

type Pending = {
  id: string
  person_id: string
  stage: string
  person?: { name: string } | null
}

const DEFAULT_CONGRATS: Record<string, string> = {
  Establish: 'You’ve put down strong roots — on to Equip!',
  Equip: 'You’re equipped to serve — Empower is next!',
  Empower: 'You’re ready to lead and make disciples!',
  Engage: 'Full circle — a new star is lit through you. 🎉',
}

// Pending sign-off requests, shown right inside the message center so a coach
// can approve them in the same place as their messages.
export default function MessageSignoffInbox({ coachId, isOpen }: { coachId: string; isOpen: boolean }) {
  const [items, setItems] = useState<Pending[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    getPendingLevelSignoffs(coachId).then(({ data }) => {
      if (!cancelled) setItems((data as unknown as Pending[]) ?? [])
    })
    return () => { cancelled = true }
  }, [coachId, isOpen])

  const approve = async (req: Pending) => {
    setBusyId(req.id)
    const congrats = DEFAULT_CONGRATS[req.stage] ?? 'Well done — signed off!'
    const { error } = await approveLevelSignoff(req.id, coachId, congrats)
    if (!error) {
      await sendMessage(coachId, req.person_id, 'note', `${req.stage} sign-off ✦ — ${congrats}`)
      setItems(prev => prev.filter(r => r.id !== req.id))
    }
    setBusyId(null)
  }

  if (items.length === 0) return null

  return (
    <div className="border-b border-[var(--line-2)] p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--gold, #F2C879)' }}>
        ✦ Sign-off requests
      </p>
      <div className="space-y-1.5">
        {items.map(req => (
          <div key={req.id} className="rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-2">
            <p className="text-xs text-[var(--fg-1)]">
              <span className="font-semibold">{req.person?.name ?? 'A disciple'}</span>
              <span className="text-[var(--fg-3)]"> · completed {req.stage}</span>
            </p>
            <button
              type="button"
              onClick={() => approve(req)}
              disabled={busyId === req.id}
              className="mt-1.5 w-full rounded-md py-1 text-[11px] font-bold disabled:opacity-50"
              style={{ background: 'var(--establish)', color: 'var(--void)' }}
            >
              {busyId === req.id ? 'Signing off…' : 'Sign off & unlock next →'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
