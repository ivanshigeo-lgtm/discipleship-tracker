'use client'

import type { Badge } from './journeyModel'

/*
 * Milestone artwork, per the Constellation design system (design-system/):
 *  · GEMS    — hexagonal, stage-colored, carrying a line-icon emblem.
 *  · BADGES  — gold "precious/earned" medallions holding the GBM flame or a
 *              Lucide-style line icon.
 * No emoji — line icons (inlined Lucide paths) + the brand flame only.
 */

// ---- Inlined Lucide line-icon paths (stroke, 24×24, round caps) ----
const ICONS: Record<string, React.ReactNode> = {
  'book-open': <><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></>,
  flame: <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
  coffee: <><path d="M10 2v2" /><path d="M14 2v2" /><path d="M6 2v2" /><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" /></>,
  compass: <><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  'pen-line': <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  sunrise: <><path d="M12 2v8" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" /><path d="m8 6 4-4 4 4" /><path d="M16 18a4 4 0 0 0-8 0" /></>,
  droplets: <><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 4.7 7 2.75c-.29 1.95-1.14 3.34-2.29 4.31S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" /><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" /></>,
  footprints: <><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" /><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" /><path d="M16 17h4" /><path d="M4 13h4" /></>,
  church: <><path d="m18 7 4 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9l4-2" /><path d="M14 22v-4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v4" /><path d="M18 22V5l-6-3-6 3v17" /><path d="M12 7v5" /><path d="M10 9h4" /></>,
  'book-marked': <><path d="M10 2v8l3-3 3 3V2" /><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" /></>,
  mic: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></>,
  sparkles: <><path d="M9.94 14.06A2 2 0 0 0 8.5 12.6l-5.1-1.32a.5.5 0 0 1 0-.96L8.5 9a2 2 0 0 0 1.44-1.44l1.32-5.1a.5.5 0 0 1 .96 0l1.32 5.1A2 2 0 0 0 15 9l5.1 1.32a.5.5 0 0 1 0 .96L15 12.6a2 2 0 0 0-1.44 1.46l-1.32 5.1a.5.5 0 0 1-.96 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></>,
}

export function LineIcon({ name, size = 22, color = 'currentColor', strokeWidth = 2 }: { name: string; size?: number; color?: string; strokeWidth?: number }) {
  // The cross is a filled mark, not a stroked line icon.
  if (name === 'cross') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
        <rect x="9.6" y="2" width="4.8" height="20" rx="2" />
        <rect x="3" y="8.6" width="18" height="4.8" rx="2" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name] ?? ICONS['flame']}
    </svg>
  )
}

const GEM_CLIP = 'polygon(50% 0, 100% 30%, 100% 70%, 50% 100%, 0 70%, 0 30%)'

// A darker tint of the stage color for the emblem sitting on the bright gem.
const EMBLEM_TINT: Record<string, string> = {
  Establish: '#0A4A43',
  Equip: '#102C66',
  Empower: '#6E1238',
  Engage: '#5A3A00',
}

export function StageGem({ badge, size = 56 }: { badge: Badge; size?: number }) {
  const earned = badge.earned
  const tint = badge.stage ? EMBLEM_TINT[badge.stage] : '#0A4A43'
  return (
    <div
      style={{
        width: size,
        height: Math.round(size * 1.14),
        clipPath: GEM_CLIP,
        display: 'grid',
        placeItems: 'center',
        position: 'relative',
        background: earned ? `linear-gradient(145deg, ${badge.color}, ${badge.color})` : 'var(--indigo-3)',
        boxShadow: earned ? `0 0 22px -4px ${badge.color}` : 'none',
        opacity: earned ? 1 : 0.55,
      }}
    >
      {earned && <span style={{ position: 'absolute', inset: 0, clipPath: 'polygon(50% 0, 100% 30%, 50% 50%, 0 30%)', background: 'rgba(255,255,255,.32)' }} />}
      <span style={{ position: 'relative', zIndex: 2, display: 'flex' }}>
        <LineIcon name={badge.icon} size={Math.round(size * 0.4)} color={earned ? tint : 'var(--fg-3)'} strokeWidth={2.2} />
      </span>
    </div>
  )
}

export function Medallion({ badge, size = 56 }: { badge: Badge; size?: number }) {
  const earned = badge.earned
  const isFlame = badge.icon === 'flame'
  if (!earned) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--indigo-3)', border: '1px dashed var(--line-2)' }}>
        <LineIcon name={badge.icon} size={Math.round(size * 0.42)} color="var(--fg-3)" />
      </div>
    )
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: 'radial-gradient(circle at 38% 32%, #FCE8C0, #E0A94A 70%)',
        boxShadow: '0 0 0 1px rgba(242,200,121,.30), 0 0 30px -6px rgba(242,200,121,.6), inset 0 -4px 10px rgba(120,70,0,.35)',
      }}
    >
      {isFlame ? (
        <img src="/gbm-flame-white.png" alt="" style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }} />
      ) : (
        <LineIcon name={badge.icon} size={Math.round(size * 0.44)} color="#5A3A00" strokeWidth={2.2} />
      )}
    </div>
  )
}

// Single milestone, dispatched by kind, with its label beneath.
export function MilestoneBadge({ badge, size = 56 }: { badge: Badge; size?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: size + 24 }}>
      {badge.kind === 'gem' ? <StageGem badge={badge} size={size} /> : <Medallion badge={badge} size={size} />}
      <span className="mt-2 text-center text-[10.5px] leading-tight" style={{ color: badge.earned ? 'var(--fg-2)' : 'var(--fg-3)' }}>
        {badge.title}
      </span>
    </div>
  )
}
