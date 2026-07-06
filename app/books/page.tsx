'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { Starfield } from '../../components/journey/StarPrimitives'

// The bookshelf: every Work in progress, plus "start a new book" — pick a
// suggested topic (drawn from what the journals hold) or name your own, and
// the ghostwriter reads your journals and prepares its interview.

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

type Suggestion = { title: string; premise: string; hook: string }

const SUGGESTIONS = [
  { title: 'The Answered Book', premise: 'The prayers I wrote down and the days God answered them — compiled from my journals into short faith stories.' },
  { title: 'What I Told God About My Children', premise: 'Every prayer I have prayed for my kids across the years, and what has become of them.' },
  { title: 'A Year in the Life', premise: 'One year of my journals — what I prayed, what happened, and what changed, month by month.' },
  { title: 'My Proverbs', premise: 'The sayings and lessons that keep showing up in my own handwriting — the truths God has taught me, in my own words.' },
]

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

  const scanForIdeas = async () => {
    if (!profile?.id || scanning) return
    setScanning(true)
    try {
      const res = await fetch('/api/books/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: profile.id }),
      })
      const j = await res.json()
      if (res.ok) setSuggestions(j.suggestions)
    } catch { /* keep whatever we had */ }
    setScanning(false)
  }

  const start = async () => {
    if (!profile?.id || !title.trim() || starting) return
    setStarting(true)
    setError('')
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: profile.id, title: title.trim(), premise: premise.trim() }),
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
            Pick what the book is about. The ghostwriter reads your journals, then interviews you for
            the parts only you know — and writes from both.
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
                        ✍️ Writing chapter {Math.min(b.chaptersWritten + 1, b.plannedChapters ?? b.chaptersWritten + 1)}{b.plannedChapters ? ` of ${b.plannedChapters}` : ''}…
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

        {/* Suggested from the journals */}
        <div className="mt-6 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5" style={{ boxShadow: 'var(--elev-2)' }}>
          <div className="cn-label" style={{ color: 'var(--establish)' }}>Suggested from your journals</div>
          {suggestions === null && !scanning && (
            <p className="mt-2 text-sm text-[var(--fg-2)]">
              Let the ghostwriter read across your years and pitch the books already hiding in your own pages.
            </p>
          )}
          {suggestions && suggestions.length > 0 && (
            <div className="mt-3 space-y-3">
              {suggestions.map(s => (
                <div key={s.title} className="rounded-xl border border-[var(--line-2)] p-3">
                  <div className="text-base" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>{s.title}</div>
                  {s.premise && <p className="mt-1 text-xs leading-relaxed text-[var(--fg-2)]">{s.premise}</p>}
                  {s.hook && <p className="mt-2 border-l-2 pl-2 text-xs italic leading-relaxed text-[var(--fg-3)]" style={{ borderColor: 'var(--establish)' }}>{s.hook}</p>}
                  <button
                    type="button"
                    onClick={() => { setTitle(s.title); setPremise(s.premise); setShowStart(true); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }) }}
                    className="mt-2 text-xs font-semibold underline"
                    style={{ color: 'var(--establish)' }}
                  >
                    Start this book →
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={scanForIdeas} disabled={scanning} className="cn-btn cn-btn-ghost mt-3 disabled:opacity-60">
            {scanning ? 'Reading across your years…' : suggestions ? '✨ Scan again' : '✨ Scan my journals for book ideas'}
          </button>
          {scanning && <p className="mt-2 text-xs text-[var(--fg-3)]">About a minute — it samples every season of your journals.</p>}
        </div>

        {/* Start a new book */}
        <div className="mt-6 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5" style={{ boxShadow: 'var(--elev-2)' }}>
          {!showStart ? (
            <button type="button" onClick={() => setShowStart(true)} className="cn-btn cn-btn-primary w-full">
              ✦ Start a new book
            </button>
          ) : (
            <>
              <div className="cn-label" style={{ color: 'var(--establish)' }}>What is this book about?</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => { setTitle(s.title); setPremise(s.premise) }}
                    className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      borderColor: title === s.title ? 'rgba(54,214,195,.5)' : 'var(--line-2)',
                      color: title === s.title ? 'var(--establish)' : 'var(--fg-2)',
                      background: title === s.title ? 'rgba(54,214,195,.10)' : 'transparent',
                    }}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title — yours, or pick one above"
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
                <button type="button" onClick={start} disabled={!title.trim() || starting} className="cn-btn cn-btn-primary disabled:opacity-50">
                  {starting ? 'Reading your journals…' : 'Begin — prepare my interview'}
                </button>
                {!starting && (
                  <button type="button" onClick={() => setShowStart(false)} className="cn-btn cn-btn-ghost">Cancel</button>
                )}
              </div>
              {starting && (
                <p className="mt-2 text-xs text-[var(--fg-3)]">
                  The ghostwriter is reading your journals and writing your interview questions — about a
                  minute. You&rsquo;ll land on the first question.
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
