'use client'

import { useEffect, useRef, useState } from 'react'
import { getPendingLevelSignoffs } from '../../lib/supabaseQueries'
import { supabase } from '../../lib/supabaseClient'

type Pending = {
  id: string
  stage: string
  person?: { id: string; name: string } | null
}

/*
 * For coaches: a banner on My Journey when their disciples are waiting on a
 * sign-off, plus a browser notification (foreground) when a NEW request arrives
 * while the app is open. Background push (when the tab is closed) would need a
 * service worker + web-push subscription — not included here.
 */
export default function SignoffNotice({ coachId }: { coachId: string }) {
  const [items, setItems] = useState<Pending[]>([])
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const seen = useRef<Set<string>>(new Set())
  const baselined = useRef(false)

  const load = async () => {
    const { data } = await getPendingLevelSignoffs(coachId)
    const list = (data as Pending[]) ?? []
    setItems(list)

    const canNotify = typeof Notification !== 'undefined' && Notification.permission === 'granted'
    for (const it of list) {
      if (seen.current.has(it.id)) continue
      seen.current.add(it.id)
      // Don't fire for the requests that already existed on first load — only
      // for ones that arrive while the coach has the app open.
      if (baselined.current && canNotify) {
        const n = new Notification('New sign-off request ✦', {
          body: `${it.person?.name ?? 'A disciple'} completed ${it.stage} and is asking for your sign-off.`,
          tag: it.id,
        })
        n.onclick = () => { window.focus(); window.location.href = '/my-constellations' }
      }
    }
    baselined.current = true
  }

  useEffect(() => {
    if (!coachId) return
    setPerm(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
    load()
    // Re-check on any sign-off change (best-effort realtime) and on a poll.
    const channel = supabase
      .channel(`signoffs-notice-${coachId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'level_signoffs' }, () => load())
      .subscribe()
    const iv = setInterval(load, 60000)
    return () => { supabase.removeChannel(channel); clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachId])

  if (items.length === 0) return null

  const requestPerm = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setPerm(p)
  }

  const names = items.map(i => i.person?.name?.split(' ')[0] ?? 'A disciple')
  const who = names.length === 1 ? names[0] : `${names.length} disciples`

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3"
      style={{ borderColor: 'rgba(244,182,80,.4)', background: 'rgba(244,182,80,.08)' }}
    >
      <span className="text-lg" style={{ color: 'var(--gold, #F2C879)' }}>✦</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--fg-1)]">
          {who} {items.length === 1 ? 'is' : 'are'} waiting for your sign-off
        </p>
        <p className="truncate text-xs text-[var(--fg-3)]">
          {items.map(i => `${i.person?.name?.split(' ')[0] ?? 'Disciple'} · ${i.stage}`).join('  •  ')}
        </p>
      </div>
      {perm === 'default' && (
        <button
          type="button"
          onClick={requestPerm}
          className="shrink-0 rounded-full border border-[var(--line-2)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-2)] transition-colors hover:text-[var(--fg-1)]"
        >
          Turn on browser alerts
        </button>
      )}
      <a
        href="/my-constellations"
        className="shrink-0 rounded-full px-4 py-1.5 text-xs font-bold"
        style={{ background: 'var(--gold, #F2C879)', color: 'var(--void)' }}
      >
        Review →
      </a>
    </div>
  )
}
