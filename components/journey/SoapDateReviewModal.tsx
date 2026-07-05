'use client'

import { useEffect, useState } from 'react'
import { SoapJournal } from '../../types/database'
import { updateSoapJournal } from '../../lib/supabaseQueries'

// Step through imported pages that had no detected date and let the user assign
// one (reading it off the photo). Saving sets journal_date + date_precision='day',
// which moves the entry onto the calendar.
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

  const current = entries[idx]
  const year = current ? current.journal_date.slice(0, 4) : String(new Date().getFullYear())

  useEffect(() => {
    setDate(entries[idx]?.journal_date ?? '')
  }, [idx, entries])

  const advance = () => {
    if (idx + 1 < entries.length) setIdx(idx + 1)
    else { onUpdated(); onClose() }
  }

  const save = async () => {
    if (!current || !date || saving) return
    setSaving(true)
    const { error } = await updateSoapJournal(current.id, { journal_date: date, date_precision: 'day' })
    setSaving(false)
    if (error) { alert('Could not save the date. Please try again.'); return }
    setSavedCount(c => c + 1)
    advance()
  }

  // Keep it under the year as "misc" and stop asking about it.
  const ignore = async () => {
    if (!current || saving) return
    setSaving(true)
    const { error } = await updateSoapJournal(current.id, { date_reviewed: true })
    setSaving(false)
    if (error) { alert('Could not save. Please try again.'); return }
    advance()
  }

  if (!current) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={saving ? undefined : onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5"
        style={{ boxShadow: 'var(--elev-2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="cn-label" style={{ color: 'var(--establish)' }}>Add a date · {year}</div>
          <span className="text-xs font-semibold text-[var(--fg-3)]">{idx + 1} of {entries.length}</span>
        </div>

        {/* The page, so you can read the handwritten date */}
        {current.photo_url && (
          <img
            src={current.photo_url}
            alt="Journal page"
            className="mt-3 w-full rounded-lg bg-black object-contain"
            style={{ maxHeight: 340 }}
          />
        )}

        {current.ocr_text && (
          <p className="mt-2 max-h-24 overflow-y-auto text-[11px] leading-snug text-[var(--fg-3)]">
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
          <button type="button" onClick={advance} disabled={saving} className="cn-btn cn-btn-ghost flex-1 disabled:opacity-50" title="Skip for now — ask again later">
            Skip
          </button>
          <button type="button" onClick={save} disabled={saving || !date} className="cn-btn cn-btn-primary flex-1 disabled:opacity-50">
            {saving ? 'Saving…' : idx + 1 < entries.length ? 'Save & next' : 'Save & finish'}
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-[var(--fg-3)]">
          Ignore keeps it under {year} as misc (still searchable) and stops asking.
        </p>
        <button type="button" onClick={onClose} className="mt-2 w-full text-center text-[11px] text-[var(--fg-3)] underline">
          Close{savedCount > 0 ? ` (${savedCount} dated)` : ''}
        </button>
      </div>
    </div>
  )
}
