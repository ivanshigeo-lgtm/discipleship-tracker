'use client'

import { useState, useRef, useEffect } from 'react'
import type { JourneyLevel, JourneyStep } from './journeyModel'
import { UNLOCK_THRESHOLD, JOURNEY_ORDER, ringProgressFromLevels } from './journeyModel'
import { StarBadge } from './StarPrimitives'
import type { Stage } from '../../types/database'

/*
 * The star IS the interface. The four E's live in the four quadrants of the
 * ring — Engage top-left, Establish top-right, Equip bottom-right, Empower
 * bottom-left, clockwise like the journey itself. Steps stay hidden until a
 * quadrant is hovered (or tapped); they pop out from the star, magnified.
 * Progress is told by light: the ring, and the star's size and color.
 */

// quadrant index (ring E_ORDER) → corner placement; the journey itself runs
// Establish (TR) → Equip (BR) → Empower (BL) → Engage (TL), ending where a
// new star begins
const QUADRANT_META: { corner: 'tl' | 'tr' | 'br' | 'bl'; stage: Stage }[] = [
  { corner: 'tl', stage: 'Engage' },
  { corner: 'tr', stage: 'Establish' },
  { corner: 'br', stage: 'Equip' },
  { corner: 'bl', stage: 'Empower' },
]

function StepRow({
  step,
  color,
  locked,
  onAction,
}: {
  step: JourneyStep
  color: string
  locked: boolean
  onAction?: (step: JourneyStep) => void
}) {
  const actionable =
    !locked && !step.completed && (step.action === 'coach-code' || step.action === 'soap' || step.action === 'testimony')

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${actionable ? 'cursor-pointer transition-colors hover:bg-[rgba(246,241,231,.05)]' : ''}`}
      onClick={actionable && onAction ? () => onAction(step) : undefined}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold"
        style={
          step.completed
            ? { background: color, borderColor: color, color: 'var(--void)', boxShadow: `0 0 8px -1px ${color}` }
            : step.progress > 0
            ? { borderColor: color, color }
            : { borderColor: 'var(--line-2)', color: 'transparent' }
        }
      >
        {step.completed ? '✓' : '·'}
      </span>
      <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${step.completed ? 'text-[var(--fg-3)]' : 'text-[var(--fg-1)]'}`}>
        {step.title}
      </span>
      {step.progress > 0 && step.progress < 1 && (
        <span className="shrink-0 text-[9px] font-bold" style={{ color }}>
          {Math.round(step.progress * 100)}%
        </span>
      )}
      {actionable && (
        <span className="shrink-0 text-[10px] font-bold" style={{ color }}>
          →
        </span>
      )}
    </div>
  )
}

