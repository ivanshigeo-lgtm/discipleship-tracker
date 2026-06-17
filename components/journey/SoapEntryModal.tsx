'use client'

import { useRef, useState } from 'react'
import { addSoapJournal, addJourneyPrayerRequest } from '../../lib/supabaseQueries'
import type { ShareVisibility } from '../../types/database'

const SCOPES: { value: ShareVisibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Just me', hint: 'Between you and God' },
  { value: 'coach', label: 'My coach', hint: 'Your coach can read it' },
  { value: 'group', label: 'My Grace Group', hint: 'Your group can read it' },
  { value: 'constellation', label: 'The constellation', hint: 'Shines for the whole church' },
]

const SOAP_PLACEHOLDER =
  'S — Scripture: What verse stood out to me?\n\nO — Observation: What did the scripture say?\n\nA — Application: How can I apply this to my life?\n\nP — Prayer: My conversation with Jesus.'

export default function SoapEntryModal({
  personId,
  onClose,
  onSaved,
}: {
  personId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [entry, setEntry] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>('private')
  const [includePrayer, setIncludePrayer] = useState(false)
  const [prayerText, setPrayerText] = useState('')
  const [prayerKind, setPrayerKind] = useState<'prayer' | 'praise'>('prayer')
  const [prayerVisibility, setPrayerVisibility] = useState<ShareVisibility>('coach')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const savePrayerIfAny = async () => {
    if (includePrayer && prayerText.trim()) {
      await addJourneyPrayerRequest(personId, prayerText.trim(), prayerVisibility, prayerKind === 'praise')
    }
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const removePhoto = () => {
    setPhoto(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async () => {
    if (!entry.trim() && !photo) return
    setBusy(true)
    setError('')

    let uploadedUrl: string | null = null

    if (photo) {
      const form = new FormData()
      form.append('file', photo)
      form.append('personId', personId)
      const res = await fetch('/api/soap/upload', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Upload failed. Please try again.')
        setBusy(false)
        return
      }
      uploadedUrl = json.url
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: saved, error: insErr } = await addSoapJournal({
      person_id: personId,
      journal_date: today,
      photo_url: uploadedUrl,
      ocr_text: entry.trim() || null,
      scripture_reference: null,
      summary: null,
      visibility,
    })

    if (insErr) {
      setError(insErr.message?.includes('duplicate') ? 'You already have an entry for today.' : 'Could not save. Please try again.')
      setBusy(false)
      return
    }

    // Auto-OCR photo in background so it becomes searchable
    if (uploadedUrl && saved?.id) {
      fetch('/api/soap/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalId: saved.id }),
      }).catch(() => {}) // silent — OCR is best-effort
    }

    await savePrayerIfAny()
    setBusy(false)
    onSaved()
    onClose()
  }

  const canSave = entry.trim().length > 0 || photo !== null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6" style={{ boxShadow: 'var(--elev-2)' }}>
        <div className="cn-label" style={{ color: 'var(--establish)' }}>Establish · in the Word</div>
        <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
          Today&rsquo;s SOAP
        </h2>

        {/* Main textarea */}
        <div className="mt-4">
          <textarea
            value={entry}
            onChange={e => setEntry(e.target.value)}
            placeholder={SOAP_PLACEHOLDER}
            rows={10}
            className="w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          />
        </div>

        {/* Sharing scope */}
        <div className="mt-4">
          <div className="cn-label mb-2">Who sees this?</div>
          <div className="grid grid-cols-2 gap-2">
            {SCOPES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => setVisibility(s.value)}
                className="rounded-lg border p-2 text-left transition-all"
                style={
                  visibility === s.value
                    ? { borderColor: 'var(--establish)', background: 'rgba(54,214,195,.08)' }
                    : { borderColor: 'var(--line-1)', background: 'var(--indigo-2)' }
                }
              >
                <span className={`block text-xs font-semibold ${visibility === s.value ? 'text-[var(--establish)]' : 'text-[var(--fg-1)]'}`}>
                  {s.label}
                </span>
                <span className="block text-[10px] text-[var(--fg-3)]">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Optional prayer / praise */}
        <div className="mt-4 rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
          <button
            type="button"
            onClick={() => setIncludePrayer(!includePrayer)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-[var(--fg-1)]">Add a prayer or praise</span>
            <span className="text-xs text-[var(--fg-3)]">{includePrayer ? '−' : '+'}</span>
          </button>
          {includePrayer && (
            <div className="mt-3 space-y-2">
              <div className="flex rounded-lg bg-[var(--indigo)] p-0.5">
                {(['prayer', 'praise'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPrayerKind(k)}
                    className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
                      prayerKind === k ? 'bg-[var(--indigo-3)] text-[var(--fg-1)]' : 'text-[var(--fg-3)]'
                    }`}
                  >
                    {k === 'prayer' ? 'Prayer request' : 'Praise report'}
                  </button>
                ))}
              </div>
              <textarea
                value={prayerText}
                onChange={e => setPrayerText(e.target.value)}
                placeholder={prayerKind === 'prayer' ? 'What can we pray with you for?' : 'What has God done?'}
                rows={2}
                className="w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              />
              <select
                value={prayerVisibility}
                onChange={e => setPrayerVisibility(e.target.value as ShareVisibility)}
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-3 py-2 text-xs text-[var(--fg-2)] focus:outline-none"
              >
                {SCOPES.map(s => (
                  <option key={s.value} value={s.value}>
                    Share with: {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Take a Photo Instead */}
        <div className="mt-4">
          <div className="cn-label mb-2">Take a Photo Instead</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoSelect}
            className="hidden"
          />
          {photoPreview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoPreview}
                alt="Selected journal photo"
                className="h-24 w-24 rounded-lg object-cover border border-[var(--line-2)]"
              />
              <button
                type="button"
                onClick={removePhoto}
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--danger)] text-[10px] font-bold text-white leading-none"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
            >
              <span>📷</span>
              <span>Open Camera</span>
            </button>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>}

        {/* Save / Cancel */}
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !canSave}
          className="cn-btn cn-btn-primary mt-4 w-full disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save today\'s entry'}
        </button>
        <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost mt-2 w-full">
          Cancel
        </button>
      </div>
    </div>
  )
}
