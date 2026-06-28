'use client'

import { useState } from 'react'
import { sendMessage, addJourneyPrayerRequest } from '../../lib/supabaseQueries'
import type { Person } from '../../types/database'

/*
 * Reach out to your coach — a greeting or a prayer request.
 * Prayer requests also land on the coach's Prayer Wall.
 */
export default function MessageCoachModal({
  personId,
  coach,
  onClose,
}: {
  personId: string
  coach: Person
  onClose: () => void
}) {
  const [kind, setKind] = useState<'greeting' | 'prayer'>('greeting')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const firstName = coach.name.split(' ')[0]

  const handleSend = async () => {
    if (!body.trim()) return
    setBusy(true)
    setError('')
    const { error: err } = await sendMessage(personId, coach.id, kind, body.trim())
    if (!err && kind === 'prayer') {
      await addJourneyPrayerRequest(personId, body.trim(), 'coach', false)
    }
    setBusy(false)
    if (err) {
      setError(err.message || 'Could not send. Please try again.')
    } else {
      setSent(true)
      setTimeout(onClose, 1800)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6" style={{ boxShadow: 'var(--elev-2)' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-xl leading-none text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
        >
          ×
        </button>
        {sent ? (
          <div className="jy-rise-in py-6 text-center">
            <p className="text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--establish)' }}>
              ✦ Sent
            </p>
            <p className="mt-2 text-sm text-[var(--fg-2)]">
              {kind === 'prayer' ? `${firstName} will be praying with you.` : `${firstName} will hear from you.`}
            </p>
          </div>
        ) : (
          <>
            <div className="cn-label" style={{ color: 'var(--establish)' }}>Establish · your coach</div>
            <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
              Reach out to {firstName}
            </h2>

            <div className="mt-4 flex rounded-lg bg-[var(--indigo-2)] p-1">
              {(['greeting', 'prayer'] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    kind === k ? 'bg-[var(--gbm-cobalt-bright)] text-white' : 'text-[var(--fg-2)]'
                  }`}
                >
                  {k === 'greeting' ? 'Say hello' : 'Prayer request'}
                </button>
              ))}
            </div>

            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={
                kind === 'greeting'
                  ? `Aloha ${firstName}! …`
                  : 'What can we pray with you for?'
              }
              rows={4}
              className="mt-4 w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
            {kind === 'prayer' && (
              <p className="mt-1.5 text-[11px] text-[var(--fg-3)]">Also placed on {firstName}&rsquo;s prayer wall.</p>
            )}
            {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost flex-1">
                Not now
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={busy || !body.trim()}
                className="cn-btn cn-btn-primary flex-1 disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
