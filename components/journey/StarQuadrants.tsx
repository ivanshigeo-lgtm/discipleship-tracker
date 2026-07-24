'use client'

import { useState, useRef, useEffect } from 'react'
import type { JourneyLevel, JourneyStep } from './journeyModel'
import { JOURNEY_ORDER, ringProgressFromLevels } from './journeyModel'
import { StageStepList } from './StageStepList'
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

function QuadrantPanel({
  level,
  prev,
  onStepAction,
  onStepToggle,
  onRequestSignoff,
  onKeepOpen,
  onCloseSoon,
  onClose,
}: {
  level: JourneyLevel
  prev?: JourneyLevel
  onStepAction: (step: JourneyStep) => void
  onStepToggle?: (step: JourneyStep) => void
  onRequestSignoff?: (stage: string) => void
  onKeepOpen?: () => void
  onCloseSoon?: () => void
  onClose?: () => void
}) {
  const locked = !level.unlocked

  // A fixed, viewport-centered panel — always fully on-screen regardless of how
  // far down the star sits, with its own max-height + scroll for long stages.
  return (
    <div
      onMouseEnter={onKeepOpen}
      onMouseLeave={onCloseSoon}
      className="jy-quad-pop pointer-events-auto fixed left-1/2 top-1/2 z-[60] max-h-[85vh] w-[min(340px,94vw)] -translate-x-1/2 -translate-y-1/2 origin-center overflow-y-auto overflow-x-hidden rounded-2xl border p-4"
      style={{
        borderColor: locked ? 'var(--line-2)' : `${level.color}55`,
        background: 'rgba(15,21,48,.92)',
        backdropFilter: 'blur(12px)',
        boxShadow: locked ? 'var(--elev-2)' : `0 12px 40px -12px ${level.color}50, inset 0 1px 0 rgba(246,241,231,.06)`,
      }}
    >
      <div
        className="sticky top-0 z-10 -mx-4 -mt-4 mb-1 flex items-baseline justify-between gap-2 rounded-t-2xl px-4 pb-2 pt-4"
        style={{ background: 'rgba(15,21,48,.92)', backdropFilter: 'blur(12px)' }}
      >
        <span className="cn-label" style={{ color: locked ? 'var(--fg-3)' : level.color }}>
          {level.stage}
        </span>
        <div className="flex items-center gap-2.5">
          {!locked && (
            <span className="text-[15px] font-bold" style={{ color: level.color }}>
              {Math.round(level.progress * 100)}%
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-[15px] leading-none text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
            style={{ borderColor: 'var(--line-2)' }}
          >
            ✕
          </button>
        </div>
      </div>

      {locked ? (
        <div className="px-1 pb-1 pt-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[var(--fg-3)]">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-[12px] font-bold uppercase tracking-wider">Still ahead</span>
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--fg-2)]">{level.tagline}</p>
          {prev && (
            <p className="mt-1.5 text-[11px] text-[var(--fg-3)]">
              {prev.signoff === 'requested'
                ? `Awaiting your coach's sign-off on ${prev.stage}.`
                : `Opens when your coach signs off on ${prev.stage}${prev.completed ? '' : ` — finish it first (it's at ${Math.round(prev.progress * 100)}%)`}.`}
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="px-1 pt-1 text-left text-[11px] italic leading-snug text-[var(--fg-2)]" style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>
            {level.tagline}
          </p>
          <div className="mt-1.5">
            <StageStepList level={level} onStepAction={onStepAction} onStepToggle={onStepToggle} onRequestSignoff={onRequestSignoff} />
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
  onStepToggle,
  onRequestSignoff,
  demo = null,
  docked = false,
  onQuadrant,
}: {
  levels: JourneyLevel[]
  color: string
  onStepAction: (step: JourneyStep) => void
  onStepToggle?: (step: JourneyStep) => void
  onRequestSignoff?: (stage: string) => void
  /* first-visit coachmark: 'arrow' glides toward the quadrant, 'open' presses it */
  demo?: 'arrow' | 'open' | null
  /* docked: don't pop a floating panel — report the chosen stage up so the page
     can render the checklist below the star (matching the native home screen,
     where the steps dock into the space the two CTAs used to occupy). */
  docked?: boolean
  onQuadrant?: (stage: Stage | null) => void
}) {
  const [active, setActive] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // The ring must breathe inside whatever width it's given — 375pt phones are
  // fine at 300, but zoomed-display minis and the app's padded WebView are not.
  const [starSize, setStarSize] = useState(340)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const fit = () => setStarSize(Math.max(180, Math.min(340, Math.round(el.getBoundingClientRect().width) - 45)))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const demoWasOpen = useRef(false)
  // Hover with a short close-delay so the mouse can travel from a quadrant to
  // its pop-out without the panel closing in the gap between them.
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openQuad = (i: number) => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setActive(i) }
  const closeSoon = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setActive(null), 160) }

  // the demo points at the stage the disciple is currently walking
  const demoQuadrant = (() => {
    const current = levels.find(l => l.unlocked && !l.completed)?.stage ?? 'Establish'
    const i = QUADRANT_META.findIndex(q => q.stage === current)
    return i === -1 ? 1 : i
  })()

  useEffect(() => {
    if (demo === 'open') {
      demoWasOpen.current = true
      setPinned(demoQuadrant)
    } else if (demo === null && demoWasOpen.current) {
      demoWasOpen.current = false
      setPinned(null)
      setActive(null)
    }
  }, [demo, demoQuadrant])

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

  // Docked mode is tap-driven only (like native) so the panel below the star
  // stays put; hover-preview is reserved for the floating (home-overlay) mode.
  const shown = docked ? pinned : (pinned ?? active)

  // Report the chosen stage up to the page so it can dock the checklist below.
  const shownStage = shown !== null ? QUADRANT_META[shown].stage : null
  useEffect(() => {
    if (docked) onQuadrant?.(shownStage)
  }, [docked, shownStage, onQuadrant])

  const ringProgress = ringProgressFromLevels(levels)
  const byStage = (stage: Stage) => levels.find(l => l.stage === stage)
  const prevOf = (stage: Stage) => {
    const i = JOURNEY_ORDER.indexOf(stage)
    return i > 0 ? byStage(JOURNEY_ORDER[i - 1]) : undefined
  }
  // the star leans gently toward the quadrant being explored
  const leanMap = ['translate(-3px,-3px)', 'translate(3px,-3px)', 'translate(3px,3px)', 'translate(-3px,3px)']

  return (
    <div ref={containerRef} className="relative mx-auto" style={{ width: 'min(400px, 94vw)', height: 'min(400px, 94vw)' }}>
      {/* the star itself */}
      <div
        id="journey-hero-star"
        className="absolute inset-0 grid place-items-center transition-transform duration-300"
        style={{ transform: shown !== null ? `${leanMap[shown]} scale(1.04)` : 'none' }}
      >
        <StarBadge size={starSize} progress={ringProgress} color={color} emphasis={shown} />
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
              onMouseEnter={() => openQuad(i)}
              onMouseLeave={closeSoon}
              onClick={() => setPinned(p => (p === i ? null : i))}
              onFocus={() => openQuad(i)}
              onBlur={closeSoon}
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

      {/* coachmark: a mouse pointer glides to the quadrant and clicks it */}
      {(demo === 'arrow' || demo === 'open') && (() => {
        const corner = QUADRANT_META[demoQuadrant].corner
        // where the pointer's tip lands (the spot being "clicked")
        const tip: Record<string, { left: string; top: string }> = {
          tl: { left: '19%', top: '19%' },
          tr: { left: '78%', top: '19%' },
          br: { left: '78%', top: '78%' },
          bl: { left: '19%', top: '78%' },
        }
        return (
          <>
            <span
              className={`jy-demo-cursor absolute z-40 ${demo === 'open' ? 'jy-cursor-press' : ''}`}
              style={{ ...tip[corner] }}
              aria-hidden
            >
              {/* mouse pointer, tip at the element's top-left corner */}
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                style={{ filter: 'drop-shadow(0 1px 3px rgba(6,8,20,.85)) drop-shadow(0 0 10px rgba(251,246,236,.45))' }}
              >
                <path
                  d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"
                  fill="#FBF6EC"
                  stroke="#0B1027"
                  strokeWidth="1.1"
                />
              </svg>
            </span>
            {demo === 'open' && (
              <span
                className="jy-click-ripple z-40"
                style={{ ...tip[corner], marginLeft: -32, marginTop: -32 }}
                aria-hidden
              />
            )}
          </>
        )
      })()}

      {/* the pop-out panel — only in floating mode; docked mode renders the
          checklist below the star instead (see the home page) */}
      {!docked && shown !== null && byStage(QUADRANT_META[shown].stage) && (
        <QuadrantPanel
          level={byStage(QUADRANT_META[shown].stage)!}
          prev={prevOf(QUADRANT_META[shown].stage)}
          onStepAction={onStepAction}
          onStepToggle={onStepToggle}
          onRequestSignoff={onRequestSignoff}
          onKeepOpen={() => { if (shown !== null) openQuad(shown) }}
          onCloseSoon={closeSoon}
          onClose={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setPinned(null); setActive(null) }}
        />
      )}
    </div>
  )
}
