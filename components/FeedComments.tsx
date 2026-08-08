'use client'

import { useState } from 'react'
import type { FeedComment } from '../lib/supabaseQueries'

// Public comment thread under a feed card. Comments are visible to everyone
// who can see the post (unlike ↩ Reply, which stays a private message to the
// author). The parent batch-loads comments per feed section and owns state;
// this renders one card's thread + composer.
export default function FeedComments({
  personId,
  comments,
  onSubmit,
  onDelete,
  onFlag,
}: {
  personId: string
  comments: FeedComment[]
  onSubmit: (body: string) => Promise<void>
  onDelete: (commentId: string) => void
  onFlag: (commentId: string) => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const fmtWhen = (iso: string) => {
    const d = new Date(iso)
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await onSubmit(body)
      setText('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-2 border-t border-[var(--line-1)] pt-2">
      {comments.length > 0 && (
        <div className="space-y-2">
          {comments.map(c => (
            <div key={c.id} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-[var(--fg-1)]">{c.people?.name ?? 'A disciple'}</span>
                <span className="text-[10px] text-[var(--fg-3)]">{fmtWhen(c.created_at)}</span>
                {c.person_id === personId ? (
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="ml-auto text-[10px] font-semibold text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => { if (window.confirm('Flag this comment for review? It will be hidden right away.')) onFlag(c.id) }}
                    className="ml-auto text-[10px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]"
                  >
                    Flag
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-[var(--fg-2)]">{c.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className={`flex items-center gap-2 ${comments.length > 0 ? 'mt-2' : ''}`}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send() } }}
          placeholder="Add a comment — everyone who sees this post can read it"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-[var(--line-1)] bg-[var(--indigo-1)] px-2.5 py-1.5 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none focus:ring-1 focus:ring-[var(--gbm-cobalt-soft)]"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!text.trim() || sending}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
          style={{ background: 'var(--gbm-cobalt-bright)', color: '#fff' }}
        >
          Post
        </button>
      </div>
    </div>
  )
}
