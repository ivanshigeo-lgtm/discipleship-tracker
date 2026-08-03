'use client'

import { useMemo, useState } from 'react'
import type { Person } from '../types/database'

// A searchable replacement for a person <select>: type to filter instead of
// scrolling. Renders the list inline so it's never clipped by a card.
// With onCreateNew, a typed name that matches nobody exactly offers an
// "Add as a new person" row — search-first IS the duplicate check.
export default function PersonSearchSelect({
  people,
  value,
  onChange,
  placeholder = 'Select person…',
  onCreateNew,
}: {
  people: Person[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  onCreateNew?: (name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const selected = people.find(p => p.id === value)
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    return people.filter(p => p.name.toLowerCase().includes(term)).slice(0, 50)
  }, [people, q])
  const newName = q.trim()
  const showCreate = Boolean(
    onCreateNew &&
    newName.length >= 2 &&
    !people.some(p => p.name.trim().toLowerCase() === newName.toLowerCase())
  )

  const handleCreate = async () => {
    if (!onCreateNew || creating) return
    setCreating(true)
    try {
      await onCreateNew(newName)
      setOpen(false)
      setQ('')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { setQ(''); setOpen(o => !o) }}
        className="flex w-full items-center justify-between rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-left text-sm focus:outline-none"
      >
        <span className={selected ? 'text-[var(--fg-1)]' : 'text-[var(--fg-3)]'}>{selected ? selected.name : placeholder}</span>
        <span className="text-[var(--fg-3)]">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="mt-1 overflow-hidden rounded-lg border border-[var(--line-2)] bg-[var(--indigo)]">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name…"
            className="w-full border-b border-[var(--line-1)] bg-[var(--indigo-2)] px-3 py-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none"
          />
          <div className="max-h-48 overflow-auto">
            {matches.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange(p.id); setOpen(false); setQ('') }}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-[var(--fg-1)] transition-colors hover:bg-[var(--indigo-2)]"
              >
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-[10px] text-[var(--fg-3)]">{p.current_stage}</span>
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="mx-2 my-1.5 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-left text-xs font-semibold disabled:opacity-60"
                style={{ borderColor: 'rgba(212,175,55,0.45)', color: 'var(--gold)' }}
              >
                {creating ? 'Adding…' : <>＋ Add &ldquo;{newName}&rdquo; as a new person</>}
              </button>
            )}
            {matches.length === 0 && !showCreate && <p className="px-3 py-2 text-xs text-[var(--fg-3)]">No matches</p>}
          </div>
        </div>
      )}
    </div>
  )
}
