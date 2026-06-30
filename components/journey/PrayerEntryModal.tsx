'use client'

import { useEffect, useRef, useState } from 'react'
import { addPrayerRequest } from '../../lib/supabaseQueries'
import type { ShareVisibility } from '../../types/database'

const SCOPES: { value: ShareVisibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Just me', hint: 'Only you' },
  { value: 'coach', label: 'My coach', hint: 'Sent to your coach' },
  { value: 'group', label: 'My group', hint: 'Your Grace Group' },
  { value: 'constellation', label: 'Constellation', hint: 'Everyone (GBC)' },
]

const MAX_SECONDS = 120 // 2-minute cap

function pickMime(): string {
  const opts = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  for (const o of opts) { if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(o)) return o }
  return ''
}

// Today's Prayer / Praise — type it, or record/upload a short video. Choose who
// it's for. Works alongside the SOAP entry.
export default function PrayerEntryModal({ personId, onClose, onSaved }: { personId: string; onClose: () => void; onSaved: () => void }) {
  const [isPraise, setIsPraise] = useState(false)
  const [visibility, setVisibility] = useState<ShareVisibility>('private')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [recording, setRecording] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(MAX_SECONDS)
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const liveRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const srRef = useRef<{ stop: () => void } | null>(null)

  useEffect(() => () => { cleanup() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cleanup = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    try { srRef.current?.stop() } catch { /* ignore */ }
  }

  // Best-effort live captioning (Chrome). Auto-fills the text; editable.
  const startCaptions = () => {
    try {
      const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
      const Ctor = SR.SpeechRecognition || SR.webkitSpeechRecognition
      if (!Ctor) return
      const rec = new Ctor() as {
        continuous: boolean; interimResults: boolean; lang: string
        onresult: (e: { resultIndex: number; results: { [i: number]: { [j: number]: { transcript: string } } } & { length: number } }) => void
        start: () => void; stop: () => void
      }
      rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US'
      rec.onresult = (e) => {
        let t = ''
        for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript
        if (t.trim()) setText(prev => (prev ? prev + ' ' : '') + t.trim())
      }
      rec.start()
      srRef.current = { stop: () => rec.stop() }
    } catch { /* captions are best-effort */ }
  }

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true,
      })
      streamRef.current = stream
      if (liveRef.current) { liveRef.current.srcObject = stream; liveRef.current.play().catch(() => {}) }
      const mime = pickMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 1_200_000 } : undefined)
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' })
        setVideoBlob(blob)
        setVideoUrl(URL.createObjectURL(blob))
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
        try { srRef.current?.stop() } catch { /* ignore */ }
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      setSecondsLeft(MAX_SECONDS)
      startCaptions()
      timerRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) { stopRecording(); return 0 }
          return s - 1
        })
      }, 1000)
    } catch {
      setError('Couldn’t access your camera/mic. Check permissions, or upload a video instead.')
    }
  }

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    setRecording(false)
    try { recRef.current?.state !== 'inactive' && recRef.current?.stop() } catch { /* ignore */ }
  }

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 80 * 1024 * 1024) { setError('That video is over 80MB — try a shorter or lower-quality clip.'); return }
    setVideoBlob(f)
    setVideoUrl(URL.createObjectURL(f))
  }

  const removeVideo = () => { setVideoBlob(null); if (videoUrl) URL.revokeObjectURL(videoUrl); setVideoUrl(null) }

  const save = async () => {
    if (!text.trim() && !videoBlob) { setError('Write something or add a video.'); return }
    setSaving(true); setError('')
    try {
      let mediaUrl: string | null = null
      if (videoBlob) {
        const ext = (videoBlob.type.includes('mp4') ? 'mp4' : 'webm')
        const form = new FormData()
        form.append('file', new File([videoBlob], `prayer-${Date.now()}.${ext}`, { type: videoBlob.type || 'video/webm' }))
        form.append('personId', personId)
        const res = await fetch('/api/prayer/upload', { method: 'POST', body: form })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'upload failed')
        mediaUrl = json.url
        // Transcode webm → MP4 so it plays on every device (falls back to original).
        if (ext !== 'mp4' && json.path) {
          try {
            const tRes = await fetch('/api/video/transcode', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bucket: 'prayer-media', path: json.path }),
            })
            const tJson = await tRes.json()
            if (tRes.ok && tJson.url) mediaUrl = tJson.url
          } catch { /* keep the original */ }
        }
      }
      const { error: insErr } = await addPrayerRequest({
        person_id: personId,
        request: text.trim() || (isPraise ? '[Video praise]' : '[Video prayer]'),
        status: 'Active',
        answered_date: null,
        answer_notes: null,
        visibility,
        is_praise: isPraise,
        media_url: mediaUrl,
      })
      if (insErr) throw insErr
      cleanup()
      onSaved()
      onClose()
    } catch {
      setError('Could not save right now. Please try again.')
      setSaving(false)
    }
  }

  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center" style={{ background: 'rgba(6,8,20,.72)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) { cleanup(); onClose() } }}>
      <div className="jy-rise-in w-full max-w-lg overflow-y-auto rounded-t-[var(--r-xl)] border border-b-0 border-[var(--line-2)] p-5 sm:rounded-[var(--r-xl)] sm:border-b" style={{ background: 'var(--indigo)', maxHeight: '92vh' }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>Today’s Prayer / Praise</h2>
          <button type="button" onClick={() => { cleanup(); onClose() }} className="text-lg leading-none text-[var(--fg-3)] hover:text-[var(--fg-1)]">×</button>
        </div>

        {/* prayer vs praise */}
        <div className="mb-3 flex rounded-full border border-[var(--line-2)] bg-[var(--indigo-2)] p-0.5">
          {[['prayer', false], ['praise', true]].map(([label, val]) => (
            <button key={label as string} type="button" onClick={() => setIsPraise(val as boolean)}
              className="flex-1 rounded-full py-1.5 text-xs font-bold capitalize transition-all"
              style={{ background: isPraise === val ? (val ? 'rgba(242,200,121,.18)' : 'rgba(155,128,255,.18)') : 'transparent', color: isPraise === val ? (val ? 'var(--gold)' : '#9B80FF') : 'var(--fg-3)' }}>
              {label as string}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          placeholder={isPraise ? 'What are you thankful for?' : 'What would you like prayer for?'}
          className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-3 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
        />

        {/* video */}
        <div className="mt-3">
          {recording ? (
            <div className="overflow-hidden rounded-lg border border-[var(--line-2)]">
              <video ref={liveRef} muted playsInline className="w-full" style={{ maxHeight: 260, background: '#000' }} />
              <div className="flex items-center justify-between bg-[var(--indigo-2)] px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#F2728A]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#F2728A]" /> {mmss}</span>
                <button type="button" onClick={stopRecording} className="cn-btn cn-btn-primary !px-3 !py-1 !text-xs">Stop</button>
              </div>
            </div>
          ) : videoUrl ? (
            <div className="overflow-hidden rounded-lg border border-[var(--line-2)]">
              <video src={videoUrl} controls playsInline className="w-full" style={{ maxHeight: 260, background: '#000' }} />
              <div className="flex justify-end bg-[var(--indigo-2)] px-3 py-2">
                <button type="button" onClick={removeVideo} className="text-xs font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">Remove video</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" onClick={startRecording} className="flex-1 rounded-lg border border-[var(--line-2)] py-2 text-xs font-semibold text-[var(--fg-2)] hover:text-[var(--fg-1)]">● Record video</button>
              <label className="flex-1 cursor-pointer rounded-lg border border-[var(--line-2)] py-2 text-center text-xs font-semibold text-[var(--fg-2)] hover:text-[var(--fg-1)]">
                ⬆ Upload video
                <input type="file" accept="video/*" onChange={onUpload} className="hidden" />
              </label>
            </div>
          )}
          {!recording && !videoUrl && <p className="mt-1 text-[10px] text-[var(--fg-3)]">Up to 2 minutes. We auto-caption when your browser allows it — edit the text above as needed.</p>}
        </div>

        {/* visibility */}
        <div className="mt-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Who can see it</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {SCOPES.map(s => (
              <button key={s.value} type="button" onClick={() => setVisibility(s.value)} title={s.hint}
                className="rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors"
                style={{ borderColor: visibility === s.value ? 'var(--gbm-cobalt-bright)' : 'var(--line-2)', background: visibility === s.value ? 'rgba(91,141,247,.12)' : 'transparent', color: visibility === s.value ? 'var(--fg-1)' : 'var(--fg-3)' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-[var(--danger)]">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => { cleanup(); onClose() }} className="cn-chip">Cancel</button>
          <button type="button" onClick={save} disabled={saving || recording} className="cn-btn cn-btn-primary !px-4 !py-1.5 !text-xs disabled:opacity-50">
            {saving ? 'Saving…' : isPraise ? 'Share praise' : 'Share prayer'}
          </button>
        </div>
      </div>
    </div>
  )
}
