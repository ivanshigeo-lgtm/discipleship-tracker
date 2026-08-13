'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPendingMeetingInvites, setMeetingInviteStatus, getPeople } from '../lib/supabaseQueries'
import type { Engagement, Person } from '../types/database'
import { fmtTime12 } from '../lib/formatTime'

// Meetings someone has been invited to. They confirm (it then shows on their
// engagement page) or decline. The creator owns the meeting either way.
export default function MeetingInvites({
  personId,
  refreshKey,
  onChanged,
}: {
  personId: string
  refreshKey?: number
  onChanged?: () => void
}) {
  const [invites, setInvites] = useState<Engagement[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [invRes, peopleRes] = await Promise.all([getPendingMeetingInvites(personId), getPeople()])
    setInvites((invRes.data as Engagement[]) ?? [])
    const map: Record<string, string> = {}
    for (const p of ((peopleRes.data as Person[]) ?? [])) map[p.id] = p.name
    setNames(map)
    setLoading(false)
  }, [personId])

  useEffect(() => { load() }, [load, refreshKey])

  const respond = async (eng: Engagement, status: 'confirmed' | 'declined') => {
    setBusyId(eng.id)
    const { error } = await setMeetingInviteStatus(eng.id, personId, status)
    if (!error) {
      setInvites(prev => prev.filter(e => e.id !== eng.id))
      onChanged?.()
    }
    setBusyId(null)
  }

  if (loading || invites.length === 0) return null

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'

  return (
    <section className="cn-card mb-6 p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="cn-h3">Meeting invitations</h2>
        <span className="cn-chip !py-0.5 !text-xs">{invites.length}</span>
      </div>
      <p className="mb-4 text-sm text-[var(--fg-2)]">
        Confirm to add a meeting to your engagements, or decline.
      </p>
      <div className="space-y-2">
        {invites.map(eng => (
          <div key={eng.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--fg-1)]">{eng.description || eng.meeting_type || 'Meeting'}</p>
              <p className="text-xs text-[var(--fg-3)]">
                {fmtDate(eng.follow_up_date)}{eng.follow_up_time ? ` · ${fmtTime12(eng.follow_up_time)}` : ''}
                {eng.created_by_person_id ? ` · from ${names[eng.created_by_person_id] ?? 'a coach'}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => respond(eng, 'declined')}
              disabled={busyId === eng.id}
              className="rounded-full border border-[var(--line-2)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-2)] transition-colors hover:text-[var(--fg-1)] disabled:opacity-50"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => respond(eng, 'confirmed')}
              disabled={busyId === eng.id}
              className="rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-50"
              style={{ background: 'var(--establish)', color: 'var(--void)' }}
            >
              {busyId === eng.id ? '…' : 'Confirm'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
