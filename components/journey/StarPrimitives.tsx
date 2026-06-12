'use client'

import { useId, useMemo } from 'react'
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

/*
 * Four-arc progress ring — one arc per E, lit by progress.
 * Quadrants follow the journey clockwise from the top-left:
 * Engage TL → Establish TR → Equip BR → Empower BL.
 * `emphasis` magnifies one quadrant's arc (hovered state).
 */
export function StarRing({
  size = 280,
  stroke,
  progress = [1, 0, 0, 0],
  glow = true,
  emphasis = null,
}: {
  size?: number
  stroke?: number
  progress?: number[]
  glow?: boolean
  emphasis?: number | null
}) {
  const sw = stroke ?? Math.max(2.5, size * 0.028)
  const R = size / 2 - sw - 6
  const C = 2 * Math.PI * R
  const Q = C / 4
  const GAP = Math.max(6, C * 0.024)
  const ARC = Q - GAP
  const c = size / 2

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', overflow: 'visible' }}>
      {E_ORDER.map((stage, i) => {
        const col = E_COLORS[stage]
        const rot = -180 + i * 90
        const p = Math.max(0, Math.min(1, progress[i] ?? 0))
        const fill = ARC * p
        const hot = emphasis === i
        const dimmed = emphasis !== null && !hot
        const w = hot ? sw * 1.7 : sw
        return (
          <g key={stage} transform={`rotate(${rot} ${c} ${c})`} style={{ opacity: dimmed ? 0.45 : 1, transition: 'opacity .35s ease' }}>
            <circle
              cx={c} cy={c} r={R} fill="none"
              stroke={hot ? `${col}33` : 'rgba(246,241,231,.10)'} strokeWidth={w} strokeLinecap="round"
              strokeDasharray={`${ARC} ${C - ARC}`}
              style={{ transition: 'stroke-width .35s ease, stroke .35s ease' }}
            />
            {p > 0 && (
              <circle
                cx={c} cy={c} r={R} fill="none"
                stroke={col} strokeWidth={w} strokeLinecap="round"
                strokeDasharray={`${fill} ${C - fill}`}
                style={{
                  filter: `drop-shadow(0 0 ${hot ? 12 : glow ? 7 : 3}px ${col})`,
                  transition: 'stroke-dasharray 1.2s cubic-bezier(.22,.61,.36,1), stroke-width .35s ease',
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

/*
 * The 8-point tapered star from the constellation map (MyCircleMap),
 * parameterized so the same star renders in the intro, the map, and the hero.
 * `size` is the full spike span; `maturity` (0..1) scales core and glow.
 */
export function SpikedStar({
  size = 200,
  color = '#FFB040',
  maturity = 0.6,
  pulse = false,
  className,
}: {
  size?: number
  color?: string
  maturity?: number
  pulse?: boolean
  className?: string
}) {
  const uid = useId().replace(/[:]/g, '')
  const c = size / 2
  const mainSpike = c * (0.62 + 0.3 * maturity)
  const diagSpike = mainSpike * 0.55
  const coreSize = size * (0.07 + 0.06 * maturity)
  const w = Math.max(1.2, size * 0.012)
  const dirs = [
    { id: 'up', points: `${c},${c - mainSpike} ${c - w},${c} ${c + w},${c}`, g: [`50%`, `0%`, `50%`, `100%`] },
    { id: 'down', points: `${c},${c + mainSpike} ${c - w},${c} ${c + w},${c}`, g: [`50%`, `100%`, `50%`, `0%`] },
    { id: 'left', points: `${c - mainSpike},${c} ${c},${c - w} ${c},${c + w}`, g: [`0%`, `50%`, `100%`, `50%`] },
    { id: 'right', points: `${c + mainSpike},${c} ${c},${c - w} ${c},${c + w}`, g: [`100%`, `50%`, `0%`, `50%`] },
  ]
  const dw = w * 0.6
  const diag = [
    [c - diagSpike * 0.707, c - diagSpike * 0.707, c - dw, c + dw, c + dw, c - dw],
    [c + diagSpike * 0.707, c - diagSpike * 0.707, c - dw, c - dw, c + dw, c + dw],
    [c - diagSpike * 0.707, c + diagSpike * 0.707, c + dw, c + dw, c - dw, c - dw],
    [c + diagSpike * 0.707, c + diagSpike * 0.707, c + dw, c - dw, c - dw, c + dw],
  ]

  return (
    <div className={`relative ${pulse ? 'jy-breathe' : ''} ${className ?? ''}`} style={{ width: size, height: size }}>
      {/* halo */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: coreSize * (4 + 3 * maturity),
          height: coreSize * (4 + 3 * maturity),
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}${maturity > 0.7 ? '60' : '45'} 0%, ${color}1d 45%, transparent 70%)`,
        }}
      />
      <svg className="absolute inset-0" width={size} height={size}>
        <defs>
          {dirs.map(d => (
            <linearGradient key={d.id} id={`${uid}-${d.id}`} x1={d.g[0]} y1={d.g[1]} x2={d.g[2]} y2={d.g[3]}>
              <stop offset="0%" stopColor={color} stopOpacity="0.1" />
              <stop offset="70%" stopColor={color} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
            </linearGradient>
          ))}
        </defs>
        {dirs.map(d => (
          <polygon key={d.id} points={d.points} fill={`url(#${uid}-${d.id})`} />
        ))}
        {diag.map((p, i) => (
          <polygon key={i} points={`${p[0]},${p[1]} ${p[2]},${p[3]} ${p[4]},${p[5]}`} fill={color} fillOpacity="0.55" />
        ))}
      </svg>
      {/* bright core */}
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: coreSize,
          height: coreSize,
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle at 40% 40%, #FFFFFF 0%, #FFFFFF 30%, ${color} 100%)`,
          boxShadow: `0 0 ${coreSize * 0.8}px #FFFFFF, 0 0 ${coreSize * 1.5}px ${color}, 0 0 ${coreSize * (2 + 2 * maturity)}px ${color}80`,
        }}
      />
    </div>
  )
}

/*
 * The hero: ring + the person's spiked star. The star grows, brightens,
 * and carries the color of the stage they're walking through.
 */
export function StarBadge({
  size = 280,
  progress = [1, 0, 0, 0],
  glow = true,
  color = '#FBF6EC',
  emphasis = null,
}: {
  size?: number
  progress?: number[]
  glow?: boolean
  color?: string
  emphasis?: number | null
}) {
  const matur = progress.reduce((a, b) => a + b, 0) / progress.length
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'grid', placeItems: 'center' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <StarRing size={size} progress={progress} glow={glow} emphasis={emphasis} />
      </div>
      <SpikedStar size={size * 0.66} color={color} maturity={matur} pulse />
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
