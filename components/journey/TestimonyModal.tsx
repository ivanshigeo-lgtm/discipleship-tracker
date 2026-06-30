'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { saveTestimony } from '../../lib/supabaseQueries'
import { supabase } from '../../lib/supabaseClient'
import type { Person } from '../../types/database'

type RecordState = 'idle' | 'preview' | 'recording' | 'review'

export default function TestimonyModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Person
  onClose: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<'write' | 'video'>(profile.testimony_video_url ? 'video' : 'write')
  const [text, setText] = useState(profile.testimony_text || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState(profile.testimony_video_url || '')
  const [error, setError] = useState('')
  const [recordState, setRecordState] = useState<RecordState>('idle')
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedObjectUrl, setRecordedObjectUrl] = useState('')
  const [recordSecs, setRecordSecs] = useState(0)
  const [vidDiag, setVidDiag] = useState('')

  const liveVideoRef = useRef<HTMLVideoElement>(null)
  const reviewVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Attach camera stream to the live video element once it's in the DOM
  useEffect(() => {
    if (recordState === 'preview' && liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current
    }
  }, [recordState])

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream()
    }
  }, [stopStream])

  const startPreview = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      })
      streamRef.current = stream
      setRecordState('preview')
    } catch {
      setError('Camera access denied. Please allow camera and microphone permission and try again.')
    }
  }

  const startRecording = () => {
    if (!streamRef.current) return
    chunksRef.current = []
    // Record VP8 webm where possible (Chrome/Firefox play their own recording
    // back reliably); fall back to mp4 on Safari (which can't do webm). Chrome's
    // own mp4 recording can produce a clip that won't preview until finalized,
    // so we avoid it here — the server transcodes to mp4 for cross-device anyway.
    const mimeType =
      ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(c => MediaRecorder.isTypeSupported(c)) || ''
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder
    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'video/webm' })
      if (blob.size === 0) {
        setError('Recording came through empty — please try again.')
        setRecordState('idle')
        return
      }
      const url = URL.createObjectURL(blob)
      setRecordedBlob(blob)
      setRecordedObjectUrl(url)
      setVidDiag(`recorded ${(blob.size / 1024 / 1024).toFixed(2)} MB · ${blob.type || 'no type'}`)
      setRecordState('review')
    }
    recorder.start(250)
    setRecordSecs(0)
    setRecordState('recording')
    timerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000)
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    recorderRef.current?.stop()
    stopStream()
  }

  const cancelRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    // Null out onstop so stopping the recorder doesn't trigger the review state
    if (recorderRef.current) {
      recorderRef.current.onstop = null
      if (recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      recorderRef.current = null
    }
    stopStream()
    if (recordedObjectUrl) {
      URL.revokeObjectURL(recordedObjectUrl)
      setRecordedObjectUrl('')
    }
    setRecordedBlob(null)
    setRecordState('idle')
  }

  const uploadToServer = async (blob: Blob, fileName: string): Promise<string | null> => {
    const ext = fileName.split('.').pop() || 'webm'

    // Step 1: get a signed upload token (tiny JSON request — no Vercel body-size issue)
    const urlRes = await fetch('/api/testimony/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: profile.id, ext }),
    })
    const urlJson = await urlRes.json()
    if (!urlRes.ok) {
      setError(urlJson.error || 'Upload failed. Please try again.')
      return null
    }

    // Step 2: upload via the official signed-URL method on the configured client.
    // (The old manual PUT read process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, which
    // isn't set — the anon key is baked into supabaseClient — so auth was empty
    // and every upload failed.)
    const contentType = blob.type.split(';')[0] || 'video/webm'
    const { error: upErr } = await supabase.storage
      .from('testimonies')
      .uploadToSignedUrl(urlJson.path, urlJson.token, blob, { contentType })

    if (upErr) {
      console.error('Testimony upload failed:', upErr)
      setError('Upload failed. Please try again.')
      return null
    }

    // Step 3: transcode to MP4 so it plays on EVERY device (iPhones can't play
    // webm). If transcoding is unavailable, fall back to the original upload —
    // which still plays on the device it was recorded on.
    if (!contentType.includes('mp4')) {
      try {
        const tRes = await fetch('/api/video/transcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket: 'testimonies', path: urlJson.path }),
        })
        const tJson = await tRes.json()
        if (tRes.ok && tJson.url) return tJson.url as string
      } catch { /* fall back to the original */ }
    }

    return urlJson.publicUrl as string
  }

  const useRecording = async () => {
    if (!recordedBlob) return
    if (recordedBlob.size > 100 * 1024 * 1024) {
      setError('Recording is over 100MB — please try a shorter clip.')
      return
    }
    setUploading(true)
    setError('')
    const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm'
    const url = await uploadToServer(recordedBlob, `testimony.${ext}`)
    if (!url) { setUploading(false); return }
    setVideoUrl(url)
    URL.revokeObjectURL(recordedObjectUrl)
    setRecordedObjectUrl('')
    setRecordedBlob(null)
    setRecordState('idle')
    setUploading(false)
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 100 * 1024 * 1024) {
      setError('Video must be under 100MB — a two-minute clip at standard quality fits comfortably.')
      return
    }
    setUploading(true)
    setError('')
    const url = await uploadToServer(file, file.name)
    if (!url) { setUploading(false); return }
    setVideoUrl(url)
    setUploading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await saveTestimony(profile.id, {
      testimony_text: text.trim() || null,
      testimony_video_url: videoUrl || null,
    })
    setSaving(false)
    if (err) {
      setError(err.message || 'Could not save. Please try again.')
    } else {
      onSaved()
      onClose()
    }
  }

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const inCamera = recordState === 'preview' || recordState === 'recording'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6"
        style={{ boxShadow: 'var(--elev-2)' }}
      >
        <div className="cn-label" style={{ color: 'var(--equip)' }}>Equip · your 2min miracle</div>
        <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
          Your 2min Miracle
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">
          Two minutes: who you were, how you met Jesus, who you&rsquo;re becoming. Your miracle will shine
          in the constellation for anyone to find.
        </p>

        <div className="mt-4 flex rounded-lg bg-[var(--indigo-2)] p-1">
          {(['write', 'video'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { cancelRecording(); setMode(m) }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === m ? 'bg-[var(--gbm-cobalt-bright)] text-white' : 'text-[var(--fg-2)]'
              }`}
            >
              {m === 'write' ? 'Write it' : 'On video'}
            </button>
          ))}
        </div>

        {mode === 'write' ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Before I met Jesus…&#10;Then…&#10;Now…"
            rows={8}
            className="mt-4 w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          />
        ) : (
          <div className="mt-4">
            {/* Already uploaded — show the video */}
            {videoUrl ? (
              <div>
                <video src={videoUrl} controls className="w-full rounded-lg" />
                <button
                  type="button"
                  onClick={() => setVideoUrl('')}
                  className="mt-2 text-xs text-[var(--fg-3)] underline"
                >
                  Replace video
                </button>
              </div>

            ) : inCamera ? (
              /* Live camera preview + recording controls */
              <div className="relative overflow-hidden rounded-lg bg-black">
                <video
                  ref={liveVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full"
                  style={{ transform: 'scaleX(-1)', minHeight: 220 }}
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-[rgba(6,8,20,.85)] to-transparent px-4 pb-4 pt-10">
                  {recordState === 'preview' ? (
                    <>
                      <button
                        type="button"
                        onClick={cancelRecording}
                        className="text-xs text-[rgba(246,241,231,.6)] hover:text-[rgba(246,241,231,.9)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={startRecording}
                        title="Start recording"
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--danger)] shadow-[0_0_20px_rgba(220,50,50,.6)]"
                      >
                        <span className="h-5 w-5 rounded-full bg-white" />
                      </button>
                      <span className="w-14 text-center text-[10px] text-[rgba(246,241,231,.45)]">tap to start</span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--danger)]" />
                        {fmtTime(recordSecs)}
                      </span>
                      <button
                        type="button"
                        onClick={stopRecording}
                        title="Stop recording"
                        className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-[var(--danger)] shadow-[0_0_20px_rgba(220,50,50,.6)]"
                      >
                        <span className="h-4 w-4 rounded-sm bg-white" />
                      </button>
                      <span className="w-14 text-center text-[10px] text-[rgba(246,241,231,.45)]">tap to stop</span>
                    </>
                  )}
                </div>
              </div>

            ) : recordState === 'review' ? (
              /* Review the clip before uploading */
              <div>
                <video
                  ref={reviewVideoRef}
                  src={recordedObjectUrl}
                  controls
                  playsInline
                  autoPlay
                  muted
                  preload="auto"
                  className="w-full rounded-lg bg-black"
                  style={{ minHeight: 200 }}
                  onLoadedData={e => { setVidDiag(d => `${d} · loaded ${e.currentTarget.videoWidth}×${e.currentTarget.videoHeight}`); e.currentTarget.play().catch(() => {}) }}
                  onError={e => { const c = e.currentTarget.error; setVidDiag(d => `${d} · PLAYBACK ERROR code ${c?.code} ${c?.message || ''}`) }}
                />
                {vidDiag && (
                  <p className="mt-1 text-[10px] leading-snug text-[var(--fg-3)]">{vidDiag}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="flex-1 rounded-lg border border-[var(--line-2)] py-2 text-xs text-[var(--fg-2)] transition-colors hover:border-[var(--line-1)]"
                  >
                    Re-record
                  </button>
                  <button
                    type="button"
                    onClick={useRecording}
                    disabled={uploading}
                    className="flex-1 rounded-lg bg-[var(--gbm-cobalt-bright)] py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {uploading ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Uploading…
                      </span>
                    ) : 'Use this'}
                  </button>
                </div>
              </div>

            ) : (
              /* Idle: record button + choose from library */
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={startPreview}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[var(--gbm-cobalt-bright)] bg-[rgba(91,141,247,.08)] py-4 text-sm font-medium text-[var(--gbm-cobalt-bright)] transition-colors hover:bg-[rgba(91,141,247,.15)]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14" />
                    <rect x="3" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Record now
                </button>

                <label className="block">
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={handleVideoUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <div className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-[var(--line-2)] py-3 text-center transition-colors hover:border-[var(--gbm-cobalt-bright)]">
                    {uploading ? (
                      <span className="flex items-center gap-2 text-sm text-[var(--fg-2)]">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
                        Uploading…
                      </span>
                    ) : (
                      <span className="text-sm text-[var(--fg-3)]">or choose from library (up to 50MB)</span>
                    )}
                  </div>
                </label>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost flex-1">
            Not yet
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading || inCamera || recordState === 'review' || (!text.trim() && !videoUrl)}
            className="cn-btn cn-btn-primary flex-1 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Let it shine'}
          </button>
        </div>
      </div>
    </div>
  )
}
