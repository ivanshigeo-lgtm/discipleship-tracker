'use client'

// Zone 1: the pipeline at a glance — the whole constellation by 4E stage with
// weekly velocity, leading the coach briefing (mirrors native redesign v2,
// coach-dashboard.tsx). Total in scope + "+N this week" + a 4-node stage ring
// (E_ORDER, counts, per-stage weekly deltas) + a leader-health footer. Tapping
// any stage — or "Open full view →" — drops into the explore workspace, which
// also hosts the church-wide duplicate scanner, so explore stays reachable even
// though the lens no longer links to it.

import { useEffect, useMemo, useState } from 'react'
import { getPeople, getPipelineEvents } from '../../lib/supabaseQueries'
import { STAGE_COLORS, ZoneLabel } from './coachModel'
import type { PipelineEvent, Person, Stage } from '../../types/database'

type Scope = 'church' | 'mine'
const STAGE_ORDER: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']

export default function CompactPipelineCard({
  myPersonIds,
  canSeeAllChurch,
  refreshKey,
  onOpenExplore,
}: {
  myPersonIds?: string[]
  canSeeAllChurch: boolean
  refreshKey: number
  onOpenExplore: () => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([])
  const [scope, setScope] = useState<Scope>('mine')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [p, pe] = await Promise.all([getPeople(), getPipelineEvents()])
      if (!alive) return
      if (p.data) setPeople(p.data as Person[])
      if (pe.data) setPipelineEvents(pe.data as PipelineEvent[])
      setReady(true)
    })()
    return () => { alive = false }
  }, [refreshKey])

  // Coaches without church access only ever see their own constellation.
  const effScope: Scope = canSeeAllChurch ? scope : 'mine'

  const data = useMemo(() => {
    const active = people.filter(p => p.status !== 'Inactive')
    const mineSet = myPersonIds ? new Set(myPersonIds) : new Set<string>()
    const scoped = effScope === 'church' ? active : active.filter(p => mineSet.has(p.id))
    const inScope = new Set(scoped.map(p => p.id))

    const counts: Record<Stage, number> = { Engage: 0, Establish: 0, Equip: 0, Empower: 0 }
    scoped.forEach(p => { counts[p.current_stage]++ })

    // "+N this week" — people who ENTERED each stage since Sunday 00:00 local
    // (pipeline_events, scope-aware) + net-new people added (people.created_at).
    // Sunday-anchored week-to-date, matching momentum-card + lens deltas.
    const sunday = new Date(); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay())
    const WK = sunday.getTime()
    const at = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN)
    const wk: Record<Stage, number> = { Engage: 0, Establish: 0, Equip: 0, Empower: 0 }
    for (const ev of pipelineEvents) {
      if (!ev.to_stage || !(ev.to_stage in wk) || at(ev.created_at) < WK) continue
      if (!inScope.has(ev.person_id)) continue
      wk[ev.to_stage]++
    }
    const wkTotal = scoped.filter(p => at(p.created_at) >= WK).length

    const leaders = counts.Equip + counts.Empower
    const carried = counts.Engage + counts.Establish
    const ratio = leaders > 0 ? carried / leaders : carried
    return { total: scoped.length, counts, wk, wkTotal, leaders, carried, ratio }
  }, [people, pipelineEvents, myPersonIds, effScope])

  if (!ready) return null
  const { total, counts, wk, wkTotal, leaders, carried, ratio } = data

  return (
    <section className="mb-6">
      <ZoneLabel label="Pipeline" right="Open full view →" onRight={onOpenExplore} />
      <div className="cn-card p-4">
        {/* Scope chips — admins only; other coaches are locked to their constellation */}
        {canSeeAllChurch && (
          <div className="mb-3 flex gap-1">
            {(['mine', 'church'] as Scope[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className="rounded-full border px-3 py-1 text-[10.5px] font-bold transition-all"
                style={scope === s
                  ? { color: 'var(--fg-1)', background: 'var(--indigo-3)', borderColor: 'rgba(91,141,247,.45)', boxShadow: '0 0 14px -4px rgba(46,85,230,.7)' }
                  : { color: 'var(--fg-3)', background: 'var(--indigo)', borderColor: 'var(--line-1)' }}
              >
                {s === 'church' ? 'GBC' : 'My constellation'}
              </button>
            ))}
          </div>
        )}

        {/* Total headline — everyone in scope + net-new this week */}
        <div className="flex items-baseline gap-2">
          <span className="text-[40px] font-bold leading-none text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>{total}</span>
          <span className="text-sm text-[var(--fg-2)]">{total === 1 ? 'person' : 'people'}</span>
          {wkTotal > 0 && (
            <span className="ml-auto text-[12.5px] font-semibold text-[var(--success,#5fce9e)]">+{wkTotal} this week</span>
          )}
        </div>

        {/* Stage ring — one node per 4E stage; tap to open the full workspace */}
        <div className="relative mb-1 mt-4">
          <div
            className="pointer-events-none absolute left-[12%] right-[12%] top-[28px] h-[2px] rounded-full opacity-60"
            style={{ background: `linear-gradient(90deg, ${STAGE_COLORS.Engage}, ${STAGE_COLORS.Establish}, ${STAGE_COLORS.Equip}, ${STAGE_COLORS.Empower})` }}
          />
          <div className="flex justify-between">
            {STAGE_ORDER.map(stage => (
              <button
                key={stage}
                type="button"
                onClick={onOpenExplore}
                className="flex flex-col items-center gap-1.5 transition-opacity hover:opacity-70"
              >
                <span
                  className="flex h-[58px] w-[58px] items-center justify-center rounded-full border-[1.5px] bg-[var(--indigo)] text-[22px] font-bold text-[var(--fg-1)]"
                  style={{ borderColor: STAGE_COLORS[stage] }}
                >
                  {counts[stage]}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: STAGE_COLORS[stage] }}>{stage}</span>
                <span className={wk[stage] > 0 ? 'text-[10px] font-semibold text-[var(--success,#5fce9e)]' : 'text-[10px] text-transparent'}>
                  {wk[stage] > 0 ? `+${wk[stage]} this wk` : '—'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Leader-health footer */}
        <div className="mt-3 border-t border-[var(--line-2)] pt-3">
          <p className="text-[13px] text-[var(--fg-2)]">
            For every leader, <span className="font-semibold text-[var(--gbm-gold,#F2C879)]">{ratio.toFixed(1)} people</span> are being carried.
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--fg-3)]">
            Leader health 1 : {ratio.toFixed(1)} · {leaders} {leaders === 1 ? 'leader' : 'leaders'} · {carried} in Engage + Establish
          </p>
        </div>
      </div>
    </section>
  )
}
