'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPendingGroupRequests, setGroupMembershipStatus, deleteGroupMembership, sendMessage } from '../lib/supabaseQueries'

type Request = {
  id: string
  person_id: string
  victory_group_id: string
  created_at: string
  people?: { name: string } | null
  victory_groups?: { name: string } | null
}

// For group owners: people who asked to join their Grace Group. Approving lets
// them in (and only then can they see that group's prayers/SOAPs).
export default function GroupJoinRequests({
  ownerPersonId,
  refreshKey,
  onChanged,
}: {
  ownerPersonId: string
  refreshKey?: number
  onChanged?: () => void
}) {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await getPendingGroupRequests(ownerPersonId)
    if (data) setRequests(data as unknown as Request[])
    setLoading(false)
  }, [ownerPersonId])

  useEffect(() => { load() }, [load, refreshKey])

  const approve = async (req: Request) => {
    setBusyId(req.id)
    const { error } = await setGroupMembershipStatus(req.id, 'approved')
    if (!error) {
      await sendMessage(ownerPersonId, req.person_id, 'note', `You're in ${req.victory_groups?.name ?? 'the group'} — welcome!`)
      setRequests(prev => prev.filter(r => r.id !== req.id))
      onChanged?.()
    }
    setBusyId(null)
  }

  const decline = async (req: Request) => {
    setBusyId(req.id)
    const { error } = await deleteGroupMembership(req.id)
    if (!error) {
      setRequests(prev => prev.filter(r => r.id !== req.id))
      onChanged?.()
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
        <h2 className="cn-h3">Group join requests</h2>
        <span className="cn-chip !py-0.5 !text-xs">{requests.length}</span>
      </div>
      <p className="mb-4 text-sm text-[var(--fg-2)]">
        People asking to join your Grace Group. They can&rsquo;t see the group&rsquo;s prayers or SOAPs until you approve.
      </p>
      <div className="space-y-2">
        {requests.map(req => (
          <div key={req.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
            <div className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-[var(--fg-1)]">{req.people?.name ?? 'Someone'}</span>
              <span className="text-sm text-[var(--fg-3)]"> → {req.victory_groups?.name ?? 'your group'}</span>
            </div>
            <button
              type="button"
              onClick={() => decline(req)}
              disabled={busyId === req.id}
              className="rounded-full border border-[var(--line-2)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-2)] transition-colors hover:text-[var(--fg-1)] disabled:opacity-50"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => approve(req)}
              disabled={busyId === req.id}
              className="rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-50"
              style={{ background: 'var(--establish)', color: 'var(--void)' }}
            >
              {busyId === req.id ? 'Approving…' : 'Approve'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
