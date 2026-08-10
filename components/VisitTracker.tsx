'use client'
// Invisible beacon: records one page_visits row when the assessment funnel
// loads. Nothing renders. A per-browser key (localStorage) lets the private
// stats view separate unique visitors from raw page loads.
import { useEffect, useRef } from 'react'

function getVisitorKey(): string {
  try {
    const k = 'cn-visitor-key'
    let v = localStorage.getItem(k)
    if (!v) {
      v =
        (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem(k, v)
    }
    return v
  } catch {
    return ''
  }
}

export default function VisitTracker({ path }: { path: string }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return // guard React StrictMode's dev double-invoke
    fired.current = true
    try {
      fetch('/api/track-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, visitorKey: getVisitorKey() }),
        keepalive: true, // still sends if they navigate away immediately
      }).catch(() => {})
    } catch {
      /* best-effort; never disrupt the page */
    }
  }, [path])
  return null
}
