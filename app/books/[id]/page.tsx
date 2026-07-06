'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '../../../contexts/AuthContext'
import { Starfield } from '../../../components/journey/StarPrimitives'
import { prepareImage } from '../../../lib/prepareImage'

// The interview: one question at a time. Talk it (Listen / keyboard mic),
// type it, attach photos, or say "Not ready yet" — the ring fills as the
// ghostwriter gets what it needs to write.

type Q = {
  id: string
  idx: number
  question: string
  why: string | null
  answer: string | null
  photo_urls: string[]
  not_ready: boolean
}

type SpeechRec = { start: () => void; stop: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: unknown) => void) | null; onend: (() => void) | null }

const hasContent = (q: Q) => Boolean(q.answer?.trim()) || q.photo_urls.length > 0

export default function BookInterviewPage() {
  const { profile, loading } = useAuth()
  const params = useParams<{ id: string }>()
  const bookId = params?.id

  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<Q[]>([])
  const [idx, setIdx] = useState(0)
  const [ready, setReady] = useState(false)

  const [draft, setDraft] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!bookId || !profile?.id) return
    fetch(`/api/books/qa?bookId=${bookId}`)
      .then(r => r.json())
      .then(j => {
        setTitle(j.book?.title ?? '')
        const qs: Q[] = j.questions ?? []
        setQuestions(qs)
        // Land on the first question that still needs something.
        const first = qs.findIndex(q => !hasContent(q))
        setIdx(first >= 0 ? first : 0)
        setReady(true)
      })
  }, [bookId, profile?.id])

  const q = questions[idx]

  useEffect(() => {
    if (!q) return
    setDraft(q.answer ?? '')
    setPhotos(q.photo_urls ?? [])
  }, [q?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const speechAvailable = typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).webkitSpeechRecognition || (window as unknown as Record<string, unknown>).SpeechRecognition)

  const toggleListen = () => {
    if (listening) { recRef.current?.stop(); return }
    const W = window as unknown as Record<string, unknown>
    const Ctor = (W.SpeechRecognition ?? W.webkitSpeechRecognition) as (new () => SpeechRec) | undefined
    if (!Ctor) return
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e: unknown) => {
      const ev = e as { resultIndex: number; results: Array<Array<{ transcript: string }>> & { length: number } }
      let added = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) added += ev.results[i][0].transcript
      if (added) setDraft(d => (d ? d + ' ' : '') + added.trim())
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    setListening(true)
    rec.start()
  }

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length || uploading || !profile?.id) return
    setUploading(true)
    const added: string[] = []
    for (const file of Array.from(files).slice(0, 12 - photos.length)) {
      try {
        const blob = file.type.startsWith('image/') ? await prepareImage(file) : file
        const form = new FormData()
        form.append('file', new File([blob], file.name.replace(/\.[^.]+$/, '') + (file.type.startsWith('image/') ? '.jpg' : ''), { type: file.type.startsWith('image/') ? 'image/jpeg' : file.type }))
        form.append('personId', profile.id)
        const res = await fetch('/api/soap/upload', { method: 'POST', body: form })
        const j = await res.json()
        if (res.ok && j.url) added.push(j.url)
      } catch { /* skip */ }
    }
    setPhotos(p => [...p, ...added])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const persist = useCallback(async (patch: { answer?: string; photoUrls?: string[]; notReady?: boolean }) => {
    if (!q) return
    const body = {
      questionId: q.id,
      answer: patch.answer ?? draft,
      photoUrls: patch.photoUrls ?? photos,
      notReady: patch.notReady ?? false,
    }
    setQuestions(qs => qs.map(x => x.id === q.id
      ? { ...x, answer: body.answer, photo_urls: body.photoUrls, not_ready: body.notReady }
      : x))
    await fetch('/api/books/qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }, [q, draft, photos])

  const saveAndNext = async () => {
    if (saving) return
    setSaving(true)
    await persist({})
    setSaving(false)
    if (idx + 1 < questions.length) setIdx(idx + 1)
  }

  const notReady = async () => {
    await persist({ answer: '', photoUrls: [], notReady: true })
    if (idx + 1 < questions.length) setIdx(idx + 1)
  }

  if (loading || !ready) return <div className="min-h-screen bg-[var(--void)]" />
  if (!profile || !q) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--void)] p-4">
        <p className="text-[var(--fg-2)]">No interview found.</p>
        <Link href="/books" className="text-sm text-[var(--fg-3)] underline">← Books</Link>
      </div>
    )
  }

  const answered = questions.filter(hasContent).length
  const pct = questions.length ? Math.round((answered / questions.length) * 100) : 0
  const enough = answered >= Math.ceil(questions.length * 0.6)

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--void)]">
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(46,85,230,.12) 0%, rgba(6,8,20,0) 55%)' }} />
      <div className="pointer-events-none fixed inset-0"><Starfield count={40} seed={17} /></div>

      <div className="relative z-10 mx-auto max-w-xl px-4 pb-20 pt-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/books" className="text-sm text-[var(--fg-3)] hover:text-[var(--fg-2)]">← Books</Link>
          <span className="text-xs font-semibold text-[var(--fg-3)]">{answered}/{questions.length} answered</span>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--indigo-2)]">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--establish, #36D6C3)' }} />
        </div>

        <div className="mt-6">
          <div className="cn-label" style={{ color: 'var(--establish)' }}>{title} · question {idx + 1} of {questions.length}</div>
          <h1 className="mt-2 text-xl leading-relaxed" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            {q.question}
          </h1>
          {q.why && <p className="mt-2 text-xs italic leading-relaxed text-[var(--fg-3)]">Why it matters: {q.why}</p>}
        </div>

        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={7}
          placeholder="Talk story — tap the mic on your keyboard to dictate, or use Listen below. Fragments are fine; there's no wrong way to remember."
          className="mt-4 w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-3 text-[15px] leading-relaxed text-[var(--fg-1)] placeholder:text-[var(--fg-3)]"
        />

        {photos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map(u => (
              <div key={u} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="attachment" className="h-16 w-16 rounded-lg object-cover" style={{ border: '1px solid var(--line-2)' }} />
                <button type="button" onClick={() => setPhotos(p => p.filter(x => x !== u))} title="Remove"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--danger)', color: '#fff' }}>✕</button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*,.pdf" multiple hidden onChange={e => attachFiles(e.target.files)} />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {speechAvailable && (
            <button type="button" onClick={toggleListen} className="cn-btn cn-btn-ghost"
              style={listening ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}>
              {listening ? '■ Stop listening' : '🎤 Listen'}
            </button>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || photos.length >= 12} className="cn-btn cn-btn-ghost disabled:opacity-50">
            {uploading ? 'Uploading…' : '📎 Add photo'}
          </button>
          <button type="button" onClick={saveAndNext} disabled={(!draft.trim() && photos.length === 0) || saving || uploading} className="cn-btn cn-btn-primary disabled:opacity-50">
            {saving ? 'Saving…' : idx + 1 < questions.length ? 'Save & next' : 'Save & finish'}
          </button>
          <button type="button" onClick={notReady} className="cn-btn cn-btn-ghost" title="Skip without answering — the question will wait, no rush">
            Not ready yet
          </button>
        </div>

        {/* question dots */}
        <div className="mt-6 flex flex-wrap gap-1.5">
          {questions.map((x, i) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setIdx(i)}
              title={`Question ${i + 1}`}
              className="h-2.5 w-2.5 rounded-full transition-all"
              style={{
                background: hasContent(x) ? 'var(--establish, #36D6C3)' : x.not_ready ? 'rgba(255,180,80,.5)' : 'var(--indigo-2)',
                border: i === idx ? '1px solid var(--fg-1)' : '1px solid var(--line-2)',
                transform: i === idx ? 'scale(1.4)' : undefined,
              }}
            />
          ))}
        </div>

        {enough && (
          <div className="mt-6 rounded-xl border p-4" style={{ borderColor: 'rgba(54,214,195,.45)', background: 'rgba(54,214,195,.06)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--establish)' }}>
              ✦ The ghostwriter has enough to begin writing.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--fg-2)]">
              Keep answering if more comes to you — every memory makes the book truer. Or hand it to
              the ghostwriter now: it plans the chapters, then writes them one by one. Unanswered
              questions become marked gaps you can fill later, right in the draft.
            </p>
            <button
              type="button"
              disabled={drafting}
              onClick={async () => {
                if (drafting) return
                setDrafting(true)
                try {
                  const res = await fetch('/api/books/draft', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookId }),
                  })
                  if (res.ok) { window.location.href = '/books'; return }
                } catch { /* fall through */ }
                setDrafting(false)
              }}
              className="cn-btn cn-btn-primary mt-3 disabled:opacity-60"
            >
              {drafting ? 'Handing your answers to the ghostwriter…' : '✍️ Write my draft'}
            </button>
            {drafting && (
              <p className="mt-2 text-xs text-[var(--fg-3)]">
                Planning the chapters — you&rsquo;ll land on your bookshelf where the progress shows live.
                The whole draft takes 15–30 minutes; you can close the app.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
