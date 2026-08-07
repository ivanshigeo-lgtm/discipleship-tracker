'use client'

// "Your next step" — the home page's ONE loud element (cobalt glow). A single
// dynamic slot that always asks exactly one small, doable thing: the first
// incomplete step of the current level — or, when the level is finished, the
// coach sign-off state (request it / waiting on the coach).

import type { JourneyLevel, JourneyStep } from './journeyModel'

// Steps whose action opens something the disciple can do right now (mirrors
// handleStepAction on the page). Anything else — e.g. coach-verified — gets a
// hint instead of a button.
const CTA_LABELS: Record<string, string> = {
  soap: 'Write an entry',
  testimony: 'Record your story',
  'spiritual-gifts': 'Take the assessment',
  'big-five': 'Take the assessment',
  passion: 'Take the assessment',
  'coach-code': 'Enter your coach’s code',
  'message-coach': 'Message your coach',
  'join-group': 'Find a group',
  'self-confirm': 'Mark it done',
}

export default function NextStepCard({
  level,
  onStepAction,
  onRequestSignoff,
}: {
  level: JourneyLevel
  onStepAction: (step: JourneyStep) => void
  onRequestSignoff: (stage: string) => void
}) {
  const next = level.steps.find(s => !s.completed)

  // Whole journey done and signed off — the hero already says "full circle".
  if (!next && level.signoff === 'approved') return null

  const cta = next ? CTA_LABELS[next.action] : null

  return (
    <section
      className="mt-6 rounded-[var(--r-xl)] border border-[rgba(91,141,247,.35)] bg-[var(--indigo-2)] p-5"
      style={{ boxShadow: 'var(--glow-cobalt)' }}
    >
      <p className="cn-label" style={{ color: level.color }}>
        {level.stage} · your next step
      </p>
      {next ? (
        <>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            {next.title}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-2)]">{next.detail}</p>
          {cta ? (
            <button
              type="button"
              onClick={() => onStepAction(next)}
              className="mt-4 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--gbm-cobalt-bright)' }}
            >
              {cta} →
            </button>
          ) : (
            <p className="mt-3 text-xs text-[var(--fg-3)]">Your coach walks this one with you.</p>
          )}
        </>
      ) : level.signoff === 'requested' ? (
        <>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            {level.stage} complete ✨
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-2)]">
            Waiting on your coach&rsquo;s sign-off — the next level opens the moment they confirm.
          </p>
        </>
      ) : (
        <>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            {level.stage} complete ✨
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-2)]">
            You&rsquo;ve finished every step. Ask your coach to sign off and unlock what&rsquo;s next.
          </p>
          <button
            type="button"
            onClick={() => onRequestSignoff(level.stage)}
            className="mt-4 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--gbm-cobalt-bright)' }}
          >
            Request sign-off →
          </button>
        </>
      )}
    </section>
  )
}
