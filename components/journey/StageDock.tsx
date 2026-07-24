'use client'

import type { JourneyLevel, JourneyStep } from './journeyModel'
import { StageStepList } from './StageStepList'

/*
 * StageDock — the home screen's docked checklist. On the native app the two
 * blue CTAs were removed and their space became the place a stage's steps open
 * when you tap a point of the star. This is the web twin: a normal in-flow
 * panel below the star (not a floating overlay) that shows the chosen stage's
 * checklist, or a gentle prompt when nothing is selected.
 */
export default function StageDock({
  level,
  prev,
  onStepAction,
  onStepToggle,
  onRequestSignoff,
  onClose,
}: {
  level: JourneyLevel | null
  prev?: JourneyLevel
  onStepAction: (step: JourneyStep) => void
  onStepToggle?: (step: JourneyStep) => void
  onRequestSignoff?: (stage: string) => void
  onClose?: () => void
}) {
  // Nothing chosen yet — invite the interaction the way native does.
  if (!level) {
    return (
      <div className="mt-6 flex min-h-[96px] items-center justify-center rounded-2xl border border-dashed border-[var(--line-2)] px-5 py-6 text-center">
        <p className="text-sm text-[var(--fg-3)]">
          Tap a point of your star to see that stage&rsquo;s steps.
        </p>
      </div>
    )
  }

  const locked = !level.unlocked

  return (
    <div
      className="jy-rise-in mt-6 rounded-2xl border p-4 text-left sm:p-5"
      style={{
        borderColor: locked ? 'var(--line-2)' : `${level.color}55`,
        background: 'rgba(15,21,48,.92)',
        boxShadow: locked ? 'var(--elev-2)' : `0 12px 40px -12px ${level.color}50, inset 0 1px 0 rgba(246,241,231,.06)`,
      }}
    >
      {/* header — stage · progress · close */}
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="cn-label" style={{ color: locked ? 'var(--fg-3)' : level.color }}>
          {level.stage}
        </span>
        <div className="flex items-center gap-2.5">
          {!locked && (
            <span className="text-[15px] font-bold" style={{ color: level.color }}>
              {Math.round(level.progress * 100)}%
            </span>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-[15px] leading-none text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
              style={{ borderColor: 'var(--line-2)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {locked ? (
        <div className="px-1 pb-1 pt-1">
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