function QuadrantPanel({
  level,
  prev,
  corner,
  onStepAction,
}: {
  level: JourneyLevel
  prev?: JourneyLevel
  corner: 'tl' | 'tr' | 'br' | 'bl'
  onStepAction: (step: JourneyStep) => void
}) {
  const locked = !level.unlocked
  // Desktop: pop out away from the star, origin at the star's corner.
  // Mobile (no hover, tight space): rise as a sheet beneath the star.
  const place: Record<string, string> = {
    tl: 'sm:right-[58%] sm:bottom-[58%] sm:origin-bottom-right',
    tr: 'sm:left-[58%] sm:bottom-[58%] sm:origin-bottom-left',
    br: 'sm:left-[58%] sm:top-[58%] sm:origin-top-left',
    bl: 'sm:right-[58%] sm:top-[58%] sm:origin-top-right',
  }

  return (
    <div
      className={`jy-quad-pop pointer-events-auto absolute inset-x-0 top-full z-30 origin-top rounded-2xl border p-3 sm:inset-x-auto sm:top-auto sm:w-60 ${place[corner]}`}
      style={{
        borderColor: locked ? 'var(--line-2)' : `${level.color}55`,
        background: 'rgba(15,21,48,.92)',
        backdropFilter: 'blur(12px)',
        boxShadow: locked ? 'var(--elev-2)' : `0 12px 40px -12px ${level.color}50, inset 0 1px 0 rgba(246,241,231,.06)`,
      }}
    >
      <div className="flex items-baseline justify-between gap-2 px-1">
        <span className="cn-label" style={{ color: locked ? 'var(--fg-3)' : level.color }}>
          {level.stage}
        </span>
        {!locked && (
          <span className="text-sm font-bold" style={{ color: level.color }}>
            {Math.round(level.progress * 100)}%
          </span>
        )}
      </div>

      {locked ? (
        <div className="px-1 pb-1 pt-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[var(--fg-3)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-wider">Still ahead</span>
          </div>
          <p className="text-xs leading-relaxed text-[var(--fg-2)]">{level.tagline}</p>
          {prev && (
            <p className="mt-1.5 text-[10px] text-[var(--fg-3)]">
              Opens when {prev.stage} reaches {Math.round(UNLOCK_THRESHOLD * 100)}% — it&rsquo;s at {Math.round(prev.progress * 100)}%.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="px-1 pt-1 text-[11px] italic leading-snug text-[var(--fg-2)]" style={{ fontFamily: 'var(--font-display)', fontSize: 13 }}>
            {level.tagline}
          </p>
          <div className="mt-1.5 space-y-0.5">
            {level.steps.map(step => (
              <StepRow key={step.id} step={step} color={level.color} locked={locked} onAction={onStepAction} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function StarQuadrants({
  levels,
  color,
  onStepAction,
}: {
  levels: JourneyLevel[]
  color: string
  onStepAction: (step: JourneyStep) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // tap outside closes a pinned panel (mobile)
  useEffect(() => {
    if (pinned === null) return
    const close = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinned(null)
        setActive(null)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [pinned])

  const shown = pinned ?? active
  const ringProgress = ringProgressFromLevels(levels)
  const byStage = (stage: Stage) => levels.find(l => l.stage === stage)
  const prevOf = (stage: Stage) => {
    const i = JOURNEY_ORDER.indexOf(stage)
    return i > 0 ? byStage(JOURNEY_ORDER[i - 1]) : undefined
  }
  // the star leans gently toward the quadrant being explored
  const leanMap = ['translate(-3px,-3px)', 'translate(3px,-3px)', 'translate(3px,3px)', 'translate(-3px,3px)']

  return (
    <div ref={containerRef} className="relative mx-auto" style={{ width: 'min(370px, 92vw)', height: 'min(370px, 92vw)' }}>
      {/* the star itself */}
      <div
        id="journey-hero-star"
        className="absolute inset-0 grid place-items-center transition-transform duration-300"
        style={{ transform: shown !== null ? `${leanMap[shown]} scale(1.04)` : 'none' }}
      >
        <StarBadge size={300} progress={ringProgress} color={color} emphasis={shown} />
      </div>

      {/* quadrant hit zones + whisper labels */}
      {QUADRANT_META.map((q, i) => {
        const level = byStage(q.stage)
        const zone: Record<string, string> = {
          tl: 'left-0 top-0',
          tr: 'right-0 top-0',
          br: 'right-0 bottom-0',
          bl: 'left-0 bottom-0',
        }
        const labelPos: Record<string, string> = {
          tl: 'left-[1%] top-[5%]',
          tr: 'right-[1%] top-[5%]',
          br: 'right-[1%] bottom-[5%]',
          bl: 'left-[1%] bottom-[5%]',
        }
        const isShown = shown === i
        return (
          <div key={q.stage} className={`absolute h-1/2 w-1/2 ${zone[q.corner]}`}>
            <button
              type="button"
              aria-label={`${q.stage} steps`}
              className="h-full w-full cursor-pointer rounded-full focus:outline-none"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setPinned(p => (p === i ? null : i))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
            <span
              className={`pointer-events-none absolute select-none text-[13px] font-bold uppercase tracking-[.16em] transition-all duration-300 sm:text-sm ${labelPos[q.corner]}`}
              style={{
                color: level?.unlocked ? level.color : 'var(--fg-3)',
                opacity: isShown ? 1 : 0.75,
                textShadow: isShown ? `0 0 14px ${level?.color}` : '0 2px 10px rgba(6,8,20,.9)',
              }}
            >
              {q.stage}
            </span>
          </div>
        )
      })}

      {/* the pop-out panel */}
      {shown !== null && byStage(QUADRANT_META[shown].stage) && (
        <QuadrantPanel
          level={byStage(QUADRANT_META[shown].stage)!}
          prev={prevOf(QUADRANT_META[shown].stage)}
          corner={QUADRANT_META[shown].corner}
          onStepAction={onStepAction}
        />
      )}
    </div>
  )
}
