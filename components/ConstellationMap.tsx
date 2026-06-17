'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Person, Stage, DiscipleshipConnection } from '../types/database'

interface ConstellationMapProps {
  people: Person[]
  connections: DiscipleshipConnection[]
  onPersonClick?: (person: Person) => void
}

const STAGE_CONFIG: Record<Stage, {
  orbitRadius: number
  color: string
  glowColor: string
  label: string
}> = {
  Engage: {
    orbitRadius: 80,
    color: 'var(--engage)',
    glowColor: 'var(--engage-glow)',
    label: 'Reach',
  },
  Establish: {
    orbitRadius: 130,
    color: 'var(--establish)',
    glowColor: 'var(--establish-glow)',
    label: 'Build',
  },
  Equip: {
    orbitRadius: 180,
    color: 'var(--equip)',
    glowColor: 'var(--equip-glow)',
    label: 'Train',
  },
  Empower: {
    orbitRadius: 230,
    color: 'var(--empower)',
    glowColor: 'var(--empower-glow)',
    label: 'Release',
  },
}

const STAGE_ORDER: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']

function getStarPosition(index: number, total: number, orbitRadius: number, centerX: number, centerY: number) {
  const angleOffset = Math.PI / 6
  const angleSpread = (2 * Math.PI) / Math.max(total, 1)
  const angle = angleOffset + index * angleSpread
  return {
    x: centerX + Math.cos(angle) * orbitRadius,
    y: centerY + Math.sin(angle) * orbitRadius,
  }
}

function getStarSize(person: Person): number {
  const stageBonus = STAGE_ORDER.indexOf(person.current_stage) * 4
  return 16 + stageBonus
}

