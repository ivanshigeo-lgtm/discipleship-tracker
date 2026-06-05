'use client'

import type { ReactNode } from 'react'
import type { Stage } from '../types/database'

type MeetingCounts = {
  Engage: { today: number; week: number; names: string[] }
  Establish: { today: number; week: number; names: string[] }
  Equip: { today: number; week: number; names: string[] }
  Empower: { today: number; week: number; names: string[] }
  'Grace Groups': { today: number; week: number; names: string[] }
}

interface MeetingBadgesProps {
  counts: MeetingCounts
}

const STAGE_COLORS: Record<string, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
  'Grace Groups': '#9B8AFB',
}

// Coffee cup icon for Engage
const CoffeeIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
    <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
    <line x1="6" y1="2" x2="6" y2="4" />
    <line x1="10" y1="2" x2="10" y2="4" />
    <line x1="14" y1="2" x2="14" y2="4" />
  </svg>
)

// Open book icon for Establish
const BookIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
)

// Flame/torch icon for Equip
const FlameIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

// Cross/plus icon for Empower
const CrossIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

// People icon for Grace Groups
const GroupIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const STAGE_ICONS: Record<string, ({ color }: { color: string }) => ReactNode> = {
  Engage: CoffeeIcon,
  Establish: BookIcon,
  Equip: FlameIcon,
  Empower: CrossIcon,
  'Grace Groups': GroupIcon,
}

function GemBadge({ label, today, week, names, color }: { label: string; today: number; week: number; names: string[]; color: string }) {
  const Icon = STAGE_ICONS[label === 'Groups' ? 'Grace Groups' : label]
  const uniqueNames = [...new Set(names)]

  return (
    <div className="group relative flex flex-col items-center gap-1">
      <div className="relative">
        {/* Hexagon gem shape */}
        <svg width="44" height="50" viewBox="0 0 44 50" className="drop-shadow-sm">
          <defs>
            <linearGradient id={`grad-${label}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <path
            d="M22 2 L40 13 L40 37 L22 48 L4 37 L4 13 Z"
            fill={`url(#grad-${label})`}
            stroke={color}
            strokeWidth="1.5"
          />
        </svg>
        {/* Icon in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          {Icon && <Icon color={color} />}
        </div>
        {/* Today's count badge (bottom right) */}
        <div
          className="absolute -bottom-1 -right-1 flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[8px] font-bold"
          style={{ background: 'var(--indigo-2)', border: `1.5px solid ${color}`, color }}
        >
          {today}<span className="font-normal opacity-70">today</span>
        </div>
        {/* Week count badge (top right) */}
        <div
          className="absolute -right-1 -top-1 flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[8px] font-bold"
          style={{ background: color, color: 'var(--void)' }}
        >
          {week}<span className="font-normal opacity-70">wk</span>
        </div>
      </div>
      <span className="text-[9px] text-[var(--fg-3)]">{label}</span>

      {/* Hover tooltip */}
      {uniqueNames.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-max -translate-x-1/2 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 shadow-xl group-hover:block">
          <div className="text-[10px] font-semibold" style={{ color }}>{label} this week</div>
          <ul className="mt-1 space-y-0.5">
            {uniqueNames.map((name, i) => (
              <li key={i} className="text-xs text-[var(--fg-1)]">• {name}</li>
            ))}
          </ul>
          <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-[var(--line-2)] bg-[var(--indigo-2)]" />
        </div>
      )}
    </div>
  )
}

export default function MeetingBadges({ counts }: MeetingBadgesProps) {
  const stages: (keyof MeetingCounts)[] = ['Engage', 'Establish', 'Equip', 'Empower', 'Grace Groups']

  return (
    <div className="flex items-center gap-2">
      {stages.map(stage => (
        <GemBadge
          key={stage}
          label={stage === 'Grace Groups' ? 'Groups' : stage}
          today={counts[stage].today}
          week={counts[stage].week}
          names={counts[stage].names}
          color={STAGE_COLORS[stage]}
        />
      ))}
    </div>
  )
}

export type { MeetingCounts }
