'use client'
// Private, admin-only view of how many people have visited the /assessment
// funnel. Not linked from anywhere public; gated both client-side (useAuth
// is_admin) and server-side (/api/visit-stats verifies the token → is_admin).
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

type DayRow = { day: string; visits: number; uniques: number }
type Stats = {
  total: number
  unique: number
  today: number
  last7: number
  first_at: string | null
  by_day: DayRow[]
}
type LeadRow = { name: string | null; email: string; created: boolean; submitted_at: string }
type Leads = { count: number; total_submissions: number; list: LeadRow[] }

export default function AssessmentStatsPage() {
  const { session, profile, profileLoading } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [leads, setLeads] = useState<Leads | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading')

  useEffect(() => {
    if (profileLoading) return
    const token = session?.access_token
    if (!token || !profile?.is_admin) {
      setState('denied')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/visit-stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token }),
        })
        const json = await res.json()
        if (cancelled) return
        if (res.ok && json.stats) {
          setStats(json.stats as Stats)
          setLeads((json.leads ?? null) as Leads | null)
          setState('ready')
        } else {
          setState(res.status === 403 ? 'denied' : 'error')
        }
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session, profile, profileLoading])

  return (
    <div className="min-h-screen bg-[var(--void)] px-5 py-10 text-[var(--fg-1)]">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
          Private · Admin only
        </p>
        <h1 className="mt-3 [font-family:var(--font-display)] text-4xl leading-tight">
          Assessment visits
        </h1>
        <p className="mt-2 text-[var(--fg-3)]">Traffic to wikichurch.app/assessment.</p>

        {state === 'loading' && <p className="mt-8 text-[var(--fg-3)]">Loading…</p>}

        {state === 'denied' && (
          <p className="mt-8 text-[var(--fg-2)]">
            You need to be signed in as an admin to see this.{' '}
            <Link href="/" className="text-[var(--gold)] underline">
              Sign in
            </Link>
          </p>
        )}

        {state === 'error' && (
          <p className="mt-8 text-[var(--danger,#e05a5a)]">Could not load stats. Try again.</p>
        )}

        {state === 'ready' && stats && (
          <>
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total visits" value={stats.total} />
              <Stat label="Unique visitors" value={stats.unique} accent />
              <Stat label="Today" value={stats.today} />
              <Stat label="Last 7 days" value={stats.last7} />
            </div>

            <p className="mt-4 text-sm text-[var(--fg-3)]">
              {stats.first_at
                ? `Counting since ${new Date(stats.first_at).toLocaleDateString(undefined, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}.`
                : 'No visits recorded yet.'}
              {' '}“Unique” counts distinct browsers; “total” counts every page load.
            </p>

            <div className="mt-10">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--fg-3)]">
                  Emails collected
                </h2>
                <span className="[font-family:var(--font-display)] text-2xl text-[var(--gold)]">
                  {(leads?.count ?? 0).toLocaleString()}
                </span>
              </div>

              {leads && leads.list.length > 0 ? (
                <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line-1)]">
                  {leads.list.map((l, i) => (
                    <div
                      key={l.email}
                      className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${
                        i % 2 ? 'bg-[var(--indigo-2)]/40' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[var(--fg-1)]">
                          {l.name || '—'}
                        </div>
                        <a
                          href={`mailto:${l.email}`}
                          className="truncate text-[var(--fg-3)] hover:text-[var(--gold)]"
                        >
                          {l.email}
                        </a>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-xs text-[var(--fg-3)]">
                        {new Date(l.submitted_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--fg-3)]">No emails collected yet.</p>
              )}
            </div>

            {stats.by_day.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--fg-3)]">
                  Last 30 days
                </h2>
                <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--line-1)]">
                  {stats.by_day.map((d, i) => (
                    <div
                      key={d.day}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                        i % 2 ? 'bg-[var(--indigo-2)]/40' : ''
                      }`}
                    >
                      <span className="text-[var(--fg-2)]">
                        {new Date(d.day + 'T00:00:00').toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span className="tabular-nums text-[var(--fg-1)]">
                        {d.visits} visit{d.visits === 1 ? '' : 's'}
                        <span className="ml-2 text-[var(--fg-3)]">· {d.uniques} unique</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-4 shadow-[var(--elev-2)]">
      <div
        className={`[font-family:var(--font-display)] text-3xl ${
          accent ? 'text-[var(--gold)]' : 'text-[var(--fg-1)]'
        }`}
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-xs uppercase tracking-wider text-[var(--fg-3)]">{label}</div>
    </div>
  )
}
