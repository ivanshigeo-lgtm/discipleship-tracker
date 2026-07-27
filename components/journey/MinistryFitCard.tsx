'use client'

import { useState } from 'react'
import { MINISTRIES } from '@/lib/ministries'
import type { MinistryFitResult, MinistryFitSuggestion, MinistryFitNewIdea } from '@/types/database'

const metaFor = (name: string) => MINISTRIES.find((m) => m.name === name)

function fitColor(score: number): string {
  if (score >= 85) return 'var(--empower, #F0729F)'
  if (score >= 70) return '#6BD1A0'
  if (score >= 50) return '#7Fb0ff'
  return 'var(--fg-3)'
}

export type MinistryFitProgress = {
  completed: number
  total: number
  /** Human label of the next assessment to take, or null if all done. */
  nextLabel: string | null
  /** Rough time estimate in minutes for the next assessment. */
  nextMinutes?: number
  /** Opens the next assessment. */
  onStartNext?: () => void
}

function SuggestionRow({ s, rank }: { s: MinistryFitSuggestion; rank: number }) {
  const meta = metaFor(s.ministry)
  const pct = Math.max(0, Math.min(100, Math.round(s.fitScore)))
  const color = fitColor(pct)
  return (
    <li className="rounded-[var(--r-lg,14px)] border p-4" style={{ borderColor: 'var(--line, rgba(255,255,255,.10))', background: 'rgba(255,255,255,.03)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,.08)', color: 'var(--fg-2, #cdd3e6)' }}>{rank}</span>
            <h4 className="truncate text-base font-semibold" style={{ color: 'var(--fg-1)' }}>{s.ministry}</h4>
          </div>
          {meta && (
            <p className="mt-1 text-[11px] uppercase tracking-wide" style={{ color: 'var(--fg-3)' }}>
              {meta.department}{meta.leader ? ` · ${meta.leader}` : ''}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold tabular-nums" style={{ color }}>{pct}</div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--fg-3)' }}>fit</div>
        </div>
      </div>
      {/* fit bar */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--fg-2, #cdd3e6)' }}>{s.rationale}</p>
    </li>
  )
}

/** A single blurred, non-interactive teaser row — hints at the real reward. */
function GhostRow({ w, fit }: { w: string; fit: number }) {
  return (
    <li
      aria-hidden
      className="select-none rounded-[var(--r-lg,14px)] border p-4"
      style={{ borderColor: 'var(--line, rgba(255,255,255,.10))', background: 'rgba(255,255,255,.03)', filter: 'blur(5px)', opacity: 0.8 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: 'rgba(255,255,255,.08)' }} />
          <span className="block h-4 rounded" style={{ width: w, background: 'rgba(255,255,255,.18)' }} />
        </div>
        <div className="text-lg font-bold tabular-nums" style={{ color: fitColor(fit) }}>{fit}</div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
        <div className="h-full rounded-full" style={{ width: `${fit}%`, background: fitColor(fit) }} />
      </div>
    </li>
  )
}

/** Locked reward state shown while the disciple is still completing the 3 Equip assessments. */
function LockedTeaser({ progress, title }: { progress: MinistryFitProgress; title: string }) {
  const { completed, total, nextLabel, nextMinutes, onStartNext } = progress
  const pct = Math.round((completed / total) * 100)
  const remaining = total - completed
  return (
    <section
      className="mt-8 rounded-[var(--r-xl)] border p-6"
      style={{
        borderColor: 'rgba(127,176,255,.25)',
        background: 'linear-gradient(180deg, rgba(127,176,255,.08) 0%, rgba(20,27,61,.55) 100%)',
        boxShadow: '0 0 48px -20px rgba(127,176,255,.45)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="cn-label" style={{ color: '#7Fb0ff' }}>Ministry Fit</p>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,.08)', color: 'var(--fg-2, #cdd3e6)' }}>
          <span aria-hidden>🔒</span> {completed} of {total}
        </span>
      </div>
      <h3 className="mt-1 text-xl sm:text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>{title}</h3>

      {/* progress bar — goal gradient */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.08)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#7Fb0ff,#C9A5F5)' }} />
      </div>

      {/* blurred reward preview */}
      <div className="relative mt-5">
        <ul className="space-y-3" aria-hidden>
          <GhostRow w="9rem" fit={92} />
          <GhostRow w="7rem" fit={85} />
        </ul>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="text-2xl" aria-hidden>🔒</span>
        </div>
      </div>

      <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--fg-1)' }}>
        {remaining === 1
          ? 'One more to go — finish it to unlock your top ministries, your SHAPE, and where you’re wired to thrive.'
          : `Complete all three Equip assessments to reveal where you’re wired to serve. ${remaining} to go.`}
      </p>

      {nextLabel && onStartNext && (
        <button
          type="button"
          onClick={onStartNext}
          className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors"
          style={{ background: '#7Fb0ff', color: '#0b1027' }}
        >
          Take the {nextLabel} assessment{nextMinutes ? ` (~${nextMinutes} min)` : ''} →
        </button>
      )}
    </section>
  )
}

export default function MinistryFitCard({
  result,
  title = 'Your Ministry Fit',
  generating = false,
  progress,
  collapsible = false,
  defaultCollapsed = false,
}: {
  result: MinistryFitResult | null
  title?: string
  generating?: boolean
  progress?: MinistryFitProgress
  // When true, the full summary can be folded away with a chevron in the header
  // (the exec summary is long; keep it out of the way once you've read it).
  collapsible?: boolean
  defaultCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  if (!result && !generating) {
    // Not generated yet: show the locked teaser to drive assessment completion.
    if (progress && progress.completed < progress.total) {
      return <LockedTeaser progress={progress} title={title} />
    }
    return null
  }

  const suggestions = (result?.suggestions ?? []) as MinistryFitSuggestion[]
  const newIdeas = (result?.new_ministry_ideas ?? []) as MinistryFitNewIdea[]

  return (
    <section
      className="mt-8 rounded-[var(--r-xl)] border p-6"
      style={{
        borderColor: 'rgba(127,176,255,.25)',
        background: 'linear-gradient(180deg, rgba(127,176,255,.08) 0%, rgba(20,27,61,.55) 100%)',
        boxShadow: '0 0 48px -20px rgba(127,176,255,.45)',
      }}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          aria-expanded={!collapsed}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          <span>
            <span className="cn-label block" style={{ color: '#7Fb0ff' }}>Ministry Fit</span>
            <span className="mt-1 block text-xl sm:text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>{title}</span>
          </span>
          <span
            aria-hidden
            className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border text-[13px] text-[var(--fg-3)] transition-transform"
            style={{ borderColor: 'var(--line-2)', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}
          >
            ▾
          </span>
        </button>
      ) : (
        <>
          <p className="cn-label" style={{ color: '#7Fb0ff' }}>Ministry Fit</p>
          <h3 className="mt-1 text-xl sm:text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>{title}</h3>
        </>
      )}

      {collapsed ? null : generating && !result ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-[var(--fg-3)]">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          Discerning where you’re wired to serve…
        </p>
      ) : (
        <>
          {result?.summary && (
            <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--fg-1)' }}>{result.summary}</p>
          )}
          <ul className="mt-5 space-y-3">
            {suggestions.map((s, i) => (
              <SuggestionRow key={`${s.ministry}-${i}`} s={s} rank={i + 1} />
            ))}
          </ul>

          {newIdeas.length > 0 && (
            <div className="mt-6">
              <p className="cn-label" style={{ color: '#C9A5F5' }}>New ministries you could help start</p>
              <ul className="mt-2 space-y-3">
                {newIdeas.map((n, i) => (
                  <li key={`${n.name}-${i}`} className="rounded-[var(--r-lg,14px)] border border-dashed p-4" style={{ borderColor: 'rgba(201,165,245,.4)', background: 'rgba(201,165,245,.05)' }}>
                    <div className="flex items-center gap-2">
                      <span aria-hidden style={{ color: '#C9A5F5' }}>✦</span>
                      <h4 className="text-base font-semibold" style={{ color: 'var(--fg-1)' }}>{n.name}</h4>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--fg-2, #cdd3e6)' }}>{n.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-[var(--fg-3)]">
            Suggested from your Spiritual Gifts, Personality, and Passion. Talk with your coach about where to take a next step.
          </p>
        </>
      )}
    </section>
  )
}
