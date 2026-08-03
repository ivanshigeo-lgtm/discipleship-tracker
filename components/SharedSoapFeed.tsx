'use client'

import { useEffect, useState } from 'react'
import { getCoachSharedSoaps, getGroupSharedSoaps, getSharedSoaps, getFeedItemStates, setFeedItemState, clearFeedItemState } from '../lib/supabaseQueries'
import ReplyModal from './ReplyModal'

type SharedSoap = {
  id: string
  person_id: string
  journal_date: string | null
  scripture_reference: string | null
  ocr_text: string | null
  summary: string | null
  created_at: string
  people?: { name: string } | null
}

export default function SharedSoapFeed({
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
  const [items, setItems] = useState<SharedSoap[]>([])
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [unread, setUnread] = useState(0)
  const [reply, setReply] = useState<SharedSoap | null>(null)

  useEffect(() => {
    let cancelled = false
    const p =
      scope === 'coach' ? getCoachSharedSoaps(personId)
      : scope === 'group' ? getGroupSharedSoaps(personId)
      : getSharedSoaps(20)
    Promise.all([Promise.resolve(p), getFeedItemStates(personId, 'soap')]).then(([res, states]) => {
      if (cancelled) return
      const list = (res.data as unknown as SharedSoap[]) ?? []
      setItems(list)
      setArchivedIds(states.archived)
      setDeletedIds(states.deleted)
      setLoading(false)
      if (seenKey) {
        const lastSeen = localStorage.getItem(seenKey) ?? '0'
        setUnread(list.filter(i => (i.created_at ?? '') > lastSeen && !states.deleted.has(i.id)).length)
      }
    })
    return () => { cancelled = true }
  }, [personId, scope, refreshKey, seenKey])

  const T = title ?? (scope === 'coach' ? 'Shared with you' : scope === 'group' ? 'From your Grace Group' : 'From the constellation')
  const S = subtitle ?? (
    scope === 'coach' ? 'SOAP reflections your disciples chose to share with you'
    : scope === 'group' ? 'SOAP reflections your group has shared'
    : 'SOAP reflections shared with everyone'
  )

  const visible = items.filter(i => !archivedIds.has(i.id) && !deletedIds.has(i.id))
  const archived = items.filter(i => archivedIds.has(i.id) && !deletedIds.has(i.id))

  const doArchive = async (id: string) => {
    setArchivedIds(prev => new Set(prev).add(id))
    await setFeedItemState(personId, 'soap', id, 'archived')
  }
  const doUnarchive = async (id: string) => {
    setArchivedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    await clearFeedItemState(personId, 'soap', id)
  }
  const doDelete = async (id: string) => {
    if (!window.confirm('Remove this from your feed for good? The author keeps their entry.')) return
    setDeletedIds(prev => new Set(prev).add(id))
    await setFeedItemState(personId, 'soap', id, 'deleted')
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

  const Card = ({ s, isArchived }: { s: SharedSoap; isArchived?: boolean }) => {
    const body = (s.summary || s.ocr_text || '').trim()
    return (
      <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-[var(--fg-1)]">{s.people?.name ?? 'A disciple'}</span>
          <span className="shrink-0 text-[11px] text-[var(--fg-3)]">{fmtDate(s.journal_date)}</span>
        </div>
        {s.scripture_reference && (
          <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--establish)' }}>{s.scripture_reference}</p>
        )}
        {body && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg-2)]">{body}</p>}
        <div className="mt-2 flex items-center justify-end gap-3">
          {!isArchived && s.person_id !== personId && (
            <button type="button" onClick={() => setReply(s)} className="text-[11px] font-semibold text-[var(--gbm-cobalt-soft)] hover:text-[var(--fg-1)]">↩ Reply</button>
          )}
          {isArchived ? (
            <button type="button" onClick={() => doUnarchive(s.id)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">Unarchive</button>
          ) : (
            <button type="button" onClick={() => doArchive(s.id)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">Archive</button>
          )}
          <button type="button" onClick={() => doDelete(s.id)} className="text-[11px] font-semibold text-red-400 hover:text-red-300">Delete</button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--establish)] border-t-transparent" />
      </div>
    )
  }
  if (visible.length === 0 && archived.length === 0 && !showEmpty) return null

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center gap-3">
        <h2 className="cn-h3">{T}</h2>
        <span className="cn-chip !py-0.5 !text-xs">{visible.length}</span>
        {unread > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--gbm-cobalt-bright)', color: '#fff' }}>{unread} new</span>
        )}
        {(visible.length > 0 || archived.length > 0) && (
          <button type="button" onClick={() => setCollapsed(c => !c)} className="ml-auto cn-chip">{collapsed ? 'Expand' : 'Collapse'}</button>
        )}
      </div>
      {collapsed ? null : (
        <>
          {visible.length === 0 && archived.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--fg-3)]">Nothing shared here yet.</p>
          ) : (
            <>
              <p className="mb-4 mt-1 text-sm text-[var(--fg-2)]">{S}</p>
              <div className="space-y-2">
                {visible.map(s => <Card key={s.id} s={s} />)}
                {visible.length === 0 && <p className="text-sm text-[var(--fg-3)]">Nothing new — all archived.</p>}
              </div>
              {archived.length > 0 && (
                <div className="mt-3">
                  <button type="button" onClick={() => setShowArchived(v => !v)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">
                    {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
                  </button>
                  {showArchived && (
                    <div className="mt-2 space-y-2 opacity-70">
                      {archived.map(s => <Card key={s.id} s={s} isArchived />)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {reply && (
        <ReplyModal
          fromId={personId}
          toId={reply.person_id}
          toName={reply.people?.name ?? 'them'}
          contextLabel={`SOAP${reply.scripture_reference ? ' · ' + reply.scripture_reference : ''}${reply.journal_date ? ' · ' + fmtDate(reply.journal_date) : ''}`}
          contextBody={(reply.summary || reply.ocr_text || '').trim()}
          onClose={() => setReply(null)}
        />
      )}
    </section>
  )
}
