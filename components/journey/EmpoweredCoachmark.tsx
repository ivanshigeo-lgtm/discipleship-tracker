'use client'

import { useEffect, useState } from 'react'

// Shown once, the first time someone lands on My Journey as an empowered coach:
// a little pointer up at the "My Constellations" toggle, so they know the coach
// dashboard is now theirs. It bobs to draw the eye, then fades away.
export default function EmpoweredCoachmark({ personId, enabled, onActiveChange }: { personId: string; enabled: boolean; onActiveChange?: (active: boolean) => void }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!enabled) return
    // Once per sign-in: sessionStorage resets each new session, and sign-out
    // clears it, so this re-appears every time you sign in and land here.
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

  // Let the page glow the toggle while the coachmark is up.
  useEffect(() => { onActiveChange?.(show) }, [show, onActiveChange])

  if (!show) return null

  return (
    <div className="absolute left-1/2 top-full z-[90] mt-2 w-max -translate-x-1/2">
      <div className="jy-coach-bob flex flex-col items-center">
        {/* arrow pointing up at the toggle */}
        <div
          className="h-0 w-0"
          style={{ borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '9px solid var(--empower)' }}
        />
        <div
          className="rounded-xl border px-4 py-2.5 text-center"
          style={{
            borderColor: 'var(--empower)',
            background: '#0E1430',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: '0 8px 28px -4px rgba(0,0,0,.7), 0 0 28px -6px rgba(240,114,159,.6)',
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
    </div>
  )
}
