'use client'

// Per-test result cards (shown immediately after finishing each test — no PII,
// scored client-side from the same lib functions) + the final consolidated
// ministry-fit summary card.
import { useState, type ReactNode } from 'react'
import { scoreGifts, type GiftScore } from '@/lib/spiritualGifts'
import { scoreTraits, type TraitScore } from '@/lib/bigFive'
import type { PassionAnswers } from '@/lib/passion'

const SHARE_URL = 'https://wikichurch.app/assessment'

const TIER_LABEL: Record<GiftScore['tier'], string> = {
  strong: 'Strong',
  probable: 'Probable',
  some: 'Some',
  little: 'Little',
}

function ResultShell({
  title,
  children,
  onContinue,
  continueLabel,
}: {
  title: string
  children: ReactNode
  onContinue: () => void
  continueLabel: string
}) {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h2 className="[font-family:var(--font-display)] text-2xl text-[var(--fg-1)]">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
      <button onClick={onContinue} className="cn-btn cn-btn-primary w-full">
        {continueLabel}
      </button>
    </div>
  )
}

export function GiftsResult({
  responses,
  onContinue,
  continueLabel,
}: {
  responses: Record<number, number>
  onContinue: () => void
  continueLabel: string
}) {
  const top = scoreGifts(responses).slice(0, 5)
  return (
    <ResultShell title="Your top spiritual gifts" onContinue={onContinue} continueLabel={continueLabel}>
      {top.map((g, idx) => (
        <div
          key={g.key}
          className="rounded-[var(--r-md)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-[var(--fg-1)]">
              {idx + 1}. {g.name}
            </span>
            <span className="text-xs font-medium text-[var(--gold)]">
              {TIER_LABEL[g.tier]} · {g.score}/{g.max}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--fg-3)]">{g.description}</p>
        </div>
      ))}
    </ResultShell>
  )
}

export function BigFiveResult({
  responses,
  onContinue,
  continueLabel,
}: {
  responses: Record<number, number>
  onContinue: () => void
  continueLabel: string
}) {
  const traits: TraitScore[] = scoreTraits(responses)
  return (
    <ResultShell title="Your personality profile" onContinue={onContinue} continueLabel={continueLabel}>
      {traits.map((t) => (
        <div key={t.key} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[var(--fg-1)]">{t.name}</span>
            <span className="text-[var(--fg-3)]">
              {t.band} · {t.percent}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--indigo-2)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${t.percent}%`, background: 'var(--equip)' }}
            />
          </div>
          <p className="text-xs text-[var(--fg-3)]">{t.level?.headline ?? t.description}</p>
        </div>
      ))}
    </ResultShell>
  )
}

export function PassionResult({
  answers,
  onContinue,
  continueLabel,
}: {
  answers: PassionAnswers
  onContinue: () => void
  continueLabel: string
}) {
  return (
    <ResultShell title="Your ministry passion" onContinue={onContinue} continueLabel={continueLabel}>
      <div className="rounded-[var(--r-md)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-3)]">
          People you're drawn to
        </p>
        <p className="mt-1.5 text-sm text-[var(--fg-1)]">{answers.peopleGroups.join(' · ')}</p>
      </div>
      <div className="rounded-[var(--r-md)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-3)]">
          Issues you care about
        </p>
        <p className="mt-1.5 text-sm text-[var(--fg-1)]">{answers.issues.join(' · ')}</p>
      </div>
      <p className="text-sm text-[var(--fg-3)]">
        Your reflections are saved and will shape the summary of how you're wired to serve.
      </p>
    </ResultShell>
  )
}

type Suggestion = { ministry: string; rationale: string; fitScore: number }
type NewIdea = { name: string; rationale: string }

// Plain-text version of the results, for the Copy / Share buttons.
function buildShareText(
  name: string,
  summary: string | null,
  suggestions: Suggestion[],
  newIdeas: NewIdea[]
): string {
  const first = name.split(' ')[0]
  const lines: string[] = [`How ${first} is wired to serve — Grace Bible Maui`, '']
  if (summary) lines.push(summary, '')
  if (suggestions.length) {
    lines.push('Where you might thrive:')
    suggestions.forEach((s, i) =>
      lines.push(`${i + 1}. ${s.ministry} (${s.fitScore}% fit) — ${s.rationale}`)
    )
    lines.push('')
  }
  if (newIdeas.length) {
    lines.push('A ministry you could help pioneer:')
    newIdeas.forEach((n) => lines.push(`• ${n.name} — ${n.rationale}`))
    lines.push('')
  }
  lines.push(`Discover how God wired you to serve: ${SHARE_URL}`)
  return lines.join('\n')
}

function ShareActions({ text, name }: { text: string; name: string }) {
  const [copied, setCopied] = useState(false)

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked (insecure context / permission) — fall back to a prompt.
      window.prompt('Copy your results:', text)
    }
  }

  const doShare = async () => {
    // Web Share API (mobile Safari/Chrome) — native share sheet. Desktop falls back to copy.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: `${name.split(' ')[0]}'s Ministry Fit`, text })
        return
      } catch {
        // user cancelled or share failed — fall through to copy
      }
    }
    void doCopy()
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button onClick={doCopy} className="cn-btn cn-btn-ghost flex-1">
        {copied ? 'Copied ✓' : 'Copy results'}
      </button>
      {canShare && (
        <button onClick={doShare} className="cn-btn cn-btn-primary flex-1">
          Share
        </button>
      )}
    </div>
  )
}

