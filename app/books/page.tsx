'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { Starfield } from '../../components/journey/StarPrimitives'
import {
  BookDials, BookForm, BookLens, BookVoice,
  FORM_LABELS, LENS_LABELS, VOICE_LABELS, ADDON_LABELS,
} from '../../lib/bookForms'

// The bookshelf: set the dials (form, lens, add-ons, voice), scan the
// journals for pitches of exactly that kind of book, or start one directly.

type BookRow = {
  id: string
  title: string
  premise: string
  status: 'generating' | 'interviewing' | 'drafting' | 'draft'
  totalQuestions: number
  answeredQuestions: number
  chaptersWritten: number
  plannedChapters: number | null
}

type Suggestion = { title: string; premise: string; hook: string; fit?: string; dials?: Partial<BookDials> }

const DEFAULT_DIALS: BookDials = { form: 'memoir', lens: 'auto', lensDetail: '', duration: null, addons: [], voice: 'my_voice' }

export default function BooksPage() {
  const { profile, loading } = useAuth()
  const router = useRouter()
  const [books, setBooks] = useState<BookRow[]>([])
  const [ready, setReady] = useState(false)
  const [starting, setStarting] = useState(false)
  const [showStart, setShowStart] = useState(false)
  const [title, setTitle] = useState('')
  const [premise, setPremise] = useState('')
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [dials, setDials] = useState<BookDials>(DEFAULT_DIALS)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    const load = () =>
      fetch(`/api/books?personId=${profile.id}`)
        .then(r => r.json())
        .then(j => { setBooks(j.books ?? []); setReady(true); return j.books ?? [] })
    load()
    fetch(`/api/books/suggest?personId=${profile.id}`)
      .then(r => r.json())
      .then(j => setSuggestions(j.suggestions))
    // While a draft is being written, keep the shelf's progress live.
    const t = setInterval(async () => {
      const bs: BookRow[] = await load()
      if (!bs.some(b => b.status === 'drafting' || b.status === 'generating')) clearInterval(t)
    }, 12000)
    return () => clearInterval(t)
  }, [profile?.id])

  const setForm = (form: BookForm) =>
    setDials(d => ({ ...d, form, duration: form === 'devotional' ? (d.duration ?? 30) : null }))
  const toggleAddon = (a: string) =>
    setDials(d => ({ ...d, addons: d.addons.includes(a) ? d.addons.filter(x => x !== a) : [...d.addons, a] }))

  const scanForIdeas = async () => {
    if (!profile?.id || scanning) return
    setScanning(true)
    try {
      const res = await fetch('/api/books/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: profile.id, dials }),
      })
      const j = await res.json()
      if (res.ok) setSuggestions(j.suggestions)
    } catch { /* keep whatever we had */ }
    setScanning(false)
  }

  const start = async (withTitle?: string, withPremise?: string, withDials?: Partial<BookDials>) => {
    const t = (withTitle ?? title).trim()
    if (!profile?.id || !t || starting) return
    setStarting(true)
    setError('')
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personId: profile.id,
          title: t,
          premise: (withPremise ?? premise).trim(),
          dials: withDials ?? dials,
        }),
      })
      const j = await res.json()
      if (!res.ok) { setError(j.error || 'Something went wrong — try again.'); setStarting(false); return }
      router.push(`/books/${j.bookId}`)
    } catch {
      setError('Network error — try again.')
      setStarting(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-[var(--void)]" />
  if (!profile) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--void)] p-4">
        <p className="text-[var(--fg-2)]">Sign in to see your books.</p>
        <Link href="/" className="text-sm text-[var(--fg-3)] underline">← My Journey</Link>
      </div>
    )
  }

  const chip = (active: boolean): React.CSSProperties => ({
    borderColor: active ? 'rgba(54,214,195,.5)' : 'var(--line-2)',
    color: active ? 'var(--establish)' : 'var(--fg-2)',
    background: active ? 'rgba(54,214,195,.10)' : 'transparent',
  })

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--void)]">
      <div aria-hidden className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(46,85,230,.12) 0%, rgba(6,8,20,0) 55%)' }} />
      <div className="pointer-events-none fixed inset-0"><Starfield count={50} seed={13} /></div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-20 pt-6 sm:px-6">
        <Link href="/" className="text-sm text-[var(--fg-3)] hover:text-[var(--fg-2)]">← My Journey</Link>

        <div className="mt-4">
          <div className="cn-label" style={{ color: 'var(--establish)' }}>Books</div>
          <h1 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            From your journals
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">
            Choose what kind of book, point the scan at your journals, and the ghostwriter pitches
            what&rsquo;s already in your pages — then interviews you and writes it.
          </p>
        </div>

        {/* Existing books */}
        {ready && books.length > 0 && (
          <div className="mt-6 space-y-3">
            {books.map(b => (
              <div key={b.id} className="rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-4" style={{ boxShadow: 'var(--elev-2)' }}>
                <div className="text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>{b.title}</div>
                {b.premise && <p className="mt-1 text-xs leading-relaxed text-[var(--fg-3)]">{b.premise}</p>}
                <div className="mt-3 flex items-center gap-3">
                  {b.status === 'draft' ? (
                    <Link href={b.chaptersWritten > 0 ? `/books/${b.id}/read` : '/book'} className="cn-btn cn-btn-primary">Read &amp; edit the draft</Link>
                  ) : b.status === 'drafting' ? (
                    <>
                      <span className="text-sm font-semibold" style={{ color: 'var(--establish)' }}>
                        ✍️ Writing part {Math.min(b.chaptersWritten + 1, b.plannedChapters ?? b.chaptersWritten + 1)}{b.plannedChapters ? ` of ${b.plannedChapters}` : ''}…
                      </span>
                      {b.chaptersWritten > 0 && (
                        <Link href={`/books/${b.id}/read`} className="text-xs underline text-[var(--fg-3)]">read what&rsquo;s done</Link>
                      )}
                    </>
                  ) : b.status === 'interviewing' ? (
                    <>
                      <Link href={`/books/${b.id}`} className="cn-btn cn-btn-primary">
                        {b.answeredQuestions > 0 ? 'Continue the interview' : 'Start the interview'}
                      </Link>
                      <span className="text-xs text-[var(--fg-3)]">{b.answeredQuestions}/{b.totalQuestions} answered</span>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--fg-3)]">Preparing…</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* The dials + scan */}
        <div className="mt-6 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5" style={{ boxShadow: 'var(--elev-2)' }}>
          <div className="cn-label" style={{ color: 'var(--establish)' }}>What kind of book?</div>

          {/* Form cards */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(Object.keys(FORM_LABELS) as BookForm[]).map(f => (
              <button key={f} type="button" onClick={() => setForm(f)}
                className="rounded-xl border p-3 text-left transition-all"
                style={chip(dials.form === f)}>
                <div className="text-sm font-semibold" style={{ color: dials.form === f ? 'var(--establish)' : 'var(--fg-1)' }}>{FORM_LABELS[f].label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-[var(--fg-3)]">{FORM_LABELS[f].desc}</div>
              </button>
            ))}
          </div>

          {/* Duration (devotionals) */}
          {dials.form === 'devotional' && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Length</span>
              {[30, 60, 90].map(d => (
                <button key={d} type="button" onClick={() => setDials(x => ({ ...x, duration: d }))}
                  className="rounded-full border px-3 py-1 text-xs font-semibold" style={chip(dials.duration === d)}>
                  {d} days
                </button>
              ))}
              <span className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs text-[var(--fg-3)] opacity-60" title="Coming soon">365</span>
            </div>
          )}

          {/* Lens */}
          <div className="mt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Focused on</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(Object.keys(LENS_LABELS) as BookLens[]).map(l => (
                <button key={l} type="button" onClick={() => setDials(x => ({ ...x, lens: l }))}
                  className="rounded-full border px-3 py-1 text-xs font-semibold" style={chip(dials.lens === l)}>
                  {LENS_LABELS[l]}
                </button>
              ))}
            </div>
            {dials.lens !== 'auto' && (
              <input
                type="text"
                value={dials.lensDetail}
                onChange={e => setDials(x => ({ ...x, lensDetail: e.target.value }))}
                placeholder={dials.lens === 'event' ? 'e.g. the Lahaina fires, 2020, our church plant' : dials.lens === 'topic' ? 'e.g. fear, provision, suffering, fatherhood' : dials.lens === 'person' ? 'e.g. my kids, my wife, my mentors' : 'anything to aim the scan (optional)'}
                className="mt-2 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)]"
              />
            )}
          </div>

          {/* More options */}
          <button type="button" onClick={() => setMoreOpen(o => !o)} className="mt-3 text-xs font-semibold underline text-[var(--fg-3)]">
            {moreOpen ? 'Fewer options' : 'More options — reader extras & voice'}
          </button>
          {moreOpen && (
            <div className="mt-2 space-y-3">
              <div className="flex flex-wrap gap-2">
                {Object.entries(ADDON_LABELS).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => toggleAddon(k)}
                    className="rounded-full border px-3 py-1 text-xs font-semibold" style={chip(dials.addons.includes(k))}>
                    {dials.addons.includes(k) ? '✓ ' : ''}{label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(VOICE_LABELS) as BookVoice[]).map(v => (
                  <button key={v} type="button" onClick={() => setDials(x => ({ ...x, voice: v }))}
                    className="rounded-full border px-3 py-1 text-xs font-semibold" style={chip(dials.voice === v)}>
                    {VOICE_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scan */}
          <button type="button" onClick={scanForIdeas} disabled={scanning} className="cn-btn cn-btn-primary mt-4 w-full disabled:opacity-60">
            {scanning ? 'Reading across your years…' : `✨ Scan my journals for ${dials.form === 'devotional' ? `${dials.duration ?? 30}-day devotional` : FORM_LABELS[dials.form].label.replace(/^\S+\s/, '').toLowerCase()} ideas`}
          </button>
          {scanning && <p className="mt-2 text-xs text-[var(--fg-3)]">About a minute — it samples every season of your journals with your settings in mind.</p>}

          {/* Pitches */}
          {suggestions && suggestions.length > 0 && (
            <div className="mt-4 space-y-3">
              {suggestions.map(s => (
                <div key={s.title} className="rounded-xl border border-[var(--line-2)] p-3">
                  <div className="text-base" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>{s.title}</div>
                  {s.premise && <p className="mt-1 text-xs leading-relaxed text-[var(--fg-2)]">{s.premise}</p>}
                  {s.hook && <p className="mt-2 border-l-2 pl-2 text-xs italic leading-relaxed text-[var(--fg-3)]" style={{ borderColor: 'var(--establish)' }}>{s.hook}</p>}
                  {s.fit && <p className="mt-1.5 text-[11px] leading-snug" style={{ color: '#F4B650' }}>Editor&rsquo;s note: {s.fit}</p>}
                  <button
                    type="button"
                    disabled={starting}
                    onClick={() => start(s.title, s.premise, s.dials ?? dials)}
                    className="mt-2 text-xs font-semibold underline disabled:opacity-50"
                    style={{ color: 'var(--establish)' }}
                  >
                    {starting ? 'Starting…' : 'Start this book →'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Start your own */}
        <div className="mt-6 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5" style={{ boxShadow: 'var(--elev-2)' }}>
          {!showStart ? (
            <button type="button" onClick={() => setShowStart(true)} className="cn-btn cn-btn-ghost w-full">
              Or name your own book — uses the settings above
            </button>
          ) : (
            <>
              <div className="cn-label" style={{ color: 'var(--establish)' }}>Your own title</div>
              <p className="mt-1 text-[11px] text-[var(--fg-3)]">
                Will be written as: {FORM_LABELS[dials.form].label}{dials.form === 'devotional' ? ` · ${dials.duration ?? 30} days` : ''}{dials.addons.length ? ` · ${dials.addons.map(a => ADDON_LABELS[a]).join(', ')}` : ''} · {VOICE_LABELS[dials.voice]}
              </p>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title"
                disabled={starting}
                className="mt-3 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)]"
              />
              <textarea
                value={premise}
                onChange={e => setPremise(e.target.value)}
                rows={3}
                disabled={starting}
                placeholder="A sentence or two on what this book should be — the season, the people, the lesson."
                className="mt-2 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm leading-relaxed text-[var(--fg-1)] placeholder:text-[var(--fg-3)]"
              />
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={() => start()} disabled={!title.trim() || starting} className="cn-btn cn-btn-primary disabled:opacity-50">
                  {starting ? 'Reading your journals…' : 'Begin — prepare my interview'}
                </button>
                {!starting && (
                  <button type="button" onClick={() => setShowStart(false)} className="cn-btn cn-btn-ghost">Cancel</button>
                )}
              </div>
              {starting && (
                <p className="mt-2 text-xs text-[var(--fg-3)]">
                  The ghostwriter is reading your journals and writing interview questions shaped for this
                  kind of book — about a minute.
                </p>
              )}
              {error && <p className="mt-2 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
