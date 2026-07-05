'use client'

import { useState } from 'react'
import exifr from 'exifr'
import { addSoapJournal } from '../../lib/supabaseQueries'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 30 }, (_, i) => CURRENT_YEAR - i)

// Order pages by when the photo was actually taken (fixes reverse-selection).
async function captureTime(file: File): Promise<number> {
  try {
    const meta = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])
    const d = meta?.DateTimeOriginal || meta?.CreateDate
    if (d instanceof Date && !isNaN(d.getTime())) return d.getTime()
  } catch { /* no EXIF */ }
  return file.lastModified || 0
}

// Hash the bytes so an identical file selected twice is skipped up front.
async function fileHash(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

type Phase = 'idle' | 'uploading' | 'processing' | 'done'
type Stats = { dated: number; undated: number; merged: number; duplicates: number }

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
  const [phase, setPhase] = useState<Phase>('idle')
  const [uploaded, setUploaded] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [stats, setStats] = useState<Stats>({ dated: 0, undated: 0, merged: 0, duplicates: 0 })
  const [error, setError] = useState('')

  const busy = phase === 'uploading' || phase === 'processing'

  const run = async () => {
    if (!files.length || busy) return
    setError('')
    const batchId = crypto.randomUUID()

    // ── Phase 1: order by capture time, drop exact dupes, upload + create rows ──
    setPhase('uploading')
    const timed = await Promise.all(files.map(async f => ({ f, t: await captureTime(f) })))
    timed.sort((a, b) => a.t - b.t || a.f.name.localeCompare(b.f.name, undefined, { numeric: true }))

    const seen = new Set<string>()
    const ordered: File[] = []
    for (const { f } of timed) {
      const h = await fileHash(f).catch(() => '')
      if (h && seen.has(h)) continue // identical file already queued
      if (h) seen.add(h)
      ordered.push(f)
    }
    setUploadTotal(ordered.length)
    setUploaded(0)

    let seq = 0
    for (const file of ordered) {
      try {
        const form = new FormData()
        form.append('file', file)
        form.append('personId', personId)
        const upRes = await fetch('/api/soap/upload', { method: 'POST', body: form })
        const upJson = await upRes.json()
        if (!upRes.ok) throw new Error(upJson.error || 'upload failed')
        await addSoapJournal({
          person_id: personId,
          journal_date: `${year}-01-01`,
          photo_url: upJson.url,
          photo_urls: [upJson.url],
          ocr_text: null,
          scripture_reference: null,
          summary: null,
          visibility: 'private',
          date_precision: 'year',
          source: 'imported',
          import_batch_id: batchId,
          import_seq: seq,
        })
      } catch {
        // skip a failed upload; the rest still import
      }
      seq++
      setUploaded(seq)
    }

    // ── Phase 2: server does OCR + dating + merging + dedup (survives close) ──
    setPhase('processing')
    const totals: Stats = { dated: 0, undated: 0, merged: 0, duplicates: 0 }
    // Loop the resumable processor until nothing is left.
    for (let guard = 0; guard < 200; guard++) {
      try {
        const res = await fetch('/api/soap/import/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, year }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'processing failed')
        totals.dated += j.dated || 0
        totals.undated += j.undated || 0
        totals.merged += j.merged || 0
        totals.duplicates += j.duplicates || 0
        setStats({ ...totals })
        setRemaining(j.remaining ?? 0)
        onImported() // refresh the calendar as entries fill in
        if ((j.remaining ?? 0) <= 0) break
      } catch (e) {
        setError(e instanceof Error ? e.message : 'processing failed')
        break
      }
    }

    setPhase('done')
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
          Pick a year and choose the photos. We order them by when each was taken, read each page,
          file it on its date (or under the year), merge pages that continue an entry, and skip duplicates.
        </p>

        {phase === 'done' ? (
          <div className="mt-5 rounded-xl border border-[var(--line-2)] p-4 text-center">
            <p className="text-lg font-bold" style={{ color: 'var(--establish)' }}>✦ Imported {stats.dated + stats.undated} entries</p>
            <p className="mt-1 text-sm text-[var(--fg-2)]">
              {stats.dated} on their date · {stats.undated} under {year}
              {stats.merged > 0 ? ` · ${stats.merged} continuation${stats.merged === 1 ? '' : 's'} merged` : ''}
              {stats.duplicates > 0 ? ` · ${stats.duplicates} duplicate${stats.duplicates === 1 ? '' : 's'} skipped` : ''}
            </p>
            <button type="button" onClick={onClose} className="cn-btn cn-btn-primary mt-4">Done</button>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Year</label>
              <select value={year} onChange={e => setYear(Number(e.target.value))} disabled={busy}
                className="mt-1.5 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm text-[var(--fg-1)]">
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div className="mt-4">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Photos</label>
              <input type="file" accept="image/*" multiple disabled={busy}
                onChange={e => setFiles(Array.from(e.target.files ?? []))}
                className="mt-1.5 block w-full text-sm text-[var(--fg-2)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--indigo-2)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--fg-1)]" />
              {files.length > 0 && phase === 'idle' && (
                <p className="mt-1.5 text-xs text-[var(--fg-3)]">{files.length} photo{files.length === 1 ? '' : 's'} selected</p>
              )}
            </div>

            {phase === 'uploading' && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--indigo-2)]">
                  <div className="h-full rounded-full transition-all" style={{ width: `${uploadTotal ? (uploaded / uploadTotal) * 100 : 0}%`, background: 'var(--gbm-cobalt-bright)' }} />
                </div>
                <p className="mt-1.5 text-xs text-[var(--fg-3)]">Uploading {uploaded}/{uploadTotal} photos…</p>
              </div>
            )}

            {phase === 'processing' && (
              <div className="mt-4 rounded-xl border border-[var(--line-2)] p-3">
                <p className="text-sm font-semibold text-[var(--fg-1)]">Reading your pages on our servers…</p>
                <p className="mt-1 text-xs text-[var(--fg-2)]">
                  {stats.dated + stats.undated} filed{stats.merged ? ` · ${stats.merged} merged` : ''}{stats.duplicates ? ` · ${stats.duplicates} duplicate skipped` : ''}
                  {remaining > 0 ? ` · ${remaining} to go` : ''}
                </p>
                <p className="mt-2 text-[11px] font-semibold" style={{ color: 'var(--establish)' }}>
                  ✓ Safe to close — this finishes on its own, even if you leave.
                </p>
              </div>
            )}

            {error && <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={onClose} disabled={phase === 'uploading'} className="cn-btn cn-btn-ghost flex-1 disabled:opacity-50">
                {phase === 'processing' ? 'Close' : 'Cancel'}
              </button>
              {phase === 'idle' && (
                <button type="button" onClick={run} disabled={!files.length} className="cn-btn cn-btn-primary flex-1 disabled:opacity-50">
                  Import {files.length || ''}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
