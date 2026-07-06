'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import { Starfield } from '../../components/journey/StarPrimitives'

// Book draft preview. Renders the manuscript with the author's
// [FOR THE INTERVIEW: ...] gaps as cards carrying a 🎤 — tap, talk (or use
// the keyboard mic to dictate), save. Answers feed the next revision pass.

// The draft belongs to its author — only their account sees it.
const AUTHOR_PERSON_ID = '2aa35958-9057-44bd-aaf2-bd12a4cf9ecd'

type Block =
  | { kind: 'h1' | 'h2' | 'chapter' | 'chtitle' | 'hr' | 'p'; text: string; id?: string }
  | { kind: 'gap'; question: string; markerKey: string }

// Stable key per gap so answers survive redeploys (as long as the question text stands).
const hashKey = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return 'gap-' + (h >>> 0).toString(36)
}

const CHAPTER_RE = /^(Chapter\s+(\w+)|Epilogue.*)$/

function parseManuscript(md: string): Block[] {
  const blocks: Block[] = []
  let prevWasChapter = false
  for (const raw of md.split(/\n\s*\n/)) {
    const b = raw.trim()
    if (!b) continue
    const gap = b.match(/\[FOR THE INTERVIEW:\s*([\s\S]*?)\]/)
    if (gap) {
      const q = gap[1].trim()
      blocks.push({ kind: 'gap', question: q, markerKey: hashKey(q) })
      prevWasChapter = false
      continue
    }
    if (b === '---') { blocks.push({ kind: 'hr', text: '' }); prevWasChapter = false; continue }
    if (b.startsWith('# ')) { blocks.push({ kind: 'h1', text: b.slice(2) }); prevWasChapter = false; continue }
    if (b.startsWith('## ')) { blocks.push({ kind: 'h2', text: b.slice(3) }); prevWasChapter = false; continue }
    // "Chapter One\nThe Speed of Trust" arrives as one block with a newline.
    const lines = b.split('\n').map(l => l.trim())
    if (CHAPTER_RE.test(lines[0]) && lines[0].length < 40) {
      blocks.push({ kind: 'chapter', text: lines[0], id: lines[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') })
      if (lines[1]) blocks.push({ kind: 'chtitle', text: lines.slice(1).join(' ') })
      prevWasChapter = true
      continue
    }
    if (prevWasChapter && b.length < 60 && !/[.!?]$/.test(b)) {
      blocks.push({ kind: 'chtitle', text: b })
      prevWasChapter = false
      continue
    }
    blocks.push({ kind: 'p', text: b })
    prevWasChapter = false
  }
  return blocks
}

// Minimal inline markdown: **bold**, *italic*.
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
        if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

type SpeechRec = { start: () => void; stop: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: unknown) => void) | null; onend: (() => void) | null }

function GapCard({ question, markerKey, saved, onSave }: {
  question: string
  markerKey: string
  saved: string | null
  onSave: (markerKey: string, question: string, answer: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(saved ?? '')
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)

  useEffect(() => { setDraft(saved ?? '') }, [saved])

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

  const save = async () => {
    if (!draft.trim() || saving) return
    setSaving(true)
    await onSave(markerKey, question, draft.trim())
    setSaving(false)
    setOpen(false)
  }

  return (
    <div className="my-5 rounded-xl border p-4" style={{ borderColor: saved ? 'rgba(54,214,195,.45)' : 'var(--warning)', background: saved ? 'rgba(54,214,195,.06)' : 'rgba(255,255,255,.03)' }}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title={saved ? 'Edit your answer' : 'Answer this — talk or type'}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-xl"
          style={{ border: `1px solid ${saved ? 'rgba(54,214,195,.5)' : 'var(--warning)'}`, background: saved ? 'rgba(54,214,195,.15)' : 'rgba(255,180,80,.12)' }}
        >
          {saved ? '✓' : '🎤'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: saved ? 'var(--establish)' : 'var(--warning)' }}>
            {saved ? 'You answered — the next draft will weave it in' : 'The book needs your memory here'}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--fg-2)]">{question}</p>
          {saved && !open && (
            <p className="mt-2 border-l-2 pl-3 text-sm italic text-[var(--fg-2)]" style={{ borderColor: 'var(--establish)' }}>
              {saved.length > 220 ? saved.slice(0, 220) + '…' : saved}
            </p>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={5}
            placeholder="Talk story — tap the mic on your keyboard to dictate, or use Listen below."
            className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm leading-relaxed text-[var(--fg-1)]"
            autoFocus
          />
          <div className="mt-2 flex items-center gap-2">
            {speechAvailable && (
              <button type="button" onClick={toggleListen}
                className="cn-btn cn-btn-ghost"
                style={listening ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}>
                {listening ? '■ Stop listening' : '🎤 Listen'}
              </button>
            )}
            <button type="button" onClick={save} disabled={!draft.trim() || saving} className="cn-btn cn-btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : 'Save answer'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="cn-btn cn-btn-ghost">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function BookPage() {
  const { profile, loading } = useAuth()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!profile?.id || profile.id !== AUTHOR_PERSON_ID) return
    Promise.all([
      fetch('/book/manuscript.md').then(r => r.text()),
      fetch(`/api/book/input?personId=${profile.id}`).then(r => r.json()),
    ]).then(([md, j]) => {
      setBlocks(parseManuscript(md))
      const map: Record<string, string> = {}
      for (const i of j.inputs ?? []) map[i.marker_key] = i.answer
      setAnswers(map)
      setReady(true)
    })
  }, [profile?.id])

  const onSave = useCallback(async (markerKey: string, question: string, answer: string) => {
    setAnswers(a => ({ ...a, [markerKey]: answer }))
    await fetch('/api/book/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: AUTHOR_PERSON_ID, markerKey, question, answer }),
    })
  }, [])

  const chapters = useMemo(
    () => blocks.filter(b => b.kind === 'chapter') as { kind: 'chapter'; text: string; id?: string }[],
    [blocks]
  )
  const gaps = useMemo(() => blocks.filter(b => b.kind === 'gap') as Extract<Block, { kind: 'gap' }>[], [blocks])
  const answered = gaps.filter(g => answers[g.markerKey]).length

  if (loading) return <div className="min-h-screen bg-[var(--void)]" />
  if (!profile || profile.id !== AUTHOR_PERSON_ID) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--void)] p-4">
        <p className="text-[var(--fg-2)]">No book draft on your account yet.</p>
        <Link href="/" className="text-sm text-[var(--fg-3)] underline">← My Journey</Link>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--void)]">
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(46,85,230,.12) 0%, rgba(6,8,20,0) 55%)' }} />
      <div className="pointer-events-none fixed inset-0"><Starfield count={50} seed={11} /></div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-[var(--fg-3)] hover:text-[var(--fg-2)]">← My Journey</Link>
          {ready && gaps.length > 0 && (
            <span className="rounded-full border px-3 py-1 text-[11px] font-semibold"
              style={{ borderColor: answered === gaps.length ? 'rgba(54,214,195,.45)' : 'var(--line-2)', color: answered === gaps.length ? 'var(--establish)' : 'var(--fg-3)' }}>
              {answered}/{gaps.length} memories added
            </span>
          )}
        </div>

        {!ready ? (
          <p className="mt-10 text-center text-sm text-[var(--fg-3)]">Opening your draft…</p>
        ) : (
          <>
            {/* chapter quick-nav */}
            <div className="mt-5 flex flex-wrap gap-1.5">
              {chapters.map(c => (
                <a key={c.id} href={`#${c.id}`} className="rounded-full border border-[var(--line-2)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fg-3)] hover:text-[var(--fg-1)]">
                  {c.text.replace('Chapter ', 'Ch ')}
                </a>
              ))}
            </div>

            <article className="mt-6">
              {blocks.map((b, i) => {
                switch (b.kind) {
                  case 'h1':
                    return <h1 key={i} className="text-3xl leading-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}><Inline text={b.text} /></h1>
                  case 'h2':
                    return <h2 key={i} className="mt-8 text-lg font-bold text-[var(--fg-1)]"><Inline text={b.text} /></h2>
                  case 'chapter':
                    return <div key={i} id={b.id} className="cn-label mt-12 scroll-mt-6" style={{ color: 'var(--establish)' }}>{b.text}</div>
                  case 'chtitle':
                    return <h2 key={i} className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}><Inline text={b.text} /></h2>
                  case 'hr':
                    return <hr key={i} className="mt-10 border-[var(--line-2)]" />
                  case 'gap':
                    return <GapCard key={b.markerKey} question={b.question} markerKey={b.markerKey} saved={answers[b.markerKey] ?? null} onSave={onSave} />
                  case 'p':
                    return <p key={i} className="mt-4 text-[15px] leading-[1.85] text-[var(--fg-2)]"><Inline text={b.text} /></p>
                }
              })}
            </article>
          </>
        )}
      </div>
    </div>
  )
}
