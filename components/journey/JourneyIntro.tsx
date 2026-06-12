'use client'

import { useEffect, useMemo, useState } from 'react'
import { Starfield, BethlehemStar } from './StarPrimitives'

/*
 * The opening story, in four movements:
 *  1. promise — Abraham under the night sky, Genesis 15:5
 *  2. named   — Psalm 147:4, the stars wheel past
 *  3. constellation — the church appears as a constellation
 *  4. yours   — one star comes forward and fills the screen, becoming the app
 */
type Phase = 'promise' | 'named' | 'constellation' | 'yours' | 'done'

const PHASE_MS: Record<Exclude<Phase, 'done'>, number> = {
  promise: 5200,
  named: 4200,
  constellation: 4600,
  yours: 3400,
}

const CONSTELLATION_POINTS = [
  { x: 22, y: 30, r: 2.5 },
  { x: 38, y: 18, r: 3.5 },
  { x: 55, y: 26, r: 2.5 },
  { x: 70, y: 16, r: 3 },
  { x: 80, y: 38, r: 2.5 },
  { x: 64, y: 50, r: 4.5 }, // your star
  { x: 44, y: 58, r: 3 },
  { x: 28, y: 70, r: 2.5 },
  { x: 52, y: 78, r: 3 },
]
const CONSTELLATION_LINES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 5], [5, 6], [6, 7], [6, 8],
]

export default function JourneyIntro({ name, onDone }: { name: string; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('promise')

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )

  useEffect(() => {
    if (reducedMotion) {
      onDone()
      return
    }
    const order: Exclude<Phase, 'done'>[] = ['promise', 'named', 'constellation', 'yours']
    const idx = order.indexOf(phase as Exclude<Phase, 'done'>)
    if (idx === -1) return
    const t = setTimeout(() => {
      const next = order[idx + 1]
      if (next) setPhase(next)
      else {
        setPhase('done')
        onDone()
      }
    }, PHASE_MS[order[idx] as Exclude<Phase, 'done'>])
    return () => clearTimeout(t)
  }, [phase, onDone, reducedMotion])

  if (phase === 'done' || reducedMotion) return null

  const firstName = name.split(' ')[0]

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[var(--void)]">
      {/* deep-space wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, rgba(46,85,230,.16) 0%, rgba(11,16,39,.0) 55%), radial-gradient(80% 60% at 70% 80%, rgba(240,114,159,.07) 0%, rgba(11,16,39,0) 60%)',
        }}
      />

      {/* starfield that slowly zooms through the phases */}
      <div
        className="absolute inset-0 transition-transform duration-[4500ms] ease-out"
        style={{
          transform:
            phase === 'promise' ? 'scale(1)' : phase === 'named' ? 'scale(1.5)' : phase === 'constellation' ? 'scale(2.1)' : 'scale(3.2)',
          opacity: phase === 'yours' ? 0.35 : 1,
          transition: 'transform 4.5s cubic-bezier(.22,.61,.36,1), opacity 2s ease',
        }}
      >
        <Starfield count={110} seed={42} />
        <Starfield count={60} seed={11} />
      </div>

      {/* movement 1 — the promise */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center transition-opacity duration-1000"
        style={{ opacity: phase === 'promise' ? 1 : 0, pointerEvents: 'none' }}
      >
        <p
          className="max-w-xl text-2xl leading-relaxed italic sm:text-3xl"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
        >
          &ldquo;Look up at the sky and count the stars&thinsp;—&thinsp;if indeed you can count them&hellip;
          so shall your offspring be.&rdquo;
        </p>
        <p className="cn-label mt-6">Genesis 15:5</p>
      </div>

      {/* movement 2 — named */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center transition-opacity duration-1000"
        style={{ opacity: phase === 'named' ? 1 : 0, pointerEvents: 'none' }}
      >
        <p
          className="max-w-xl text-2xl leading-relaxed italic sm:text-3xl"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
        >
          &ldquo;He determines the number of the stars and calls them each by name.&rdquo;
        </p>
        <p className="cn-label mt-6">Psalm 147:4</p>
      </div>

      {/* movement 3 — the constellation */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-1000"
        style={{ opacity: phase === 'constellation' ? 1 : 0, pointerEvents: 'none' }}
      >
        <svg viewBox="0 0 100 92" className="w-full max-w-lg px-6">
          {CONSTELLATION_LINES.map(([a, b], i) => (
            <line
              key={i}
              x1={CONSTELLATION_POINTS[a].x} y1={CONSTELLATION_POINTS[a].y}
              x2={CONSTELLATION_POINTS[b].x} y2={CONSTELLATION_POINTS[b].y}
              stroke="rgba(246,241,231,.22)" strokeWidth="0.3"
              className="jy-line-draw"
              style={{ animationDelay: `${0.4 + i * 0.18}s` }}
            />
          ))}
          {CONSTELLATION_POINTS.map((p, i) => (
            <circle
              key={i} cx={p.x} cy={p.y} r={p.r / 2.2}
              fill={i === 5 ? '#FBF6EC' : 'rgba(246,241,231,.85)'}
              className="jy-twinkle-svg"
              style={{ animationDelay: `${i * 0.25}s`, filter: i === 5 ? 'drop-shadow(0 0 3px #FBF6EC)' : undefined }}
            />
          ))}
        </svg>
        <p
          className="mt-2 px-8 text-center text-xl italic sm:text-2xl"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
        >
          Your church is a constellation of stars.
        </p>
      </div>

      {/* movement 4 — your star */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-1000"
        style={{ opacity: phase === 'yours' ? 1 : 0, pointerEvents: 'none' }}
      >
        <div className={phase === 'yours' ? 'jy-star-arrive' : ''}>
          <BethlehemStar size={170} />
        </div>
        <p
          className="mt-4 text-center text-2xl italic sm:text-3xl"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
        >
          And this one, {firstName}, is yours.
        </p>
      </div>

      {/* skip */}
      <button
        type="button"
        onClick={() => {
          setPhase('done')
          onDone()
        }}
        className="absolute right-5 top-5 z-10 rounded-full border border-[var(--line-2)] bg-[rgba(11,16,39,.6)] px-4 py-1.5 text-xs font-semibold text-[var(--fg-2)] backdrop-blur-md transition-colors hover:text-[var(--fg-1)]"
      >
        Skip
      </button>
    </div>
  )
}
