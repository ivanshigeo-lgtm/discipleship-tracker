'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Shown once per sign-in, the first time someone lands on My Journey as an
// empowered coach: a pointer up at the "My Constellations" toggle so they know
// the coach dashboard is now theirs. Rendered FIXED at the viewport (anchored to
// the toggle's real position) so the page's star text never renders over it.
export default function EmpoweredCoachmark({ personId, enabled, onActiveChange }: { personId: string; enabled: boolean; onActiveChange?: (active: boolean) => void }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!enabled) return
    const key = `empowered-coachmark-${personId}`
    if (sessionStorage.getItem(key)) return
    const t = setTimeout(() => {
      setShow(true)
      sessionStorage.setItem(key, '1')
    }, 900)
    return () => clearTimeout(t)
  }, [enabled, personId])

  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 11000)
    return () => clearTimeout(t)
  }, [show])

  // Track the toggle's position so the pointer always sits right under it.
  useEffect(() => {
    if (!show) return
    const measure = () => {
      const el = document.getElementById('my-constellations-toggle')
      if (el) {
        const r = el.getBoundingClientRect()
        setPos({ x: r.left + r.width / 2, y: r.bottom + 10 })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [show])

  useEffect(() => { onActiveChange?.(show) }, [show, onActiveChange])

  if (!show || !pos || !mounted) return null

  // Portal to <body> so no transformed/positioned ancestor in the header can
  // trap it behind the page's star content.
  return createPortal(
    <div className="fixed z-[300] -translate-x-1/2" style={{ left: pos.x, top: pos.y }}>
      <div className="jy-coach-bob flex flex-col items-center">
        {/* arrow pointing up at the toggle */}
        <div
          className="h-0 w-0"
          style={{ borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '9px solid var(--empower)' }}
        />
        <div
          className="max-w-[300px] rounded-xl border px-4 py-2.5 text-center"
          style={{
            borderColor: 'var(--empower)',
            backgroundColor: '#0B1024',
            boxShadow: '0 12px 32px -6px rgba(0,0,0,.85), 0 0 24px -8px rgba(240,114,159,.55)',
          }}
        >
          <p className="text-xs font-bold tracking-wide" style={{ color: 'var(--empower)' }}>✦ You&rsquo;re empowered</p>
          <p className="mt-0.5 text-xs text-[var(--fg-1)]">
            Tap <span className="font-semibold">My Constellations</span> to open your coach dashboard.
          </p>
          <button
            type="button"
            onClick={() => setShow(false)}
            className="mt-1.5 text-[10px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
