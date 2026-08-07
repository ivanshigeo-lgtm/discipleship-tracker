'use client'

import { useEffect, useState } from 'react'
import { getCoachSharedPrayers, getGroupSharedPrayers, getConstellationSharedPrayers, getFeedItemStates, setFeedItemState, clearFeedItemState, getFeedLikes, setFeedLike } from '../lib/supabaseQueries'
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
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [unread, setUnread] = useState(0)
  const [reply, setReply] = useState<SharedPrayer | null>(null)
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map())
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const p =
      scope === 'coach' ? getCoachSharedPrayers(personId)
      : scope === 'group' ? getGroupSharedPrayers(personId)
      : getConstellationSharedPrayers()
    Promise.all([Promise.resolve(p), getFeedItemStates(personId, 'prayer_request')]).then(([res, states]) => {
      if (cancelled) return
      const list = (res.data as unknown as SharedPrayer[]) ?? []
      setItems(list)
      setArchivedIds(states.archived)
      setDeletedIds(states.deleted)
      setLoading(false)
      if (seenKey) {
        const lastSeen = localStorage.getItem(seenKey) ?? '0'
        setUnread(list.filter(i => (i.created_at ?? '') > lastSeen && !states.deleted.has(i.id)).length)
      }
      getFeedLikes(personId, 'prayer_request', list.map(i => i.id)).then(likes => {
        if (cancelled) return
        setLikeCounts(likes.counts)
        setMyLikes(likes.mine)
      })
    })
    return () => { cancelled = true }
  }, [personId, scope, refreshKey, seenKey])

  const T = title ?? (scope === 'coach' ? 'Prayers shared with you' : scope === 'group' ? 'Your Grace Group’s prayers' : 'Prayers shared with everyone')
  const S = subtitle ?? (
    scope === 'coach' ? 'Requests and praises your disciples sent you'
    : scope === 'group' ? 'Requests and praises shared with your group'
    : 'Requests and praises shared with everyone'
  )

  const visible = items.filter(i => !archivedIds.has(i.id) && !deletedIds.has(i.id))
  const archived = items.filter(i => archivedIds.has(i.id) && !deletedIds.has(i.id))
  const deleted = items.filter(i => deletedIds.has(i.id))

  const doArchive = async (id: string) => {
    setArchivedIds(prev => new Set(prev).add(id))
    await setFeedItemState(personId, 'prayer_request', id, 'archived')
  }
  const doUnarchive = async (id: string) => {
    setArchivedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    await clearFeedItemState(personId, 'prayer_request', id)
  }
  const doDelete = async (id: string) => {
    if (!window.confirm('Delete this from your feed? You can bring it back anytime from "Show deleted" at the bottom of the feed.')) return
    setDeletedIds(prev => new Set(prev).add(id))
    await setFeedItemState(personId, 'prayer_request', id, 'deleted')
  }
  const doRestore = async (id: string) => {
    setDeletedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    await clearFeedItemState(personId, 'prayer_request', id)
  }
  const toggleLike = async (id: string) => {
    const liked = !myLikes.has(id)
    setMyLikes(prev => { const n = new Set(prev); if (liked) n.add(id); else n.delete(id); return n })
    setLikeCounts(prev => { const n = new Map(prev); n.set(id, Math.max(0, (n.get(id) ?? 0) + (liked ? 1 : -1))); return n })
    await setFeedLike(personId, 'prayer_request', id, liked)
  }

  const Card = ({ p, isArchived, isDeleted }: { p: SharedPrayer; isArchived?: boolean; isDeleted?: boolean }) => (
    <div className="rounded-xl border border-[var(--line-1)] p-3" style={{ background: p.is_praise ? 'rgba(242,200,121,.08)' : 'var(--indigo-2)' }}>
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
      <div className="mt-2 flex items-center justify-end gap-3">
        {isDeleted ? (
          <button type="button" onClick={() => doRestore(p.id)} className="text-[11px] font-semibold text-[var(--gbm-cobalt-soft)] hover:text-[var(--fg-1)]">Restore to feed</button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => toggleLike(p.id)}
              className="text-[11px] font-semibold hover:text-[var(--fg-1)]"
              style={{ color: myLikes.has(p.id) ? 'var(--gold)' : 'var(--gbm-cobalt-soft)' }}
              title={myLikes.has(p.id) ? 'Unlike' : 'Like'}
            >
              {myLikes.has(p.id) ? '♥' : '♡'}{(likeCounts.get(p.id) ?? 0) > 0 ? ` ${likeCounts.get(p.id)}` : ''}
            </button>
            {!isArchived && p.person_id !== personId && (
              <button type="button" onClick={() => setReply(p)} className="text-[11px] font-semibold text-[var(--gbm-cobalt-soft)] hover:text-[var(--fg-1)]">↩ Reply</button>
            )}
            {isArchived ? (
              <button type="button" onClick={() => doUnarchive(p.id)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">Unarchive</button>
            ) : (
              <button type="button" onClick={() => doArchive(p.id)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">Archive</button>
            )}
            <button type="button" onClick={() => doDelete(p.id)} className="text-[11px] font-semibold text-red-400 hover:text-red-300">Delete</button>
          </>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#9B80FF] border-t-transparent" />
      </div>
    )
  }
  if (visible.length === 0 && archived.length === 0 && deleted.length === 0 && !showEmpty) return null

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center gap-3">
        <h2 className="cn-h3">{T}</h2>
        <span className="cn-chip !py-0.5 !text-xs">{visible.length}</span>
        {unread > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: '#9B80FF', color: '#fff' }}>{unread} new</span>
        )}
        {(visible.length > 0 || archived.length > 0 || deleted.length > 0) && (
          <button type="button" onClick={() => setCollapsed(c => !c)} className="ml-auto cn-chip">{collapsed ? 'Expand' : 'Collapse'}</button>
        )}
      </div>
      {visible.length === 0 && archived.length === 0 && deleted.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--fg-3)]">Nothing shared here yet.</p>
      ) : collapsed ? null : (
        <>
          <p className="mb-4 mt-1 text-sm text-[var(--fg-2)]">{S}</p>
          <div className="space-y-2">
            {visible.map(p => <Card key={p.id} p={p} />)}
            {visible.length === 0 && <p className="text-sm text-[var(--fg-3)]">Nothing new — all archived.</p>}
          </div>
          {archived.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowArchived(v => !v)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">
                {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-2 space-y-2 opacity-70">
                  {archived.map(p => <Card key={p.id} p={p} isArchived />)}
                </div>
              )}
            </div>
          )}
          {deleted.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowDeleted(v => !v)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">
                {showDeleted ? 'Hide' : 'Show'} deleted ({deleted.length})
              </button>
              {showDeleted && (
                <div className="mt-2 space-y-2 opacity-50">
                  {deleted.map(p => <Card key={p.id} p={p} isDeleted />)}
                </div>
              )}
            </div>
          )}
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
