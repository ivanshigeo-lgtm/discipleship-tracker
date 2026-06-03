import type { Stage } from '../types/database'

type BadgeConfig = {
  level: number
  title: string
  character: string
  icon: string
  colors: {
    ring: string
    from: string
    to: string
    accent: string
    text: string
    glow: string
  }
}

type StageLevelBadgeProps = {
  stage: Stage
  size?: 'sm' | 'md'
  showSubtitle?: boolean
}

const badgeConfig: Record<Stage, BadgeConfig> = {
  Engage: {
    level: 1,
    title: 'Engaged',
    character: 'First Connection',
    icon: '🌱',
    colors: {
      ring: '#86efac',
      from: '#f0fdf4',
      to: '#dcfce7',
      accent: '#16a34a',
      text: 'text-emerald-900',
      glow: 'shadow-emerald-100',
    },
  },
  Establish: {
    level: 2,
    title: 'Established',
    character: 'Rooted Disciple',
    icon: '📖',
    colors: {
      ring: '#92400e',
      from: '#eff6ff',
      to: '#dbeafe',
      accent: '#2563eb',
      text: 'text-blue-900',
      glow: 'shadow-blue-100',
    },
  },
  Equip: {
    level: 3,
    title: 'Equipped',
    character: 'Torchbearer',
    icon: '🔥',
    colors: {
      ring: '#fcd34d',
      from: '#fffbeb',
      to: '#fef3c7',
      accent: '#d97706',
      text: 'text-amber-900',
      glow: 'shadow-amber-100',
    },
  },
  Empower: {
    level: 4,
    title: 'Empowered',
    character: 'Released Leader',
    icon: '✝',
    colors: {
      ring: '#111827',
      from: '#f5f3ff',
      to: '#ede9fe',
      accent: '#7c3aed',
      text: 'text-violet-900',
      glow: 'shadow-violet-100',
    },
  },
}

