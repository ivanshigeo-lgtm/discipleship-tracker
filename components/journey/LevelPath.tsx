'use client'

import { useState } from 'react'
import type { JourneyLevel, JourneyStep } from './journeyModel'
import { UNLOCK_THRESHOLD } from './journeyModel'

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
  const actionable = !locked && !step.completed && (step.action === 'coach-code' || step.action === 'soap' || step.action === 'testimony')

  return (
    <div
      className={`flex items-start gap-3 rounded-xl p-2.5 transition-colors ${actionable ? 'cursor-pointer hover:bg-[rgba(246,241,231,.04)]' : ''}`}
      onClick={actionable && onAction ? () => onAction(step) : undefined}
    >
      {/* node */}
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all"
        style={
          step.completed
            ? { background: color, borderColor: color, color: 'var(--void)', boxShadow: `0 0 10px -1px ${color}` }
            : step.progress > 0
            ? { borderColor: color, color }
            : { borderColor: 'var(--line-2)', color: 'var(--fg-3)' }
        }
      >
        {step.completed ? '✓' : ''}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-sm font-semibold ${step.completed ? 'text-[var(--fg-2)]' : 'text-[var(--fg-1)]'}`}>
            {step.title}
          </span>
          {actionable && (
            <span className="shrink-0 text-[10px] font-semibold" style={{ color }}>
              {step.action === 'soap' ? 'Open journal →' : step.action === 'testimony' ? 'Tell it →' : 'Connect →'}
            </span>
          )}
          {!locked && !step.completed && step.action === 'coach-verified' && (
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-[var(--fg-3)]">with your coach</span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-[var(--fg-3)]">{step.detail}</p>
        {step.progress > 0 && step.progress < 1 && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[rgba(246,241,231,.08)]">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${step.progress * 100}%`, background: color, boxShadow: `0 0 6px ${color}` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default function LevelPath({
  levels,
  onStepAction,
}: {
  levels: JourneyLevel[]
  onStepAction: (step: JourneyStep) => void
}) {
  // open the first unlocked-but-incomplete level by default
  const defaultOpen = levels.find(l => l.unlocked && !l.completed)?.stage ?? levels[levels.length - 1].stage
  const [open, setOpen] = useState<string>(defaultOpen)

  return (
    <div className="relative">
      {/* the trail */}
      <div className="absolute bottom-6 left-[22px] top-6 w-px bg-gradient-to-b from-[rgba(244,182,80,.5)] via-[rgba(54,214,195,.35)] to-[rgba(240,114,159,.2)]" />

      <div className="space-y-4">
        {levels.map((level, idx) => {
          const isOpen = open === level.stage
          const locked = !level.unlocked
          const pct = Math.round(level.progress * 100)
          const prev = levels[idx - 1]

          return (
            <section
              key={level.stage}
              className="relative rounded-[var(--r-lg)] border transition-all"
              style={{
                borderColor: locked ? 'var(--line-1)' : isOpen ? `${level.color}55` : 'var(--line-1)',
                background: locked ? 'rgba(20,27,61,.4)' : 'var(--indigo-2)',
                boxShadow: isOpen && !locked ? `0 8px 32px -12px ${level.color}40, inset 0 1px 0 rgba(246,241,231,.06)` : 'var(--elev-2)',
                opacity: locked ? 0.65 : 1,
              }}
            >
              <button
                type="button"
                className="flex w-full items-center gap-4 p-4 text-left"
                onClick={() => !locked && setOpen(isOpen ? '' : level.stage)}
              >
                {/* level node on the trail */}
                <span
                  className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2"
                  style={
                    level.completed
                      ? { borderColor: level.color, background: `${level.color}22`, boxShadow: `0 0 18px -2px ${level.color}` }
                      : locked
                      ? { borderColor: 'var(--line-2)', background: 'var(--indigo)' }
                      : { borderColor: level.color, background: 'var(--indigo)', boxShadow: `0 0 12px -4px ${level.color}` }
                  }
                >
                  {locked ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  ) : (
                    <span className="text-base" style={{ color: level.color }}>✦</span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="cn-label" style={{ color: locked ? 'var(--fg-3)' : level.color }}>
                      {level.stage}
                    </span>
                    {level.completed && (
                      <span className="text-[10px] font-semibold" style={{ color: level.color }}>
                        complete
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-[var(--fg-2)]">
                    {locked && prev
                      ? `Unlocks when ${prev.stage} reaches ${Math.round(UNLOCK_THRESHOLD * 100)}% — it's at ${Math.round(prev.progress * 100)}%.`
                      : level.tagline}
                  </span>
                </span>

                {!locked && (
                  <span className="shrink-0 text-right">
                    <span className="block text-lg font-bold" style={{ color: level.color }}>
                      {pct}%
                    </span>
                  </span>
                )}
              </button>

              {isOpen && !locked && (
                <div className="border-t border-[var(--line-1)] p-3">
                  <p
                    className="mb-2 px-2.5 pt-1 text-sm italic leading-relaxed"
                    style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-2)' }}
                  >
                    &ldquo;{level.verse.text}&rdquo;
                    <span className="not-italic text-xs text-[var(--fg-3)]"> — {level.verse.ref}</span>
                  </p>
                  <div className="space-y-0.5">
                    {level.steps.map(step => (
                      <StepRow key={step.id} step={step} color={level.color} locked={locked} onAction={onStepAction} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
