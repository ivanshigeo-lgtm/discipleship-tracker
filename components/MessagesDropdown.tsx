'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  getMyMessages,
  markMessageRead,
  archiveMessage,
  unarchiveMessage,
  deleteMessage,
  countArchivedMessages,
} from '../lib/supabaseQueries'
import type { Message, Person } from '../types/database'

type MessageWithSender = Message & { from: Pick<Person, 'id' | 'name' | 'current_stage'> | null }

const KIND_STYLE: Record<Message['kind'], { label: string; color: string }> = {
  greeting: { label: 'Hello', color: 'var(--engage)' },
  prayer:   { label: 'Prayer', color: 'var(--equip)' },
  note:     { label: 'Update', color: 'var(--establish)' },
}

export default function MessagesDropdown({
  personId,
  refreshKey = 0,
  onOpenMessageCenter,
}: {
  personId: string
  refreshKey?: number
  onOpenMessageCenter?: (targetPersonId: string) => void
}) {
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [open, setOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archivedCount, setArchivedCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      getMyMessages(personId, { archived: showArchived }),
      countArchivedMessages(personId),
    ])
    if (data) setMessages(data as unknown as MessageWithSender[])
    setArchivedCount(count)
  }, [personId, showArchived])

  useEffect(() => { load() }, [load, refreshKey])

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const unread = messages.filter(m => !m.read_at)

  const handleMarkRead = async (id: string) => {
    setMessages(current => current.map(m => (m.id === id ? { ...m, read_at: new Date().toISOString() } : m)))
    await markMessageRead(id)
  }

  const handleMarkAllRead = async () => {
    const ids = unread.map(m => m.id)
    setMessages(current => current.map(m => ids.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m))
    await Promise.all(ids.map(id => markMessageRead(id)))
  }

  const handleArchive = async (id: string) => {
    setMessages(current => current.filter(m => m.id !== id))
    setArchivedCount(c => c + 1)
    await archiveMessage(id)
  }

  const handleUnarchive = async (id: string) => {
    setMessages(current => current.filter(m => m.id !== id))
    setArchivedCount(c => Math.max(0, c - 1))
    await unarchiveMessage(id)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this message for good? This can’t be undone.')) return
    setMessages(current => current.filter(m => m.id !== id))
    if (showArchived) setArchivedCount(c => Math.max(0, c - 1))
    await deleteMessage(id)
  }

  const canToggleArchived = showArchived || archivedCount > 0

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center gap-1.5 rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-medium text-[var(--fg-2)] transition-colors hover:border-[var(--line-3)] hover:text-[var(--fg-1)]"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Messages
        {unread.length > 0 && (
          <span
            className="flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold"
            style={{ background: 'var(--establish)', color: 'var(--void)' }}
          >
            {unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(400px,90vw)] rounded-2xl border border-[var(--line-2)] p-3"
          style={{ background: 'rgba(15,21,48,.97)', backdropFilter: 'blur(16px)', boxShadow: 'var(--elev-2)' }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--fg-3)]">
              {showArchived ? 'Archived messages' : 'Messages from disciples'}
            </span>
            <div className="flex items-center gap-2.5">
              {!showArchived && unread.length > 1 && (
                <button type="button" onClick={handleMarkAllRead} className="text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-1)]">
                  Mark all read
                </button>
              )}
              {canToggleArchived && (
                <button
                  type="button"
                  onClick={() => setShowArchived(s => !s)}
                  className="text-[10px] font-medium text-[var(--fg-3)] hover:text-[var(--fg-1)]"
                >
                  {showArchived ? 'Back to inbox' : `Show archived${archivedCount > 0 ? ` (${archivedCount})` : ''}`}
                </button>
              )}
            </div>
          </div>

          {messages.length === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--fg-3)]">
              {showArchived ? 'No archived messages' : 'No messages yet'}
            </p>
          ) : (
            <div className="max-h-[min(60vh,480px)] space-y-1.5 overflow-y-auto pr-0.5">
              {messages.map(m => {
                const kind = KIND_STYLE[m.kind]
                return (
                  <div
                    key={m.id}
                    className="flex items-start gap-2.5 rounded-xl border p-2.5"
                    style={{
                      borderColor: m.read_at ? 'var(--line-1)' : 'rgba(54,214,195,.25)',
                      background: m.read_at ? 'var(--indigo-2)' : 'rgba(54,214,195,.04)',
                    }}
                  >
                    <span
                      className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                      style={{ color: kind.color, background: `color-mix(in srgb, ${kind.color} 14%, transparent)` }}
                    >
                      {kind.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--fg-1)]">{m.from?.name ?? 'Someone'}</span>
                        <span className="shrink-0 text-[9px] text-[var(--fg-3)]">
                          {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-2)]">{m.body}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {showArchived ? (
                        <button
                          type="button"
                          onClick={() => handleUnarchive(m.id)}
                          className="rounded-full border border-[var(--line-2)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--fg-2)] hover:border-[var(--gbm-cobalt-bright)] hover:text-[var(--fg-1)]"
                        >
                          Unarchive
                        </button>
                      ) : (
                        <>
                          {onOpenMessageCenter && m.from && (
                            <button
                              type="button"
                              onClick={() => { onOpenMessageCenter(m.from!.id); setOpen(false) }}
                              className="rounded-full border border-[var(--line-2)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--fg-2)] hover:border-[var(--gbm-cobalt-bright)] hover:text-[var(--fg-1)]"
                            >
                              Reply
                            </button>
                          )}
                          {!m.read_at && (
                            <button
                              type="button"
                              onClick={() => handleMarkRead(m.id)}
                              className="text-[9px] text-[var(--fg-3)] hover:text-[var(--fg-1)]"
                            >
                              ✓ Read
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleArchive(m.id)}
                            className="text-[9px] text-[var(--fg-3)] hover:text-[var(--fg-1)]"
                          >
                            Archive
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDelete(m.id)}
                        className="text-[9px] text-[var(--fg-3)] hover:text-[var(--danger,#E06B6B)]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
