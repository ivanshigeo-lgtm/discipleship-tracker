'use client'

import { useState } from 'react'

type CurriculumType = 'One2One' | 'Making Disciples' | 'Coffee' | 'Church Community' | 'Empowering Leaders'

type BadgeConfig = {
  type: CurriculumType
  label: string
  color: string
  bgColor: string
  icon: React.ReactNode
}

const CoffeeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
    <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
    <line x1="6" y1="2" x2="6" y2="4" />
    <line x1="10" y1="2" x2="10" y2="4" />
    <line x1="14" y1="2" x2="14" y2="4" />
  </svg>
)

const BookIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
)

const FlameIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
)

const CrossIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="4" y1="8" x2="20" y2="8" />
  </svg>
)

const ChurchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
    <path d="M18 22V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16" />
    <path d="M2 22h20" />
    <path d="M12 2v4" />
    <path d="M10 4h4" />
    <path d="M10 14h4" />
    <path d="M12 14v4" />
  </svg>
)

const BADGE_CONFIGS: BadgeConfig[] = [
  {
    type: 'Coffee',
    label: 'Coffee',
    color: '#F4B650',
    bgColor: 'rgba(244,182,80,.15)',
    icon: <CoffeeIcon />,
  },
  {
    type: 'One2One',
    label: 'One2One',
    color: '#36D6C3',
    bgColor: 'rgba(54,214,195,.15)',
    icon: <BookIcon />,
  },
  {
    type: 'Church Community',
    label: 'Church',
    color: '#36D6C3',
    bgColor: 'rgba(54,214,195,.15)',
    icon: <ChurchIcon />,
  },
  {
    type: 'Making Disciples',
    label: 'Disciples',
    color: '#5B8DF7',
    bgColor: 'rgba(91,141,247,.15)',
    icon: <FlameIcon />,
  },
  {
    type: 'Empowering Leaders',
    label: 'Empower',
    color: '#F0729F',
    bgColor: 'rgba(240,114,159,.15)',
    icon: <CrossIcon />,
  },
]

function HexBadge({
  config,
  count,
  names,
}: {
  config: BadgeConfig
  count: number
  names: string[]
}) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (count === 0) return null

  return (
    <div
      className="relative flex flex-col items-center gap-1"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center"
        style={{ color: config.color }}
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <polygon
            points="50,2 95,25 95,75 50,98 5,75 5,25"
            fill={config.bgColor}
            stroke={config.color}
            strokeWidth="3"
          />
        </svg>
        <div className="relative z-10">{config.icon}</div>
        <div
          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
          style={{ background: config.color, color: 'var(--void)' }}
        >
          {count > 99 ? '99+' : count}
        </div>
      </div>
      <span className="text-[10px] font-medium" style={{ color: config.color }}>
        {config.label}
      </span>

      {showTooltip && names.length > 0 && (
        <div
          className="absolute top-full z-50 mt-2 min-w-[140px] rounded-lg border p-2 shadow-lg"
          style={{
            background: 'var(--indigo)',
            borderColor: config.color,
          }}
        >
          <div className="mb-1 text-[10px] font-semibold" style={{ color: config.color }}>
            {config.type} Completed
          </div>
          <div className="space-y-0.5">
            {names.map((name, i) => (
              <div key={i} className="text-xs text-[var(--fg-1)]">
                {name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export type CurriculumCounts = Record<CurriculumType, number>
export type CurriculumNames = Record<CurriculumType, string[]>

export default function EngagementBadges({
  completedCounts,
  completedNames,
}: {
  completedCounts: CurriculumCounts
  completedNames: CurriculumNames
}) {
  const hasAnyCompleted = Object.values(completedCounts).some(count => count > 0)

  if (!hasAnyCompleted) return null

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3">
        {BADGE_CONFIGS.map(config => (
          <HexBadge
            key={config.type}
            config={config}
            count={completedCounts[config.type] || 0}
            names={completedNames[config.type] || []}
          />
        ))}
      </div>
    </div>
  )
}

export { BADGE_CONFIGS }
export type { CurriculumType }
