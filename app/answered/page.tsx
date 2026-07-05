'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import { Starfield } from '../../components/journey/StarPrimitives'

// Answered Prayers — pairs a specific prayer from one entry with the later
// entry where the answer shows up, in the person's own words on both ends.

type Pair = {
  id: string
  prayer_date: string
  prayer_quote: string
  answer_date: string | null
  answer_quote: string | null
  arc_summary: string | null
  confidence: 'strong' | 'possible'
  status: 'suggested' | 'confirmed' | 'dismissed'
}

const fmt = (d: string | null) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : ''

export default function AnsweredPage() {
  const { profile, loading } = useAuth()
  const [pairs, setPairs] = useState<Pair[]>([])
  const [scanned, setScanned] = useState(0)
  const [totalEntries, setTotalEntries] = useState(0)
  const [phase, setPhase] = useState<'loading' | 'idle' | 'scanning' | 'ready'>('loading')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    if (!profile?.id) return { done: false }
    const res = await fetch(`/api/soap/answered?personId=${profile.id}`)
    const j = await res.json()
    setPairs(j.pairs ?? [])
    setScanned(j.scanned ?? 0)
    setTotalEntries(j.totalEntries ?? 0)
    const scanDone = (j.scanned ?? 0) >= (j.totalEntries ?? 0) && (j.totalEntries ?? 0) > 0
    return { done: scanDone && (j.pairs?.length ?? 0) > 0, scanDone }
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return
    load().then(({ scanDone }) => setPhase(scanDone ? 'ready' : 'idle'))
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [profile?.id, load])

  const startScan = async () => {
    if (!profile?.id || phase === 'scanning') return
    setPhase('scanning')
    // One kick — the server chains itself through the whole corpus.
    fetch('/api/soap/answered/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: profile.id }),
    }).catch(() => {})
    pollRef.current = setInterval(async () => {
      const { done, scanDone } = await load()
      if (scanDone) {
        // Extraction finished — nudge once more so the match phase runs if the
        // chain's last hop hasn't already produced pairs.
        fetch('/api/soap/answered/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personId: profile!.id }),
        }).catch(() => {})
      }
      if (done) {
        if (pollRef.current) clearInterval(pollRef.current)
        setPhase('ready')
      }
    }, 7000)
  }

  const curate = async (id: string, status: 'confirmed' | 'dismissed') => {
    setPairs(ps => status === 'dismissed' ? ps.filter(p => p.id !== id) : ps.map(p => (p.id === id ? { ...p, status } : p)))
    await fetch('/api/soap/answered', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
  }

  if (loading) return <div className="min-h-screen bg-[var(--void)]" />
  if (!profile) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--void)] p-4">
        <p className="text-[var(--fg-2)]">No profile linked to your account.</p>
      </div>
    )
  }

  const pct = totalEntries ? Math.min(100, Math.round((scanned / totalEntries) * 100)) : 0

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--void)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(120% 80% at 50% 0%, rgba(46,85,230,.14) 0%, rgba(6,8,20,0) 55%)' }}
      />
      <div className="pointer-events-none fixed inset-0">
        <Starfield count={60} seed={7} />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6">
        <Link href="/" className="text-sm text-[var(--fg-3)] hover:text-[var(--fg-2)]">← My Journey</Link>

        <div className="mt-4">
          <div className="cn-label" style={{ color: 'var(--establish)' }}>Answered</div>
          <h1 className="mt-1 text-3xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            Prayers God answered
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">
            Your own words on both ends: what you asked for, and the day you wrote down that it happened.
          </p>
        </div>

        {phase === 'idle' && (
          <div className="mt-8 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6 text-center" style={{ boxShadow: 'var(--elev-2)' }}>
            <p className="text-sm text-[var(--fg-2)]">
              {totalEntries} journal entries are ready to search. This reads every entry once and
              finds the prayers whose answers you later wrote down. It runs on its own — you can
              leave and come back.
            </p>
            <button type="button" onClick={startScan} className="cn-btn cn-btn-primary mt-4">
              ✦ Search my journals
            </button>
          </div>
        )}

        {phase === 'scanning' && (
          <div className="mt-8 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6" style={{ boxShadow: 'var(--elev-2)' }}>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--indigo-2)]">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--gbm-cobalt-bright)' }} />
            </div>
            <p className="mt-2 text-sm font-semibold text-[var(--fg-1)]">
              Reading {scanned}/{totalEntries} entries…
            </p>
            <p className="mt-1 text-xs text-[var(--fg-3)]">
              Then we match each prayer against everything you wrote afterward. A decade takes a few minutes.
            </p>
          </div>
        )}

        {phase === 'ready' && pairs.length === 0 && (
          <p className="mt-8 text-sm text-[var(--fg-2)]">
            No clear pairs found yet — as you keep journaling, answers to today&rsquo;s prayers will show up here.
          </p>
        )}

        {pairs.length > 0 && (
          <div className="mt-8 space-y-4">
            {pairs.map(p => (
              <div key={p.id} className="rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5" style={{ boxShadow: 'var(--elev-2)' }}>
                {p.arc_summary && (
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-1)' }}>{p.arc_summary}</p>
                )}
                <div className="mt-3 border-l-2 pl-3" style={{ borderColor: 'var(--gbm-cobalt-bright)' }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">You prayed · {fmt(p.prayer_date)}</div>
                  <p className="mt-1 text-sm italic text-[var(--fg-2)]">&ldquo;{p.prayer_quote}&rdquo;</p>
                </div>
                {p.answer_quote && (
                  <div className="mt-3 border-l-2 pl-3" style={{ borderColor: 'var(--establish)' }}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">You wrote · {fmt(p.answer_date)}</div>
                    <p className="mt-1 text-sm italic text-[var(--fg-2)]">&ldquo;{p.answer_quote}&rdquo;</p>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {p.status === 'confirmed' ? (
                    <span className="text-xs font-semibold" style={{ color: 'var(--establish)' }}>✓ Confirmed</span>
                  ) : (
                    <>
                      {p.confidence === 'possible' && (
                        <span className="text-[11px] text-[var(--fg-3)]">Possible match —</span>
                      )}
                      <button type="button" onClick={() => curate(p.id, 'confirmed')} className="text-xs font-semibold underline" style={{ color: 'var(--establish)' }}>
                        Yes, God answered this
                      </button>
                      <button type="button" onClick={() => curate(p.id, 'dismissed')} className="text-xs text-[var(--fg-3)] underline">
                        Not a match
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
