'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getPendingConnectionRequests } from '../lib/supabaseQueries'

type Request = {
  id: string
  disciple_name: string
  disciple_person_id: string | null
  created_at: string
}

// For coaches: disciples who signed up through the open web signup and entered
// this coach's code. The connection stays PENDING until the coach accepts it
// here, which flips it live and notifies the disciple.
export default function NewDiscipleRequests({
  coachPersonId,
  refreshKey,
  onChanged,
}: {
  coachPersonId: string
  refreshKey?: number
  onChanged?: () => void
}) {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await getPendingConnectionRequests(coachPersonId)
    if (data) setRequests(data as Request[])
    setLoading(false)
  }, [coachPersonId])

  useEffect(() => { load() }, [load, refreshKey])

  const accept = async (req: Request) => {
    setBusyId(req.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      const res = await fetch('/api/accept-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, connectionId: req.id }),
      })
      if (res.ok) {
        setRequests(prev => prev.filter(r => r.id !== req.id))
        onChanged?.()
      }
    } catch {
      /* leave the row so the coach can retry */
    }
    setBusyId(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--establish)] border-t-transparent" />
      </div>
    )
  }
  if (requests.length === 0) return null

  return (
    <section className="cn-card mb-6 p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="cn-h3">New disciple requests</h2>
        <span className="cn-chip !py-0.5 !text-xs">{requests.length}</span>
      </div>
      <p className="mb-4 text-sm text-[var(--fg-2)]">
        People who signed up and entered your coach code. Accept to connect their star to your constellation.
      </p>
      <div className="space-y-2">
        {requests.map(req => (
          <div key={req.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-[var(--fg-1)]">{req.disciple_name}</span>
              <span className="text-sm text-[var(--fg-3)]"> requested you as their coach</span>
            </div>
            <button
              type="button"
              onClick={() => accept(req)}
              disabled={busyId === req.id}
              className="rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-50"
              style={{ background: 'var(--establish)', color: 'var(--void)' }}
            >
              {busyId === req.id ? 'Accepting…' : 'Accept'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