function StageIcon({ stage, color }: { stage: Stage; color: string }) {
  if (stage === 'Engage') {
    return (
      <g>
        <path d="M24 38V25" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M24 27c-7 0-11-4-11-10 7 0 11 4 11 10Z" fill={color} opacity="0.9" />
        <path d="M24 29c7 0 11-4 11-10-7 0-11 4-11 10Z" fill={color} opacity="0.72" />
        <path d="M18 40c2.5-3.5 9.5-3.5 12 0" stroke={color} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.9" />
      </g>
    )
  }

  if (stage === 'Establish') {
    return (
      <g>
        <path d="M11 18c5-3 10-3 13 1v20c-3-4-8-4-13-1V18Z" fill="white" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M37 18c-5-3-10-3-13 1v20c3-4 8-4 13-1V18Z" fill="white" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M24 19v20M15 23h5M15 28h5M28 23h5M28 28h5" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      </g>
    )
  }

  if (stage === 'Equip') {
    return (
      <g>
        <defs>
          <linearGradient id="equip-torch-metal" x1="18" x2="31" y1="18" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#fff7ed" />
            <stop offset="0.18" stopColor="#fef3c7" />
            <stop offset="0.42" stopColor="#d97706" />
            <stop offset="0.68" stopColor="#92400e" />
            <stop offset="1" stopColor="#451a03" />
          </linearGradient>
          <linearGradient id="equip-torch-handle" x1="19" x2="30" y1="28" y2="45" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f5f5f4" />
            <stop offset="0.32" stopColor="#a8a29e" />
            <stop offset="0.58" stopColor="#57534e" />
            <stop offset="1" stopColor="#1c1917" />
          </linearGradient>
          <radialGradient id="equip-flame-outer" cx="50%" cy="42%" r="64%">
            <stop offset="0" stopColor="#fff7ad" />
            <stop offset="0.2" stopColor="#fde047" />
            <stop offset="0.52" stopColor="#f97316" />
            <stop offset="1" stopColor="#b91c1c" />
          </radialGradient>
          <radialGradient id="equip-flame-inner" cx="50%" cy="44%" r="58%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.32" stopColor="#fef3c7" />
            <stop offset="0.72" stopColor="#fb923c" />
            <stop offset="1" stopColor="#ea580c" />
          </radialGradient>
          <filter id="equip-torch-glow" x="-45%" y="-45%" width="190%" height="190%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#fb923c" floodOpacity="0.8" />
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#7c2d12" floodOpacity="0.45" />
          </filter>
        </defs>
        <g filter="url(#equip-torch-glow)">
          <path
            d="M24 7c4.7 4.5 7.1 8.7 6.9 12.5-.2 3.7-3.1 6.5-6.9 6.5s-6.7-2.8-6.9-6.5C16.9 15.7 19.3 11.5 24 7Z"
            fill="url(#equip-flame-outer)"
            stroke="#fed7aa"
            strokeWidth="1"
          />
          <path
            d="M24.4 13.2c2.2 3 3.4 5.3 3.3 7.2-.1 2-1.6 3.5-3.7 3.5s-3.5-1.5-3.6-3.4c-.1-1.9 1.1-4.1 4-7.3Z"
            fill="url(#equip-flame-inner)"
            opacity="0.95"
          />
          <path d="M20 26.5h8.2l-1.5 4.8h-5.2L20 26.5Z" fill="url(#equip-torch-metal)" stroke="#78350f" strokeWidth="0.9" />
          <path d="M20.3 31.2h7.4l-1.3 12.2c-1.4.9-3.4.9-4.8 0L20.3 31.2Z" fill="url(#equip-torch-handle)" stroke="#292524" strokeWidth="0.9" />
          <path d="M21.1 33.6h5.8M21.4 36.6h5.2M21.7 39.6h4.6" stroke="#fef3c7" strokeWidth="0.7" strokeLinecap="round" opacity="0.55" />
          <path d="M24.6 31.8 23.4 43" stroke="#ffffff" strokeWidth="0.7" strokeLinecap="round" opacity="0.42" />
        </g>
      </g>
    )
  }

  return (
    <g>
      <defs>
        <linearGradient id="empower-cross-wood" x1="13" x2="35" y1="10" y2="43" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c3f1d" />
          <stop offset="0.34" stopColor="#4a2512" />
          <stop offset="0.68" stopColor="#8a4b24" />
          <stop offset="1" stopColor="#2f160b" />
        </linearGradient>
        <linearGradient id="empower-cross-highlight" x1="17" x2="28" y1="9" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c08457" stopOpacity="0.88" />
          <stop offset="0.45" stopColor="#f3d3b1" stopOpacity="0.5" />
          <stop offset="1" stopColor="#5b2a13" stopOpacity="0.25" />
        </linearGradient>
        <filter id="empower-cross-shadow" x="-35%" y="-25%" width="170%" height="160%">
          <feDropShadow dx="0.8" dy="2" stdDeviation="1.8" floodColor="#1f0f08" floodOpacity="0.55" />
        </filter>
      </defs>
      <g filter="url(#empower-cross-shadow)">
        <path
          d="M20.5 12.5c1.8-.7 4.6-.8 6.5.1l-1.2 29.9c-1.9.9-4.3.8-6.2-.2l.9-29.8Z"
          fill="url(#empower-cross-wood)"
          stroke="#2a1309"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path
          d="M11.6 21.1c7.4-1.1 16.9-1.2 25.1-.2.9 1.7.8 3.8-.2 5.5-8.2-.8-17.7-.7-25.1.3-1-1.8-1-3.8.2-5.6Z"
          fill="url(#empower-cross-wood)"
          stroke="#2a1309"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path d="M23.3 14.4c-.8 7.5-1.2 18.5-.9 26.4" stroke="url(#empower-cross-highlight)" strokeWidth="1.1" strokeLinecap="round" opacity="0.85" />
        <path d="M13.9 23.3c6.7-.7 14.4-.7 20.4-.2" stroke="#c08457" strokeWidth="1" strokeLinecap="round" opacity="0.62" />
        <path d="M18.8 17.8c2.6-.9 5.7-.8 8.3.2M18.2 34.6c2.4 1.1 5.5 1.2 8.1.2" stroke="#2a1309" strokeWidth="0.8" strokeLinecap="round" opacity="0.45" />
        <path d="M15.6 20.9c.8 2.2.8 4.4.2 6.5M31.8 20.8c-.8 2.1-.8 4.2-.2 6.4" stroke="#1f0f08" strokeWidth="0.7" strokeLinecap="round" opacity="0.4" />
        <circle cx="20.4" cy="22.8" r="0.8" fill="#1f0f08" opacity="0.7" />
        <circle cx="27.9" cy="23" r="0.75" fill="#1f0f08" opacity="0.65" />
        <path d="M18.8 41.2c2.8 1.3 6.7 1.4 9.5.1" stroke="#f5d0a9" strokeWidth="0.8" strokeLinecap="round" opacity="0.36" />
      </g>
    </g>
  )
}

