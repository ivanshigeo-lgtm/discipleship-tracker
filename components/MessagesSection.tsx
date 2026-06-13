'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getMyMessages, markMessageRead } from '../lib/supabaseQueries'
import type { Message, Person } from '../types/database'

type MessageWithSender = Message & { from: Pick<Person, 'id' | 'name' | 'current_stage'> | null }

export default function MessagesSection({ refreshKey = 0 }: { refreshKey?: number }) {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await getMyMessages(profile.id)
    if (data) setMessages(data as unknown as MessageWithSender[])
  }, [profile?.id])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Only show milestone update notes here — prayers go to the Prayer Wall, greetings go to Messages
  const updates = messages.filter(m => m.kind === 'note')

  if (updates.length === 0) return null

  const unread = updates.filter(m => !m.read_at)
  const visible = showAll ? updates : unread.length > 0 ? unread : updates.slice(0, 5)

  const handleMarkRead = async (id: string) => {
    setMessages(current => current.map(m => (m.id === id ? { ...m, read_at: new Date().toISOString() } : m)))
    await markMessageRead(id)
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="cn-h3">Constellation Progress</h2>
          {unread.length > 0 && (
            <span className="cn-chip !bg-[rgba(54,214,195,.15)] !py-0.5 !text-xs !text-[var(--establish)]">
              {unread.length} new
            </span>
          )}
        </div>
        {updates.length > 5 && (
          <button type="button" onClick={() => setShowAll(s => !s)} className="cn-chip !text-xs">
            {showAll ? 'Show recent' : `Show all ${updates.length}`}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--fg-3)]">Milestone updates from your disciples</p>

      <div className="mt-3 space-y-2">
        {visible.map(m => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-xl border p-3"
            style={{
              borderColor: m.read_at ? 'var(--line-1)' : 'rgba(54,214,195,.3)',
              background: m.read_at ? 'var(--indigo-2)' : 'rgba(54,214,195,.05)',
            }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--fg-1)]">{m.from?.name ?? 'Someone'}</span>
                <span className="shrink-0 text-[10px] text-[var(--fg-3)]">
                  {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <p className="mt-0.5 text-sm leading-relaxed text-[var(--fg-2)]">{m.body}</p>
            </div>
            {!m.read_at && (
              <button
                type="button"
                onClick={() => handleMarkRead(m.id)}
                className="shrink-0 text-[10px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]"
              >
                Mark read
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
