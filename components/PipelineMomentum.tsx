'use client'

import { useEffect, useMemo, useState } from 'react'
import { getPeople, getAllStageChecklistItems, getPipelineEvents } from '../lib/supabaseQueries'
import type { Person, StageChecklistItem, PipelineEvent, Stage } from '../types/database'

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650', Establish: '#36D6C3', Equip: '#5B8DF7', Empower: '#F0729F',
}
const STAGES: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']
const PERIODS = [
  { key: '30', label: '30d', days: 30 },
  { key: '90', label: '90d', days: 90 },
  { key: '365', label: '1y', days: 365 },
]

function Stat({ value, label, sub, color }: { value: string | number; label: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
      <div className="text-2xl font-bold tabular-nums" style={{ color: color ?? 'var(--fg-1)' }}>{value}</div>
      <div className="text-[11px] font-medium text-[var(--fg-2)]">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] text-[var(--fg-3)]">{sub}</div>}
    </div>
  )
}

export default function PipelineMomentum({ refreshKey = 0 }: { refreshKey?: number }) {
  const [people, setPeople] = useState<Person[]>([])
  const [items, setItems] = useState<StageChecklistItem[]>([])
  const [events, setEvents] = useState<PipelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [periodKey, setPeriodKey] = useState('90')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [p, i, e] = await Promise.all([getPeople(), getAllStageChecklistItems(), getPipelineEvents()])
      if (!alive) return
      if (p.data) setPeople(p.data as Person[])
      if (i.data) setItems(i.data as StageChecklistItem[])
      if (e.data) setEvents(e.data as PipelineEvent[])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [refreshKey])

  const period = PERIODS.find(p => p.key === periodKey)!

  const data = useMemo(() => {
    const cutoff = Date.now() - period.days * 24 * 3600 * 1000
    const inWindow = (iso?: string | null) => !!iso && new Date(iso).getTime() >= cutoff

    const newPeople = people.filter(p => inWindow(p.created_at)).length
    const completions = items.filter(it => it.completed && it.label.startsWith('Completed ') && inWindow(it.completed_at)).length
    const empoweredInPeriod = events.filter(ev => ev.to_stage === 'Empower' && inWindow(ev.created_at)).length
    const weeks = Math.max(1, period.days / 7)
    const perWeek = (completions / weeks)

    // Avg days from added → Empowered (precise once events accumulate).
    const peopleById = new Map(people.map(p => [p.id, p]))
    const durations: number[] = []
    for (const ev of events.filter(e => e.to_stage === 'Empower')) {
      const per = peopleById.get(ev.person_id)
      if (per?.created_at) {
        const d = (new Date(ev.created_at).getTime() - new Date(per.created_at).getTime()) / (1000 * 3600 * 24)
        if (d > 0) durations.push(d)
      }
    }
    const avgWeeks = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 7) : null

    const dist: Record<Stage, number> = { Engage: 0, Establish: 0, Equip: 0, Empower: 0 }
    let total = 0
    for (const p of people) {
      if (p.status === 'Inactive') continue
      dist[p.current_stage] = (dist[p.current_stage] ?? 0) + 1
      total++
    }

    return { newPeople, completions, empoweredInPeriod, perWeek, avgWeeks, dist, total }
  }, [people, items, events, period])

  if (loading) {
    return (
      <section className="cn-card mb-6 p-4">
        <h2 className="cn-h3">Pipeline Momentum</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--indigo-3)]" />)}
        </div>
      </section>
    )
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="cn-h3">Pipeline Momentum</h2>
          <p className="text-xs text-[var(--fg-3)]">How fast people are moving through the pipeline</p>
        </div>
        <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriodKey(p.key)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${periodKey === p.key ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Stat value={data.newPeople} label="New people" sub={`added in ${period.label}`} color="var(--equip)" />
        <Stat value={data.completions} label="Milestones completed" sub={`~${data.perWeek.toFixed(1)}/week`} color="var(--establish)" />
        <Stat value={data.empoweredInPeriod} label="Reached Empower" sub="from stage log" color="var(--empower)" />
        <Stat value={data.avgWeeks != null ? `${data.avgWeeks}w` : '—'} label="Avg time to Empower" sub={data.avgWeeks == null ? 'builds as people advance' : 'added → Empowered'} />
      </div>

      {/* Current distribution across the pipeline */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
          <span>In the pipeline now</span>
          <span>{data.total} active</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-[var(--indigo)]">
          {STAGES.map(s => {
            const pct = data.total ? (data.dist[s] / data.total) * 100 : 0
            return pct > 0 ? <div key={s} style={{ width: `${pct}%`, background: STAGE_COLORS[s] }} title={`${s}: ${data.dist[s]}`} /> : null
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {STAGES.map(s => (
            <span key={s} className="flex items-center gap-1 text-[11px] text-[var(--fg-2)]">
              <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLORS[s] }} />
              {s} <span className="font-semibold tabular-nums">{data.dist[s]}</span>
            </span>
          ))}
        </div>
      </div>

      {events.length === 0 && (
        <p className="mt-3 text-[10px] text-[var(--fg-3)]">
          Stage-transition tracking starts now — “Reached Empower” and “Avg time to Empower” fill in as people advance.
        </p>
      )}
    </section>
  )
}
