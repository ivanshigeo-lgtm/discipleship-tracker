'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  archiveMessage,
  countArchivedMessages,
  deleteMessage,
  getMyMessages,
  markMessageRead,
  sendMessage,
  unarchiveMessage,
} from '../lib/supabaseQueries'
import type { Message, Person } from '../types/database'

type InboxMessage = Message & { from: Pick<Person, 'id' | 'name' | 'current_stage'> | null }

// The inbox card: messages addressed to this person — a disciple's hello, a
// coach's reply. Prayers keep going to the Prayer Wall (its own tab), so this
// shows the conversational kinds (greeting + note) with an inline reply.
//
// Each message can be archived (soft-hidden, recoverable via "Show archived") or
// deleted for good. A "Show archived" toggle in the header flips the list to the
// archived set and stays reachable even after the live inbox empties.
// Mirrors native src/components/messages-inbox.tsx.
export default function MessagesInbox({
  personId,
  refreshKey,
  onChanged,
}: {
  personId: string
  refreshKey?: number
  onChanged?: () => void
}) {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedCount, setArchivedCount] = useState(0)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      getMyMessages(personId, { archived: showArchived }),
      countArchivedMessages(personId),
    ])
    if (data) setMessages((data as unknown as InboxMessage[]).filter(m => m.kind !== 'prayer'))
    setArchivedCount(count)
    setLoading(false)
  }, [personId, showArchived])

  useEffect(() => { load() }, [load, refreshKey])

  const toggleArchived = () => {
    setReplyTo(null)
    setLoading(true)
    setShowArchived(prev => !prev)
  }

  const openReply = (m: InboxMessage) => {
    setReplyTo(replyTo === m.id ? null : m.id)
    setReplyText('')
  }

  const markRead = async (m: InboxMessage) => {
    setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)))
    await markMessageRead(m.id)
    onChanged?.()
  }

  const archive = async (m: InboxMessage) => {
    setMessages(prev => prev.filter(x => x.id !== m.id))
    setArchivedCount(c => c + 1)
    await archiveMessage(m.id)
    onChanged?.()
  }

  const unarchive = async (m: InboxMessage) => {
    setMessages(prev => prev.filter(x => x.id !== m.id))
    setArchivedCount(c => Math.max(0, c - 1))
    await unarchiveMessage(m.id)
    onChanged?.()
  }

  const confirmDelete = async (m: InboxMessage) => {
    if (!window.confirm('Delete this message for good? This can’t be undone.')) return
    setMessages(prev => prev.filter(x => x.id !== m.id))
    if (showArchived) setArchivedCount(c => Math.max(0, c - 1))
    await deleteMessage(m.id)
    onChanged?.()
  }

  const sendReply = async (m: InboxMessage) => {
    const text = replyText.trim()
    if (!text || !m.from) return
    setBusyId(m.id)
    const { error } = await sendMessage(personId, m.from.id, 'note', text)
    if (!error) {
      if (!m.read_at) await markMessageRead(m.id)
      setMessages(prev => prev.map(x => (x.id === m.id ? { ...x, read_at: x.read_at ?? new Date().toISOString() } : x)))
      setReplyTo(null)
      setReplyText('')
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
  // Clean feed: nothing live and nothing archived → the card disappears.
  if (!showArchived && messages.length === 0 && archivedCount === 0) return null

  const unread = messages.filter(m => !m.read_at).length
  const canToggle = showArchived || archivedCount > 0

  return (
    <section className="cn-card mb-6 p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="cn-h3">{showArchived ? 'Archived' : 'Messages'}</h2>
        {!showArchived && unread > 0 && (
          <span className="cn-chip !bg-[rgba(54,214,195,.15)] !py-0.5 !text-xs !text-[var(--establish)]">
            {unread} new
          </span>
        )}
        <div className="flex-1" />
        {canToggle && (
          <button
            type="button"
            onClick={toggleArchived}
            className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-semibold text-[var(--fg-2)] hover:border-[var(--line-3)] hover:text-[var(--fg-1)]"
          >
            {showArchived ? 'Back to inbox' : `Show archived${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <p className="py-1 text-sm text-[var(--fg-3)]">
          {showArchived ? 'No archived messages.' : 'Your inbox is clear.'}
        </p>
      ) : (
        <div className="space-y-2">
          {messages.map(m => {
            const busy = busyId === m.id
            const open = replyTo === m.id
            return (
              <div
                key={m.id}
                className="rounded-xl border p-3"
                style={{
                  borderColor: !showArchived && !m.read_at ? 'rgba(54,214,195,.3)' : 'var(--line-1)',
                  background: !showArchived && !m.read_at ? 'rgba(54,214,195,.05)' : 'var(--indigo-2)',
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--fg-1)]">
                    {m.from?.name ?? 'Someone'}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--fg-3)]">
                    {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-[var(--fg-2)]">{m.body}</p>
                <div className="mt-2.5 flex items-center gap-4">
                  {showArchived ? (
                    <button
                      type="button"
                      onClick={() => unarchive(m)}
                      className="text-xs font-semibold text-[var(--gbm-cobalt-soft,var(--gbm-cobalt-bright))] hover:opacity-80"
                    >
                      Unarchive
                    </button>
                  ) : (
                    <>
                      {m.from && (
                        <button
                          type="button"
                          onClick={() => openReply(m)}
                          className="text-xs font-semibold text-[var(--gbm-cobalt-soft,var(--gbm-cobalt-bright))] hover:opacity-80"
                        >
                          {open ? 'Cancel' : 'Reply'}
                        </button>
                      )}
                      {!m.read_at && (
                        <button
                          type="button"
                          onClick={() => markRead(m)}
                          className="text-xs font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => archive(m)}
                        className="text-xs font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]"
                      >
                        Archive
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => confirmDelete(m)}
                    className="text-xs font-semibold text-[var(--fg-3)] hover:text-[var(--danger,#E06B6B)]"
                  >
                    Delete
                  </button>
                </div>
                {open && (
                  <div className="mt-2.5 flex items-end gap-2">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder={`Reply to ${m.from?.name?.split(' ')[0] ?? 'them'}…`}
                      rows={2}
                      className="min-h-[40px] flex-1 resize-y rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => sendReply(m)}
                      disabled={busy || !replyText.trim()}
                      className="h-9 shrink-0 rounded-full bg-[var(--gbm-cobalt-bright)] px-4 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