export function SummaryView({
  name,
  summary,
  suggestions,
  newIdeas,
}: {
  name: string
  summary: string | null
  suggestions: Suggestion[]
  newIdeas: NewIdea[]
}) {
  const shareText = buildShareText(name, summary, suggestions, newIdeas)
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-[var(--gold)]">
          Your ministry fit
        </p>
        <h2 className="mt-2 [font-family:var(--font-display)] text-3xl text-[var(--fg-1)]">
          How you're wired to serve, {name.split(' ')[0]}
        </h2>
      </div>

      <ShareActions text={shareText} name={name} />

      {summary ? (
        <p className="rounded-[var(--r-lg)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-6 text-lg leading-relaxed text-[var(--fg-1)] shadow-[var(--elev-2)]">
          {summary}
        </p>
      ) : (
        <p className="rounded-[var(--r-lg)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-6 text-center text-sm text-[var(--fg-3)]">
          Your results are saved. A member of our team will follow up with your personalized
          ministry-fit summary soon.
        </p>
      )}

      {suggestions.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-3)]">
            Where you might thrive
          </h3>
          {suggestions.map((s) => (
            <div
              key={s.ministry}
              className="rounded-[var(--r-md)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-[var(--fg-1)]">{s.ministry}</span>
                <span className="text-xs font-medium text-[var(--gold)]">{s.fitScore}% fit</span>
              </div>
              <p className="mt-1 text-sm text-[var(--fg-2)]">{s.rationale}</p>
            </div>
          ))}
        </section>
      )}

      {newIdeas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-3)]">
            A ministry you could help pioneer
          </h3>
          {newIdeas.map((n) => (
            <div
              key={n.name}
              className="rounded-[var(--r-md)] border border-dashed border-[var(--empower)] bg-[var(--indigo-2)] p-4"
            >
              <span className="text-base font-semibold text-[var(--fg-1)]">{n.name}</span>
              <p className="mt-1 text-sm text-[var(--fg-2)]">{n.rationale}</p>
            </div>
          ))}
        </section>
      )}

      <p className="text-center text-sm text-[var(--fg-3)]">
        Thank you for sharing how God has shaped you. Someone from Grace Bible Maui will reach out
        to help you take a next step.
      </p>
    </div>
  )
}
