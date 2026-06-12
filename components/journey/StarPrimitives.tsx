'use client'

import { useMemo } from 'react'
import { E_ORDER, E_COLORS } from './journeyModel'

/* Deterministic PRNG so server and client render identical starfields */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function Starfield({ count = 60, seed = 7 }: { count?: number; seed?: number }) {
  const stars = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: count }, () => ({
      top: rand() * 100,
      left: rand() * 100,
      size: rand() * 2 + 1,
      o: rand() * 0.5 + 0.2,
      d: rand() * 3.5 + 2.5,
      delay: rand() * 4,
    }))
  }, [count, seed])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s, i) => (
        <i
          key={i}
          className="jy-star"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            ['--o' as string]: s.o,
            ['--d' as string]: `${s.d}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

/* Four-arc progress ring — one arc per E, lit by progress */
export function StarRing({
  size = 280,
  stroke,
  progress = [1, 0, 0, 0],
  glow = true,
}: {
  size?: number
  stroke?: number
  progress?: number[]
  glow?: boolean
}) {
  const sw = stroke ?? Math.max(2.5, size * 0.028)
  const R = size / 2 - sw - 4
  const C = 2 * Math.PI * R
  const Q = C / 4
  const GAP = Math.max(6, C * 0.024)
  const ARC = Q - GAP
  const c = size / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      {E_ORDER.map((stage, i) => {
        const col = E_COLORS[stage]
        const rot = -90 + i * 90
        const p = Math.max(0, Math.min(1, progress[i] ?? 0))
        const fill = ARC * p
        return (
          <g key={stage} transform={`rotate(${rot} ${c} ${c})`}>
            <circle
              cx={c} cy={c} r={R} fill="none"
              stroke="rgba(246,241,231,.10)" strokeWidth={sw} strokeLinecap="round"
              strokeDasharray={`${ARC} ${C - ARC}`}
            />
            {p > 0 && (
              <circle
                cx={c} cy={c} r={R} fill="none"
                stroke={col} strokeWidth={sw} strokeLinecap="round"
                strokeDasharray={`${fill} ${C - fill}`}
                style={{
                  filter: `drop-shadow(0 0 ${glow ? 7 : 3}px ${col})`,
                  transition: 'stroke-dasharray 1.2s cubic-bezier(.22,.61,.36,1)',
                }}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* Glowing star core — bright center fading to a hazy halo, never a hard disc */
export function StarCore({
  d = 64,
  bright = 0.8,
  color = '#FBF6EC',
  pulse = true,
}: {
  d?: number
  bright?: number
  color?: string
  pulse?: boolean
}) {
  return (
    <span
      className={pulse ? 'jy-breathe' : undefined}
      style={{
        width: d,
        height: d,
        borderRadius: '50%',
        display: 'block',
        background: `radial-gradient(circle, #ffffff 0%, #ffffff 9%, ${color} 20%, rgba(251,246,236,${0.5 * bright}) 44%, rgba(251,246,236,${0.16 * bright}) 66%, rgba(251,246,236,0) 82%)`,
      }}
    />
  )
}

/* The hero: ring + core. Core grows brighter and larger with maturity. */
export function StarBadge({
  size = 280,
  progress = [1, 0, 0, 0],
  glow = true,
}: {
  size?: number
  progress?: number[]
  glow?: boolean
}) {
  const matur = progress.reduce((a, b) => a + b, 0) / progress.length
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <StarRing size={size} progress={progress} glow={glow} />
      </div>
      <StarCore d={size * (0.2 + 0.32 * matur)} bright={0.55 + 0.45 * matur} />
    </div>
  )
}

/* Eight-pointed Bethlehem star used in the intro and celebrations */
export function BethlehemStar({ size = 120, color = '#FBF6EC', className }: { size?: number; color?: string; className?: string }) {
  const c = size / 2
  const spike = (len: number, w: number, rot: number) => (
    <path
      key={rot}
      d={`M ${c} ${c - len} Q ${c + w} ${c} ${c} ${c + len} Q ${c - w} ${c} ${c} ${c - len} Z`}
      fill={color}
      opacity={0.92}
      transform={`rotate(${rot} ${c} ${c})`}
    />
  )
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      <defs>
        <radialGradient id="bstar-halo">
          <stop offset="0%" stopColor={color} stopOpacity="0.9" />
          <stop offset="40%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={c} fill="url(#bstar-halo)" />
      {spike(c * 0.92, size * 0.045, 0)}
      {spike(c * 0.92, size * 0.045, 90)}
      {spike(c * 0.6, size * 0.04, 45)}
      {spike(c * 0.6, size * 0.04, 135)}
      <circle cx={c} cy={c} r={size * 0.05} fill="#fff" />
    </svg>
  )
}
