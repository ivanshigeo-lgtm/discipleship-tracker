'use client'

import { useEffect, useState } from 'react'
import { getCoachSharedPrayers, getGroupSharedPrayers, getConstellationSharedPrayers } from '../lib/supabaseQueries'
import ReplyModal from './ReplyModal'

type SharedPrayer = {
  id: string
  person_id: string
  request: string
  is_praise: boolean
  status: string
  answer_notes: string | null
  media_url: string | null
  created_at: string
  people?: { name: string } | null
}

export default function SharedPrayerFeed({
  personId,
  scope,
  refreshKey,
  title,
  subtitle,
  seenKey,
  showEmpty = false,
}: {
  personId: string
  scope: 'coach' | 'group' | 'constellation'
  refreshKey?: number
  title?: string
  subtitle?: string
  seenKey?: string
  showEmpty?: boolean
}) {
  const [items, setItems] = useState<SharedPrayer[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [unread, setUnread] = useState(0)
  const [reply, setReply] = useState<SharedPrayer | null>(null)

  useEffect(() => {
    let cancelled = false
    const p =
      scope === 'coach' ? getCoachSharedPrayers(personId)
      : scope === 'group' ? getGroupSharedPrayers(personId)
      : getConstellationSharedPrayers()
    Promise.resolve(p).then(({ data }) => {
      if (cancelled) return
      const list = (data as unknown as SharedPrayer[]) ?? []
      setItems(list)
      setLoading(false)
      if (seenKey) {
        const lastSeen = localStorage.getItem(seenKey) ?? '0'
        setUnread(list.filter(i => (i.created_at ?? '') > lastSeen).length)
      }
    })
    return () => { cancelled = true }
  }, [personId, scope, refreshKey, seenKey])

  const T = title ?? (scope === 'coach' ? 'Prayers shared with you' : scope === 'group' ? 'Your Grace Group’s prayers' : 'Prayers shared with everyone')
  const S = subtitle ?? (
    scope === 'coach' ? 'Requests and praises your disciples sent you'
    : scope === 'group' ? 'Requests and praises shared with your group'
    : 'Requests and praises shared with everyone'
  )

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#9B80FF] border-t-transparent" />
      </div>
    )
  }
  if (items.length === 0 && !showEmpty) return null

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center gap-3">
        <h2 className="cn-h3">{T}</h2>
        <span className="cn-chip !py-0.5 !text-xs">{items.length}</span>
        {unread > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#9B80FF', color: '#fff' }}>{unread} new</span>
        )}
        {items.length > 0 && (
          <button type="button" onClick={() => setCollapsed(c => !c)} className="ml-auto cn-chip">{collapsed ? 'Expand' : 'Collapse'}</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--fg-3)]">Nothing shared here yet.</p>
      ) : collapsed ? null : (
        <>
          <p className="mb-4 mt-1 text-sm text-[var(--fg-2)]">{S}</p>
          <div className="space-y-2">
            {items.map(p => (
              <div key={p.id} className="rounded-xl border border-[var(--line-1)] p-3" style={{ background: p.is_praise ? 'rgba(242,200,121,.08)' : 'var(--indigo-2)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--fg-1)]">{p.people?.name ?? 'A disciple'}</span>
                  <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider" style={{ color: p.is_praise ? 'var(--gold)' : '#9B80FF' }}>
                    {p.is_praise ? '✦ Praise' : '✦ Prayer'}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg-2)]">{p.request}</p>
                {p.media_url && (
                  <video src={p.media_url} controls playsInline className="mt-2 w-full rounded-lg" style={{ maxHeight: 280, background: '#000' }} />
                )}
                {p.answer_notes && <p className="mt-1 text-xs text-[var(--establish)]">— {p.answer_notes}</p>}
                {p.person_id !== personId && (
                  <div className="mt-2 flex justify-end">
                    <button type="button" onClick={() => setReply(p)} className="text-[11px] font-semibold text-[var(--gbm-cobalt-soft)] hover:text-[var(--fg-1)]">↩ Reply</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {reply && (
        <ReplyModal
          fromId={personId}
          toId={reply.person_id}
          toName={reply.people?.name ?? 'them'}
          contextLabel={reply.is_praise ? 'Praise' : 'Prayer request'}
          contextBody={reply.request}
          onClose={() => setReply(null)}
        />
      )}
    </section>
  )
}
