'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Starfield } from './journey/StarPrimitives'
import { prepareImage } from '../lib/prepareImage'
import { Block, paraKey, parseManuscript } from '../lib/bookParse'

// Book draft preview. Renders the manuscript with the author's
// [FOR THE INTERVIEW: ...] gaps as cards carrying a 🎤 — tap, talk (or use
// the keyboard mic to dictate), save. Answers feed the next revision pass.




type EditState = { text: string | null; deleted: boolean }

// A paragraph in a quiet box: tap ✏️ to edit in place, save/delete/restore.
function EditablePara({ original, edit, onCommit }: {
  original: string
  edit: EditState | undefined
  onCommit: (blockKey: string, original: string, action: { save?: string; delete?: boolean; restore?: boolean }) => Promise<void>
}) {
  const key = paraKey(original)
  const current = edit?.deleted ? null : (edit?.text ?? original)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(current ?? original)
  const [busy, setBusy] = useState(false)
  const [aiAsk, setAiAsk] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [beforeAi, setBeforeAi] = useState<string | null>(null)

  const commit = async (action: { save?: string; delete?: boolean; restore?: boolean }) => {
    setBusy(true)
    await onCommit(key, original, action)
    setBusy(false)
    setEditing(false)
  }

  // "Ask the ghostwriter" — rewrite the CURRENT draft text per the instruction;
  // result lands in the textarea (nothing saved until Save).
  const askAi = async () => {
    if (!aiAsk.trim() || aiBusy) return
    setAiBusy(true)
    try {
      const res = await fetch('/api/book/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraph: draft, instruction: aiAsk.trim() }),
      })
      const j = await res.json()
      if (res.ok && j.rewritten) {
        setBeforeAi(draft)
        setDraft(j.rewritten)
        setAiAsk('')
      }
    } catch { /* leave draft untouched */ }
    setAiBusy(false)
  }

  if (edit?.deleted && !editing) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed px-3 py-2" style={{ borderColor: 'var(--line-2)' }}>
        <span className="text-xs italic text-[var(--fg-3)]">Paragraph removed</span>
        <button type="button" disabled={busy} onClick={() => commit({ restore: true })} className="text-xs font-semibold underline" style={{ color: 'var(--establish)' }}>
          Restore
        </button>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'rgba(54,214,195,.45)', background: 'rgba(255,255,255,.02)' }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={Math.min(16, Math.max(4, Math.ceil(draft.length / 70)))}
          className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-[15px] leading-[1.8] text-[var(--fg-1)]"
          autoFocus
        />
        {/* Ask the ghostwriter — instruction in, rewritten paragraph lands above */}
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={aiAsk}
            onChange={e => setAiAsk(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') askAi() }}
            placeholder="Ask AI — e.g. “shorter and punchier”, “add that the smoke smelled like burnt sugar cane”"
            disabled={aiBusy}
            className="min-w-0 flex-1 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-[13px] text-[var(--fg-1)] placeholder:text-[var(--fg-3)]"
          />
          <button
            type="button"
            onClick={askAi}
            disabled={!aiAsk.trim() || aiBusy}
            className="cn-btn cn-btn-ghost flex-shrink-0 disabled:opacity-50"
            style={{ borderColor: 'rgba(54,214,195,.45)', color: 'var(--establish)' }}
          >
            {aiBusy ? 'Rewriting…' : '✨ Rewrite'}
          </button>
        </div>
        {beforeAi !== null && (
          <button
            type="button"
            onClick={() => { setDraft(beforeAi); setBeforeAi(null) }}
            className="mt-1.5 text-xs text-[var(--fg-3)] underline"
          >
            Undo AI rewrite
          </button>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || !draft.trim()} onClick={() => commit({ save: draft.trim() })} className="cn-btn cn-btn-primary disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" disabled={busy} onClick={() => { if (confirm('Remove this paragraph from the draft?')) commit({ delete: true }) }} className="cn-btn cn-btn-ghost" style={{ color: 'var(--danger)' }}>
            Delete paragraph
          </button>
          {edit && (
            <button type="button" disabled={busy} onClick={() => commit({ restore: true })} className="cn-btn cn-btn-ghost">
              Restore original
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => { setDraft(current ?? original); setEditing(false) }} className="cn-btn cn-btn-ghost">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="group relative mt-4 rounded-lg border border-transparent px-1 py-0.5 transition-colors hover:border-[var(--line-2)]"
      style={edit ? { borderLeft: '2px solid rgba(54,214,195,.55)', paddingLeft: '10px' } : undefined}
    >
      <p className="text-[15px] leading-[1.85] text-[var(--fg-2)]"><Inline text={current ?? ''} /></p>
      <button
        type="button"
        onClick={() => { setDraft(current ?? original); setEditing(true) }}
        title={edit ? 'Edited — tap to edit again' : 'Edit this paragraph'}
        className="absolute -right-1 -top-2 flex h-7 w-7 items-center justify-center rounded-full text-[12px] opacity-40 transition-opacity hover:opacity-100 group-hover:opacity-80"
        style={{ border: '1px solid var(--line-2)', background: 'var(--indigo)' }}
      >
        ✏️
      </button>
    </div>
  )
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

// One instruction swept over a scope (whole book, or one chapter).
function SweepPanel({ triggerLabel, scopeNote, placeholder, compact, onApply }: {
  triggerLabel: string
  scopeNote: string
  placeholder: string
  compact?: boolean
  onApply: (instruction: string) => Promise<string>
}) {
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const run = async () => {
    if (!ask.trim() || busy) return
    setBusy(true)
    setResult(null)
    const msg = await onApply(ask.trim())
    setResult(msg)
    setAsk('')
    setBusy(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact ? 'flex h-7 w-7 items-center justify-center rounded-full text-[13px] opacity-60 hover:opacity-100' : 'text-sm font-semibold'}
        style={compact ? { border: '1px solid var(--line-2)', background: 'var(--indigo)' } : { color: 'var(--establish)' }}
        title={triggerLabel}
      >
        {compact ? '🪄' : `🪄 ${triggerLabel}`}
      </button>
    )
  }

  return (
    <div className={compact ? 'mt-2 w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-3' : ''}>
      <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--establish)' }}>{scopeNote}</div>
      <textarea
        value={ask}
        onChange={e => setAsk(e.target.value)}
        rows={3}
        disabled={busy}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm leading-relaxed text-[var(--fg-1)] placeholder:text-[var(--fg-3)]"
      />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={run} disabled={!ask.trim() || busy} className="cn-btn cn-btn-primary disabled:opacity-50">
          {busy ? 'Sweeping…' : 'Apply'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setResult(null) }} disabled={busy} className="cn-btn cn-btn-ghost">Close</button>
      </div>
      {busy && <p className="mt-2 text-xs text-[var(--fg-3)]">The ghostwriter is reading — this can take a minute. Stay on this page.</p>}
      {result && <p className="mt-2 text-sm" style={{ color: 'var(--establish)' }}>{result}</p>}
    </div>
  )
}

