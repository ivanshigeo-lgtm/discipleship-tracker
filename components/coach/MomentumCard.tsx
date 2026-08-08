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

type Mode = 'direct' | 'my' | 'gbc'

export default function MomentumCard({
  personId,
  myPersonIds,
  myDirectIds,
  canSeeAllChurch,
  refreshKey,
  onPersonClick,
}: {
  personId: string
  myPersonIds?: string[]
  myDirectIds?: string[]
  canSeeAllChurch: boolean
  refreshKey: number
  onPersonClick: (person: Person) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [items, setItems] = useState<StageChecklistItem[]>([])
  const [bookletProgress, setBookletProgress] = useState<BookletProgress[]>([])
  const [pendingSignoffs, setPendingSignoffs] = useState(0)
  const [mode, setMode] = useState<Mode>('my')
  // The Wk/30d window controls only the tile counts (new people / milestones /
  // chapters). The weekly signals (% moving, Since Sunday) are ALWAYS Sunday-anchored.
  const [win, setWin] = useState<'week' | '30d'>('week')
  // Which metric the weekly bar chart plots — tap a tile to switch.
  const [metric, setMetric] = useState<'people' | 'milestones' | 'chapters'>('milestones')
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
    const allow = mode === 'direct' && myDirectIds ? new Set(myDirectIds)
      : mode === 'my' && myPersonIds ? new Set(myPersonIds)
      : null
    const inScope = (id: string) => !allow || allow.has(id)
    const active = people.filter(p => p.status !== 'Inactive' && inScope(p.id))
    const n = active.length
    const activeIds = new Set(active.map(p => p.id))
    const small = n < 10

    const now = Date.now()
    const WEEK = 7 * DAY_MS
    // Movement events — a checklist completion OR a booklet chapter advance is a
    // "step". Flatten both into one {id, at} list so every window/bucket below is a
    // single pass. booklet_progress keeps only the latest advance's timestamp,
    // which is exactly what buckets the most recent chapter move into its week.
    const events: { id: string; at: number; chapter: boolean }[] = []
    for (const it of items) {
      if (it.completed && it.completed_at && it.label.startsWith('Completed ') && activeIds.has(it.person_id))
        events.push({ id: it.person_id, at: new Date(it.completed_at).getTime(), chapter: false })
    }
    for (const bp of bookletProgress) {
      if (bp.current_chapter > 0 && bp.updated_at && activeIds.has(bp.person_id))
        events.push({ id: bp.person_id, at: new Date(bp.updated_at).getTime(), chapter: true })
    }
    const moversIn = (a: number, b: number) => {
      const s = new Set<string>()
      for (const e of events) if (e.at >= a && e.at < b) s.add(e.id)
      return s.size
    }
    const countIn = (a: number, b: number) => events.filter(e => e.at >= a && e.at < b).length

    // Sunday 00:00 local. `elapsed` is how far into this week we are, so the
    // week-over-week comparison is same-slice: Sun→now this week vs Sun→(same
    // weekday/time) last week — a true partial-week compare that grows daily.
    const sunday = new Date(); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay())
    const weekStart = sunday.getTime()
    const elapsed = now - weekStart

    // ALWAYS-ON weekly signal (Sunday-anchored, never toggle-controlled).
    const weekMovers = moversIn(weekStart, now + 1)
    const prevWeekMovers = moversIn(weekStart - WEEK, weekStart - WEEK + elapsed)

    // Since Sunday raw milestone volume + type breakdown.
    const checklistSinceSunday = events.filter(e => !e.chapter && e.at >= weekStart).length
    const chapterSinceSunday = events.filter(e => e.chapter && e.at >= weekStart).length
    const sinceSunday = checklistSinceSunday + chapterSinceSunday

    // Toggle-controlled window: new people + milestone + chapter volume.
    const winStart = win === 'week' ? weekStart : now - 30 * DAY_MS
    const peopleAt = (p: Person) => (p.created_at ? new Date(p.created_at).getTime() : -1)
    const newPeople = active.filter(p => peopleAt(p) >= winStart).length
    const winMilestones = countIn(winStart, now + 1)
    const winChapters = events.filter(e => e.chapter && e.at >= winStart).length

    // Per-metric weekly series + movement-rate sparkline over the last 8 Sunday
    // weeks (the current, partial week is the last bar/point). One bucket array
    // per tappable tile so the chart can plot whichever metric is selected.
    const NW = 8
    const weekBuckets: number[] = []      // milestones (checklist + chapter) / week
    const peopleBuckets: number[] = []    // new people / week
    const chapterBuckets: number[] = []   // chapter advances / week
    const rates: number[] = []
    for (let i = 0; i < NW; i++) {
      const a = weekStart - (NW - 1 - i) * WEEK
      const b = i === NW - 1 ? now + 1 : a + WEEK
      weekBuckets.push(countIn(a, b))
      chapterBuckets.push(events.filter(e => e.chapter && e.at >= a && e.at < b).length)
      peopleBuckets.push(active.filter(p => { const t = peopleAt(p); return t >= a && t < b }).length)
      rates.push(n ? (moversIn(a, b) / n) * 100 : 0)
    }
    const peak = Math.max(1, ...weekBuckets)

    // Leader health across the scope.
    const leaders = active.filter(p => p.current_stage === 'Equip' || p.current_stage === 'Empower').length
    const carried = n - leaders
    const ratio = leaders > 0 ? carried / leaders : null

    const risers = topRisers(people, items, allow).slice(0, 2)

    return { n, small, rates, weekMovers, prevWeekMovers, newPeople, winMilestones, winChapters, weekBuckets, peopleBuckets, chapterBuckets, peak, leaders, carried, ratio, sinceSunday, checklistSinceSunday, chapterSinceSunday, risers }
  }, [people, items, bookletProgress, myPersonIds, myDirectIds, mode, win])

  if (!ready) return null

  const { n, small, rates, weekMovers, prevWeekMovers, ratio, risers } = data
  const pctNow = n ? Math.round((weekMovers / n) * 100) : 0
  const pctPrev = n ? Math.round((prevWeekMovers / n) * 100) : 0
  const deltaPts = pctNow - pctPrev

  // Sparkline of the rate vs the scope's own average (mock's scaling ported).
  const lo = Math.min(...rates), hi = Math.max(...rates)
  const pad = (hi - lo) * 0.35 || 10
  const y = (r: number) => 8 + (1 - (r - (lo - pad)) / ((hi + pad) - (lo - pad))) * 26
  const xs = rates.map((_, i) => 4 + i * (96 / (rates.length - 1)))
  const points = rates.map((r, i) => `${xs[i].toFixed(1)},${y(r).toFixed(1)}`).join(' ')
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length
  const baseY = y(avg).toFixed(1)

  const ratioLine = mode !== 'gbc'
    ? n === 0
      ? <>No one in your constellation yet — invite someone below.</>
      : <>You&rsquo;re walking with <b className="font-semibold text-[var(--gold)]">{n}</b>{risers.length > 0 && risers[0].pct >= 50 && <> — and <b className="font-semibold text-[var(--gold)]">{risers.filter(r => r.pct >= 50).length}</b> {risers.filter(r => r.pct >= 50).length === 1 ? 'of them is' : 'of them are'} nearly ready to lead.</>}</>
    : ratio !== null
      ? <>Across Grace Bible, every leader is carrying <b className="font-semibold text-[var(--gold)]">{ratio.toFixed(1).replace(/\.0$/, '')}</b> people.</>
      : <>Across Grace Bible, <b className="font-semibold text-[var(--gold)]">{n}</b> people are on the journey.</>

  // Everything below is Sunday-to-date (week-to-date), compared to the same slice
  // of last week — so the trend reads honestly from Monday on, no full-week wait.
  // Always show the raw fraction (movers OF the scope total) so the percent is
  // transparent and the denominator visibly tracks the My people/constellation/GBC
  // toggle — a "mover" is a distinct PERSON, not a milestone count.
  const moveLine = small
    ? <><b className="font-semibold text-[var(--fg-1)]">{weekMovers} of {n}</b> took a step this week</>
    : <><b className="font-semibold text-[var(--fg-1)]">{weekMovers} of {n} people</b> took a step this week ({pctNow}%)</>

  const deltaUp = small ? weekMovers >= prevWeekMovers : deltaPts >= 0
  const deltaLine = small
    ? weekMovers === prevWeekMovers
      ? <>even with last week to date ({prevWeekMovers})</>
      : deltaUp
        ? <><span className="font-bold text-[var(--success)]">▲</span> up from {prevWeekMovers} last week to date</>
        : <>▼ down from {prevWeekMovers} last week to date</>
    : deltaPts === 0
      ? <>even with last week to date</>
      : deltaUp
        ? <><span className="font-bold text-[var(--success)]">▲ {deltaPts} pts</span> vs last week to date</>
        : <>▼ {Math.abs(deltaPts)} pts vs last week to date</>

  const modes: [Mode, string][] = [
    ['direct', 'My people'],
    ['my', 'My constellation'],
    ...(canSeeAllChurch ? [['gbc', 'GBC'] as [Mode, string]] : []),
  ]

  // Tappable stat tiles — each drives the weekly bar chart below.
  const winSub = win === 'week' ? 'since Sun' : 'last 30d'
  const tiles = [
    { key: 'people' as const, label: 'New people', num: data.newPeople, color: 'var(--gbm-cobalt-soft,#8FA6E8)', buckets: data.peopleBuckets, chart: 'New people / week' },
    { key: 'milestones' as const, label: 'Milestones', num: data.winMilestones, color: 'var(--success)', buckets: data.weekBuckets, chart: 'Milestones / week' },
    { key: 'chapters' as const, label: 'Chapters', num: data.winChapters, color: 'var(--gold)', buckets: data.chapterBuckets, chart: 'Chapters / week' },
  ]
  const activeTile = tiles.find(t => t.key === metric) ?? tiles[1]
  const activeBuckets = activeTile.buckets
  const activePeak = Math.max(1, ...activeBuckets)

  return (
    <section className="mb-5">
      <ZoneLabel label="Leadership momentum" />
      <div className="cn-card flex flex-col gap-3 px-4 pb-4 pt-3.5">
        <div className="flex items-center">
          <div className="ml-auto flex rounded-full border border-[var(--line-1)] bg-[var(--indigo)] p-0.5">
            {modes.map(([val, label]) => (
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
            <p className={`mt-1 text-[11px] ${deltaUp ? 'text-[var(--success)]' : 'text-[var(--fg-3)]'}`}>{deltaLine}</p>
            <p className="mt-1.5 text-[10.5px] leading-[1.35] text-[var(--fg-3)] opacity-85">A &ldquo;step&rdquo; = one person completing a checklist item or advancing a booklet chapter.</p>
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
          Since Sunday: {data.sinceSunday} {data.sinceSunday === 1 ? 'milestone' : 'milestones'} logged
          {data.chapterSinceSunday > 0 ? ` (${data.checklistSinceSunday} checklist + ${data.chapterSinceSunday} chapter ${data.chapterSinceSunday === 1 ? 'advance' : 'advances'})` : ''} · {pendingSignoffs} {pendingSignoffs === 1 ? 'sign-off' : 'sign-offs'} waiting
        </p>

        {/* ── Window block: new people + milestone volume (Wk/30d controls THIS only) ── */}
        <div className="flex flex-col gap-2.5 border-t border-[var(--line-1)] pt-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--fg-3)]">The numbers</p>
            <div className="flex rounded-full bg-[rgba(6,8,20,.5)] p-[3px]">
              {(['week', '30d'] as const).map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWin(w)}
                  className={`rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all ${win === w ? 'bg-[var(--gbm-cobalt,#5B8DF7)] text-white' : 'text-[var(--fg-3)] hover:text-[var(--fg-1)]'}`}
                >
                  {w === 'week' ? 'Week' : '30d'}
                </button>
              ))}
            </div>
          </div>

          {/* Three tappable stat tiles — the selected one drives the chart. */}
          <div className="flex gap-2">
            {tiles.map(t => {
              const on = metric === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setMetric(t.key)}
                  className="flex-1 rounded-xl border px-2.5 py-2.5 text-left transition-all"
                  style={{
                    borderColor: on ? t.color : 'var(--line-1)',
                    background: on ? `color-mix(in srgb, ${t.color} 12%, transparent)` : 'var(--indigo)',
                  }}
                >
                  <p className="text-[10.5px] font-semibold text-[var(--fg-2)] truncate">{t.label}</p>
                  <p className="text-[23px] font-semibold leading-7" style={{ fontFamily: 'var(--font-display)', color: t.color }}>{t.num}</p>
                  <p className="text-[9.5px] text-[var(--fg-3)] truncate">{winSub}</p>
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[9.5px] font-semibold uppercase tracking-[.08em]" style={{ color: activeTile.color }}>{activeTile.chart}</p>
            <p className="text-[9.5px] font-semibold uppercase tracking-[.08em] text-[var(--fg-3)]">Peak {activePeak}</p>
          </div>
          <div className="flex h-11 items-end gap-[5px]">
            {activeBuckets.map((v, i) => (
              <div key={i} className="flex h-11 flex-1 items-end">
                <div
                  className="w-full rounded-[3px]"
                  style={{ height: Math.max(3, (v / activePeak) * 40), background: v > 0 ? activeTile.color : 'rgba(246,241,231,.12)' }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[9.5px] text-[var(--fg-3)]">{activeBuckets.length}w ago</p>
            <p className="text-[9.5px] text-[var(--fg-3)]">this week</p>
          </div>
        </div>
      </div>
    </section>
  )
}
