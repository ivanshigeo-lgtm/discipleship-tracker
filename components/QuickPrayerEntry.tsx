'use client'

import { useMemo, useState } from 'react'
import { addPrayerRequest, addPraise } from '../lib/supabaseQueries'
import type { Person } from '../types/database'

// Quick prayer/praise entry for the Engagements section: pick a person, jot a
// prayer request or a praise, and it posts to the Prayer Wall / praise side.
export default function QuickPrayerEntry({
  people,
  onAdded,
}: {
  people: Person[]
  onAdded?: () => void
}) {
  const [selected, setSelected] = useState<Person | null>(null)
  const [search, setSearch] = useState('')
  const [focused, setFocused] = useState(false)
  const [kind, setKind] = useState<'prayer' | 'praise'>('prayer')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedFor, setSavedFor] = useState('')

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return people
      .filter(p => p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [search, people])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !text.trim()) return
    setLoading(true)
    setError('')
    const { error } = kind === 'praise'
      ? await addPraise(selected.id, text.trim())
      : await addPrayerRequest({
          person_id: selected.id,
          request: text.trim(),
          status: 'Active',
          answered_date: null,
          answer_notes: null,
        })
    if (error) {
      setError(error.message)
    } else {
      setSavedFor(`${kind === 'praise' ? 'Praise' : 'Prayer'} added for ${selected.name}`)
      setText('')
      onAdded?.()
      setTimeout(() => setSavedFor(''), 2500)
    }
    setLoading(false)
  }

  return (
    <div className="cn-card mb-6 p-4">
      <h3 className="text-sm font-semibold text-[var(--fg-1)]">Add a prayer or praise</h3>
      <p className="mt-0.5 text-xs text-[var(--fg-3)]">Posts to the Prayer Wall and praise wall.</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Person picker */}
        <div className="relative sm:w-56">
          {selected ? (
            <div className="flex items-center justify-between gap-2 rounded-full border border-[var(--line-2)] bg-[var(--indigo)] px-3 py-1.5 text-xs text-[var(--fg-1)]">
              <span className="truncate font-medium">{selected.name}</span>
              <button
                type="button"
                onClick={() => { setSelected(null); setSearch('') }}
                className="shrink-0 text-[var(--fg-3)] hover:text-[var(--fg-1)]"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                placeholder="Find person…"
                className="h-8 w-full rounded-full border border-[var(--line-2)] bg-[var(--indigo)] px-3 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none focus:ring-1 focus:ring-[var(--gbm-cobalt-bright)]"
              />
              {focused && matches.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] shadow-lg">
                  {matches.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => { setSelected(p); setSearch(''); setFocused(false) }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--fg-1)] transition-colors hover:bg-[var(--indigo-2)]"
                    >
                      <span className="truncate font-medium">{p.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-[var(--fg-3)]">{p.current_stage}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Prayer / Praise toggle */}
        <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-0.5">
          {([['prayer', 'Prayer'], ['praise', 'Praise']] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setKind(val)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all ${kind === val ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Text + submit */}
        <form onSubmit={handleSubmit} className="flex flex-1 gap-1.5">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={kind === 'praise' ? 'What are you praising God for?' : 'What are you praying for?'}
            disabled={!selected}
            className="h-8 flex-1 rounded-full border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !selected || !text.trim()}
            className="cn-btn cn-btn-primary shrink-0 !px-3 !py-1 !text-xs disabled:opacity-50"
          >
            {loading ? '…' : 'Add'}
          </button>
        </form>
      </div>

      {error && <p className="mt-2 text-xs text-[#F2728A]">{error}</p>}
      {savedFor && <p className="mt-2 text-xs text-[var(--establish)]">{savedFor}</p>}
    </div>
  )
}
