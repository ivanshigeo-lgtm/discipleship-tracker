'use client'

import { useState } from 'react'

// Strip any stray markdown so the reflection reads as clean prose.
export function cleanInsight(text: string): string {
  return text
    .replace(/^\s*#{1,6}\s+/gm, '')      // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // bold
    .replace(/\*([^*]+)\*/g, '$1')       // italics
    .replace(/`([^`]+)`/g, '$1')         // inline code
    .replace(/^\s*[-•]\s+/gm, '')        // bullets
    .trim()
}

// Mode 1 of the SOAP AI: one tap summarizes the last 7 days. The result is
// collapsible and dismissible so it doesn't linger.
export default function WeeklyInsightCard({
  summary,
  journalCount,
  loading,
  note,
  onGather,
  onClear,
}: {
  summary: string | null
  journalCount: number
  loading: boolean
  note: string
  onGather: () => void
  onClear: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: 'rgba(91,141,247,.30)',
        background: 'linear-gradient(145deg, rgba(91,141,247,.06) 0%, var(--indigo, #141B3D) 100%)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="group relative min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm" style={{ color: 'var(--gbm-cobalt-soft, #8FB0FF)' }}>✦</span>
            <span className="text-sm font-bold text-[var(--fg-1)]">Weekly insight</span>
            <span className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-[var(--line-2)] text-[8px] font-bold text-[var(--fg-3)]">i</span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--fg-3)]">Your last 7 days, in one tap</p>
          <div className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-64 rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] p-2.5 text-[11px] leading-relaxed text-[var(--fg-2)] shadow-xl group-hover:block">
            A gentle weekly reflection on your time in the Word. Tap &ldquo;Gather this week&rdquo; — your guide reads your last 7 days of SOAPs and sums up what God seems to be saying.
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {summary ? (
            <>
              <button type="button" onClick={() => setCollapsed(c => !c)} className="cn-chip !py-0.5 !text-[11px]">
                {collapsed ? 'Expand' : 'Collapse'}
              </button>
              <button
                type="button"
                onClick={onClear}
                aria-label="Dismiss weekly insight"
                className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--fg-3)] hover:bg-[var(--indigo-2)] hover:text-[var(--fg-1)]"
              >
                ×
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onGather}
              disabled={loading}
              className="rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60"
              style={{ background: 'var(--gbm-cobalt-bright)', color: '#fff' }}
            >
              {loading ? 'Listening…' : 'Gather this week'}
            </button>
          )}
        </div>
      </div>

      {summary && !collapsed && (
        <div className="mt-3 border-t border-[var(--line-1)] pt-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg-2)]">{cleanInsight(summary)}</p>
          <p className="mt-2 text-xs text-[var(--fg-3)]">From {journalCount} {journalCount === 1 ? 'entry' : 'entries'} in the last 7 days</p>
        </div>
      )}

      {!summary && note && <p className="mt-2 text-xs text-[var(--fg-3)]">{note}</p>}
    </div>
  )
}
