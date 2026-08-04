'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getPeople, getVictoryGroups } from '../lib/supabaseQueries'
import type { Person, Stage, VictoryGroup } from '../types/database'

const STAGES: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']

// Coach broadcast: one message — text, voice note, or video — sent to a whole
// stage, to groups, or to hand-picked people. The server fans it out into each
// recipient's Messages inbox (/api/messages/broadcast); nothing shows in SOAP
// feeds. Voice records in the browser (MediaRecorder) and is transcoded to
// AAC/MP4 server-side so it plays on iPhones.
export default function BroadcastComposer({
  personId,
  onSent,
}: {
  personId: string
  onSent?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'stages' | 'groups' | 'people'>('stages')
  const [stages, setStages] = useState<Set<Stage>>(new Set())
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set())
  const [people, setPeople] = useState<Pick<Person, 'id' | 'name' | 'current_stage'>[]>([])
  const [personIds, setPersonIds] = useState<Set<string>>(new Set())
  const [personQuery, setPersonQuery] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<number | null>(null)

  // One attachment: a recorded voice note or an attached video.
  const [mediaBlob, setMediaBlob] = useState<Blob | null>(null)
  const [mediaKind, setMediaKind] = useState<'audio' | 'video' | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open) return
    getVictoryGroups().then(({ data }) => setGroups((data as VictoryGroup[]) ?? []))
    getPeople().then(({ data }) => setPeople(((data as Person[]) ?? []).map(p => ({ id: p.id, name: p.name, current_stage: p.current_stage }))))
  }, [open])

  const clearMedia = () => {
    setMediaBlob(null)
    setMediaKind(null)
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaPreview(null)
  }

  const startRecording = async () => {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mime })
        clearMedia()
        setMediaBlob(blob)
        setMediaKind('audio')
        setMediaPreview(URL.createObjectURL(blob))
      }
      recorderRef.current = rec
      rec.start()
      setRecording(true)
      setRecSeconds(0)
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch {
      setError('Could not access the microphone.')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    setRecording(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const pickVideo = (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    if (f.size > 80 * 1024 * 1024) { setError('That video is over 80MB — try a shorter clip.'); return }
    setError('')
    clearMedia()
    setMediaBlob(f)
    setMediaKind('video')
    setMediaPreview(URL.createObjectURL(f))
  }

  const audienceCount =
    mode === 'stages' ? stages.size : mode === 'groups' ? groupIds.size : personIds.size

  const send = async () => {
    if (!text.trim() && !mediaBlob) { setError('Write something or add a recording.'); return }
    if (audienceCount === 0) { setError('Pick who this goes to.'); return }
    setSending(true)
    setError('')
    try {
      let mediaUrl: string | null = null
      if (mediaBlob && mediaKind) {
        const isMp4 = mediaBlob.type.includes('mp4')
        const ext = isMp4 ? (mediaKind === 'audio' ? 'm4a' : 'mp4') : 'webm'
        const form = new FormData()
        form.append('file', new File([mediaBlob], `message-${Date.now()}.${ext}`, { type: mediaBlob.type || 'video/webm' }))
        form.append('personId', personId)
        const res = await fetch('/api/prayer/upload', { method: 'POST', body: form })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'upload failed')
        mediaUrl = json.url
        // webm won't play on iPhones — transcode to MP4 (falls back to original).
        if (ext === 'webm' && json.path) {
          try {
            const tRes = await fetch('/api/video/transcode', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bucket: 'prayer-media', path: json.path, audioOnly: mediaKind === 'audio' }),
            })
            const tJson = await tRes.json()
            if (tRes.ok && tJson.url) mediaUrl = tJson.url
          } catch { /* keep the original */ }
        }
      }
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/messages/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: session?.access_token,
          body: text.trim(),
          mediaUrl,
          mediaKind: mediaUrl ? mediaKind : null,
          stages: mode === 'stages' ? [...stages] : [],
          groupIds: mode === 'groups' ? [...groupIds] : [],
          personIds: mode === 'people' ? [...personIds] : [],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'send failed')
      setDone(json.sent)
      setText('')
      clearMedia()
      setStages(new Set()); setGroupIds(new Set()); setPersonIds(new Set())
      onSent?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send right now.')
    }
    setSending(false)
  }

  const toggle = <T,>(set: Set<T>, v: T, setter: (s: Set<T>) => void) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v); else n.add(v)
    setter(n)
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
      active
        ? 'border-[var(--gbm-cobalt-bright)] bg-[rgba(91,141,247,0.18)] text-[var(--fg-1)]'
        : 'border-[var(--line-2)] text-[var(--fg-2)] hover:border-[var(--line-3)]'
    }`

  const filteredPeople = people.filter(p =>
    p.id !== personId && (!personQuery || p.name.toLowerCase().includes(personQuery.toLowerCase()))
  )

  if (!open) {
    return (
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => { setOpen(true); setDone(null) }}
          className="rounded-full bg-[var(--gbm-cobalt-bright)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          ✉️ Message people
        </button>
      </div>
    )
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="cn-h3">Message people</h2>
        <div className="flex-1" />
        <button type="button" onClick={() => { setOpen(false); if (recording) stopRecording() }} className="cn-chip">Close</button>
      </div>

      {done !== null && (
        <p className="mb-3 rounded-xl border border-[rgba(54,214,195,.3)] bg-[rgba(54,214,195,.08)] px-3 py-2 text-sm text-[var(--establish)]">
          Sent to {done} {done === 1 ? 'person' : 'people'}. It’s in their Messages now.
        </p>
      )}

      <div className="mb-3 flex gap-2">
        {(['stages', 'groups', 'people'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)} className={chip(mode === m)}>
            {m === 'stages' ? 'By stage' : m === 'groups' ? 'By group' : 'Individuals'}
          </button>
        ))}
      </div>

      {mode === 'stages' && (
        <div className="mb-3 flex flex-wrap gap-2">
          {STAGES.map(s => (
            <button key={s} type="button" onClick={() => toggle(stages, s, setStages)} className={chip(stages.has(s))}>{s}</button>
          ))}
        </div>
      )}
      {mode === 'groups' && (
        <div className="mb-3 flex flex-wrap gap-2">
          {groups.length === 0 && <p className="text-sm text-[var(--fg-3)]">No groups yet.</p>}
          {groups.map(g => (
            <button key={g.id} type="button" onClick={() => toggle(groupIds, g.id, setGroupIds)} className={chip(groupIds.has(g.id))}>{g.name}</button>
          ))}
        </div>
      )}
      {mode === 'people' && (
        <div className="mb-3">
          <input
            value={personQuery}
            onChange={e => setPersonQuery(e.target.value)}
            placeholder="Search people…"
            className="mb-2 w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          />
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {filteredPeople.slice(0, 60).map(p => (
              <button key={p.id} type="button" onClick={() => toggle(personIds, p.id, setPersonIds)} className={chip(personIds.has(p.id))}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Write your message… (optional if you record one)"
        rows={3}
        className="w-full resize-y rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {recording ? (
          <button type="button" onClick={stopRecording} className="rounded-full border border-red-400 px-3 py-1 text-xs font-semibold text-red-400">
            ■ Stop ({Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, '0')})
          </button>
        ) : (
          <button type="button" onClick={startRecording} className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-semibold text-[var(--fg-2)] hover:border-[var(--line-3)]">
            🎙 Record voice
          </button>
        )}
        <label className="cursor-pointer rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-semibold text-[var(--fg-2)] hover:border-[var(--line-3)]">
          🎥 Add video
          <input type="file" accept="video/*" capture className="hidden" onChange={e => { pickVideo(e.target.files); e.target.value = '' }} />
        </label>
        {mediaBlob && !recording && (
          <button type="button" onClick={clearMedia} className="text-xs font-semibold text-[var(--fg-3)] hover:text-red-400">
            Remove {mediaKind === 'audio' ? 'voice note' : 'video'}
          </button>
        )}
      </div>

      {mediaPreview && mediaKind === 'audio' && <audio src={mediaPreview} controls className="mt-2 w-full" />}
      {mediaPreview && mediaKind === 'video' && (
        <video src={mediaPreview} controls playsInline className="mt-2 w-full rounded-lg" style={{ maxHeight: 240, background: '#000' }} />
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      <div className="mt-3 flex items-center justify-end gap-3">
        <span className="text-xs text-[var(--fg-3)]">
          {audienceCount === 0 ? 'No audience picked yet' : `Sending to ${audienceCount} ${mode === 'stages' ? (audienceCount === 1 ? 'stage' : 'stages') : mode === 'groups' ? (audienceCount === 1 ? 'group' : 'groups') : (audienceCount === 1 ? 'person' : 'people')}`}
        </span>
        <button
          type="button"
          onClick={send}
          disabled={sending || recording}
          className="rounded-full bg-[var(--gbm-cobalt-bright)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  )
}
