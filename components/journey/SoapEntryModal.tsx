'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { addSoapJournal } from '../../lib/supabaseQueries'
import { prepareImage } from '../../lib/prepareImage'
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
  initialDate,
}: {
  personId: string
  onClose: () => void
  onSaved: () => void
  initialDate?: string
}) {
  const todayIso = new Date().toISOString().split('T')[0]
  const [entryDate, setEntryDate] = useState(initialDate ?? todayIso)
  const [entry, setEntry] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>('private')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  // Attach stream to video element when camera opens
  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraOpen])

  useEffect(() => {
    return () => stopCamera()
  }, [stopCamera])

  const openCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)
    } catch {
      setCameraError('Camera access denied. Please allow camera permission and try again.')
    }
  }

  const takePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], `soap-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
      setPhoto(file)
      setPhotoPreview(URL.createObjectURL(blob))
      stopCamera()
      setCameraOpen(false)
    }, 'image/jpeg', 0.90)
  }

  const cancelCamera = () => {
    stopCamera()
    setCameraOpen(false)
    setCameraError('')
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0]
    if (!raw) return
    // Bake in orientation (portrait/landscape) + shrink, so it displays and OCRs upright.
    const blob = await prepareImage(raw)
    const file = new File([blob], `soap-photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(blob))
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

    const { data: saved, error: insErr } = await addSoapJournal({
      person_id: personId,
      journal_date: entryDate,
      photo_url: uploadedUrl,
      ocr_text: entry.trim() || null,
      scripture_reference: null,
      summary: null,
      visibility,
    })

    if (insErr) {
      setError(insErr.message?.includes('duplicate') ? 'You already have an entry for that date.' : 'Could not save. Please try again.')
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
          {entryDate === todayIso ? "Today’s SOAP" : 'SOAP Entry'}
        </h2>

        {/* Date selector (for backdating) */}
        <div className="mt-3">
          <label className="cn-label mb-1 block">Date</label>
          <input
            type="date"
            value={entryDate}
            max={todayIso}
            onChange={e => setEntryDate(e.target.value)}
            className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          />
        </div>

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

        {/* Take a Photo Instead */}
        <div className="mt-4">
          <div className="cn-label mb-2">Take a Photo Instead</div>

          {/* Hidden canvas for snapshot */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Hidden file input for "choose from library" fallback */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            className="hidden"
          />

          {cameraOpen ? (
            /* Full-screen camera — fills the screen and reflows to landscape so
               you can turn the phone sideways to fit both notebook pages. */
            <div className="fixed inset-0 z-[300] bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-contain"
              />
              {/* Hint — shown in portrait only */}
              <div className="pointer-events-none absolute inset-x-0 top-0 p-4 text-center text-xs font-medium text-white/80 landscape:hidden">
                Turn your phone sideways to fit both notebook pages
              </div>
              {/* Controls: bottom bar in portrait, right-side rail in landscape */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-5
                              landscape:inset-x-auto landscape:inset-y-0 landscape:right-0 landscape:h-full landscape:w-32 landscape:flex-col landscape:bg-gradient-to-l">
                <button
                  type="button"
                  onClick={cancelCamera}
                  className="rounded-lg border border-white/30 px-4 py-2 text-xs font-medium text-white/90"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={takePhoto}
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-lg"
                  aria-label="Take photo"
                >
                  <span className="h-12 w-12 rounded-full border-4 border-[var(--establish)]" />
                </button>
                <button
                  type="button"
                  onClick={() => { cancelCamera(); fileInputRef.current?.click() }}
                  className="rounded-lg border border-white/30 px-4 py-2 text-xs font-medium text-white/90"
                >
                  Library
                </button>
              </div>
            </div>
          ) : photoPreview ? (
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
            <div className="flex flex-col items-center gap-2">
              {/* Camera shutter–style button: white inner disc inside a thin
                  ring, the way a phone camera capture button looks. */}
              <button
                type="button"
                onClick={openCamera}
                disabled={busy}
                aria-label="Open camera"
                className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--fg-2)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                <span className="h-12 w-12 rounded-full bg-white shadow-inner" />
              </button>
              <span className="text-xs text-[var(--fg-3)]">Open camera</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="text-xs text-[var(--fg-3)] underline underline-offset-2 hover:text-[var(--fg-2)] disabled:opacity-50"
              >
                or choose from library
              </button>
            </div>
          )}
          {cameraError && <p className="mt-2 text-xs text-[var(--danger)]">{cameraError}</p>}
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

        {error && <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>}

        {/* Save / Cancel */}
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !canSave}
          className="cn-btn cn-btn-primary mt-4 w-full disabled:opacity-50"
        >
          {busy ? 'Saving…' : entryDate === todayIso ? "Save today's entry" : 'Save entry'}
        </button>
        <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost mt-2 w-full">
          Cancel
        </button>
      </div>
    </div>
  )
}
