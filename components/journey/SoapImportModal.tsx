'use client'

import { useState } from 'react'
import { addSoapJournal } from '../../lib/supabaseQueries'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 30 }, (_, i) => CURRENT_YEAR - i)

type Progress = { done: number; total: number; dated: number; undated: number; failed: number }

// Bulk-import handwritten SOAP journals for a chosen year: multi-select photos →
// upload each → OCR + detect the written month/day → file on that date, or under
// the year if no date is found.
export default function SoapImportModal({
  personId,
  onClose,
  onImported,
}: {
  personId: string
  onClose: () => void
  onImported: () => void
}) {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<Progress | null>(null)

  const run = async () => {
    if (!files.length || busy) return
    setBusy(true)
    setError('')
    const batchId = crypto.randomUUID()
    const p: Progress = { done: 0, total: files.length, dated: 0, undated: 0, failed: 0 }
    setProgress({ ...p })

    for (const file of files) {
      try {
        // 1. upload the photo
        const form = new FormData()
        form.append('file', file)
        form.append('personId', personId)
        const upRes = await fetch('/api/soap/upload', { method: 'POST', body: form })
        const upJson = await upRes.json()
        if (!upRes.ok) throw new Error(upJson.error || 'upload failed')

        // 2. create the entry, filed under the year until OCR finds a date
        const { data: row, error: insErr } = await addSoapJournal({
          person_id: personId,
          journal_date: `${year}-01-01`,
          photo_url: upJson.url,
          ocr_text: null,
          scripture_reference: null,
          summary: null,
          visibility: 'private',
          date_precision: 'year',
          source: 'imported',
          import_batch_id: batchId,
        })
        if (insErr || !row) throw new Error(insErr?.message || 'save failed')

        // 3. OCR + detect the month/day within the chosen year
        const ocrRes = await fetch('/api/soap/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ journalId: (row as { id: string }).id, importYear: year }),
        })
        const ocrJson = await ocrRes.json().catch(() => ({}))
        if (ocrRes.ok && ocrJson.detected_date) p.dated++
        else p.undated++
      } catch {
        p.failed++
      }
      p.done++
      setProgress({ ...p })
    }

    setBusy(false)
    setDone({ ...p })
    onImported()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={busy ? undefined : onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6"
        style={{ boxShadow: 'var(--elev-2)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="cn-label" style={{ color: 'var(--establish)' }}>Import past journals</div>
        <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
          Bring a year to light
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">
          Pick a year, choose the photos of those pages, and we&rsquo;ll read each one — filing it on
          the date written on the page, or under the year if there&rsquo;s no date.
        </p>

        {done ? (
          <div className="mt-5 rounded-xl border border-[var(--line-2)] p-4 text-center">
            <p className="text-lg font-bold" style={{ color: 'var(--establish)' }}>✦ Imported {done.dated + done.undated} pages</p>
            <p className="mt-1 text-sm text-[var(--fg-2)]">
              {done.dated} placed on their date · {done.undated} filed under {year}
              {done.failed > 0 ? ` · ${done.failed} failed` : ''}
            </p>
            <button type="button" onClick={onClose} className="cn-btn cn-btn-primary mt-4">Done</button>
          </div>
        ) : (
          <>
            {/* Year picker */}
            <div className="mt-5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Year</label>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm text-[var(--fg-1)]"
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {/* Photo picker */}
            <div className="mt-4">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Photos</label>
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                onChange={e => setFiles(Array.from(e.target.files ?? []))}
                className="mt-1.5 block w-full text-sm text-[var(--fg-2)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--indigo-2)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--fg-1)]"
              />
              {files.length > 0 && (
                <p className="mt-1.5 text-xs text-[var(--fg-3)]">{files.length} photo{files.length === 1 ? '' : 's'} selected</p>
              )}
            </div>

            {progress && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--indigo-2)]">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%`, background: 'var(--establish)' }} />
                </div>
                <p className="mt-1.5 text-xs text-[var(--fg-3)]">
                  Reading {progress.done}/{progress.total} — {progress.dated} dated, {progress.undated} filed under {year}
                </p>
              </div>
            )}

            {error && <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={onClose} disabled={busy} className="cn-btn cn-btn-ghost flex-1 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={run} disabled={busy || !files.length} className="cn-btn cn-btn-primary flex-1 disabled:opacity-50">
                {busy ? 'Importing…' : `Import ${files.length || ''}`}
              </button>
            </div>
            {busy && <p className="mt-2 text-center text-[11px] text-[var(--fg-3)]">Reading each page with AI — keep this open.</p>}
          </>
        )}
      </div>
    </div>
  )
}
