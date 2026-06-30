'use client'

import { useState } from 'react'
import { getOrCreateDM, sendConversationMessage } from '../lib/supabaseQueries'

// Reply to a shared SOAP or prayer — like an email reply: the original is
// quoted/attached so the author knows what it's about. Lands in their Message
// Center (a direct conversation).
export default function ReplyModal({
  fromId,
  toId,
  toName,
  contextLabel,
  contextBody,
  onClose,
}: {
  fromId: string
  toId: string
  toName: string
  contextLabel: string
  contextBody: string
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const quote = contextBody.trim().slice(0, 240) + (contextBody.trim().length > 240 ? '…' : '')

  const send = async () => {
    if (!text.trim()) return
    setSending(true); setError('')
    try {
      const { conversationId } = await getOrCreateDM(fromId, toId)
      if (!conversationId) throw new Error('no conversation')
      const body = `↩ Re: ${contextLabel}\n\n“${quote}”\n\n${text.trim()}`
      const { error: sErr } = await sendConversationMessage(conversationId, fromId, body)
      if (sErr) throw sErr
      setSent(true)
      setTimeout(onClose, 1200)
    } catch {
      setError('Could not send your reply. Please try again.')
    }
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" style={{ background: 'rgba(6,8,20,.7)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="jy-rise-in w-full max-w-md rounded-t-[var(--r-xl)] border border-b-0 border-[var(--line-2)] p-5 sm:rounded-[var(--r-xl)] sm:border-b" style={{ background: 'var(--indigo)' }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>Reply to {toName}</h2>
          <button type="button" onClick={onClose} className="text-lg leading-none text-[var(--fg-3)] hover:text-[var(--fg-1)]">×</button>
        </div>

        {sent ? (
          <p className="py-6 text-center text-sm text-[var(--establish)]">✦ Reply sent</p>
        ) : (
          <>
            {/* attached original */}
            <div className="mb-3 rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-3)]">{contextLabel}</p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-[var(--fg-2)]">{quote}</p>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={`Write your reply to ${toName}…`}
              rows={4}
              className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-3 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="cn-chip">Cancel</button>
              <button type="button" onClick={send} disabled={sending || !text.trim()} className="cn-btn cn-btn-primary !px-4 !py-1.5 !text-xs disabled:opacity-50">
                {sending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