type SpeechRec = { start: () => void; stop: () => void; continuous: boolean; interimResults: boolean; lang: string; onresult: ((e: unknown) => void) | null; onend: (() => void) | null }

function GapCard({ question, markerKey, saved, savedPhotos, personId, onSave }: {
  question: string
  markerKey: string
  saved: string | null
  savedPhotos: string[]
  personId: string
  onSave: (markerKey: string, question: string, answer: string, photoUrls: string[]) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(saved ?? '')
  const [photos, setPhotos] = useState<string[]>(savedPhotos)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef<SpeechRec | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setDraft(saved ?? '') }, [saved])
  useEffect(() => { setPhotos(savedPhotos) }, [savedPhotos])

  const attachFiles = async (files: FileList | null) => {
    if (!files?.length || uploading) return
    setUploading(true)
    const added: string[] = []
    for (const file of Array.from(files).slice(0, 12 - photos.length)) {
      try {
        // Compress images the same way journal photos are; other files go as-is.
        const blob = file.type.startsWith('image/') ? await prepareImage(file) : file
        const form = new FormData()
        form.append('file', new File([blob], file.name.replace(/\.[^.]+$/, '') + (file.type.startsWith('image/') ? '.jpg' : ''), { type: file.type.startsWith('image/') ? 'image/jpeg' : file.type }))
        form.append('personId', personId)
        const res = await fetch('/api/soap/upload', { method: 'POST', body: form })
        const j = await res.json()
        if (res.ok && j.url) added.push(j.url)
      } catch { /* skip failed file; the rest continue */ }
    }
    setPhotos(p => [...p, ...added])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

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
    if ((!draft.trim() && photos.length === 0) || saving) return
    setSaving(true)
    await onSave(markerKey, question, draft.trim(), photos)
    setSaving(false)
    setOpen(false)
  }

  const hasContent = Boolean(saved) || savedPhotos.length > 0

  return (
    <div className="my-5 rounded-xl border p-4" style={{ borderColor: hasContent ? 'rgba(54,214,195,.45)' : 'var(--warning)', background: hasContent ? 'rgba(54,214,195,.06)' : 'rgba(255,255,255,.03)' }}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title={hasContent ? 'Edit your answer' : 'Answer this — talk, type, or attach a photo'}
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-xl"
          style={{ border: `1px solid ${hasContent ? 'rgba(54,214,195,.5)' : 'var(--warning)'}`, background: hasContent ? 'rgba(54,214,195,.15)' : 'rgba(255,180,80,.12)' }}
        >
          {hasContent ? '✓' : '🎤'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: hasContent ? 'var(--establish)' : 'var(--warning)' }}>
            {hasContent ? 'You answered — the next draft will weave it in' : 'The book needs your memory here'}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--fg-2)]">{question}</p>
          {saved && !open && (
            <p className="mt-2 border-l-2 pl-3 text-sm italic text-[var(--fg-2)]" style={{ borderColor: 'var(--establish)' }}>
              {saved.length > 220 ? saved.slice(0, 220) + '…' : saved}
            </p>
          )}
          {savedPhotos.length > 0 && !open && (
            <div className="mt-2 flex flex-wrap gap-2">
              {savedPhotos.map(u => (
                <a key={u} href={u} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="attached memory" className="h-16 w-16 rounded-lg object-cover" style={{ border: '1px solid rgba(54,214,195,.35)' }} />
                </a>
              ))}
            </div>
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
          {photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {photos.map(u => (
                <div key={u} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="attachment" className="h-16 w-16 rounded-lg object-cover" style={{ border: '1px solid var(--line-2)' }} />
                  <button
                    type="button"
                    onClick={() => setPhotos(p => p.filter(x => x !== u))}
                    title="Remove"
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: 'var(--danger)', color: '#fff' }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,.pdf" multiple hidden onChange={e => attachFiles(e.target.files)} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {speechAvailable && (
              <button type="button" onClick={toggleListen}
                className="cn-btn cn-btn-ghost"
                style={listening ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}>
                {listening ? '■ Stop listening' : '🎤 Listen'}
              </button>
            )}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || photos.length >= 12} className="cn-btn cn-btn-ghost disabled:opacity-50">
              {uploading ? 'Uploading…' : '📎 Add photo'}
            </button>
            <button type="button" onClick={save} disabled={(!draft.trim() && photos.length === 0) || saving || uploading} className="cn-btn cn-btn-primary disabled:opacity-50">
              {saving ? 'Saving…' : 'Save answer'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="cn-btn cn-btn-ghost">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

// The reader + writing room for one book draft. Source is either the static
// Lahaina manuscript (no bookId) or a database-drafted book (bookId given).
export default function BookReader({ personId, bookId }: { personId: string; bookId?: string }) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [answers, setAnswers] = useState<Record<string, { answer: string; photos: string[] }>>({})
  const [edits, setEdits] = useState<Record<string, EditState>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!personId) return
    Promise.all([
      bookId
        ? fetch(`/api/books/manuscript?bookId=${bookId}`).then(r => r.json()).then(j => (j.md as string) ?? '')
        : fetch('/book/manuscript.md').then(r => r.text()),
      fetch(`/api/book/input?personId=${personId}`).then(r => r.json()),
      fetch(`/api/book/edit?personId=${personId}`).then(r => r.json()),
    ]).then(([md, j, e]) => {
      setBlocks(parseManuscript(md))
      const map: Record<string, { answer: string; photos: string[] }> = {}
      for (const i of j.inputs ?? []) map[i.marker_key] = { answer: i.answer, photos: i.photo_urls ?? [] }
      setAnswers(map)
      const emap: Record<string, EditState> = {}
      for (const ed of e.edits ?? []) emap[ed.block_key] = { text: ed.edited_text, deleted: ed.deleted }
      setEdits(emap)
      setReady(true)
    })
  }, [personId, bookId])

  const onCommitEdit = useCallback(async (blockKey: string, original: string, action: { save?: string; delete?: boolean; restore?: boolean }) => {
    if (action.restore) {
      setEdits(e => { const n = { ...e }; delete n[blockKey]; return n })
      await fetch('/api/book/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, blockKey, restore: true }),
      })
      return
    }
    const next: EditState = action.delete ? { text: null, deleted: true } : { text: action.save ?? '', deleted: false }
    setEdits(e => ({ ...e, [blockKey]: next }))
    await fetch('/api/book/edit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personId, blockKey,
        editedText: next.text, deleted: next.deleted,
        originalExcerpt: original.slice(0, 300),
      }),
    })
  }, [personId])

  const onSave = useCallback(async (markerKey: string, question: string, answer: string, photoUrls: string[]) => {
    setAnswers(a => ({ ...a, [markerKey]: { answer, photos: photoUrls } }))
    await fetch('/api/book/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, markerKey, question, answer, photoUrls }),
    })
  }, [personId])

  // One instruction swept over a scope; results land as ordinary paragraph
  // overlays (teal markers, individually restorable).
  const sweep = useCallback(async (instruction: string, chapter?: string): Promise<string> => {
    try {
      const res = await fetch('/api/book/global-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, instruction, chapter, bookId }),
      })
      const j = await res.json()
      if (!res.ok) return j.error || 'Something went wrong — try again.'
      const e = await fetch(`/api/book/edit?personId=${personId}`).then(r => r.json())
      const emap: Record<string, EditState> = {}
      for (const ed of e.edits ?? []) emap[ed.block_key] = { text: ed.edited_text, deleted: ed.deleted }
      setEdits(emap)
      return `Done — ${j.replaced} paragraph${j.replaced === 1 ? '' : 's'} reworded, ${j.deleted} removed. ${j.note || ''} Review the teal markers; restore any you disagree with.`
    } catch {
      return 'Network hiccup — the edit may still be running. Refresh in a minute.'
    }
  }, [personId, bookId])

  const chapters = useMemo(
    () => blocks.filter(b => b.kind === 'chapter') as { kind: 'chapter'; text: string; id?: string }[],
    [blocks]
  )
  const gaps = useMemo(() => blocks.filter(b => b.kind === 'gap') as Extract<Block, { kind: 'gap' }>[], [blocks])
  const answered = gaps.filter(g => answers[g.markerKey] && (answers[g.markerKey].answer || answers[g.markerKey].photos.length)).length

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--void)]">
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(46,85,230,.12) 0%, rgba(6,8,20,0) 55%)' }} />
      <div className="pointer-events-none fixed inset-0"><Starfield count={50} seed={11} /></div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Link href={bookId ? '/books' : '/'} className="text-sm text-[var(--fg-3)] hover:text-[var(--fg-2)]">{bookId ? '← Books' : '← My Journey'}</Link>
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
            {/* Whole-book edit */}
            <div className="mt-5 rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-3">
              <SweepPanel
                triggerLabel="Whole-book edit — tell the ghostwriter one thing to change everywhere"
                scopeNote="Whole-book edit"
                placeholder={'e.g. "Take out the parts about people sleeping in the church — I don\'t want readers to think we were an official shelter."'}
                onApply={ins => sweep(ins)}
              />
            </div>

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
                    return (
                      <div key={i} id={b.id} className="mt-12 scroll-mt-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="cn-label" style={{ color: 'var(--establish)' }}>{b.text}</span>
                          <SweepPanel
                            compact
                            triggerLabel={`Edit all of ${b.text} with one instruction`}
                            scopeNote={`Chapter edit — ${b.text} only`}
                            placeholder={`e.g. "Make this chapter tighter" or "Shift the emphasis from the money to the people" — applies only to ${b.text}.`}
                            onApply={ins => sweep(ins, b.text)}
                          />
                        </div>
                      </div>
                    )
                  case 'chtitle':
                    return <h2 key={i} className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}><Inline text={b.text} /></h2>
                  case 'hr':
                    return <hr key={i} className="mt-10 border-[var(--line-2)]" />
                  case 'gap':
                    return (
                      <GapCard
                        key={b.markerKey}
                        question={b.question}
                        markerKey={b.markerKey}
                        saved={answers[b.markerKey]?.answer || null}
                        savedPhotos={answers[b.markerKey]?.photos ?? []}
                        personId={personId}
                        onSave={onSave}
                      />
                    )
                  case 'p':
                    return <EditablePara key={i} original={b.text} edit={edits[paraKey(b.text)]} onCommit={onCommitEdit} />
                }
              })}
            </article>
          </>
        )}
      </div>
    </div>
  )
}
