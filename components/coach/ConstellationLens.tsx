'use client'

// Zone 5: a live mini constellation with a user-driven camera. Three scope
// chips — Grace Bible → My constellation → Leaders — and the camera ZOOMS
// between them (transform, .7s); labels counter-scale via --zs so type stays
// readable at any zoom. Leaders dims everyone but Equip/Empower and pulses the
// top riser. The action button follows the lens: Invite on the wide scopes,
// "Invest in <name> →" on Leaders. The full pipeline/map/list lives behind
// "Open constellation" (the explore view) — never on the briefing.

import { useEffect, useMemo, useState } from 'react'
import { getPeople, getAllStageChecklistItems, getPipelineEvents } from '../../lib/supabaseQueries'
import { STAGE_COLORS, topRisers, ZoneLabel } from './coachModel'
import type { PipelineEvent, Person, Stage, StageChecklistItem } from '../../types/database'

type LensScope = 'church' | 'mine' | 'leaders'
const SCOPE_KEY = 'cn-lens-scope-v1'
const MAX_NAMED = 12

// Deterministic per-person hash so stars keep their spot between renders.
const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

const STAGE_ORDER: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']

export default function ConstellationLens({
  personId,
  myPersonIds,
  canSeeAllChurch,
  refreshKey,
  onInvite,
  onOpenExplore,
  onPersonClick,
}: {
  personId: string
  myPersonIds?: string[]
  canSeeAllChurch: boolean
  refreshKey: number
  onInvite: () => void
  onOpenExplore: () => void
  onPersonClick: (person: Person) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [items, setItems] = useState<StageChecklistItem[]>([])
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([])
  const [scope, setScope] = useState<LensScope>('mine')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(SCOPE_KEY) as LensScope | null
    if (saved === 'church' || saved === 'mine' || saved === 'leaders') {
      setScope(saved === 'church' && !canSeeAllChurch ? 'mine' : saved)
    }
  }, [canSeeAllChurch])
  const pickScope = (s: LensScope) => { setScope(s); localStorage.setItem(SCOPE_KEY, s) }

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [p, i, pe] = await Promise.all([getPeople(), getAllStageChecklistItems(), getPipelineEvents()])
      if (!alive) return
      if (p.data) setPeople(p.data as Person[])
      if (i.data) setItems(i.data as StageChecklistItem[])
      if (pe.data) setPipelineEvents(pe.data as PipelineEvent[])
      setReady(true)
    })()
    return () => { alive = false }
  }, [refreshKey])

  const world = useMemo(() => {
    const active = people.filter(p => p.status !== 'Inactive')
    const mineSet = myPersonIds ? new Set(myPersonIds) : new Set<string>()
    const mine = active.filter(p => mineSet.has(p.id))
    const churchDist: Record<Stage, number> = { Engage: 0, Establish: 0, Equip: 0, Empower: 0 }
    active.forEach(p => { churchDist[p.current_stage]++ })
    const mineDist: Record<Stage, number> = { Engage: 0, Establish: 0, Equip: 0, Empower: 0 }
    mine.forEach(p => { mineDist[p.current_stage]++ })

    // "+X this week" velocity — people who ENTERED each stage in the last 7 days
    // (pipeline_events, scope-aware) plus net-new people added (people.created_at).
    // Same source the explore ring uses, so home + explore agree.
    const WK = Date.now() - 7 * 86_400_000
    const at = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN)
    const churchWk: Record<Stage, number> = { Engage: 0, Establish: 0, Equip: 0, Empower: 0 }
    const mineWk: Record<Stage, number> = { Engage: 0, Establish: 0, Equip: 0, Empower: 0 }
    for (const ev of pipelineEvents) {
      if (!ev.to_stage || !(ev.to_stage in churchWk) || at(ev.created_at) < WK) continue
      churchWk[ev.to_stage]++
      if (mineSet.has(ev.person_id)) mineWk[ev.to_stage]++
    }
    const churchWkTotal = active.filter(p => at(p.created_at) >= WK).length
    const mineWkTotal = mine.filter(p => at(p.created_at) >= WK).length

    // Ambient church stars cluster around the flame; the coach's own cluster
    // sits lower-right (the camera's zoom target) and stays clear of overlap.
    const bg = active
      .filter(p => !mineSet.has(p.id) && p.id !== personId)
      .map(p => {
        const h1 = hash(p.id), h2 = hash(p.id + 'r')
        const a = (h1 % 360) * (Math.PI / 180)
        const r = Math.pow((h2 % 1000) / 1000, 0.6) * 46
        let x = 36 + Math.cos(a) * r * 1.05
        let y = 34 + Math.sin(a) * r * 0.85
        if (x > 52 && y > 42) { x -= 26; y -= 20 } // keep the coach's corner readable
        x = Math.min(97, Math.max(3, x)); y = Math.min(84, Math.max(4, y))
        return { id: p.id, x, y, color: STAGE_COLORS[p.current_stage], size: 1.6 + (h2 % 22) / 10 }
      })

    const risers = topRisers(mine, items, null)
    const topRiser = risers[0] ?? null
    // The coach's cluster scatters evenly by area, and BOTH its spread and the
    // camera zoom scale with headcount: 3 people stay an intimate zoomed cluster,
    // 100+ spread into an even starfield instead of a dense worm/blob crammed
    // into a fixed radius. layout.cam drives the CSS transform below.
    const N = mine.length
    const t = Math.max(0, Math.min(1, (N - 8) / 52)) // 0 at ≤8 people → 1 at ≥60
    const cx = 68 - 18 * t, cy = 62 - 20 * t, spread = 13 + 30 * t
    const layout = { cx, cy, spread, z: 2.5 - 1.15 * t, txPct: 50 - cx, tyPct: 50 - cy }
    const named = mine.map((p, i) => {
      // Angle and radius come from INDEPENDENT hashes; radius uses a sqrt
      // distribution so stars scatter evenly by area (correlating both to one
      // hash — as this used to — folds the cluster into four spiral "worm" arms).
      const h1 = hash(p.id + 'm'), h2 = hash(p.id + 'mr')
      const a = (h1 % 360) * (Math.PI / 180)
      const r = spread * Math.sqrt((h2 % 1000) / 1000)
      const x = Math.min(95, Math.max(5, cx + Math.cos(a) * r))
      const y = Math.min(88, Math.max(6, cy + Math.sin(a) * r * 0.82))
      const isLeader = p.current_stage === 'Equip' || p.current_stage === 'Empower'
      const riser = risers.find(rr => rr.person.id === p.id) ?? null
      return {
        person: p, x, y,
        color: STAGE_COLORS[p.current_stage],
        labeled: i < MAX_NAMED,
        isLeader,
        isTopRiser: topRiser?.person.id === p.id,
        pct: riser?.pct ?? null,
      }
    })

    return { active, mine, churchDist, mineDist, churchWk, mineWk, churchWkTotal, mineWkTotal, bg, named, risers, topRiser, layout }
  }, [people, items, pipelineEvents, myPersonIds, personId])

  if (!ready) return null

  const { active, mine, churchDist, mineDist, churchWk, mineWk, churchWkTotal, mineWkTotal, bg, named, topRiser, layout } = world
  const leaders = named.filter(s => s.isLeader).length

  // Camera per scope: church = full frame; 'mine' = count-adaptive cluster cam
  // (spread + zoom from layout); 'leaders' shares the center, zooms in a touch.
  const leaderZ = Math.min(2.9, layout.z + 0.5)
  const Z: Record<LensScope, { t: string; zs: number }> = {
    church: { t: 'scale(1)', zs: 1 },
    mine: { t: `scale(${layout.z}) translate(${layout.txPct}%,${layout.tyPct}%)`, zs: layout.z },
    leaders: { t: `scale(${leaderZ}) translate(${layout.txPct}%,${layout.tyPct}%)`, zs: leaderZ },
  }
  // Per-stage count with its "+N this week" delta appended (delta hidden at 0).
  const distLine = (d: Record<Stage, number>, wk: Record<Stage, number>) =>
    STAGE_ORDER.filter(s => d[s] > 0).map(s => `${d[s]} ${s}${wk[s] > 0 ? ` +${wk[s]}` : ''}`).join(' · ')
  const wkTotal = (total: number) => total > 0
    ? <> · <span className="font-semibold text-[var(--success,#5fce9e)]">+{total} this wk</span></>
    : null
  const legend: Record<LensScope, React.ReactNode> = {
    church: <><b className="font-semibold text-[var(--fg-1)]">{active.length} people</b>{wkTotal(churchWkTotal)}{distLine(churchDist, churchWk) && <> · {distLine(churchDist, churchWk)}</>}</>,
    mine: mine.length
      ? <><b className="font-semibold text-[var(--fg-1)]">{mine.length} walking with you</b>{wkTotal(mineWkTotal)}{distLine(mineDist, mineWk) && <> · {distLine(mineDist, mineWk)}</>}</>
      : <>No one in your constellation yet — invite someone below.</>,
    leaders: <>
      <b className="font-semibold text-[var(--fg-1)]">{leaders + 1} leading</b> (incl. you)
      {topRiser && <> · <b className="font-semibold text-[var(--fg-1)]">{topRiser.person.name.split(' ')[0]}</b> {topRiser.pct >= 75 ? 'nearly ready' : 'on the way'}</>}
    </>,
  }

  const scopes: [LensScope, string][] = [
    ...(canSeeAllChurch ? [['church', 'GBC'] as [LensScope, string]] : []),
    ['mine', 'My constellation'],
    ['leaders', 'Emerging Leaders'],
  ]
  const zoomed = scope !== 'church'
  const focus = scope === 'leaders'
  // Drop a name label that would land in the bottom legend band (mirrors the
  // camera transform's screen-space y: p' = center + z·(p − center + t)).
  const MAP_H = 216
  const camZ = Z[scope].zs
  const camTy = scope === 'church' ? 0 : layout.tyPct / 100
  const inLegendBand = (yPct: number) =>
    MAP_H / 2 + camZ * ((yPct / 100) * MAP_H - MAP_H / 2 + camTy * MAP_H) + 10 * camZ > MAP_H - 34

  return (
    <section className="mb-5">
      <ZoneLabel label="Your constellation" right="Open full map →" onRight={onOpenExplore} />
      <div className="cn-card overflow-hidden p-0">
        <div
          className="relative h-[216px] overflow-hidden border-b border-[var(--line-1)]"
          style={{ background: 'radial-gradient(120% 100% at 50% 0%, #161d44 0%, #0a0e24 70%)' }}
        >
          <style>{`
            .cl-tagwrap { transform: translateX(-50%) scale(calc(1 / var(--zs, 1))); transform-origin: 50% 0; }
            .cl-label { background: rgba(6,9,24,.62); border-radius: 7px; padding: 2px 6px; }
            @keyframes cl-pulse {
              0%, 100% { box-shadow: 0 0 14px 2px rgba(240,114,159,.45); }
              50% { box-shadow: 0 0 24px 6px rgba(240,114,159,.9); }
            }
            @media (prefers-reduced-motion: reduce) { .cl-rising { animation: none !important; } }
          `}</style>
          <div
            className="absolute inset-0"
            style={{
              transform: Z[scope].t,
              ['--zs' as string]: Z[scope].zs,
              transformOrigin: '50% 50%',
              transition: 'transform .7s var(--ease-soft)',
            }}
          >
            {/* the flame at the center of the church */}
            <img
              src="/gbm-flame-white.png"
              alt=""
              className="absolute w-4 -translate-x-1/2 -translate-y-1/2"
              style={{ left: '36%', top: '34%', filter: 'drop-shadow(0 0 12px rgba(251,246,236,.6))' }}
            />
            {bg.map(s => (
              <span
                key={s.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-500"
                style={{
                  left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size,
                  background: `radial-gradient(circle, ${s.color}f2, ${s.color}00 72%)`,
                  boxShadow: `0 0 ${(s.size * 1.3).toFixed(0)}px ${s.color}73`,
                  opacity: focus ? 0.05 : 0.7,
                }}
              />
            ))}
            {/* the coach */}
            <div className="absolute" style={{ left: '66%', top: '61%' }}>
              <span
                className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background: 'radial-gradient(circle at 38% 32%, #5B8DF7, rgba(46,85,230,.3) 78%)',
                  boxShadow: focus ? '0 0 18px 4px rgba(46,85,230,.9), 0 0 0 2px rgba(91,141,247,.45)' : '0 0 12px 2px rgba(46,85,230,.7)',
                }}
              />
              <div className="cl-tagwrap cl-label pointer-events-none absolute top-2.5 text-center transition-opacity duration-500" style={{ opacity: zoomed ? 1 : 0 }}>
                <p className="whitespace-nowrap text-[9.5px] font-semibold text-[var(--fg-2)]">You</p>
              </div>
            </div>
            {named.map(s => {
              const dim = focus && !s.isLeader && !s.isTopRiser
              return (
                <button
                  key={s.person.id}
                  type="button"
                  onClick={() => onPersonClick(s.person)}
                  className="absolute"
                  style={{ left: `${s.x}%`, top: `${s.y}%`, opacity: dim ? 0.16 : 1, transition: 'opacity .5s var(--ease-soft)' }}
                >
                  <span
                    className={`absolute h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full ${focus && s.isTopRiser ? 'cl-rising' : ''}`}
                    style={{
                      background: `radial-gradient(circle at 38% 32%, ${s.color}, ${s.color}40 78%)`,
                      boxShadow: dim ? 'none' : `0 0 4px 1px ${s.color}8c`,
                      animation: focus && s.isTopRiser ? 'cl-pulse 2.6s ease-in-out infinite' : undefined,
                    }}
                  />
                  {s.labeled && !inLegendBand(s.y) && (
                    <span className="cl-tagwrap cl-label pointer-events-none absolute top-2.5 block text-center transition-opacity duration-500" style={{ opacity: zoomed ? 1 : 0 }}>
                      <span className="block whitespace-nowrap text-[9.5px] font-semibold text-[var(--fg-2)]">{s.person.name.split(' ')[0]}</span>
                      {focus && s.pct !== null && (
                        <span
                          className="block whitespace-nowrap text-[8.5px] font-bold tracking-[.06em]"
                          style={{ color: s.isTopRiser ? 'var(--empower)' : 'var(--fg-3)', marginTop: 1 }}
                        >
                          {s.isTopRiser ? (s.pct >= 75 ? 'NEARLY READY' : `${s.pct}% THERE`) : 'LATER'}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div
            className="absolute inset-x-0 bottom-0 px-3 pb-2 pt-4 text-center text-[10.5px] text-[var(--fg-3)]"
            style={{ background: 'linear-gradient(180deg, rgba(10,14,36,0), rgba(10,14,36,.7) 45%, rgba(10,14,36,.94) 80%)' }}
          >
            {legend[scope]}
          </div>
        </div>

        <div className="flex justify-center gap-1 px-3 pt-2.5">
          {scopes.map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => pickScope(val)}
              className="rounded-full border px-3 py-1 text-[10.5px] font-bold transition-all"
              style={scope === val
                ? { color: 'var(--fg-1)', background: 'var(--indigo-3)', borderColor: 'rgba(91,141,247,.45)', boxShadow: '0 0 14px -4px rgba(46,85,230,.7)' }
                : { color: 'var(--fg-3)', background: 'var(--indigo)', borderColor: 'var(--line-1)' }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 p-3.5">
          {scope === 'leaders' && topRiser ? (
            <button
              type="button"
              onClick={() => onPersonClick(topRiser.person)}
              className="flex-1 rounded-[var(--r-md)] border border-[rgba(91,141,247,.5)] px-3 py-2.5 text-center text-[12.5px] font-semibold text-white transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(180deg,#2E55E6,#1c3fd0)', boxShadow: '0 0 20px -6px rgba(46,85,230,.8)' }}
            >
              Invest in {topRiser.person.name.split(' ')[0]} →
            </button>
          ) : (
            <button
              type="button"
              onClick={onInvite}
              className="flex-1 rounded-[var(--r-md)] border border-[rgba(91,141,247,.5)] px-3 py-2.5 text-center text-[12.5px] font-semibold text-white transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(180deg,#2E55E6,#1c3fd0)', boxShadow: '0 0 20px -6px rgba(46,85,230,.8)' }}
            >
              ✦ Invite someone
            </button>
          )}
          <button
            type="button"
            onClick={onOpenExplore}
            className="flex-1 rounded-[var(--r-md)] border border-[var(--line-2)] bg-[var(--indigo-3)] px-3 py-2.5 text-center text-[12.5px] font-semibold text-[var(--fg-1)] transition-all hover:brightness-110"
          >
            Open constellation
          </button>
        </div>
      </div>
    </section>
  )
}
