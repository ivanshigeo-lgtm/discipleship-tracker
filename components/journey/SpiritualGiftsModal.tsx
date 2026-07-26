'use client'

import { useEffect, useMemo, useState } from 'react'
import { upsertSpiritualGiftsResult } from '../../lib/supabaseQueries'
import {
  QUESTIONS,
  SCALE,
  scoreGifts,
  topGifts as computeTopGifts,
  formatGiftsForSharing,
  TIER_LABEL,
  TOTAL_QUESTIONS,
  type GiftScore,
} from '../../lib/spiritualGifts'
import type { Person, SpiritualGiftsResult } from '../../types/database'

type View = 'intro' | 'quiz' | 'results'

const PAGE_SIZE = 10
const PAGE_COUNT = Math.ceil(TOTAL_QUESTIONS / PAGE_SIZE)
const draftKey = (pid: string) => `spiritual-gifts-draft-v1-${pid}`

// Standard Houts thresholds → a color for the tier chip / score bar.
const TIER_COLOR: Record<GiftScore['tier'], string> = {
  strong: 'var(--equip)',
  probable: '#7FB0FF',
  some: 'var(--fg-3)',
  little: 'var(--line-1)',
}

export default function SpiritualGiftsModal({
  profile,
  existingResult,
  onClose,
  onSaved,
}: {
  profile: Person
  existingResult: SpiritualGiftsResult | null
  onClose: () => void
  onSaved: () => void
}) {
  // If a result already exists, land on it; otherwise the intro.
  const [view, setView] = useState<View>(existingResult ? 'results' : 'intro')
  const [responses, setResponses] = useState<Record<number, number>>(
    existingResult?.responses
      ? Object.fromEntries(Object.entries(existingResult.responses).map(([k, v]) => [Number(k), Number(v)]))
      : {}
  )
  const [page, setPage] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState(false)

  // Resume an in-progress draft (only when there's no saved result yet).
  useEffect(() => {
    if (existingResult) return
    try {
      const raw = localStorage.getItem(draftKey(profile.id))
      if (raw) {
        const d = JSON.parse(raw) as { responses?: Record<string, number>; page?: number }
        if (d.responses && Object.keys(d.responses).length) {
          setResponses(Object.fromEntries(Object.entries(d.responses).map(([k, v]) => [Number(k), Number(v)])))
          if (typeof d.page === 'number') setPage(Math.min(Math.max(0, d.page), PAGE_COUNT - 1))
        }
      }
    } catch { /* ignore malformed draft */ }
  }, [profile.id, existingResult])

  // Persist the draft as they answer, so refreshing/closing resumes cleanly.
  useEffect(() => {
    if (view !== 'quiz') return
    try {
      localStorage.setItem(draftKey(profile.id), JSON.stringify({ responses, page }))
    } catch { /* quota — resume just won't work */ }
  }, [responses, page, view, profile.id])

  const answeredCount = Object.keys(responses).length
  const pageQuestions = useMemo(
    () => QUESTIONS.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [page]
  )
  const pageAnswered = pageQuestions.every(q => responses[q.id] !== undefined)
  const scores = useMemo<GiftScore[]>(() => scoreGifts(responses), [responses])
  const top3 = useMemo(() => computeTopGifts(responses, 3), [responses])

  const setAnswer = (qid: number, value: number) =>
    setResponses(prev => ({ ...prev, [qid]: value }))

  const finish = async () => {
    setSaving(true)
    setError('')
    const finalScores = scoreGifts(responses)
    const finalTop = finalScores.slice(0, 3)
    const { error: err } = await upsertSpiritualGiftsResult(profile.id, responses, finalScores, finalTop)
    setSaving(false)
    if (err) {
      setError(err.message || 'Could not save your results. Please try again.')
      return
    }
    try { localStorage.removeItem(draftKey(profile.id)) } catch { /* ignore */ }
    setShowAll(false)
    setView('results')
    onSaved()
  }

  const startFresh = () => {
    setResponses({})
    setPage(0)
    setView('quiz')
  }

  // Copy/share the results so they can be sent to a coach or a Grace Group.
  // Prefer the OS share sheet on mobile web; fall back to clipboard elsewhere.
  const shareResults = async () => {
    const text = formatGiftsForSharing(scores, profile.name)
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* user dismissed the share sheet, or clipboard was blocked */ }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)]"
        style={{ boxShadow: 'var(--elev-2)' }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="px-6 pt-6">
          <div className="cn-label" style={{ color: 'var(--equip)' }}>Equip · discover your gifts</div>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            Your Spiritual Gifts
          </h2>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 pt-3">
          {view === 'intro' && (
            <div>
              <p className="text-sm leading-relaxed text-[var(--fg-2)]">
                God has given every believer gifts to serve His body (<span className="italic">Ephesians 4:12</span>).
                Rate {TOTAL_QUESTIONS} short statements — how often each is true of you — and we&rsquo;ll surface your{' '}
                <span className="text-[var(--fg-1)]">top three gifts</span>, with ways to put them to work.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-[var(--fg-2)]">
                <li>· Takes about 8–10 minutes</li>
                <li>· Answer honestly about how you <span className="italic">actually</span> are, not how you wish to be</li>
                <li>· Your progress saves as you go</li>
              </ul>
              {answeredCount > 0 && !existingResult && (
                <p className="mt-4 rounded-lg bg-[var(--indigo-2)] px-3 py-2 text-xs text-[var(--fg-2)]">
                  You have an unfinished attempt ({answeredCount}/{TOTAL_QUESTIONS} answered).
                </p>
              )}
            </div>
          )}

          {view === 'quiz' && (
            <div>
              {/* Progress */}
              <div className="sticky top-0 -mx-6 mb-3 bg-[var(--indigo)] px-6 pb-2 pt-1">
                <div className="flex items-center justify-between text-xs text-[var(--fg-3)]">
                  <span>Page {page + 1} of {PAGE_COUNT}</span>
                  <span>{answeredCount}/{TOTAL_QUESTIONS} answered</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--indigo-2)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(answeredCount / TOTAL_QUESTIONS) * 100}%`, background: 'var(--equip)' }}
                  />
                </div>
              </div>

              <div className="space-y-5">
                {pageQuestions.map((q, i) => (
                  <div key={q.id}>
                    <p className="text-sm leading-snug text-[var(--fg-1)]">
                      <span className="text-[var(--fg-3)]">{page * PAGE_SIZE + i + 1}.</span> {q.text}
                    </p>
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {SCALE.map(s => {
                        const active = responses[q.id] === s.value
                        return (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => setAnswer(q.id, s.value)}
                            className="rounded-lg border py-2 text-[11px] font-medium transition-colors"
                            style={{
                              borderColor: active ? 'var(--equip)' : 'var(--line-2)',
                              background: active ? 'rgba(91,141,247,.15)' : 'transparent',
                              color: active ? 'var(--fg-1)' : 'var(--fg-3)',
                            }}
                          >
                            {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'results' && (
            <div>
              <p className="text-sm leading-relaxed text-[var(--fg-2)]">
                Based on your answers, these gifts shine brightest in you. Lean into them — and find a place to serve.
              </p>

              {/* Top 3 */}
              <div className="mt-4 space-y-3">
                {top3.map((g, i) => (
                  <div key={g.key} className="rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] p-4">
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-[var(--equip)]">#{i + 1}</span>
                        <span className="text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
                          {g.name}
                        </span>
                      </div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'rgba(91,141,247,.15)', color: 'var(--equip)' }}
                      >
                        {TIER_LABEL[g.tier]} · {g.score}/{g.max}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">{g.description}</p>
                    {g.ministries.length > 0 && (
                      <div className="mt-3">
                        <div className="cn-label text-[var(--fg-3)]">Ways to serve</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {g.ministries.map(m => (
                            <span
                              key={m}
                              className="rounded-full border border-[var(--line-2)] px-2.5 py-1 text-[11px] text-[var(--fg-2)]"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Copy / share results — to send to a coach or Grace Group */}
              <button
                type="button"
                onClick={shareResults}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors"
                style={{
                  borderColor: copied ? 'var(--equip)' : 'var(--line-2)',
                  background: 'var(--indigo-2)',
                  color: 'var(--fg-1)',
                }}
              >
                {copied ? '✓ Copied — paste it to your coach or group' : 'Copy my results to share'}
              </button>

              {/* Full ranked list */}
              <button
                type="button"
                onClick={() => setShowAll(v => !v)}
                className="mt-4 text-xs text-[var(--equip)] underline"
              >
                {showAll ? 'Hide full ranking' : 'See all 25 gifts ranked'}
              </button>
              {showAll && (
                <div className="mt-3 space-y-2">
                  {scores.map((g, i) => (
                    <div key={g.key} className="flex items-center gap-3">
                      <span className="w-5 text-right text-[11px] text-[var(--fg-3)]">{i + 1}</span>
                      <span className="w-28 shrink-0 truncate text-sm text-[var(--fg-1)]">{g.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--indigo-2)]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(g.score / g.max) * 100}%`, background: TIER_COLOR[g.tier] }}
                        />
                      </div>
                      <span className="w-8 text-right text-[11px] text-[var(--fg-3)]">{g.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>}
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="flex gap-2 border-t border-[var(--line-2)] px-6 py-4">
          {view === 'intro' && (
            <>
              <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost flex-1">Not now</button>
              <button type="button" onClick={() => setView('quiz')} className="cn-btn cn-btn-primary flex-1">
                {answeredCount > 0 && !existingResult ? 'Resume' : 'Begin'}
              </button>
            </>
          )}

          {view === 'quiz' && (
            <>
              <button
                type="button"
                onClick={() => (page === 0 ? setView('intro') : setPage(p => p - 1))}
                className="cn-btn cn-btn-ghost flex-1"
              >
                Back
              </button>
              {page < PAGE_COUNT - 1 ? (
                <button
                  type="button"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!pageAnswered}
                  className="cn-btn cn-btn-primary flex-1 disabled:opacity-40"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finish}
                  disabled={!pageAnswered || saving}
                  className="cn-btn cn-btn-primary flex-1 disabled:opacity-40"
                >
                  {saving ? 'Saving…' : 'See my gifts'}
                </button>
              )}
            </>
          )}

          {view === 'results' && (
            <>
              <button type="button" onClick={startFresh} className="cn-btn cn-btn-ghost flex-1">Retake</button>
              <button type="button" onClick={onClose} className="cn-btn cn-btn-primary flex-1">Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
