'use client'

import { useEffect, useRef, useState } from 'react'

/*
 * Background music for the opening story (intro + tour).
 * Looks for /journey/intro-theme.mp3 — if the file isn't there, renders
 * nothing. Browsers block un-gestured audio, so if autoplay is refused a
 * quiet "Sound on" chip appears; any tap starts the music. Volume ramps
 * in and out so the music never starts or stops abruptly.
 */
const TRACK = '/journey/intro-theme.mp3'
const TARGET_VOLUME = 0.45

export default function StoryMusic({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [available, setAvailable] = useState(true)
  const [blocked, setBlocked] = useState(false)
  const [muted, setMuted] = useState(false)

  const fadeTo = (target: number, onDone?: () => void) => {
    const a = audioRef.current
    if (!a) return
    if (fadeRef.current) clearInterval(fadeRef.current)
    fadeRef.current = setInterval(() => {
      const next = target > a.volume ? Math.min(target, a.volume + 0.03) : Math.max(target, a.volume - 0.03)
      a.volume = next
      if (next === target) {
        if (fadeRef.current) clearInterval(fadeRef.current)
        onDone?.()
      }
    }, 80)
  }

  useEffect(() => {
    const a = audioRef.current
    if (!a || !available) return

    if (active && !muted) {
      a.volume = a.paused ? 0 : a.volume
      a.play()
        .then(() => {
          setBlocked(false)
          fadeTo(TARGET_VOLUME)
        })
        .catch(() => setBlocked(true))
    } else {
      fadeTo(0, () => a.pause())
    }

    return () => {
      if (fadeRef.current) clearInterval(fadeRef.current)
    }
  }, [active, muted, available])

  if (!available) return null

  return (
    <>
      <audio ref={audioRef} src={TRACK} loop preload="auto" onError={() => setAvailable(false)} />
      {active && (
        <button
          type="button"
          onClick={() => {
            if (blocked) {
              setBlocked(false)
              setMuted(false)
              const a = audioRef.current
              if (a) {
                a.volume = 0
                a.play().then(() => fadeTo(TARGET_VOLUME)).catch(() => setBlocked(true))
              }
            } else {
              setMuted(m => !m)
            }
          }}
          className="fixed left-5 top-5 z-[110] flex items-center gap-1.5 rounded-full border border-[var(--line-2)] bg-[rgba(11,16,39,.6)] px-4 py-1.5 text-xs font-semibold text-[var(--fg-2)] backdrop-blur-md transition-colors hover:text-[var(--fg-1)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            {!(blocked || muted) && <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />}
            {(blocked || muted) && <line x1="23" y1="9" x2="17" y2="15" />}
            {(blocked || muted) && <line x1="17" y1="9" x2="23" y2="15" />}
          </svg>
          {blocked ? 'Sound on' : muted ? 'Unmute' : 'Mute'}
        </button>
      )}
    </>
  )
}