export default function StageLevelBadge({ stage, size = 'md', showSubtitle = true }: StageLevelBadgeProps) {
  const config = badgeConfig[stage]
  const gradientId = `stage-badge-gradient-${stage}-${size}`
  const isSmall = size === 'sm'

  return (
    <div
      className={`inline-flex max-w-full shrink-0 items-center rounded-xl border bg-white shadow-sm ${config.colors.glow} ${isSmall ? 'gap-1 px-1.5 py-1' : 'gap-2 px-2 py-1.5'}`}
      style={{ borderColor: config.colors.ring }}
    >
      <div className={`relative shrink-0 ${isSmall ? 'h-8 w-7' : 'h-10 w-9'}`}>
        {stage === 'Empower' || stage === 'Equip' || stage === 'Establish' ? (
          <div
            className={`${isSmall ? 'h-8 w-7' : 'h-10 w-9'} overflow-hidden rounded-[42%] border-2 ${stage === 'Empower' ? 'bg-violet-950' : stage === 'Equip' ? 'bg-amber-950' : 'bg-blue-950'} shadow-sm`}
            style={{ borderColor: config.colors.ring }}
            aria-label={`${config.title} level ${config.level} badge`}
            role="img"
          >
            <img
              src={stage === 'Empower' ? '/empower-status-icon.jpg' : stage === 'Equip' ? '/equip-status-icon.jpg' : '/establish-status-icon.jpg'}
              alt={stage === 'Empower' ? 'Empower status disciple icon' : stage === 'Equip' ? 'Equip status disciple icon' : 'Establish status disciple icon'}
              className="h-full w-full object-cover object-center"
            />
          </div>
        ) : (
          <svg viewBox="0 0 48 56" className={`${isSmall ? 'h-8 w-7' : 'h-10 w-9'} drop-shadow-sm`} role="img" aria-label={`${config.title} level ${config.level} badge`}>
            <defs>
              <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor={config.colors.from} />
                <stop offset="100%" stopColor={config.colors.to} />
              </linearGradient>
            </defs>
            <path
              d="M24 3 42 10v16c0 12-7 21-18 27C13 47 6 38 6 26V10l18-7Z"
              fill={`url(#${gradientId})`}
              stroke={config.colors.ring}
              strokeWidth="3"
            />
            <StageIcon stage={stage} color={config.colors.accent} />
          </svg>
        )}
        <div className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-gray-950 font-black leading-none text-white shadow-sm ${isSmall ? '-bottom-0.5 px-1 py-0.5 text-[7px]' : '-bottom-1 px-1.5 py-0.5 text-[8px]'}`}>
          LV{config.level}
        </div>
      </div>
      <div className="min-w-0 leading-tight">
        <div className={`truncate font-black uppercase tracking-wide ${config.colors.text} ${isSmall ? 'text-[9px]' : 'text-[10px]'}`}>{config.title}</div>
        {showSubtitle && <div className={`truncate font-semibold text-gray-600 ${isSmall ? 'text-[8px]' : 'text-[9px]'}`}>{config.character}</div>}
      </div>
    </div>
  )
}
