'use client'

import { MINISTRIES } from '@/lib/ministries'
import type { MinistryFitResult, MinistryFitSuggestion } from '@/types/database'

const metaFor = (name: string) => MINISTRIES.find((m) => m.name === name)

function fitColor(score: number): string {
  if (score >= 85) return 'var(--empower, #F0729F)'
  if (score >= 70) return '#6BD1A0'
  if (score >= 50) return '#7Fb0ff'
  return 'var(--fg-3)'
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

export default function MinistryFitCard({
  result,
  title = 'Your Ministry Fit',
  generating = false,
}: {
  result: MinistryFitResult | null
  title?: string
  generating?: boolean
}) {
  if (!result && !generating) return null

  const suggestions = (result?.suggestions ?? []) as MinistryFitSuggestion[]

  return (
    <section
      className="mt-8 rounded-[var(--r-xl)] border p-6"
      style={{
        borderColor: 'rgba(127,176,255,.25)',
        background: 'linear-gradient(180deg, rgba(127,176,255,.08) 0%, rgba(20,27,61,.55) 100%)',
        boxShadow: '0 0 48px -20px rgba(127,176,255,.45)',
      }}
    >
      <p className="cn-label" style={{ color: '#7Fb0ff' }}>Ministry Fit</p>
      <h3 className="mt-1 text-xl sm:text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>{title}</h3>

      {generating && !result ? (
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
          <p className="mt-4 text-[11px] leading-relaxed text-[var(--fg-3)]">
            Suggested from your Spiritual Gifts, Personality, and Passion. Talk with your coach about where to take a next step.
          </p>
        </>
      )}
    </section>
  )
}
