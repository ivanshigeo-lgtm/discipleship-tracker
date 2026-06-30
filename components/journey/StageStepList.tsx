'use client'

import type { JourneyLevel, JourneyStep } from './journeyModel'
import { STEP_CHECKLIST, STEP_DESCRIPTIONS, JOURNEY_ORDER } from './journeyModel'

/*
 * The list of steps for one stage — shared by the star's hover pop-out and the
 * left menu so they look identical. Each row has a checkable circle, the step
 * title, an optional action CTA, and an inline description revealed on hover
 * (never a tooltip that runs off-screen). Ends with the sign-off footer.
 */

export function StepRow({
  step,
  color,
  locked,
  onAction,
  onToggle,
}: {
  step: JourneyStep
  color: string
  locked: boolean
  onAction?: (step: JourneyStep) => void
  onToggle?: (step: JourneyStep) => void
}) {
  const toggleable = !locked && !!STEP_CHECKLIST[step.id] && !!onToggle
  const actionable =
    !locked &&
    (step.action === 'message-coach' ||
      (!step.completed &&
        (step.action === 'coach-code' ||
          step.action === 'join-group' ||
          step.action === 'soap' ||
          step.action === 'testimony' ||
          step.action === 'self-confirm')))

  const boxStyle = step.completed
    ? { background: color, borderColor: color, color: 'var(--void)', boxShadow: `0 0 8px -1px ${color}` }
    : step.progress > 0
    ? { borderColor: color, color }
    : { borderColor: 'var(--line-2)', color: toggleable ? 'var(--fg-3)' : 'transparent' }

  const description = STEP_DESCRIPTIONS[step.id]

  return (
    <div
      className={`group rounded-lg px-2 py-1.5 transition-colors ${actionable ? 'cursor-pointer hover:bg-[rgba(246,241,231,.05)]' : 'hover:bg-[rgba(246,241,231,.04)]'}`}
      onClick={actionable && onAction ? () => onAction(step) : undefined}
    >
      <div className="flex items-center gap-2.5">
        {toggleable ? (
          <button
            type="button"
            aria-label={step.completed ? 'Mark not done' : 'Mark done'}
            onClick={(e) => { e.stopPropagation(); onToggle!(step) }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold transition-transform hover:scale-110"
            style={boxStyle}
          >
            {step.completed ? '✓' : ''}
          </button>
        ) : (
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold"
            style={boxStyle}
          >
            {step.completed ? '✓' : '·'}
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate text-left text-[13px] font-medium ${step.completed ? 'text-[var(--fg-3)]' : 'text-[var(--fg-1)]'}`}>
          {step.title}
        </span>
        {step.progress > 0 && step.progress < 1 && (
          <span className="shrink-0 text-[9px] font-bold" style={{ color }}>
            {Math.round(step.progress * 100)}%
          </span>
        )}
        {actionable && (
          <span className="shrink-0 text-[10px] font-bold" style={{ color }}>
            {step.action === 'message-coach'
              ? 'Message →'
              : step.action === 'join-group'
              ? 'Join →'
              : step.action === 'self-confirm'
              ? 'Mark it →'
              : '→'}
          </span>
        )}
      </div>
      {/* Inline description on hover — grows in place, so it can never run off
          the screen the way a floating tooltip can. */}
      {description && (
        <div className="grid grid-rows-[0fr] transition-all duration-200 group-hover:grid-rows-[1fr]">
          <p className="overflow-hidden pl-[26px] text-[11px] leading-snug text-[var(--fg-3)]">
            <span className="block pt-1">{description}</span>
          </p>
        </div>
      )}
    </div>
  )
}

// The sign-off gate at the bottom of a stage's list.
export function SignoffFooter({ level, onRequestSignoff }: { level: JourneyLevel; onRequestSignoff?: (stage: string) => void }) {
  const isEngage = level.stage === 'Engage'

  if (level.signoff === 'approved') {
    return (
      <div className="mt-2.5 rounded-lg border px-3 py-2" style={{ borderColor: `${level.color}55`, background: `${level.color}12` }}>
        <p className="text-[11px] font-bold" style={{ color: level.color }}>✦ Signed off by your coach</p>
        {level.congrats && <p className="mt-1 text-xs italic leading-relaxed text-[var(--fg-1)]">&ldquo;{level.congrats}&rdquo;</p>}
      </div>
    )
  }
  if (level.signoff === 'requested') {
    return (
      <p className="mt-2.5 rounded-lg border border-[var(--line-2)] px-3 py-2 text-center text-[11px] font-semibold text-[var(--fg-2)]">
        ✦ Awaiting your coach&rsquo;s sign-off
      </p>
    )
  }
  if (!level.completed || !onRequestSignoff) return null
  // Stage complete, not yet requested — congrats + an un-missable, pulsing
  // "request sign-off" button so the disciple knows to take the next step.
  const idx = JOURNEY_ORDER.indexOf(level.stage)
  const next = idx >= 0 && idx < JOURNEY_ORDER.length - 1 ? JOURNEY_ORDER[idx + 1] : null
  return (
    <div className="mt-2.5 rounded-xl border p-3 text-center" style={{ borderColor: `${level.color}66`, background: `${level.color}14` }}>
      <p className="text-sm font-bold" style={{ color: level.color }}>🎉 You&rsquo;ve completed {level.stage}!</p>
      <p className="mx-auto mt-1 max-w-[260px] text-[11px] leading-relaxed text-[var(--fg-2)]">
        {isEngage
          ? 'One last step — ask your coach to confirm you’ve come full circle.'
          : next
          ? `Ask your coach to sign off so ${next} unlocks.`
          : 'Ask your coach to sign off on this stage.'}
      </p>
      <button
        type="button"
        onClick={() => onRequestSignoff(level.stage)}
        className="jy-signoff-pulse mt-2.5 w-full rounded-lg py-2.5 text-sm font-bold"
        style={{ background: level.color, color: 'var(--void)' }}
      >
        ✦ {isEngage ? 'Request final sign-off' : 'Request sign-off from coach'} →
      </button>
    </div>
  )
}

// The full step list + sign-off footer for one (unlocked) stage.
export function StageStepList({
  level,
  onStepAction,
  onStepToggle,
  onRequestSignoff,
}: {
  level: JourneyLevel
  onStepAction?: (step: JourneyStep) => void
  onStepToggle?: (step: JourneyStep) => void
  onRequestSignoff?: (stage: string) => void
}) {
  return (
    <>
      <div className="space-y-0.5">
        {level.steps.map(step => (
          <StepRow key={step.id} step={step} color={level.color} locked={!level.unlocked} onAction={onStepAction} onToggle={onStepToggle} />
        ))}
      </div>
      <SignoffFooter level={level} onRequestSignoff={onRequestSignoff} />
    </>
  )
}
