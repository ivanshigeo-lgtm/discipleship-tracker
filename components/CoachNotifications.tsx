'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getCoachNotifications,
  getPendingLevelSignoffs,
  markCoachNotificationRead,
} from '../lib/supabaseQueries'
import type { CoachNotification } from '../types/database'

export default function CoachNotifications({
  personId,
  refreshKey = 0,
  mode = 'list',
  onOpenSoap,
  onOpenMessages,
  onOpenSignoff,
}: {
  personId: string
  refreshKey?: number
  mode?: 'list' | 'bell'
  onOpenSoap: (soapId: string) => void
  onOpenMessages: () => void
  onOpenSignoff: () => void
}) {
  const [items, setItems] = useState<CoachNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [listRes, pendingRes] = await Promise.all([
      getCoachNotifications(personId),
      getPendingLevelSignoffs(personId),
    ])
    const pendingIds = new Set(((pendingRes.data as { id: string }[] | null) ?? []).map(r => r.id))
    const rows = listRes.data ?? []
    for (const n of rows) {
      if (n.kind === 'signoff_requested' && !n.read_at && !pendingIds.has(n.target_id)) {
        void markCoachNotificationRead(n.id)
        n.read_at = new Date().toISOString()
      }
    }
    setItems(rows)
    setUnread(rows.filter(n => !n.read_at).length)
    setLoading(false)
  }, [personId])

  useEffect(() => { load() }, [load, refreshKey])

  const openItem = async (n: CoachNotification) => {
    if (n.kind === 'soap_shared') {
      if (!n.read_at) await markCoachNotificationRead(n.id)
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: x.read_at ?? new Date().toISOString() } : x))
      setUnread(c => Math.max(0, c - (n.read_at ? 0 : 1)))
      onOpenSoap(n.target_id)
    } else if (n.kind === 'signoff_requested') {
      onOpenSignoff()
    } else {
      if (!n.read_at) await markCoachNotificationRead(n.id)
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: x.read_at ?? new Date().toISOString() } : x))
      setUnread(c => Math.max(0, c - (n.read_at ? 0 : 1)))
      onOpenMessages()
    }
    setOpen(false)
  }

  const label = (n: CoachNotification) => {
    const who = n.actor?.name ?? 'A disciple'
    if (n.kind === 'soap_shared') return `${who} shared a SOAP`
    if (n.kind === 'signoff_requested') return `${who} asked for a sign-off`
    return `${who} sent you a message`
  }

  const list = (
    <div className="space-y-1.5">
      {loading ? (
        <p className="px-1 py-2 text-xs text-[var(--fg-3)]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-1 py-2 text-xs text-[var(--fg-3)]">No notifications yet.</p>
      ) : (
        items.slice(0, mode === 'bell' ? 12 : 20).map(n => (
          <button
            key={n.id}
            type="button"
            onClick={() => openItem(n)}
            className="flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-all hover:border-[var(--gbm-cobalt-bright)]"
            style={{
              borderColor: n.read_at ? 'var(--line-1)' : 'rgba(91,141,247,.45)',
              background: n.read_at ? 'var(--indigo-2)' : 'rgba(91,141,247,.10)',
            }}
          >
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: n.read_at ? 'var(--line-2)' : 'var(--gbm-cobalt-bright)' }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-[var(--fg-1)]">{label(n)}</span>
              {n.preview && <span className="mt-0.5 block truncate text-[10px] text-[var(--fg-3)]">{n.preview}</span>}
              <span className="mt-0.5 block text-[10px] text-[var(--fg-3)]">
                {n.kind === 'soap_shared' ? 'Open to like or comment' : n.kind === 'signoff_requested' ? 'Open to sign off' : 'Open conversation'}
                {' · '}
                {new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  )

  if (mode === 'bell') {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title={unread > 0 ? `${unread} unread` : 'Notifications'}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line-2)] text-[var(--fg-2)] hover:text-[var(--fg-1)]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unread > 0 && (
            <span
              className="absolute -right-1 -top-1 min-w-[16px] rounded-full px-1 text-[9px] font-bold leading-4 text-white"
              style={{ background: '#F2728A' }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-[var(--line-1)] bg-[var(--indigo)] p-2 shadow-2xl">
              <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                Notifications
              </div>
              {list}
            </div>
          </>
        )}
      </div>
    )
  }

  if (items.length === 0 && !loading) return null

  return (
    <section className="cn-card mb-5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="cn-h3">Notifications</h2>
        {unread > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(242,114,138,.15)', color: '#F2728A' }}>
            {unread} unread
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-[var(--fg-2)]">
        SOAPs and messages from people you coach, and sign-off requests.
      </p>
      {list}
    </section>
  )
}