export default function ConstellationMap({
  people,
  connections,
  onPersonClick,
}: ConstellationMapProps) {
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })
  const [hoveredPerson, setHoveredPerson] = useState<string | null>(null)
  const [starRect, setStarRect] = useState<DOMRect | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hover lifecycle for the testimony popup.
  // CRITICAL: every "leave" must schedule a DELAYED hide and every "enter"
  // must cancel it. The star, the bridge strip and the card are three
  // separate fixed elements; the mouse crossing the boundary between any
  // two of them fires mouseleave on one at the same instant it fires
  // mouseenter on the next. If leave hid the popup immediately it would win
  // that race and the card would vanish the moment you reach it. With a
  // shared timer, the incoming enter cancels the outgoing leave's timer
  // before it fires, so travel star → bridge → card is seamless.
  const scheduleHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setHoveredPerson(null), 300)
  }
  const cancelHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }
  // Capture the star's actual screen position so the popup can be placed
  // with position:fixed at exactly the right coordinates, regardless of
  // CSS transforms on the star wrapper.
  const handleStarEnter = (personId: string, e: React.MouseEvent<HTMLDivElement>) => {
    cancelHide()
    setStarRect(e.currentTarget.getBoundingClientRect())
    setHoveredPerson(personId)
  }
  // Cleanup timer on unmount
  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }, [])

  useEffect(() => {
    const updateDimensions = () => {
      const container = document.getElementById('constellation-container')
      if (container) {
        setDimensions({
          width: container.offsetWidth,
          height: Math.min(container.offsetWidth * 0.6, 500),
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const centerX = dimensions.width / 2
  const centerY = dimensions.height / 2

  const scaleFactor = Math.min(dimensions.width / 800, dimensions.height / 500, 1)

  const peopleByStage = useMemo(() => {
    const grouped: Record<Stage, Person[]> = {
      Engage: [],
      Establish: [],
      Equip: [],
      Empower: [],
    }
    people.forEach(person => {
      grouped[person.current_stage].push(person)
    })
    return grouped
  }, [people])

  const starPositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number; size: number }> = {}

    STAGE_ORDER.forEach(stage => {
      const stagePeople = peopleByStage[stage]
      const orbitRadius = STAGE_CONFIG[stage].orbitRadius * scaleFactor

      stagePeople.forEach((person, index) => {
        const pos = getStarPosition(index, stagePeople.length, orbitRadius, centerX, centerY)
        positions[person.id] = {
          ...pos,
          size: getStarSize(person) * scaleFactor,
        }
      })
    })

    return positions
  }, [peopleByStage, centerX, centerY, scaleFactor])

  const connectionLines = useMemo(() => {
    return connections
      .filter(conn => {
        const fromPos = starPositions[conn.discipler_person_id]
        const toPos = conn.disciple_person_id ? starPositions[conn.disciple_person_id] : null
        return fromPos && toPos
      })
      .map(conn => {
        const fromPos = starPositions[conn.discipler_person_id]
        const toPos = starPositions[conn.disciple_person_id!]
        const discipler = people.find(p => p.id === conn.discipler_person_id)
        return {
          id: conn.id,
          x1: fromPos.x,
          y1: fromPos.y,
          x2: toPos.x,
          y2: toPos.y,
          color: discipler ? STAGE_CONFIG[discipler.current_stage].color : 'var(--fg-3)',
        }
      })
  }, [connections, starPositions, people])

  const activeConnectionCount = connectionLines.length

  return (
    <div
      id="constellation-container"
      className="relative w-full overflow-hidden rounded-3xl border border-[var(--line-1)]"
      style={{
        height: dimensions.height,
        background: 'radial-gradient(circle at 50% 50%, rgba(27,33,85,.6) 0%, rgba(6,8,20,.95) 70%)',
      }}
    >
      {/* Ambient nebula glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(70% 50% at 50% 50%, rgba(242,200,121,.08), transparent 60%),
            radial-gradient(40% 40% at 20% 70%, rgba(54,214,195,.06), transparent 50%),
            radial-gradient(40% 40% at 80% 30%, rgba(240,114,159,.06), transparent 50%)
          `,
        }}
      />

      {/* Orbital rings */}
      {STAGE_ORDER.map(stage => {
        const config = STAGE_CONFIG[stage]
        const radius = config.orbitRadius * scaleFactor
        return (
          <div
            key={stage}
            className="pointer-events-none absolute rounded-full border"
            style={{
              left: centerX - radius,
              top: centerY - radius,
              width: radius * 2,
              height: radius * 2,
              borderColor: `color-mix(in srgb, ${config.color} 15%, transparent)`,
              boxShadow: `0 0 ${40 * scaleFactor}px -${10 * scaleFactor}px ${config.glowColor}`,
            }}
          />
        )
      })}

      {/* SVG layer for connection lines */}
      <svg
        className="pointer-events-none absolute inset-0"
        width={dimensions.width}
        height={dimensions.height}
      >
        {/* Lines from center to each star */}
        {Object.entries(starPositions).map(([personId, pos]) => {
          const person = people.find(p => p.id === personId)
          if (!person) return null
          const config = STAGE_CONFIG[person.current_stage]
          const isHovered = hoveredPerson === personId

          return (
            <line
              key={`center-${personId}`}
              x1={centerX}
              y1={centerY}
              x2={pos.x}
              y2={pos.y}
              stroke={config.color}
              strokeOpacity={isHovered ? 0.5 : 0.15}
              strokeWidth={isHovered ? 2 : 1}
              style={{ transition: 'all 0.3s ease' }}
            />
          )
        })}

        {/* Discipleship connection lines */}
        {connectionLines.map(line => (
          <line
            key={line.id}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.color}
            strokeOpacity={0.5}
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        ))}
      </svg>

      {/* Central Sun (Jesus) */}
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          left: centerX - 40 * scaleFactor,
          top: centerY - 40 * scaleFactor,
          width: 80 * scaleFactor,
          height: 80 * scaleFactor,
          background: 'radial-gradient(circle at 50% 40%, #FFF7E4, #F2C879 55%, #E0A94A 100%)',
          animation: 'sun-pulse 4.5s cubic-bezier(.22,.61,.36,1) infinite alternate',
          zIndex: 10,
        }}
      >
        <img
          src="/gbm-flame-white.png"
          alt="Jesus at the center"
          style={{
            width: 40 * scaleFactor,
            opacity: 0.95,
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.3))',
          }}
        />
      </div>

      {/* Stars (People) */}
      {people.map(person => {
        const pos = starPositions[person.id]
        if (!pos) return null

        const config = STAGE_CONFIG[person.current_stage]
        const isHovered = hoveredPerson === person.id

        return (
          <div
            key={person.id}
            className="absolute cursor-pointer text-center"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, -50%) scale(${isHovered ? 1.15 : 1})`,
              transition: 'transform 0.3s ease',
              zIndex: isHovered ? 20 : 5,
            }}
            onClick={() => onPersonClick?.(person)}
            onMouseEnter={(e) => handleStarEnter(person.id, e)}
            onMouseLeave={scheduleHide}
          >
            <div
              className="mx-auto rounded-full"
              style={{
                width: pos.size,
                height: pos.size,
                background: `radial-gradient(circle at 50% 40%, #ffffff, var(--fg-1) 60%, rgba(246,241,231,.5) 100%)`,
                boxShadow: `0 0 ${pos.size * 1.2}px ${pos.size * 0.4}px ${config.glowColor}`,
                animation: 'star-breath 3s cubic-bezier(.22,.61,.36,1) infinite alternate',
              }}
            />
            <div
              className="mt-2 whitespace-nowrap text-center"
              style={{
                fontSize: Math.max(10, 11 * scaleFactor),
                fontWeight: 600,
                color: isHovered ? 'var(--fg-1)' : 'var(--fg-2)',
                textShadow: '0 2px 8px var(--void)',
              }}
            >
              {person.name}
            </div>
            <div
              style={{
                fontSize: Math.max(8, 9 * scaleFactor),
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: config.color,
                marginTop: 2,
              }}
            >
              {person.current_stage}
            </div>
          </div>
        )
      })}

      {/* Story popup — rendered with position:fixed so it appears at the star's
          exact screen location regardless of CSS transforms on the star wrapper.
          Also renders a transparent bridge strip between popup bottom and star top
          so the mouse never crosses a dead zone when moving star → popup. */}
      {hoveredPerson && starRect && (() => {
        const person = people.find(p => p.id === hoveredPerson)
        if (!person || (!person.testimony_text && !person.testimony_video_url)) return null
        const config = STAGE_CONFIG[person.current_stage]
        const cardWidth = 240
        const left = Math.max(8, Math.min(
          starRect.left + starRect.width / 2 - cardWidth / 2,
          window.innerWidth - cardWidth - 8,
        ))
        // Popup sits immediately above the star's visual top edge
        const popupBottom = window.innerHeight - starRect.top
        return (
          <>
            {/* Transparent bridge covers the gap between popup and star.
                Extends 4px into the star below and 4px into the card above so
                sub-pixel rounding can never leave a 1px dead line at either seam. */}
            <div
              style={{
                position: 'fixed',
                left,
                bottom: popupBottom - 4,
                width: cardWidth,
                height: 24,
                zIndex: 9998,
              }}
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
            />
            {/* Actual card */}
            <div
              style={{
                position: 'fixed',
                left,
                bottom: popupBottom + 16,
                width: cardWidth,
                background: 'rgba(6,8,20,.94)',
                backdropFilter: 'blur(14px)',
                border: `1px solid ${config.color}40`,
                borderRadius: 14,
                padding: '10px 12px',
                boxShadow: `0 0 24px -4px ${config.glowColor}60`,
                zIndex: 9999,
                cursor: 'default',
              }}
              onMouseEnter={cancelHide}
              onMouseLeave={scheduleHide}
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: config.color }} />
                <span className="text-[10px] font-semibold" style={{ color: config.color }}>
                  {person.name.split(' ')[0]}&rsquo;s story
                </span>
              </div>
              {person.testimony_video_url ? (
                <video
                  src={person.testimony_video_url}
                  className="w-full rounded-lg"
                  style={{ maxHeight: 140 }}
                  playsInline
                  controls
                />
              ) : (
                <p className="text-[11px] italic leading-relaxed text-[var(--fg-2)]">
                  &ldquo;{(person.testimony_text ?? '').slice(0, 180)}{(person.testimony_text ?? '').length > 180 ? '…' : ''}&rdquo;
                </p>
              )}
            </div>
          </>
        )
      })()}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-3">
        {STAGE_ORDER.map(stage => {
          const config = STAGE_CONFIG[stage]
          const count = peopleByStage[stage].length
          return (
            <div key={stage} className="flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  background: config.color,
                  boxShadow: `0 0 8px ${config.glowColor}`,
                }}
              />
              <span
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--fg-3)' }}
              >
                {stage} ({count})
              </span>
            </div>
          )
        })}
      </div>

      {/* Stats caption */}
      <div className="absolute bottom-4 right-4 z-20 text-right">
        <p className="text-xs" style={{ color: 'var(--fg-3)' }}>
          <span style={{ color: 'var(--gold)' }}>✦</span>{' '}
          {people.length} {people.length === 1 ? 'star' : 'stars'} orbiting
          {activeConnectionCount > 0 && ` · ${activeConnectionCount} discipleship ${activeConnectionCount === 1 ? 'connection' : 'connections'}`}
        </p>
      </div>

      {/* CSS Keyframes */}
      <style jsx>{`
        @keyframes sun-pulse {
          from {
            box-shadow: 0 0 50px 8px rgba(242, 200, 121, 0.5),
              0 0 100px 24px rgba(242, 200, 121, 0.2);
          }
          to {
            box-shadow: 0 0 70px 16px rgba(242, 200, 121, 0.7),
              0 0 140px 38px rgba(242, 200, 121, 0.3);
          }
        }
        @keyframes star-breath {
          from {
            opacity: 0.85;
            transform: scale(0.98);
          }
          to {
            opacity: 1;
            transform: scale(1.02);
          }
        }
      `}</style>
    </div>
  )
}
