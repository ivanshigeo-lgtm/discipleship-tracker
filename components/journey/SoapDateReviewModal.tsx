'use client'

import { useEffect, useState } from 'react'
import { SoapJournal } from '../../types/database'
import { updateSoapJournal, deleteSoapJournal, getPrevImportedEntry, mergeSoapEntries } from '../../lib/supabaseQueries'

// Step through imported pages that still need a date, with tools to fix the
// common import issues: rotate a sideways page, delete a duplicate/non-SOAP,
// or merge a left→right continuation back into the entry it belongs to.
export default function SoapDateReviewModal({
  entries,
  onClose,
  onUpdated,
}: {
  entries: SoapJournal[]
  onClose: () => void
  onUpdated: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [dirty, setDirty] = useState(false) // did we change anything (for refresh on close)
  const [override, setOverride] = useState<Record<string, string>>({}) // id -> rotated photo url

  const current = entries[idx]
  const year = current ? current.journal_date.slice(0, 4) : String(new Date().getFullYear())
  const photo = current ? (override[current.id] ?? current.photo_url) : null

  useEffect(() => {
    setDate(entries[idx]?.journal_date ?? '')
  }, [idx, entries])

  const advance = () => {
    if (idx + 1 < entries.length) setIdx(idx + 1)
    else { if (dirty || savedCount) onUpdated(); onClose() }
  }

  const save = async () => {
    if (!current || !date || saving) return
    setSaving(true)
    const { error } = await updateSoapJournal(current.id, { journal_date: date, date_precision: 'day' })
    setSaving(false)
    if (error) { alert('Could not save the date. Please try again.'); return }
    setSavedCount(c => c + 1); setDirty(true)
    advance()
  }

  const ignore = async () => {
    if (!current || saving) return
    setSaving(true)
    const { error } = await updateSoapJournal(current.id, { date_reviewed: true })
    setSaving(false)
    if (error) { alert('Could not save. Please try again.'); return }
    setDirty(true)
    advance()
  }

  // Rotate the page; degrees are clockwise (270 = 90° counter-clockwise).
  const rotate = async (degrees: number) => {
    if (!current || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/soap/rotate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalId: current.id, degrees }),
      })
      const j = await res.json()
      if (res.ok && j.url) { setOverride(o => ({ ...o, [current.id]: j.url })); setDirty(true) }
      else alert('Could not rotate. Please try again.')
    } catch { alert('Could not rotate. Please try again.') }
    setSaving(false)
  }

  const del = async () => {
    if (!current || saving) return
    if (!confirm('Delete this entry? (For duplicates or non-journal pages.)')) return
    setSaving(true)
    const { error } = await deleteSoapJournal(current.id)
    setSaving(false)
    if (error) { alert('Could not delete. Please try again.'); return }
    setDirty(true)
    advance()
  }

  // Merge this page into the previous entry (a left→right continuation).
  const merge = async () => {
    if (!current || saving) return
    if (current.import_seq == null) { alert('Can’t find the previous page to merge into.'); return }
    setSaving(true)
    const { data: prev } = await getPrevImportedEntry(current.person_id, current.import_seq)
    if (!prev) { setSaving(false); alert('No previous entry to merge into.'); return }
    const { error } = await mergeSoapEntries((prev as SoapJournal).id, current)
    setSaving(false)
    if (error) { alert('Could not merge. Please try again.'); return }
    setDirty(true)
    advance()
  }

  if (!current) return null

  const toolBtn = 'flex-1 rounded-lg border border-[var(--line-2)] py-2 text-[11px] font-semibold text-[var(--fg-2)] transition-colors hover:border-[var(--fg-3)] disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={saving ? undefined : onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5"
        style={{ boxShadow: 'var(--elev-2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="cn-label" style={{ color: 'var(--establish)' }}>Fix &amp; date · {year}</div>
          <span className="text-xs font-semibold text-[var(--fg-3)]">{idx + 1} of {entries.length}</span>
        </div>

        {photo && (
          <img
            src={photo}
            alt="Journal page"
            className="mt-3 w-full rounded-lg bg-black object-contain"
            style={{ maxHeight: 340 }}
          />
        )}

        {/* Fix-it tools */}
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => rotate(270)} disabled={saving} className={toolBtn} title="Rotate 90° counter-clockwise">↺ Left</button>
          <button type="button" onClick={() => rotate(90)} disabled={saving} className={toolBtn} title="Rotate 90° clockwise">↻ Right</button>
          <button type="button" onClick={merge} disabled={saving} className={toolBtn} title="Merge into the previous entry (a left→right continuation)">↥ Merge</button>
          <button type="button" onClick={del} disabled={saving} className={`${toolBtn} hover:!border-[var(--danger)] hover:!text-[var(--danger)]`} title="Delete (duplicate or non-journal page)">🗑 Delete</button>
        </div>

        {current.ocr_text && (
          <p className="mt-2 max-h-20 overflow-y-auto text-[11px] leading-snug text-[var(--fg-3)]">
            {current.ocr_text}
          </p>
        )}

        <div className="mt-3">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Date on this page</label>
          <input
            type="date"
            value={date}
            min={`${year}-01-01`}
            max={`${year}-12-31`}
            onChange={e => setDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm text-[var(--fg-1)]"
          />
        </div>

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={ignore} disabled={saving} className="cn-btn cn-btn-ghost flex-1 disabled:opacity-50" title={`Keep under ${year} as misc — don't ask again`}>
            Ignore
          </button>
          <button type="button" onClick={advance} disabled={saving} className="cn-btn cn-btn-ghost flex-1 disabled:opacity-50" title="Skip for now">
            Skip
          </button>
          <button type="button" onClick={save} disabled={saving || !date} className="cn-btn cn-btn-primary flex-1 disabled:opacity-50">
            {saving ? '…' : idx + 1 < entries.length ? 'Save & next' : 'Save & finish'}
          </button>
        </div>
        <button type="button" onClick={() => { if (dirty || savedCount) onUpdated(); onClose() }} className="mt-3 w-full text-center text-[11px] text-[var(--fg-3)] underline">
          Close{savedCount > 0 ? ` (${savedCount} dated)` : ''}
        </button>
      </div>
    </div>
  )
}
