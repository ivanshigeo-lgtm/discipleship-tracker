'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { addSoapJournal, addJourneyPrayerRequest } from '../../lib/supabaseQueries'
import type { ShareVisibility } from '../../types/database'

const SCOPES: { value: ShareVisibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Just me', hint: 'Between you and God' },
  { value: 'coach', label: 'My coach', hint: 'Your coach can read it' },
  { value: 'group', label: 'My Grace Group', hint: 'Your group can read it' },
  { value: 'constellation', label: 'The constellation', hint: 'Shines for the whole church' },
]

export default function SoapEntryModal({
  personId,
  onClose,
  onSaved,
}: {
  personId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [entryMode, setEntryMode] = useState<'photo' | 'type'>('photo')
  const [scripture, setScripture] = useState('')
  const [entry, setEntry] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>('private')
  const [includePrayer, setIncludePrayer] = useState(false)
  const [prayerText, setPrayerText] = useState('')
  const [prayerKind, setPrayerKind] = useState<'prayer' | 'praise'>('prayer')
  const [prayerVisibility, setPrayerVisibility] = useState<ShareVisibility>('coach')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const savePrayerIfAny = async () => {
    if (includePrayer && prayerText.trim()) {
      await addJourneyPrayerRequest(personId, prayerText.trim(), prayerVisibility, prayerKind === 'praise')
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')

    const ext = file.name.split('.').pop()
    const path = `${personId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('soap-photos').upload(path, file)
    if (upErr) {
      setError('Upload failed. Please try again.')
      setBusy(false)
      return
    }
    const { data } = supabase.storage.from('soap-photos').getPublicUrl(path)

    const today = new Date().toISOString().split('T')[0]
    const { error: insErr } = await addSoapJournal({
      person_id: personId,
      journal_date: today,
      photo_url: data.publicUrl,
      ocr_text: null,
      scripture_reference: null,
      summary: null,
      visibility,
    })
    if (insErr) {
      setError(insErr.message?.includes('duplicate') ? 'You already have an entry for today.' : 'Could not save. Please try again.')
      setBusy(false)
      return
    }
    await savePrayerIfAny()
    setBusy(false)
    onSaved()
    onClose()
  }

  const handleTypedSubmit = async () => {
    if (!entry.trim()) return
    setBusy(true)
    setError('')
    const today = new Date().toISOString().split('T')[0]
    const { error: insErr } = await addSoapJournal({
      person_id: personId,
      journal_date: today,
      photo_url: null,
      ocr_text: entry.trim(),
      scripture_reference: scripture.trim() || null,
      summary: null,
      visibility,
    })
    if (insErr) {
      setError(insErr.message?.includes('duplicate') ? 'You already have an entry for today.' : 'Could not save. Please try again.')
      setBusy(false)
      return
    }
    await savePrayerIfAny()
    setBusy(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6" style={{ boxShadow: 'var(--elev-2)' }}>
        <div className="cn-label" style={{ color: 'var(--establish)' }}>Establish · in the Word</div>
        <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
          Today&rsquo;s SOAP
        </h2>

        <div className="mt-4 flex rounded-lg bg-[var(--indigo-2)] p-1">
          {(['photo', 'type'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setEntryMode(m)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                entryMode === m ? 'bg-[var(--gbm-cobalt-bright)] text-white' : 'text-[var(--fg-2)]'
              }`}
            >
              {m === 'photo' ? 'Photo' : 'Type'}
            </button>
          ))}
        </div>

        {entryMode === 'type' && (
          <div className="mt-4 space-y-3">
            <input
              type="text"
              value={scripture}
              onChange={e => setScripture(e.target.value)}
              placeholder="Scripture reference — e.g. John 3:16"
              className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
            <textarea
              value={entry}
              onChange={e => setEntry(e.target.value)}
              placeholder="Scripture: What does it say?&#10;Observation: What does it mean?&#10;Application: How does it apply?&#10;Prayer: Your response to God"
              rows={6}
              className="w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
          </div>
        )}

        {/* sharing scope */}
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

        {/* optional prayer / praise */}
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

        {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

        {entryMode === 'photo' ? (
          <label className="mt-4 block">
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} disabled={busy} className="hidden" />
            <div className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--line-2)] p-6 text-center transition-colors hover:border-[var(--gbm-cobalt-bright)]">
              {busy ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
              ) : (
                <span className="text-sm text-[var(--fg-2)]">Tap to photograph your journal</span>
              )}
            </div>
          </label>
        ) : (
          <button
            type="button"
            onClick={handleTypedSubmit}
            disabled={busy || !entry.trim()}
            className="cn-btn cn-btn-primary mt-4 w-full disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save today’s entry'}
          </button>
        )}

        <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost mt-2 w-full">
          Cancel
        </button>
      </div>
    </div>
  )
}
