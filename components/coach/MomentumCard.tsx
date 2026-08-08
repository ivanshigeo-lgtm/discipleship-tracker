'use client'

// Zone 4: leadership momentum in ONE card. The headline metric is the
// MOVEMENT RATE — the share of active scoped people who took ≥1 journey step
// in the window — either a stage_checklist_items completion OR advancing a
// booklet chapter (booklet_progress.updated_at) — so the number carries
// its own denominator and scales honestly from 3 people to 165. Small
// constellations get plain words on a monthly window; larger scopes get a
// percentage with a weekly trend. The sparkline plots the RATE against a
// dashed baseline = the scope's own average. Raw milestone volume is demoted
// to a "Since Sunday" line. Rising block = top-2 emerging leaders by
// checklist percent-complete (the heavy Empower forecast stays off the home).

import { useEffect, useMemo, useState } from 'react'
import { getPeople, getAllStageChecklistItems, getAllBookletProgress, getPendingLevelSignoffs } from '../../lib/supabaseQueries'
import { topRisers, ZoneLabel } from './coachModel'
import type { BookletProgress, Person, StageChecklistItem } from '../../types/database'

const DAY_MS = 86_400_000

export default function MomentumCard({
  personId,
  myPersonIds,
  canSeeAllChurch,
  refreshKey,
  onPersonClick,
}: {
  personId: string
  myPersonIds?: string[]
  canSeeAllChurch: boolean
  refreshKey: number
  onPersonClick: (person: Person) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [items, setItems] = useState<StageChecklistItem[]>([])
  const [bookletProgress, setBookletProgress] = useState<BookletProgress[]>([])
  const [pendingSignoffs, setPendingSignoffs] = useState(0)
  const [mode, setMode] = useState<'my' | 'gbc'>('my')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [p, i, bp, so] = await Promise.all([
        getPeople(), getAllStageChecklistItems(), getAllBookletProgress(), getPendingLevelSignoffs(personId),
      ])
      if (!alive) return
      if (p.data) setPeople(p.data as Person[])
      if (i.data) setItems(i.data as StageChecklistItem[])
      if (bp.data) setBookletProgress(bp.data as BookletProgress[])
      setPendingSignoffs((so.data as unknown[] | null)?.length ?? 0)
      setReady(true)
    })()
    return () => { alive = false }
  }, [personId, refreshKey])

  const data = useMemo(() => {
    const allow = mode === 'my' && myPersonIds ? new Set(myPersonIds) : null
    const inScope = (id: string) => !allow || allow.has(id)
    const active = people.filter(p => p.status !== 'Inactive' && inScope(p.id))
    const n = active.length
    const activeIds = new Set(active.map(p => p.id))
    const small = n < 10

    const completions = items.filter(it => it.completed && it.completed_at && activeIds.has(it.person_id))
    // A step = a checklist completion OR a booklet chapter advance. booklet_progress
    // keeps only the latest advance's timestamp, which is exactly what buckets the
    // most recent chapter move into the right week.
    const chapterMoves = bookletProgress.filter(
      bp => bp.current_chapter > 0 && bp.updated_at && activeIds.has(bp.person_id),
    )
    // Distinct movers per bucket, newest bucket last. Small scopes bucket by
    // 30-day "months", larger by weeks.
    const bucketDays = small ? 30 : 7
    const numBuckets = small ? 4 : 8
    const now = Date.now()
    const buckets: Set<string>[] = Array.from({ length: numBuckets }, () => new Set<string>())
    const bucketMove = (id: string, at: string) => {
      const ago = Math.floor((now - new Date(at).getTime()) / (bucketDays * DAY_MS))
      if (ago >= 0 && ago < numBuckets) buckets[numBuckets - 1 - ago].add(id)
    }
    for (const it of completions) bucketMove(it.person_id, it.completed_at!)
    for (const bp of chapterMoves) bucketMove(bp.person_id, bp.updated_at)
    const rates = buckets.map(b => (n ? (b.size / n) * 100 : 0))
    const moversNow = buckets[numBuckets - 1].size
    const moversPrev = buckets[numBuckets - 2].size

    // Leader health across the scope.
    const leaders = active.filter(p => p.current_stage === 'Equip' || p.current_stage === 'Empower').length
    const carried = n - leaders
    const ratio = leaders > 0 ? carried / leaders : null

    // Since the most recent Sunday 00:00 local: raw milestone volume.
    const sunday = new Date(); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay())
    const sinceSunday = completions.filter(it =>
      it.label.startsWith('Completed ') && new Date(it.completed_at!).getTime() >= sunday.getTime()
    ).length

    const risers = topRisers(people, items, allow).slice(0, 2)

    return { n, small, rates, moversNow, moversPrev, leaders, carried, ratio, sinceSunday, risers }
  }, [people, items, bookletProgress, myPersonIds, mode])

  if (!ready) return null

  const { n, small, rates, moversNow, moversPrev, ratio, risers } = data
  const pctNow = Math.round(rates[rates.length - 1])
  const pctPrev = Math.round(rates[rates.length - 2])
  const deltaPts = pctNow - pctPrev

  // Sparkline of the rate vs the scope's own average (mock's scaling ported).
  const lo = Math.min(...rates), hi = Math.max(...rates)
  const pad = (hi - lo) * 0.35 || 10
  const y = (r: number) => 8 + (1 - (r - (lo - pad)) / ((hi + pad) - (lo - pad))) * 26
  const xs = rates.map((_, i) => 4 + i * (96 / (rates.length - 1)))
  const points = rates.map((r, i) => `${xs[i].toFixed(1)},${y(r).toFixed(1)}`).join(' ')
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length
  const baseY = y(avg).toFixed(1)

  const ratioLine = mode === 'my'
    ? n === 0
      ? <>No one in your constellation yet — invite someone below.</>
      : <>You&rsquo;re walking with <b className="font-semibold text-[var(--gold)]">{n}</b>{risers.length > 0 && risers[0].pct >= 50 && <> — and <b className="font-semibold text-[var(--gold)]">{risers.filter(r => r.pct >= 50).length}</b> {risers.filter(r => r.pct >= 50).length === 1 ? 'of them is' : 'of them are'} nearly ready to lead.</>}</>
    : ratio !== null
      ? <>Across Grace Bible, every leader is carrying <b className="font-semibold text-[var(--gold)]">{ratio.toFixed(1).replace(/\.0$/, '')}</b> people.</>
      : <>Across Grace Bible, <b className="font-semibold text-[var(--gold)]">{n}</b> people are on the journey.</>

  const moveLine = small
    ? <><b className="font-semibold text-[var(--fg-1)]">{moversNow} of your {n}</b> took a step this month</>
    : <><b className="font-semibold text-[var(--fg-1)]">{pctNow}%</b> of {mode === 'gbc' ? 'Grace Bible' : 'your constellation'} took a step this week</>

  const deltaLine = small
    ? moversNow >= moversPrev
      ? <><span className="font-bold text-[var(--success)]">▲</span> up from {moversPrev} of {n} last month</>
      : <>down from {moversPrev} of {n} last month</>
    : deltaPts >= 0
      ? <><span className="font-bold text-[var(--success)]">▲ {deltaPts} pts</span> vs last week</>
      : <>▼ {Math.abs(deltaPts)} pts vs last week</>

  return (
    <section className="mb-5">
      <ZoneLabel label="Leadership momentum" />
      <div className="cn-card flex flex-col gap-3 px-4 pb-4 pt-3.5">
        <div className="flex items-center">
          <div className="ml-auto flex rounded-full border border-[var(--line-1)] bg-[var(--indigo)] p-0.5">
            {([['my', 'My constellation'], ...(canSeeAllChurch ? [['gbc', 'Grace Bible']] : [])] as ['my' | 'gbc', string][]).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setMode(val)}
                className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-all ${mode === val ? 'bg-[var(--indigo-3)] text-[var(--fg-1)]' : 'text-[var(--fg-3)] hover:text-[var(--fg-1)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-[21px] font-semibold leading-tight text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}>
          {ratioLine}
        </p>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--fg-3)]">People moving</p>
            <p className="mt-1 text-[15px] font-semibold leading-snug text-[var(--fg-1)]">{moveLine}</p>
            <p className="mt-1 text-[11px] text-[var(--fg-3)]">{deltaLine}</p>
          </div>
          <svg width="104" height="48" viewBox="0 0 104 48" aria-hidden="true">
            <line x1="4" y1={baseY} x2="100" y2={baseY} stroke="rgba(246,241,231,.28)" strokeWidth="1" strokeDasharray="3 4" />
            <polyline points={points} stroke="#5B8DF7" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={xs[xs.length - 1]} cy={y(rates[rates.length - 1]).toFixed(1)} r="3.4" fill="#F2C879" />
            <text x="100" y="45" textAnchor="end" fontFamily="var(--font-ui)" fontSize="7.5" fontWeight="600" fill="#7A82A8">
              vs your average
            </text>
          </svg>
        </div>

        <p className="text-[11.5px] text-[var(--fg-3)]">
          Since Sunday: {data.sinceSunday} {data.sinceSunday === 1 ? 'milestone' : 'milestones'} logged · {pendingSignoffs} {pendingSignoffs === 1 ? 'sign-off' : 'sign-offs'} waiting
        </p>

        {risers.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-[var(--line-1)] pt-3">
            {risers.map((r, i) => (
              <button
                key={r.person.id}
                type="button"
                onClick={() => onPersonClick(r.person)}
                className="flex items-center gap-2.5 text-left text-[12.5px]"
              >
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: 'var(--empower)', boxShadow: '0 0 9px 1px rgba(240,114,159,.65)', opacity: i === 0 ? 1 : 0.55 }}
                />
                <span className="font-semibold text-[var(--fg-1)]">{r.person.name}</span>
                <span className="ml-auto text-[11px] text-[var(--fg-3)]">
                  {r.person.current_stage} · {r.pct >= 100 ? 'checklist complete' : r.pct > 0 ? `${r.pct}% of the way` : 'on the way'}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
