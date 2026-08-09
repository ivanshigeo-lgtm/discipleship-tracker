'use client'

// Generic one-question-at-a-time Likert runner, shared by the Spiritual Gifts
// (0–3 scale, 100 Qs) and Big Five (1–5 scale, 50 Qs) onramp tests. Pure UI over a
// question bank + scale from the lib — no auth, no network. Selecting an answer
// records it and auto-advances; the final answer calls onComplete(responses).
import { useState } from 'react'

type Question = { id: number; text: string }
type ScaleOption = { value: number; label: string }

export default function QuestionRunner({
  title,
  subtitle,
  accent,
  questions,
  scale,
  onComplete,
  onExit,
}: {
  title: string
  subtitle: string
  accent: string
  questions: Question[]
  scale: readonly ScaleOption[]
  onComplete: (responses: Record<number, number>) => void
  onExit: () => void
}) {
  const [responses, setResponses] = useState<Record<number, number>>({})
  const [i, setI] = useState(0)

  const q = questions[i]
  const total = questions.length
  const answered = Object.keys(responses).length
  const pct = Math.round((answered / total) * 100)
  const current = responses[q.id]

  const choose = (value: number) => {
    const next = { ...responses, [q.id]: value }
    setResponses(next)
    // Advance after a beat so the selection is visible; complete on the last one.
    if (i < total - 1) {
      window.setTimeout(() => setI((n) => Math.min(n + 1, total - 1)), 160)
    } else {
      window.setTimeout(() => onComplete(next), 200)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <button
          onClick={i === 0 ? onExit : () => setI((n) => Math.max(0, n - 1))}
          className="text-sm text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
        >
          ← {i === 0 ? 'Back to menu' : 'Previous'}
        </button>
        <span className="text-xs font-medium tracking-wide text-[var(--fg-3)]">
          {answered} / {total}
        </span>
      </div>

      <div>
        <h2 className="[font-family:var(--font-display)] text-2xl text-[var(--fg-1)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--fg-3)]">{subtitle}</p>
      </div>

      {/* progress */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--indigo-2)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, background: accent }}
        />
      </div>

      {/* the statement */}
      <div className="rounded-[var(--r-lg)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-6 shadow-[var(--elev-2)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--fg-3)]">
          Question {i + 1}
        </p>
        <p className="mt-3 text-lg leading-relaxed text-[var(--fg-1)]">{q.text}</p>

        <div className="mt-6 flex flex-col gap-2">
          {scale.map((opt) => {
            const selected = current === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => choose(opt.value)}
                className="flex items-center gap-3 rounded-[var(--r-md)] border px-4 py-3 text-left text-sm transition-all"
                style={{
                  borderColor: selected ? accent : 'var(--line-2)',
                  background: selected ? `${accent}22` : 'transparent',
                  color: selected ? 'var(--fg-1)' : 'var(--fg-2)',
                }}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
                  style={{
                    borderColor: selected ? accent : 'var(--line-2)',
                    background: selected ? accent : 'transparent',
                    color: selected ? 'var(--void)' : 'var(--fg-3)',
                  }}
                >
                  {opt.value}
                </span>
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
