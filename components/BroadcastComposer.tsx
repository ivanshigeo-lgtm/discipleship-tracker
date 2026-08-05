'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getPeople, getVictoryGroups } from '../lib/supabaseQueries'
import type { Person, Stage, VictoryGroup } from '../types/database'

const STAGES: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']
const MODE_LABEL = { stages: 'By stage', groups: 'By group', people: 'By name' } as const

// One rung of the audience step-ladder: a select-style field that expands its
// option list beneath it. Mirrors the native composer's DropdownField.
function Dd({ placeholder, value, open, onToggle, children }: {
  placeholder: string
  value: string | null
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded-xl border bg-[var(--indigo-2)] px-3 py-2 text-left text-sm font-semibold ${open ? 'border-[var(--gbm-cobalt-bright)]' : 'border-[var(--line-2)]'}`}
      >
        <span className={`truncate ${value ? 'text-[var(--fg-1)]' : 'text-[var(--fg-3)]'}`}>{value ?? placeholder}</span>
        <span className="ml-2 shrink-0 text-xs text-[var(--fg-3)]">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="-mt-1 overflow-hidden rounded-b-xl border border-t-0 border-[var(--line-2)] bg-[var(--indigo-2)] pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

function DdRow({ label, selected, color, onClick }: {
  label: string
  selected?: boolean
  color?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between border-t border-[var(--line-1)] px-3 py-2 text-left text-sm font-semibold hover:bg-[var(--indigo-3)]"
    >
      <span className="truncate" style={{ color: color ?? (selected ? 'var(--fg-1)' : 'var(--fg-2)') }}>{label}</span>
      {selected && <span className="ml-2 shrink-0 text-[var(--gbm-cobalt-soft)]">✓</span>}
    </button>
  )
}

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
  const [mode, setMode] = useState<'stages' | 'groups' | 'people' | null>(null)
  // Which ladder rung's option list is open — one at a time.
  const [openDd, setOpenDd] = useState<'mode' | 'stage' | 'day' | 'group' | 'person' | null>('mode')
  const [day, setDay] = useState<string | null>(null)
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
  const [recKind, setRecKind] = useState<'audio' | 'video'>('audio')
  const [recSeconds, setRecSeconds] = useState(0)
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null)
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

  const startRecording = async (kind: 'audio' | 'video') => {
    setError('')
    try {
      // Video is capped at 720p / ~1.5Mbps — phone-friendly clips that stay small.
      const stream = await navigator.mediaDevices.getUserMedia(
        kind === 'audio'
          ? { audio: true }
          : { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: true }
      )
      const mime = kind === 'audio'
        ? (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm')
        : MediaRecorder.isTypeSupported('video/mp4')
          ? 'video/mp4'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm'
      const rec = new MediaRecorder(stream, kind === 'audio'
        ? { mimeType: mime }
        : { mimeType: mime, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 96_000 })
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        setLiveStream(null)
        const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] })
        clearMedia()
        setMediaBlob(blob)
        setMediaKind(kind)
        setMediaPreview(URL.createObjectURL(blob))
      }
      recorderRef.current = rec
      rec.start()
      setRecKind(kind)
      if (kind === 'video') setLiveStream(stream)
      setRecording(true)
      setRecSeconds(0)
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch {
      setError(kind === 'audio' ? 'Could not access the microphone.' : 'Could not access the camera.')
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

  const filteredPeople = people.filter(p =>
    p.id !== personId && (!personQuery || p.name.toLowerCase().includes(personQuery.toLowerCase()))
  )

  if (!open) {
    return (
      <div className="mb-3 flex justify-end">
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
    <section className="cn-card mb-3 p-4">
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

      {/* audience — step-ladder of dropdowns: pick the kind, then the rest appear */}
      <Dd
        placeholder="Who is this for?"
        value={mode ? MODE_LABEL[mode] : null}
        open={openDd === 'mode'}
        onToggle={() => setOpenDd(openDd === 'mode' ? null : 'mode')}
      >
        {(['stages', 'groups', 'people'] as const).map(m => (
          <DdRow key={m} label={MODE_LABEL[m]} selected={mode === m} onClick={() => {
            setMode(m)
            setStages(new Set()); setGroupIds(new Set()); setPersonIds(new Set())
            setDay(null); setPersonQuery('')
            setOpenDd(m === 'stages' ? 'stage' : m === 'groups' ? 'day' : 'person')
          }} />
        ))}
      </Dd>

      {mode === 'stages' && (
        <Dd
          placeholder="Which stage(s)?"
          value={stages.size ? STAGES.filter(s => stages.has(s)).join(', ') : null}
          open={openDd === 'stage'}
          onToggle={() => setOpenDd(openDd === 'stage' ? null : 'stage')}
        >
          {STAGES.map(s => (
            <DdRow key={s} label={s} selected={stages.has(s)}
              color={stages.has(s) ? `var(--${s.toLowerCase()})` : undefined}
              onClick={() => toggle(stages, s, setStages)} />
          ))}
        </Dd>
      )}

      {mode === 'groups' && (() => {
        const dayOf = (g: VictoryGroup) => g.meeting_day || 'No set day'
        const days = [...new Set(groups.map(dayOf))]
        const dayGroups = groups.filter(g => !day || day === 'Any day' || dayOf(g) === day)
        return (
          <>
            <Dd
              placeholder="Meeting day"
              value={day}
              open={openDd === 'day'}
              onToggle={() => setOpenDd(openDd === 'day' ? null : 'day')}
            >
              {['Any day', ...days].map(d => (
                <DdRow key={d} label={d} selected={day === d}
                  onClick={() => { setDay(d); setGroupIds(new Set()); setOpenDd('group') }} />
              ))}
            </Dd>
            <Dd
              placeholder="Which group(s)?"
              value={groupIds.size ? groups.filter(g => groupIds.has(g.id)).map(g => g.name).join(', ') : null}
              open={openDd === 'group'}
              onToggle={() => setOpenDd(openDd === 'group' ? null : 'group')}
            >
              {dayGroups.length === 0 && (
                <p className="border-t border-[var(--line-1)] px-3 py-2 text-sm text-[var(--fg-3)]">
                  No groups{day && day !== 'Any day' ? ` on ${day}` : ' yet'}.
                </p>
              )}
              {dayGroups.map(g => (
                <DdRow key={g.id} label={g.name} selected={groupIds.has(g.id)}
                  onClick={() => toggle(groupIds, g.id, setGroupIds)} />
              ))}
            </Dd>
          </>
        )
      })()}

      {mode === 'people' && (
        <Dd
          placeholder="Choose people"
          value={personIds.size
            ? people.filter(p => personIds.has(p.id)).map(p => p.name).slice(0, 3).join(', ') + (personIds.size > 3 ? ` +${personIds.size - 3}` : '')
            : null}
          open={openDd === 'person'}
          onToggle={() => setOpenDd(openDd === 'person' ? null : 'person')}
        >
          <div className="px-2 pt-2">
            <input
              value={personQuery}
              onChange={e => setPersonQuery(e.target.value)}
              placeholder="Search people…"
              className="mb-1 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-3)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filteredPeople.slice(0, 60).map(p => (
              <DdRow key={p.id} label={p.name} selected={personIds.has(p.id)}
                onClick={() => toggle(personIds, p.id, setPersonIds)} />
            ))}
          </div>
        </Dd>
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
            ■ Stop {recKind === 'video' ? 'video' : ''} ({Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, '0')})
          </button>
        ) : (
          <>
            <button type="button" onClick={() => startRecording('audio')} className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-semibold text-[var(--fg-2)] hover:border-[var(--line-3)]">
              🎙 Record voice
            </button>
            <button type="button" onClick={() => startRecording('video')} className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-semibold text-[var(--fg-2)] hover:border-[var(--line-3)]">
              📹 Record video
            </button>
          </>
        )}
        <label className="cursor-pointer rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-semibold text-[var(--fg-2)] hover:border-[var(--line-3)]">
          🎥 Upload video
          <input type="file" accept="video/*" capture className="hidden" onChange={e => { pickVideo(e.target.files); e.target.value = '' }} />
        </label>
        {mediaBlob && !recording && (
          <button type="button" onClick={clearMedia} className="text-xs font-semibold text-[var(--fg-3)] hover:text-red-400">
            Remove {mediaKind === 'audio' ? 'voice note' : 'video'}
          </button>
        )}
      </div>

      {recording && recKind === 'video' && liveStream && (
        <video
          ref={el => {
            if (el && el.srcObject !== liveStream) {
              el.srcObject = liveStream
              el.play().catch(() => {})
            }
          }}
          muted
          playsInline
          className="mt-2 w-full rounded-lg"
          style={{ maxHeight: 240, background: '#000', transform: 'scaleX(-1)' }}
        />
      )}

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
