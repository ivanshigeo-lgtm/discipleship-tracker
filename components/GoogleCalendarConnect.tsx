'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function GoogleCalendarConnect() {
  const { profile } = useAuth()
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) {
      setLoading(false)
      return
    }

    const checkStatus = async () => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        const res = await fetch(`/api/auth/google/status?personId=${profile.id}`, {
          signal: controller.signal
        })
        clearTimeout(timeout)

        const data = await res.json()
        setConnected(data.connected)
      } catch (err) {
        console.error('Error checking Google Calendar status:', err)
      } finally {
        setLoading(false)
      }
    }

    checkStatus()
  }, [profile])

  // Check for success/error in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_connected') === 'true') {
      setConnected(true)
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  if (!profile || loading) return null

  const handleConnect = () => {
    window.location.href = `/api/auth/google?personId=${profile.id}`
  }

  return (
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

      {connected ? (
        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
          Connected
        </span>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          className="rounded-full bg-[var(--gbm-cobalt-bright)] px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          Connect
        </button>
      )}
    </div>
  )
}
