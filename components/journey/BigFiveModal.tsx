'use client'

import { useEffect, useMemo, useState } from 'react'
import { upsertBigFiveResult } from '../../lib/supabaseQueries'
import {
  QUESTIONS,
  SCALE,
  scoreTraits,
  formatBigFiveForSharing,
  BAND_LABEL,
  TOTAL_QUESTIONS,
  type TraitScore,
} from '../../lib/bigFive'
import type { Person, BigFiveResult } from '../../types/database'

/*
 * "Discover Your Personality" — the Big Five (OCEAN) companion to the Spiritual
 * Gifts assessment. Paged 1-5 Likert over the shared IPIP-50 instrument
 * (lib/bigFive.ts, kept in sync web↔native) → five trait bands, each with a
 * generous "how you'll thrive in serving" note. Draft resumes via localStorage;
 * a saved result opens straight to the results. Mirrors SpiritualGiftsModal.tsx.
 */

type View = 'intro' | 'quiz' | 'results'

const PAGE_SIZE = 10
const PAGE_COUNT = Math.ceil(TOTAL_QUESTIONS / PAGE_SIZE)
const draftKey = (pid: string) => `big-five-draft-v1-${pid}`

// Band → a color for the band chip / score bar.
const BAND_COLOR: Record<TraitScore['band'], string> = {
  high: 'var(--equip)',
  balanced: '#7FB0FF',
  lower: 'var(--fg-3)',
}

export default function BigFiveModal({
  profile,
  existingResult,
  onClose,
  onSaved,
}: {
  profile: Person
  existingResult: BigFiveResult | null
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
  const scores = useMemo<TraitScore[]>(() => scoreTraits(responses), [responses])

  const setAnswer = (qid: number, value: number) =>
    setResponses(prev => ({ ...prev, [qid]: value }))

  const finish = async () => {
    setSaving(true)
    setError('')
    const finalScores = scoreTraits(responses)
    const { error: err } = await upsertBigFiveResult(profile.id, responses, finalScores)
    setSaving(false)
    if (err) {
      setError(err.message || 'Could not save your results. Please try again.')
      return
    }
    try { localStorage.removeItem(draftKey(profile.id)) } catch { /* ignore */ }
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
    const text = formatBigFiveForSharing(scores, profile.name)
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
          <div className="cn-label" style={{ color: 'var(--equip)' }}>Equip · discover your personality</div>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            Your Personality Profile
          </h2>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 pt-3">
          {view === 'intro' && (
            <div>
              <p className="text-sm leading-relaxed text-[var(--fg-2)]">
                God wired each of us differently, and how you&rsquo;re wired shapes where you&rsquo;ll flourish
                in serving. Rate {TOTAL_QUESTIONS} short statements — how much each is true of you — and
                we&rsquo;ll show your <span className="text-[var(--fg-1)]">five personality traits</span>, with
                where you tend to thrive.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-[var(--fg-2)]">
                <li>· Takes about 5–7 minutes</li>
                <li>· There are no better or worse results — every profile has real strengths</li>
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
                    <div className="mt-2 grid grid-cols-5 gap-1.5">
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
                Here&rsquo;s how you&rsquo;re wired. Each trait is a spectrum, not a score to beat — lean into
                your strengths and find a place to serve that fits.
              </p>

              {/* Five trait cards */}
              <div className="mt-4 space-y-3">
                {scores.map(t => (
                  <div key={t.key} className="rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
                        {t.name}
                      </span>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'rgba(91,141,247,.15)', color: 'var(--equip)' }}
                      >
                        {BAND_LABEL[t.band]} · {t.percent}%
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--indigo)]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${t.percent}%`, background: BAND_COLOR[t.band] }}
                      />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--fg-1)]">{t.level.headline}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--fg-2)]">{t.level.ministry}</p>
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
                  {saving ? 'Saving…' : 'See my results'}
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
