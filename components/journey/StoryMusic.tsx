'use client'

import { useEffect, useRef, useState } from 'react'

/*
 * Background music for the opening story (intro + tour).
 * Looks for /journey/intro-theme.mp3 — if the file isn't there, renders
 * nothing. Browsers block un-gestured audio, so if autoplay is refused a
 * quiet "Sound on" chip appears; any tap starts the music.
 *
 * Fades are done through the Web Audio API (a GainNode), NOT the audio
 * element's `volume`: on iOS WKWebView `HTMLAudioElement.volume` is a no-op,
 * so a volume ramp there does nothing and the track cuts off abruptly. A
 * GainNode's gain is honored on iOS, so the music truly fades in and out.
 */
const TRACK = '/journey/intro-theme.mp3'
const TARGET_VOLUME = 0.45
const FADE_IN_S = 1.6
const FADE_OUT_S = 1.4

export default function StoryMusic({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeRef = useRef(active)
  activeRef.current = active
  const [available, setAvailable] = useState(true)
  const [blocked, setBlocked] = useState(false)
  const [muted, setMuted] = useState(false)

  // Build the Web Audio graph (audio element → gain → speakers) once. Gain
  // starts silent so playback can fade in. Returns null if Web Audio isn't
  // available, in which case we fall back to the (best-effort) volume prop.
  const ensureGraph = (): GainNode | null => {
    if (gainRef.current) return gainRef.current
    const a = audioRef.current
    if (!a) return null
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      const ctx = new Ctx()
      const src = ctx.createMediaElementSource(a)
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(gain)
      gain.connect(ctx.destination)
      ctxRef.current = ctx
      gainRef.current = gain
      return gain
    } catch {
      return null
    }
  }

  // Ramp the gain to a target over `seconds`; runs onDone just after. Falls
  // back to element.volume when there's no graph.
  const rampTo = (target: number, seconds: number, onDone?: () => void) => {
    if (pauseTimer.current) { clearTimeout(pauseTimer.current); pauseTimer.current = null }
    const ctx = ctxRef.current
    const gain = gainRef.current
    if (ctx && gain) {
      const now = ctx.currentTime
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(target, now + seconds)
    } else if (audioRef.current) {
      // Non-iOS fallback: honored where volume is settable.
      audioRef.current.volume = target
    }
    if (onDone) pauseTimer.current = setTimeout(onDone, seconds * 1000 + 80)
  }

  const startPlayback = () => {
    const a = audioRef.current
    if (!a) return
    const gain = ensureGraph()
    const ctx = ctxRef.current
    const go = () => {
      a.play()
        .then(() => {
          // The story may have ended while play()/resume() resolved — if so, stop.
          if (!activeRef.current) { a.pause(); return }
          // play() can resolve while the AudioContext is still suspended — on
          // desktop the element advances but the graph outputs silence. Only go
          // audible once the context is actually running; otherwise surface the
          // "Sound on" chip so a tap can resume it.
          if (ctx && ctx.state !== 'running') { setBlocked(true); return }
          setBlocked(false)
          if (gain) rampTo(TARGET_VOLUME, FADE_IN_S)
          else a.volume = TARGET_VOLUME
        })
        .catch(() => setBlocked(true))
    }
    // The context starts suspended and only resumes under a user gesture.
    // resume() lands promptly on native and on the Sound-on tap, but off a
    // gesture (the desktop intro auto-opens) Chrome leaves it PENDING forever —
    // which used to strand the story silent with no way to start it. Race a
    // short timeout so go() always runs; its suspended-check then surfaces the
    // chip when resume() hasn't landed.
    if (ctx && ctx.state === 'suspended') {
      Promise.race([
        ctx.resume().catch(() => {}),
        new Promise(res => setTimeout(res, 400)),
      ]).then(go)
    } else {
      go()
    }
  }

  useEffect(() => {
    const a = audioRef.current
    if (!a || !available) return

    let kick: (() => void) | null = null

    if (active && !muted) {
      startPlayback()
      // Bulletproof autoplay: browsers block un-gestured audio, and the small
      // "Sound on" chip is easy to miss — which left desktop web silent. The
      // FIRST gesture anywhere on the page resumes the AudioContext and starts
      // the track; once the context is running this stops re-triggering. Capture
      // phase so it fires even when the story UI swallows the event.
      kick = () => {
        if (!activeRef.current) return
        const ctx = ctxRef.current
        if (!ctx || ctx.state !== 'running') startPlayback()
      }
      document.addEventListener('pointerdown', kick, true)
      document.addEventListener('keydown', kick, true)
    } else {
      // Graceful fade-out at the end of the story (or on mute), then stop.
      // The story page hands back to the app ~1.7s after the tour ends, so
      // this ~1.4s fade reaches silence before the WebView is torn down.
      if (gainRef.current) rampTo(0, FADE_OUT_S, () => a.pause())
      else { a.volume = 0; a.pause() }
    }

    return () => {
      if (pauseTimer.current) clearTimeout(pauseTimer.current)
      if (kick) {
        document.removeEventListener('pointerdown', kick, true)
        document.removeEventListener('keydown', kick, true)
      }
    }
  }, [active, muted, available])

  if (!available) return null

  return (
    <>
      <audio ref={audioRef} src={TRACK} preload="auto" onError={() => setAvailable(false)} />
      {active && (
        <button
          type="button"
          onClick={() => {
            if (blocked) {
              setBlocked(false)
              setMuted(false)
              startPlayback()
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
