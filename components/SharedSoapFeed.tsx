'use client'

import { useEffect, useState } from 'react'
import { getCoachSharedSoaps, getGroupSharedSoaps, getSharedSoaps, getFeedItemStates, setFeedItemState, clearFeedItemState, getFeedLikes, setFeedLike, getFeedComments, addFeedComment, deleteFeedComment, flagFeedComment, type FeedComment } from '../lib/supabaseQueries'
import ReplyModal from './ReplyModal'
import FeedComments from './FeedComments'

type SharedSoap = {
  id: string
  person_id: string
  journal_date: string | null
  scripture_reference: string | null
  ocr_text: string | null
  summary: string | null
  created_at: string
  photo_url?: string | null
  people?: { name: string } | null
  // Set by /api/soap/shared on rows the viewer authored: the card labels WHO
  // it's shared with. target_group_names is null for "all my groups".
  own?: boolean
  target_group_names?: string[] | null
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
  const [showDeleted, setShowDeleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [unread, setUnread] = useState(0)
  const [reply, setReply] = useState<SharedSoap | null>(null)
  // Card is redefined every render (remounts), so expansion lives up here.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map())
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())
  const [comments, setComments] = useState<Map<string, FeedComment[]>>(new Map())
  const [openComments, setOpenComments] = useState<Set<string>>(new Set())

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
      getFeedLikes(personId, 'soap', list.map(i => i.id)).then(likes => {
        if (cancelled) return
        setLikeCounts(likes.counts)
        setMyLikes(likes.mine)
      })
      getFeedComments('soap', list.map(i => i.id)).then(res => {
        if (cancelled) return
        setComments(res.byTarget)
      })
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
  const deleted = items.filter(i => deletedIds.has(i.id))

  const doArchive = async (id: string) => {
    setArchivedIds(prev => new Set(prev).add(id))
    await setFeedItemState(personId, 'soap', id, 'archived')
  }
  const doUnarchive = async (id: string) => {
    setArchivedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    await clearFeedItemState(personId, 'soap', id)
  }
  const doDelete = async (id: string) => {
    if (!window.confirm('Delete this from your feed? You can bring it back anytime from "Show deleted" at the bottom of the feed.')) return
    setDeletedIds(prev => new Set(prev).add(id))
    await setFeedItemState(personId, 'soap', id, 'deleted')
  }
  const doRestore = async (id: string) => {
    setDeletedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    await clearFeedItemState(personId, 'soap', id)
  }
  const toggleLike = async (id: string) => {
    const liked = !myLikes.has(id)
    setMyLikes(prev => { const n = new Set(prev); if (liked) n.add(id); else n.delete(id); return n })
    setLikeCounts(prev => { const n = new Map(prev); n.set(id, Math.max(0, (n.get(id) ?? 0) + (liked ? 1 : -1))); return n })
    await setFeedLike(personId, 'soap', id, liked)
  }
  const toggleComments = (id: string) =>
    setOpenComments(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const submitComment = async (id: string, body: string) => {
    const { data } = await addFeedComment(personId, 'soap', id, body)
    if (data) setComments(prev => { const n = new Map(prev); n.set(id, [...(n.get(id) ?? []), data]); return n })
  }
  const removeComment = async (id: string, commentId: string) => {
    setComments(prev => { const n = new Map(prev); n.set(id, (n.get(id) ?? []).filter(c => c.id !== commentId)); return n })
    await deleteFeedComment(commentId)
  }
  const flagComment = async (id: string, commentId: string) => {
    setComments(prev => { const n = new Map(prev); n.set(id, (n.get(id) ?? []).filter(c => c.id !== commentId)); return n })
    await flagFeedComment(commentId)
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''

  // On the viewer's own rows the card answers "who did I share this with?" —
  // group shares name the target groups (null target list = every group).
  // Same strings as the native feed pill (soap-feed.tsx ownShareLabel).
  const ownShareLabel = (s: SharedSoap): string => {
    if (scope === 'coach') return 'Shared with my coach'
    if (scope === 'group') {
      return s.target_group_names?.length ? s.target_group_names.join(', ') : 'All my groups'
    }
    return 'Whole church'
  }

  const toggleExpanded = (id: string) =>
    setExpandedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  const Card = ({ s, isArchived, isDeleted }: { s: SharedSoap; isArchived?: boolean; isDeleted?: boolean }) => {
    // Expanded shows the whole entry (full text + photo); collapsed clamps to a
    // few lines, which for a SOAP is usually just the Scripture.
    const body = ((expandedIds.has(s.id) ? s.ocr_text : null) || s.summary || s.ocr_text || '').trim()
    const expanded = expandedIds.has(s.id)
    const fullText = (s.ocr_text || '').trim()
    const expandable = fullText.length > 220 || fullText.split('\n').length > 4 || !!s.photo_url
    const mine = s.own || s.person_id === personId
    return (
      <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-[var(--fg-1)]">{s.people?.name ?? 'A disciple'}</span>
          {mine && (
            <span
              className="min-w-0 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'rgba(91,141,247,0.14)', color: 'var(--gbm-cobalt-soft)' }}
              title={ownShareLabel(s)}
            >
              {ownShareLabel(s)}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[11px] text-[var(--fg-3)]">{fmtDate(s.journal_date)}</span>
        </div>
        {s.scripture_reference && (
          <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--establish)' }}>{s.scripture_reference}</p>
        )}
        {body && (
          <p
            className={`mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg-2)] ${expanded ? '' : 'line-clamp-4 cursor-pointer'}`}
            onClick={expanded || !expandable ? undefined : () => toggleExpanded(s.id)}
          >
            {body}
          </p>
        )}
        {expanded && s.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.photo_url} alt="SOAP journal page" className="mt-2 w-full rounded-lg" />
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          {expandable ? (
            <button
              type="button"
              onClick={() => toggleExpanded(s.id)}
              className="text-[11px] font-semibold text-[var(--gbm-cobalt-soft)] hover:text-[var(--fg-1)]"
            >
              {expanded ? '▴ Show less' : '▾ Read full entry'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
          {isDeleted ? (
            <button type="button" onClick={() => doRestore(s.id)} className="text-[11px] font-semibold text-[var(--gbm-cobalt-soft)] hover:text-[var(--fg-1)]">Restore to feed</button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => toggleLike(s.id)}
                className="text-[11px] font-semibold hover:text-[var(--fg-1)]"
                style={{ color: myLikes.has(s.id) ? 'var(--gold)' : 'var(--gbm-cobalt-soft)' }}
                title={myLikes.has(s.id) ? 'Unlike' : 'Like'}
              >
                {myLikes.has(s.id) ? '♥' : '♡'}{(likeCounts.get(s.id) ?? 0) > 0 ? ` ${likeCounts.get(s.id)}` : ''}
              </button>
              <button
                type="button"
                onClick={() => toggleComments(s.id)}
                className="text-[11px] font-semibold hover:text-[var(--fg-1)]"
                style={{ color: openComments.has(s.id) ? 'var(--fg-1)' : 'var(--gbm-cobalt-soft)' }}
                title="Comments are public to everyone who can see this post"
              >
                💬 Comment{(comments.get(s.id)?.length ?? 0) > 0 ? ` ${comments.get(s.id)!.length}` : ''}
              </button>
              {!isArchived && s.person_id !== personId && (
                <button type="button" onClick={() => setReply(s)} title="Private — only the author sees this, in their inbox" className="text-[11px] font-semibold text-[var(--gbm-cobalt-soft)] hover:text-[var(--fg-1)]">🔒 Message</button>
              )}
              {isArchived ? (
                <button type="button" onClick={() => doUnarchive(s.id)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">Unarchive</button>
              ) : (
                <button type="button" onClick={() => doArchive(s.id)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">Archive</button>
              )}
              <button type="button" onClick={() => doDelete(s.id)} className="text-[11px] font-semibold text-red-400 hover:text-red-300">Delete</button>
            </>
          )}
          </div>
        </div>
        {openComments.has(s.id) && (
          <FeedComments
            personId={personId}
            comments={comments.get(s.id) ?? []}
            onSubmit={body => submitComment(s.id, body)}
            onDelete={cid => void removeComment(s.id, cid)}
            onFlag={cid => void flagComment(s.id, cid)}
          />
        )}
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
  if (visible.length === 0 && archived.length === 0 && deleted.length === 0 && !showEmpty) return null

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center gap-3">
        <h2 className="cn-h3">{T}</h2>
        <span className="cn-chip !py-0.5 !text-xs">{visible.length}</span>
        {unread > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: 'var(--gbm-cobalt-bright)', color: '#fff' }}>{unread} new</span>
        )}
        {(visible.length > 0 || archived.length > 0 || deleted.length > 0) && (
          <button type="button" onClick={() => setCollapsed(c => !c)} className="ml-auto cn-chip">{collapsed ? 'Expand' : 'Collapse'}</button>
        )}
      </div>
      {collapsed ? null : (
        <>
          {visible.length === 0 && archived.length === 0 && deleted.length === 0 ? (
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
              {deleted.length > 0 && (
                <div className="mt-3">
                  <button type="button" onClick={() => setShowDeleted(v => !v)} className="text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">
                    {showDeleted ? 'Hide' : 'Show'} deleted ({deleted.length})
                  </button>
                  {showDeleted && (
                    <div className="mt-2 space-y-2 opacity-50">
                      {deleted.map(s => <Card key={s.id} s={s} isDeleted />)}
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
