'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function GoogleCalendarConnect() {
  const { profile } = useAuth()
  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState('')

  const applyStatus = (data: { connected?: boolean; email?: string | null; warning?: string | null; blocked?: boolean }) => {
    setConnected(Boolean(data.connected))
    setEmail(data.email ?? null)
    setWarning(data.warning ?? null)
    setBlocked(Boolean(data.blocked))
  }

  const checkStatus = async () => {
    if (!profile) return
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)

      const res = await fetch(`/api/auth/google/status?personId=${profile.id}`, {
        signal: controller.signal
      })
      clearTimeout(timeout)

      const data = await res.json()
      applyStatus(data)
    } catch (err) {
      console.error('Error checking Google Calendar status:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!profile) {
      setLoading(false)
      return
    }
    void checkStatus()
  }, [profile])

  // Check for success/error in URL params (callback uses gcal=connected)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_connected') === 'true' || params.get('gcal') === 'connected') {
      setConnected(true)
      window.history.replaceState({}, '', window.location.pathname)
      void checkStatus()
    }
  }, [profile])

  const handleBackfill = async () => {
    if (!profile || backfilling) return
    setBackfilling(true)
    setBackfillMsg('')
    try {
      const res = await fetch('/api/calendar/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: profile.id }),
      })
      const data = await res.json()
      if (data.reason === 'not_connected') {
        setBackfillMsg('Google Calendar is not connected.')
      } else if (data.reason === 'token_refresh_failed' || data.reason === 'blocked_account') {
        setBackfillMsg(data.error || 'Reconnect Google Calendar with the church Gmail.')
      } else {
        const created = data.created ?? 0
        const failed = data.failed ?? 0
        setBackfillMsg(
          failed
            ? `Synced ${created} missing event${created === 1 ? '' : 's'}; ${failed} failed.`
            : created
              ? `Synced ${created} missing event${created === 1 ? '' : 's'}.`
              : 'No missing future events to sync.',
        )
      }
    } catch (err) {
      console.error('Calendar backfill error:', err)
      setBackfillMsg('Backfill failed. Try reconnecting Google Calendar.')
    } finally {
      setBackfilling(false)
    }
  }

  if (!profile || loading) return null

  const handleConnect = () => {
    window.location.href = `/api/auth/google?personId=${profile.id}`
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
            <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-sm text-[var(--fg-2)]">Google Calendar</span>
        </div>

        {connected && !blocked ? (
          <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
            {email ? `Connected · ${email}` : 'Connected'}
          </span>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            className="rounded-full bg-[var(--gbm-cobalt-bright)] px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            {blocked ? 'Reconnect church Gmail' : 'Connect'}
          </button>
        )}
      </div>

      {warning && (
        <p className="text-[10px] leading-snug text-[#F2728A]">{warning}</p>
      )}

      {connected && !blocked && (
        <button
          type="button"
          onClick={handleBackfill}
          disabled={backfilling}
          className="text-[10px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)] disabled:opacity-50"
        >
          {backfilling ? 'Syncing missing events…' : 'Sync missing meetings'}
        </button>
      )}
      {backfillMsg && (
        <p className="text-[10px] text-[var(--fg-3)]">{backfillMsg}</p>
      )}
    </div>
  )
}
