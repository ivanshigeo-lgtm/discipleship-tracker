'use client'

// Passion assessment for the onramp — reflective, not scored. Three sections on one
// scrollable page: 5 open reflections, rank the people-groups you're drawn to
// (2–3), and pick the 3 issues you care about most (ordered by tap). Reuses the
// lib's prompt/option banks + isPassionComplete gate.
import { useState } from 'react'
import {
  REFLECTIONS,
  PEOPLE_GROUPS,
  ISSUES,
  RANK_COUNT,
  PEOPLE_RANK_COUNT,
  isPassionComplete,
  type PassionAnswers,
} from '@/lib/passion'

const ACCENT = 'var(--engage)'

export default function PassionRunner({
  onComplete,
  onExit,
}: {
  onComplete: (answers: PassionAnswers) => void
  onExit: () => void
}) {
  const [reflections, setReflections] = useState<Record<number, string>>({})
  const [peopleGroups, setPeopleGroups] = useState<string[]>([])
  const [issues, setIssues] = useState<string[]>([])

  // Tap-to-rank: add to the ordered list, or remove (re-numbering the rest).
  const toggleRanked = (
    list: string[],
    setList: (v: string[]) => void,
    value: string,
    max: number
  ) => {
    if (list.includes(value)) setList(list.filter((v) => v !== value))
    else if (list.length < max) setList([...list, value])
  }

  const answers: PassionAnswers = { reflections, peopleGroups, issues }
  const complete = isPassionComplete(answers)

  const rankChip = (list: string[], value: string, accent: string) => {
    const rank = list.indexOf(value)
    const selected = rank >= 0
    return (
      <button
        key={value}
        onClick={() => {}}
        className="relative flex items-center gap-2 rounded-[var(--r-pill)] border px-4 py-2 text-sm transition-all"
        style={{
          borderColor: selected ? accent : 'var(--line-2)',
          background: selected ? `${accent}22` : 'transparent',
          color: selected ? 'var(--fg-1)' : 'var(--fg-2)',
        }}
      >
        {selected && (
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: accent, color: 'var(--void)' }}
          >
            {rank + 1}
          </span>
        )}
        {value}
      </button>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <button
          onClick={onExit}
          className="text-sm text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
        >
          ← Back to menu
        </button>
      </div>

      <div>
        <h2 className="[font-family:var(--font-display)] text-2xl text-[var(--fg-1)]">Ministry Passion</h2>
        <p className="mt-1 text-sm text-[var(--fg-3)]">
          There are no wrong answers — this is about the burdens and dreams God has put in you.
        </p>
      </div>

      {/* Reflections */}
      <section className="flex flex-col gap-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-3)]">
          Reflect
        </h3>
        {REFLECTIONS.map((r) => (
          <div key={r.id} className="flex flex-col gap-2">
            <label className="text-sm text-[var(--fg-1)]">{r.text}</label>
            <textarea
              value={reflections[r.id] ?? ''}
              onChange={(e) => setReflections((prev) => ({ ...prev, [r.id]: e.target.value }))}
              rows={2}
              className="w-full resize-y rounded-[var(--r-md)] border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              placeholder="Your thoughts…"
            />
          </div>
        ))}
      </section>

      {/* People groups */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-3)]">
            Who are you drawn to?
          </h3>
          <p className="mt-1 text-sm text-[var(--fg-3)]">
            Tap {PEOPLE_RANK_COUNT}–{RANK_COUNT} people-groups in order of pull ({peopleGroups.length} chosen).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PEOPLE_GROUPS.map((g) => (
            <span
              key={g}
              onClick={() => toggleRanked(peopleGroups, setPeopleGroups, g, RANK_COUNT)}
              className="cursor-pointer"
            >
              {rankChip(peopleGroups, g, 'var(--equip)')}
            </span>
          ))}
        </div>
      </section>

      {/* Issues */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-3)]">
            What issues stir you?
          </h3>
          <p className="mt-1 text-sm text-[var(--fg-3)]">
            Tap exactly {RANK_COUNT} in order of priority ({issues.length} chosen).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ISSUES.map((s) => (
            <span
              key={s}
              onClick={() => toggleRanked(issues, setIssues, s, RANK_COUNT)}
              className="cursor-pointer"
            >
              {rankChip(issues, s, 'var(--establish)')}
            </span>
          ))}
        </div>
      </section>

      <button
        disabled={!complete}
        onClick={() => onComplete(answers)}
        className="cn-btn cn-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: complete ? ACCENT : undefined }}
      >
        {complete ? 'See my results' : 'Finish all sections to continue'}
      </button>
    </div>
  )
}
