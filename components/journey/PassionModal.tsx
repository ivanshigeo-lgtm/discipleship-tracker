'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { upsertPassionResult } from '../../lib/supabaseQueries'
import {
  REFLECTIONS,
  PEOPLE_GROUPS,
  ISSUES,
  RANK_COUNT,
  PEOPLE_RANK_COUNT,
  emptyPassionAnswers,
  normalizePassionAnswers,
  isPassionComplete,
  toggleRanked,
  formatPassionForSharing,
  type PassionAnswers,
} from '../../lib/passion'
import type { Person, PassionResult } from '../../types/database'

/*
 * "Discover Your Passion" — the GBC Passion Assessment, a reflective companion
 * to Spiritual Gifts and Big Five: five open prompts draw out the heart's
 * desire, then the person ranks their top three people-groups and top three
 * issues. Nothing is scored; the results collate what they wrote and chose so
 * it can be prayed over and shared with a coach. Draft resumes via localStorage;
 * a saved result opens straight to the results. Mirrors BigFiveModal.tsx.
 */

type View = 'intro' | 'reflect' | 'people' | 'issues' | 'results'

const draftKey = (pid: string) => `passion-draft-v1-${pid}`

export default function PassionModal({
  profile,
  existingResult,
  onClose,
  onSaved,
}: {
  profile: Person
  existingResult: PassionResult | null
  onClose: () => void
  onSaved: () => void
}) {
  const [view, setView] = useState<View>(existingResult ? 'results' : 'intro')
  const [answers, setAnswers] = useState<PassionAnswers>(
    existingResult ? normalizePassionAnswers(existingResult.answers) : emptyPassionAnswers()
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  // Free-text "Other" people-group being typed (added on Add / Enter).
  const [customPeople, setCustomPeople] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  // Each step must open at the top — the body keeps its scroll offset across
  // view changes, so people landed mid-list with the step's blurb off-screen.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [view])

  // Resume an in-progress draft (only when there's no saved result yet).
  useEffect(() => {
    if (existingResult) return
    try {
      const raw = localStorage.getItem(draftKey(profile.id))
      if (raw) {
        const norm = normalizePassionAnswers(JSON.parse(raw))
        if (norm.peopleGroups.length || norm.issues.length || Object.keys(norm.reflections).length) {
          setAnswers(norm)
        }
      }
    } catch { /* ignore malformed draft */ }
  }, [profile.id, existingResult])

  // Persist the draft as they go, so refreshing/closing resumes cleanly.
  useEffect(() => {
    if (view === 'intro' || view === 'results') return
    try {
      localStorage.setItem(draftKey(profile.id), JSON.stringify(answers))
    } catch { /* quota — resume just won't work */ }
  }, [answers, view, profile.id])

  const reflectionsDone = REFLECTIONS.every(r => (answers.reflections[r.id] ?? '').trim().length > 0)
  const hasDraft = useMemo(
    () =>
      answers.peopleGroups.length > 0 ||
      answers.issues.length > 0 ||
      Object.values(answers.reflections).some(v => v.trim().length > 0),
    [answers]
  )

  const setReflection = (id: number, text: string) =>
    setAnswers(prev => ({ ...prev, reflections: { ...prev.reflections, [id]: text } }))
  const togglePeople = (opt: string) =>
    setAnswers(prev => ({ ...prev, peopleGroups: toggleRanked(prev.peopleGroups, opt, RANK_COUNT) }))
  const toggleIssue = (opt: string) =>
    setAnswers(prev => ({ ...prev, issues: toggleRanked(prev.issues, opt) }))
  const addCustomPeople = () => {
    const t = customPeople.trim()
    if (!t) return
    setAnswers(prev =>
      prev.peopleGroups.some(g => g.toLowerCase() === t.toLowerCase()) || prev.peopleGroups.length >= RANK_COUNT
        ? prev
        : { ...prev, peopleGroups: [...prev.peopleGroups, t] }
    )
    setCustomPeople('')
  }

  const rankOf = (list: string[], opt: string) => {
    const i = list.indexOf(opt)
    return i === -1 ? null : i + 1
  }

  const finish = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await upsertPassionResult(profile.id, answers)
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
    setAnswers(emptyPassionAnswers())
    setView('reflect')
  }

  // Copy/share the results so they can be sent to a coach or a Grace Group.
  // Prefer the OS share sheet on mobile web; fall back to clipboard elsewhere.
  const shareResults = async () => {
    const text = formatPassionForSharing(answers, profile.name)
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

  // A ranked-option chip list (people-groups / issues). Tap to rank 1–3; tap
  // again to remove and the rest re-number automatically.
  const RankList = ({ options, selected, onToggle, cap = RANK_COUNT }: {
    options: string[]
    selected: string[]
    onToggle: (opt: string) => void
    cap?: number
  }) => (
    <div className="mt-3.5 space-y-2">
      {options.map(opt => {
        const rank = rankOf(selected, opt)
        const active = rank !== null
        const disabled = !active && selected.length >= cap
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            disabled={disabled}
            className="flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-40"
            style={{
              borderColor: active ? 'var(--equip)' : 'var(--line-2)',
              background: active ? 'rgba(91,141,247,.15)' : 'transparent',
            }}
          >
            <span
              className="min-w-0 pr-2 text-sm font-medium"
              style={{ color: active ? 'var(--fg-1)' : 'var(--fg-2)' }}
            >
              {opt}
            </span>
            {active && (
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ background: 'var(--equip)', color: 'var(--void)' }}
              >
                {rank}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)]"
        style={{ boxShadow: 'var(--elev-2)' }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="px-6 pt-6">
          <div className="cn-label" style={{ color: 'var(--equip)' }}>Equip · discover your passion</div>
          <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            Your Passion
          </h2>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 pb-2 pt-3">
          {view === 'intro' && (
            <div>
              <p className="text-sm leading-relaxed text-[var(--fg-2)]">
                God stirs each heart toward certain people and certain needs. Prayerfully answer a few
                open questions, then choose who and what you feel most drawn to serve. This isn&rsquo;t
                scored — it&rsquo;s a mirror for what God may be calling you toward.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-[var(--fg-2)]">
                <li>· There are no right or wrong answers</li>
                <li>· Don&rsquo;t worry about whether you can do it or how — answer as if nothing could stop you</li>
                <li>· Takes about 5–10 minutes</li>
                <li>· Your progress saves as you go</li>
              </ul>
              {hasDraft && !existingResult && (
                <p className="mt-4 rounded-lg bg-[var(--indigo-2)] px-3 py-2 text-xs text-[var(--fg-2)]">
                  You have an unfinished attempt saved.
                </p>
              )}
            </div>
          )}

          {view === 'reflect' && (
            <div>
              <div className="cn-label mb-1" style={{ color: 'var(--equip)' }}>Reflect · 1 of 3</div>
              <p className="text-sm leading-relaxed text-[var(--fg-2)]">Take your time. A sentence or two is plenty.</p>
              <div className="mt-2 space-y-5">
                {REFLECTIONS.map((r, i) => (
                  <div key={r.id}>
                    <p className="text-sm leading-snug text-[var(--fg-1)]">
                      <span className="text-[var(--fg-3)]">{i + 1}. </span>{r.text}
                    </p>
                    <textarea
                      value={answers.reflections[r.id] ?? ''}
                      onChange={e => setReflection(r.id, e.target.value)}
                      placeholder="Your reflection…"
                      rows={3}
                      className="mt-2 w-full resize-y rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-3)] focus:border-[var(--equip)]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 'people' && (
            <div>
              <div className="cn-label mb-1" style={{ color: 'var(--equip)' }}>Who · 2 of 3</div>
              <p className="text-sm leading-relaxed text-[var(--fg-2)]">
                Select up to three people-groups you&rsquo;re most passionate about serving. Tap to rank
                them 1–3; tap again to remove. Two is plenty if a third doesn&rsquo;t fit.
                ({answers.peopleGroups.length}/{RANK_COUNT})
              </p>
              <RankList
                options={PEOPLE_GROUPS}
                selected={answers.peopleGroups}
                onToggle={togglePeople}
                cap={RANK_COUNT}
              />
              {/* Custom picks (added via the Other box) — click to remove, same as presets. */}
              <div className="mt-2 space-y-2">
                {answers.peopleGroups.filter(g => !PEOPLE_GROUPS.includes(g)).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => togglePeople(opt)}
                    className="flex w-full items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors"
                    style={{ borderColor: 'var(--equip)', background: 'rgba(91,141,247,.15)' }}
                  >
                    <span className="min-w-0 pr-2 text-sm font-medium" style={{ color: 'var(--fg-1)' }}>{opt}</span>
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                      style={{ background: 'var(--equip)', color: 'var(--void)' }}
                    >
                      {rankOf(answers.peopleGroups, opt)}
                    </span>
                  </button>
                ))}
                <div className="flex items-center gap-2">
                  <input
                    value={customPeople}
                    onChange={e => setCustomPeople(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomPeople() } }}
                    placeholder="Other — type your own…"
                    className="min-w-0 flex-1 rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] px-3.5 py-2.5 text-sm text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-3)] focus:border-[var(--equip)]"
                  />
                  <button
                    type="button"
                    onClick={addCustomPeople}
                    disabled={!customPeople.trim() || answers.peopleGroups.length >= RANK_COUNT}
                    className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--equip)', color: 'var(--void)' }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {view === 'issues' && (
            <div>
              <div className="cn-label mb-1" style={{ color: 'var(--equip)' }}>What · 3 of 3</div>
              <p className="text-sm leading-relaxed text-[var(--fg-2)]">
                Select the three issues you&rsquo;re most passionate about getting involved in. Tap to rank
                them 1–3; tap again to remove. ({answers.issues.length}/{RANK_COUNT})
              </p>
              <RankList options={ISSUES} selected={answers.issues} onToggle={toggleIssue} />
            </div>
          )}

          {view === 'results' && (
            <div>
              <p className="text-sm leading-relaxed text-[var(--fg-2)]">
                Here&rsquo;s what stirs your heart. Pray over it, and talk it through with your coach — this
                is often where God&rsquo;s calling starts to take shape.
              </p>

              <h3 className="cn-label mt-5 mb-2.5" style={{ color: 'var(--equip)' }}>Reflections</h3>
              <div className="space-y-3">
                {REFLECTIONS.map((r, i) => (
                  <div key={r.id} className="rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] p-3.5">
                    <p className="text-[13px] font-medium leading-snug text-[var(--fg-2)]">{i + 1}. {r.text}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-1)]">
                      {(answers.reflections[r.id] ?? '').trim() || '—'}
                    </p>
                  </div>
                ))}
              </div>

              <h3 className="cn-label mt-5 mb-2.5" style={{ color: 'var(--equip)' }}>People I&rsquo;m most drawn to serve</h3>
              <div className="space-y-2">
                {answers.peopleGroups.length ? (
                  answers.peopleGroups.map((g, i) => (
                    <div key={g} className="flex items-center gap-2.5">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ background: 'var(--equip)', color: 'var(--void)' }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[15px] font-medium text-[var(--fg-1)]">{g}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--fg-1)]">—</p>
                )}
              </div>

              <h3 className="cn-label mt-5 mb-2.5" style={{ color: 'var(--equip)' }}>Issues that stir my heart</h3>
              <div className="space-y-2">
                {answers.issues.length ? (
                  answers.issues.map((s, i) => (
                    <div key={s} className="flex items-center gap-2.5">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                        style={{ background: 'var(--equip)', color: 'var(--void)' }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[15px] font-medium text-[var(--fg-1)]">{s}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--fg-1)]">—</p>
                )}
              </div>

              {/* Copy / share results — to send to a coach or Grace Group */}
              <button
                type="button"
                onClick={shareResults}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors"
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
              <button type="button" onClick={() => setView('reflect')} className="cn-btn cn-btn-primary flex-1">
                {hasDraft && !existingResult ? 'Resume' : 'Begin'}
              </button>
            </>
          )}

          {view === 'reflect' && (
            <>
              <button type="button" onClick={() => setView('intro')} className="cn-btn cn-btn-ghost flex-1">Back</button>
              <button
                type="button"
                onClick={() => setView('people')}
                disabled={!reflectionsDone}
                className="cn-btn cn-btn-primary flex-1 disabled:opacity-40"
              >
                Next
              </button>
            </>
          )}

          {view === 'people' && (
            <>
              <button type="button" onClick={() => setView('reflect')} className="cn-btn cn-btn-ghost flex-1">Back</button>
              <button
                type="button"
                onClick={() => setView('issues')}
                disabled={answers.peopleGroups.length < PEOPLE_RANK_COUNT}
                className="cn-btn cn-btn-primary flex-1 disabled:opacity-40"
              >
                Next
              </button>
            </>
          )}

          {view === 'issues' && (
            <>
              <button type="button" onClick={() => setView('people')} className="cn-btn cn-btn-ghost flex-1">Back</button>
              <button
                type="button"
                onClick={finish}
                disabled={!isPassionComplete(answers) || saving}
                className="cn-btn cn-btn-primary flex-1 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'See my summary'}
              </button>
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
