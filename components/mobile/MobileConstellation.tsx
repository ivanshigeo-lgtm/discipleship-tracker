'use client'

// Mobile redesign of the coach "Our Journey" constellation view (Pass 1).
// Implements the Claude Design mock "Mobile Journey.dc.html" screens:
//   2a  constellation landing  — stage nodes + counts, leader-health line,
//       collapsed momentum row, needs-attention list, verse, tab bar + FAB
//   1c  stage drill-in list    — search, filter chips, swipe-left actions
//   1d  person action sheet     — quick actions (log follow-up, priority, advance)
// Rendered as a full-screen overlay by app/my-constellations/page.tsx only at a
// phone breakpoint; desktop keeps the existing pipeline layout untouched.

import { useEffect, useMemo, useState } from 'react'
import {
  getPeople,
  getAllEngagements,
  getPrayerWallForViewer,
  getAllStageChecklistItems,
  getVictoryGroups,
  getAllGroupMemberships,
  updatePersonStage,
  getMyPriorityPersonIds,
  setPersonPriority,
} from '../../lib/supabaseQueries'
import { stageLabels, stageOrder } from '../../lib/stageLabels'
import { bookletStage } from '../../lib/curriculum'
import { daysOf } from '../../lib/meetingDays'
import type { Person, Stage, Engagement, PrayerRequest, StageChecklistItem, VictoryGroup } from '../../types/database'
import PipelineMomentum from '../PipelineMomentum'

// ── Palette (kept explicit to stay pixel-faithful to the mock) ────────────────
const E_COLOR: Record<Stage, string> = {
  Engage: '#F4B650', Establish: '#36D6C3', Equip: '#5B8DF7', Empower: '#F0729F',
}
const PINK = '#F2728A'
const GOLD = '#F2C879'
const SPACE_BG = 'radial-gradient(135% 120% at 50% -10%, #1B2155 0%, #0C1230 42%, #060814 100%)'
const SERIF = "var(--font-display)"

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysSince(dateString: string | null): number | null {
  if (!dateString) return null
  const diff = Date.now() - new Date(dateString).getTime()
  return Math.floor(diff / 86_400_000)
}

function nextFollowUp(engs: Engagement[]): { label: string; overdue: boolean } | null {
  const pending = engs
    .filter(e => e.status === 'Pending' && e.follow_up_date)
    .sort((a, b) => new Date(a.follow_up_date! + 'T00:00:00').getTime() - new Date(b.follow_up_date! + 'T00:00:00').getTime())
  if (!pending.length) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = Math.round((new Date(pending[0].follow_up_date! + 'T00:00:00').getTime() - today.getTime()) / 86_400_000)
  if (d < 0) return { label: `${Math.abs(d)}d overdue`, overdue: true }
  if (d === 0) return { label: 'Today', overdue: false }
  if (d === 1) return { label: 'Tomorrow', overdue: false }
  return { label: `In ${d}d`, overdue: false }
}

function lastTouch(engs: Engagement[]): string | null {
  const done = engs
    .filter(e => e.status === 'Completed' && e.follow_up_date)
    .sort((a, b) => new Date(b.follow_up_date! + 'T00:00:00').getTime() - new Date(a.follow_up_date! + 'T00:00:00').getTime())
  if (!done.length) return null
  const d = daysSince(done[0].follow_up_date)
  if (d === null) return null
  return d === 0 ? 'today' : `${d}d ago`
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// A person enriched with the derived fields the mobile screens need.
type Enriched = {
  person: Person
  daysInStage: number | null
  follow: { label: string; overdue: boolean } | null
  prayerCount: number
  last: string | null
}

// ── Icons (Lucide paths, inline to avoid an extra dep in the overlay) ──────────
const Chevron = ({ dir = 'right', size = 16, color = '#7A82A8' }: { dir?: 'right' | 'down' | 'left' | 'up'; size?: number; color?: string }) => {
  const d = dir === 'right' ? 'm9 18 6-6-6-6' : dir === 'left' ? 'm15 18-6-6 6-6' : dir === 'up' ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
}

// ══════════════════════════════════════════════════════════════════════════════
export default function MobileConstellation({
  allowedPersonIds,
  effectiveScope,
  isAdmin,
  viewerPersonId,
  onScopeChange,
  refreshKey,
  onChanged,
  onAddPerson,
  onOpenFullProfile,
  onTab,
}: {
  allowedPersonIds?: string[]
  effectiveScope: 'gbc' | 'mine' | 'direct'
  isAdmin: boolean
  viewerPersonId: string
  onScopeChange: (s: 'gbc' | 'mine' | 'direct') => void
  refreshKey: number
  onChanged: () => void
  onAddPerson: () => void
  onOpenFullProfile: (person: Person, tab?: 'engagements') => void
  onTab: (tab: 'people' | 'groups' | 'me') => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [prayers, setPrayers] = useState<PrayerRequest[]>([])
  const [checklist, setChecklist] = useState<StageChecklistItem[]>([])
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [memberships, setMemberships] = useState<{ person_id: string; victory_group_id: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Top-level tab (bottom bar). 'me' is a pure route-out action, not a rendered tab.
  const [tab, setTab] = useState<'journey' | 'people' | 'groups'>('journey')

  // Navigation within the overlay
  const [activeStage, setActiveStage] = useState<Stage | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const [peopleFilter, setPeopleFilter] = useState<'all' | 'priority' | 'overdue'>('all')
  const [peopleSearch, setPeopleSearch] = useState('')
  const [sheetPerson, setSheetPerson] = useState<Person | null>(null)
  const [momentumOpen, setMomentumOpen] = useState(false)
  const [scopeMenu, setScopeMenu] = useState(false)
  const [seeAll, setSeeAll] = useState(false)
  const [stageFilter, setStageFilter] = useState<'all' | 'priority' | 'overdue' | 'longest'>('all')
  const [stageSearch, setStageSearch] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    ;(async () => {
      const [p, e, pr, cl, g, gm, prio] = await Promise.all([
        getPeople(), getAllEngagements(), getPrayerWallForViewer(viewerPersonId, isAdmin), getAllStageChecklistItems(),
        getVictoryGroups(), getAllGroupMemberships(), getMyPriorityPersonIds(viewerPersonId),
      ])
      if (!alive) return
      // Priority is per-coach — overlay this viewer's private stars.
      if (p.data) setPeople((p.data as Person[]).map(x => ({ ...x, priority: prio.ids.has(x.id) })))
      if (e.data) setEngagements(e.data as Engagement[])
      if (pr.data) setPrayers(pr.data as PrayerRequest[])
      if (cl.data) setChecklist(cl.data as StageChecklistItem[])
      if (g.data) setGroups(g.data as VictoryGroup[])
      if (gm.data) setMemberships(gm.data as { person_id: string; victory_group_id: string }[])
      setLoading(false)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, viewerPersonId, isAdmin])

  const engByPerson = useMemo(() => {
    const m = new Map<string, Engagement[]>()
    engagements.forEach(e => { const l = m.get(e.person_id) || []; l.push(e); m.set(e.person_id, l) })
    return m
  }, [engagements])

  const prayerCountByPerson = useMemo(() => {
    const m = new Map<string, number>()
    prayers.filter(p => p.status === 'Active').forEach(p => m.set(p.person_id, (m.get(p.person_id) || 0) + 1))
    return m
  }, [prayers])

  // Scoped, active people enriched with derived fields.
  const scoped = useMemo<Enriched[]>(() => {
    const allow = allowedPersonIds ? new Set(allowedPersonIds) : null
    return people
      .filter(p => p.status !== 'Inactive' && (!allow || allow.has(p.id)))
      .map(p => {
        const engs = engByPerson.get(p.id) || []
        return {
          person: p,
          daysInStage: daysSince(p.updated_at),
          follow: nextFollowUp(engs),
          prayerCount: prayerCountByPerson.get(p.id) || 0,
          last: lastTouch(engs),
        }
      })
  }, [people, allowedPersonIds, engByPerson, prayerCountByPerson])

  const byStage = useMemo(() => {
    const m: Record<Stage, Enriched[]> = { Engage: [], Establish: [], Equip: [], Empower: [] }
    scoped.forEach(e => m[e.person.current_stage].push(e))
    stageOrder.forEach(s => m[s].sort((a, b) => a.person.name.localeCompare(b.person.name)))
    return m
  }, [scoped])

  const counts = useMemo(() => ({
    Engage: byStage.Engage.length, Establish: byStage.Establish.length,
    Equip: byStage.Equip.length, Empower: byStage.Empower.length,
  }), [byStage])

  // Attention = a person with an overdue follow-up.
  const attnByStage = useMemo(() => {
    const m: Record<Stage, number> = { Engage: 0, Establish: 0, Equip: 0, Empower: 0 }
    scoped.forEach(e => { if (e.follow?.overdue) m[e.person.current_stage]++ })
    return m
  }, [scoped])

  // Leader health: leaders (Equip+Empower) vs people being carried (Engage+Establish).
  const health = useMemo(() => {
    const leaders = counts.Equip + counts.Empower
    const carried = counts.Engage + counts.Establish
    const ratio = leaders > 0 ? carried / leaders : 0
    return { leaders, carried, ratio }
  }, [counts])

  // Collapsed momentum row numbers (90d): new people + milestones completed.
  const momentum90 = useMemo(() => {
    const cutoff = Date.now() - 90 * 86_400_000
    const inWin = (iso?: string | null) => !!iso && new Date(iso).getTime() >= cutoff
    const allow = allowedPersonIds ? new Set(allowedPersonIds) : null
    const inScope = (id: string) => !allow || allow.has(id)
    const newPeople = people.filter(p => inScope(p.id) && inWin(p.created_at)).length
    const milestones = checklist.filter(it => it.completed && it.label.startsWith('Completed ') && inScope(it.person_id) && inWin(it.completed_at)).length
    return { newPeople, milestones }
  }, [people, checklist, allowedPersonIds])

  // Needs-attention feed: overdue first (by days over), then priority.
  const needsAttention = useMemo(() => {
    const overdue = scoped.filter(e => e.follow?.overdue)
      .sort((a, b) => parseInt(b.follow!.label) - parseInt(a.follow!.label))
    const priority = scoped.filter(e => e.person.priority && !e.follow?.overdue)
      .sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0))
    return [...overdue, ...priority]
  }, [scoped])

  const peopleById = useMemo(() => {
    const m = new Map<string, Person>()
    people.forEach(p => m.set(p.id, p))
    return m
  }, [people])

  // Group members within scope, and per-group counts.
  const membersByGroup = useMemo(() => {
    const allow = allowedPersonIds ? new Set(allowedPersonIds) : null
    const m = new Map<string, Person[]>()
    memberships.forEach(ms => {
      if (allow && !allow.has(ms.person_id)) return
      const p = peopleById.get(ms.person_id)
      if (!p || p.status === 'Inactive') return
      const l = m.get(ms.victory_group_id) || []
      l.push(p); m.set(ms.victory_group_id, l)
    })
    m.forEach(l => l.sort((a, b) => a.name.localeCompare(b.name)))
    return m
  }, [memberships, peopleById, allowedPersonIds])

  // ── Mutations ───────────────────────────────────────────────────────────────
  const togglePriority = async (p: Person) => {
    const next = !p.priority
    setPeople(prev => prev.map(x => x.id === p.id ? { ...x, priority: next } : x))
    setSheetPerson(prev => prev && prev.id === p.id ? { ...prev, priority: next } : prev)
    const { error } = await setPersonPriority(viewerPersonId, p.id, next)
    if (error) setPeople(prev => prev.map(x => x.id === p.id ? { ...x, priority: !next } : x))
    else onChanged()
  }
  const advance = async (p: Person) => {
    const i = stageOrder.indexOf(p.current_stage)
    if (i >= stageOrder.length - 1) return
    const next = stageOrder[i + 1]
    setSheetPerson(null)
    await updatePersonStage(p.id, next)
    onChanged()
  }

  const scopeLabel = (s: 'gbc' | 'mine' | 'direct') => s === 'gbc' ? 'GBC' : s === 'mine' ? 'My Constellation' : 'My People'
  const scopeChoices: ('gbc' | 'mine' | 'direct')[] = isAdmin ? ['gbc', 'mine', 'direct'] : ['mine', 'direct']

  // ── Shared small pieces ───────────────────────────────────────────────────────
  const Fab = ({ bottom }: { bottom: number }) => (
    <button
      type="button"
      aria-label="Add person"
      onClick={onAddPerson}
      style={{
        position: 'absolute', right: 18, bottom, width: 56, height: 56, borderRadius: 999, border: 'none',
        background: 'linear-gradient(160deg,#2E55E6,#1539C9)', color: '#FBF6EC', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 0 1px rgba(91,141,247,.25), 0 0 32px -4px rgba(46,85,230,.75), 0 12px 24px -8px rgba(0,0,0,.6)',
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
    </button>
  )

  const TabBar = () => {
    const item = (active: boolean, label: string, path: React.ReactNode, onClick: () => void) => (
      <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: active ? '#8FB0FA' : '#7A82A8', minWidth: 64, paddingTop: 4 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
        <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
      </button>
    )
    return (
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'stretch', padding: '10px 8px 26px', background: 'rgba(11,16,39,.72)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(246,241,231,.10)' }}>
        {item(tab === 'journey', 'Journey', <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />, () => { setTab('journey'); setActiveStage(null) })}
        {item(tab === 'people', 'People', <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>, () => { setTab('people'); setActiveStage(null) })}
        {item(tab === 'groups', 'Groups', <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />, () => { setTab('groups'); setActiveStage(null) })}
        {item(false, 'Me', <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>, () => onTab('me'))}
      </div>
    )
  }

  // Person row used in the needs-attention feed and stage list.
  const PersonMeta = ({ e }: { e: Enriched }) => {
    const c = E_COLOR[e.person.current_stage]
    return (
      <>
        <div style={{ width: 40, height: 40, borderRadius: 999, border: `1.5px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: c, flex: '0 0 auto' }}>{initials(e.person.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.person.name}</div>
          <div style={{ fontSize: 11.5, color: '#7A82A8' }}>
            {e.person.current_stage}{e.daysInStage !== null ? ` · ${e.daysInStage}d in stage` : ''}
            {e.prayerCount > 0 ? ` · ✦ ${e.prayerCount}` : ''}
          </div>
        </div>
      </>
    )
  }

  // ── LANDING (2a) ──────────────────────────────────────────────────────────────
  const Landing = (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#F6F1E7' }}>
      {/* header */}
      <div style={{ padding: '62px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600 }}>Our Journey</div>
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setScopeMenu(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(27,35,71,.8)', border: '1px solid rgba(246,241,231,.12)', borderRadius: 999, padding: '6px 12px', color: '#B4BAD6', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', minHeight: 32 }}>
            {scopeLabel(effectiveScope)}<Chevron dir="down" size={12} color="#B4BAD6" />
          </button>
          {scopeMenu && (
            <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, background: '#141B3D', border: '1px solid rgba(246,241,231,.14)', borderRadius: 12, overflow: 'hidden', minWidth: 160, boxShadow: '0 12px 30px -8px rgba(0,0,0,.7)' }}>
              {scopeChoices.map(s => (
                <button key={s} type="button" onClick={() => { onScopeChange(s); setScopeMenu(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: effectiveScope === s ? 'rgba(46,85,230,.25)' : 'transparent', border: 'none', color: '#F6F1E7', fontSize: 13, fontWeight: 600 }}>{scopeLabel(s)}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '6px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* stage nodes */}
        <div style={{ position: 'relative', padding: '18px 4px 6px' }}>
          <div style={{ position: 'absolute', left: 44, right: 44, top: 52, height: 1, background: 'linear-gradient(90deg, rgba(244,182,80,.5), rgba(54,214,195,.5), rgba(91,141,247,.5), rgba(240,114,159,.5))' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {stageOrder.map(s => {
              const c = E_COLOR[s]
              return (
                <button key={s} type="button" onClick={() => { setActiveStage(s); setStageFilter('all'); setStageSearch('') }} style={{ background: 'none', border: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 80, position: 'relative', cursor: 'pointer' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 999, border: `1.5px solid ${c}`, background: 'rgba(20,27,61,.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 28px -4px ${c}99` }}>
                    <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: '#F6F1E7' }}>{counts[s]}</span>
                    <span style={{ fontSize: 9, color: c }}>✦</span>
                  </div>
                  {attnByStage[s] > 0 && (
                    <span style={{ position: 'absolute', top: -2, right: 6, minWidth: 18, height: 18, borderRadius: 999, background: PINK, color: '#0B1027', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', boxShadow: '0 0 12px rgba(242,114,138,.6)' }}>{attnByStage[s]}</span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: c }}>
                    {s}<Chevron dir="right" size={11} color={c} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* leader health */}
        <div style={{ textAlign: 'center', padding: '2px 8px 4px' }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 21, color: '#F6F1E7', lineHeight: 1.3 }}>
            For every leader, <span style={{ color: '#F2C879' }}>{health.leaders > 0 ? health.ratio.toFixed(1).replace(/\.0$/, '') : '—'} people</span> are being carried.
          </div>
          <div style={{ fontSize: 11, color: '#7A82A8', marginTop: 4 }}>
            Leader health 1 : {health.leaders > 0 ? health.ratio.toFixed(1) : '—'} · {health.leaders} leaders · {health.carried} in Engage + Establish
          </div>
        </div>

        {/* momentum row */}
        <button type="button" onClick={() => setMomentumOpen(true)} style={{ background: '#1B2347', border: '1px solid rgba(246,241,231,.10)', borderRadius: 20, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 8px 24px -8px rgba(0,0,0,.6), inset 0 1px 0 rgba(246,241,231,.06)', width: '100%' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7A82A8' }}>Momentum · 90d</div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, color: '#B4BAD6' }}><b style={{ color: '#5B8DF7' }}>{momentum90.newPeople}</b> new</span>
            <span style={{ fontSize: 13, color: '#B4BAD6' }}><b style={{ color: '#36D6C3' }}>{momentum90.milestones}</b> milestones</span>
            <Chevron dir="down" size={16} color="#7A82A8" />
          </div>
        </button>

        {/* needs attention */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 4px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7A82A8' }}>Needs attention</div>
          {needsAttention.length > 3 && (
            <button type="button" onClick={() => setSeeAll(v => !v)} style={{ background: 'none', border: 'none', fontSize: 11.5, color: '#5B8DF7', fontWeight: 600 }}>{seeAll ? 'Show less' : `See all ${needsAttention.length}`}</button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {needsAttention.length === 0 && (
            <div style={{ background: '#141B3D', border: '1px solid rgba(246,241,231,.10)', borderRadius: 16, padding: '16px 14px', textAlign: 'center', fontSize: 13, color: '#7A82A8' }}>Everyone's followed up. Your sky is calm.</div>
          )}
          {(seeAll ? needsAttention : needsAttention.slice(0, 3)).map(e => (
            <button key={e.person.id} type="button" onClick={() => setSheetPerson(e.person)} style={{ background: '#141B3D', border: '1px solid rgba(246,241,231,.10)', borderRadius: 16, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, width: '100%', textAlign: 'left', color: '#F6F1E7' }}>
              <PersonMeta e={e} />
              {e.follow?.overdue
                ? <span style={{ fontSize: 10.5, fontWeight: 700, color: PINK, background: 'rgba(242,114,138,.14)', borderRadius: 999, padding: '4px 9px', flex: '0 0 auto' }}>{e.follow.label}</span>
                : <span style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, background: 'rgba(242,200,121,.14)', borderRadius: 999, padding: '4px 9px', flex: '0 0 auto' }}>★ Priority</span>}
              <Chevron dir="right" />
            </button>
          ))}
        </div>

        {/* verse */}
        <div style={{ textAlign: 'center', padding: '6px 20px 16px' }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: '#7A82A8', lineHeight: 1.4 }}>&ldquo;You are the light of the world.&rdquo; — Matthew 5:14</div>
        </div>
      </div>

      <Fab bottom={104} />
      <TabBar />
    </div>
  )

  // ── STAGE LIST (1c) ────────────────────────────────────────────────────────────
  const stageList = activeStage ? (() => {
    const list = byStage[activeStage]
    const c = E_COLOR[activeStage]
    const q = stageSearch.trim().toLowerCase()
    const nPriority = list.filter(e => e.person.priority).length
    const nOverdue = list.filter(e => e.follow?.overdue).length
    let shown = q ? list.filter(e => e.person.name.toLowerCase().includes(q)) : list.slice()
    if (stageFilter === 'priority') shown = shown.filter(e => e.person.priority)
    else if (stageFilter === 'overdue') shown = shown.filter(e => e.follow?.overdue)
    else if (stageFilter === 'longest') shown = shown.slice().sort((a, b) => (b.daysInStage ?? 0) - (a.daysInStage ?? 0))

    const chip = (key: typeof stageFilter, label: string, active: boolean, color: string, activeBg: string, border?: string) => (
      <button key={key} type="button" onClick={() => setStageFilter(key)} style={{ flex: 'none', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '8px 14px', border: border ?? 'none', background: active ? activeBg : 'rgba(27,35,71,.8)', color: active ? (key === 'all' ? '#0B1027' : color) : '#B4BAD6' }}>{label}</button>
    )

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#F6F1E7' }}>
        <div style={{ padding: '58px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <button type="button" onClick={() => setActiveStage(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#5B8DF7', fontSize: 14, fontWeight: 600, background: 'none', border: 'none' }}>
              <Chevron dir="left" size={18} color="#5B8DF7" />Journey
            </button>
            <div style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginRight: 64 }}>
              <span style={{ color: c, fontSize: 14 }}>✦</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: c }}>{activeStage}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#B4BAD6', background: `${c}1F`, border: `1px solid ${c}4D`, borderRadius: 999, padding: '2px 9px' }}>{list.length}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1B2347', border: '1px solid rgba(246,241,231,.12)', borderRadius: 14, padding: '11px 14px', marginTop: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A82A8" strokeWidth="1.75" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={stageSearch} onChange={e => setStageSearch(e.target.value)} placeholder="Find person…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#F6F1E7', fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {chip('all', `All ${list.length}`, stageFilter === 'all', '#0B1027', '#F6F1E7')}
            {chip('priority', `★ Priority ${nPriority}`, stageFilter === 'priority', GOLD, 'rgba(242,200,121,.12)', '1px solid rgba(242,200,121,.3)')}
            {chip('overdue', `Overdue ${nOverdue}`, stageFilter === 'overdue', PINK, 'rgba(242,114,138,.12)', '1px solid rgba(242,114,138,.3)')}
            {chip('longest', 'Longest', stageFilter === 'longest', '#B4BAD6', 'rgba(35,44,87,.9)', '1px solid rgba(246,241,231,.12)')}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 16px 90px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.length === 0 && <div style={{ textAlign: 'center', fontSize: 12, color: '#7A82A8', padding: '20px 0' }}>No one here yet.</div>}
          {shown.map(e => (
            <SwipeRow
              key={e.person.id}
              e={e}
              onOpen={() => setSheetPerson(e.person)}
              onPriority={() => togglePriority(e.person)}
              onAdvance={() => advance(e.person)}
            />
          ))}
          {shown.length > 0 && <div style={{ textAlign: 'center', fontSize: 11, color: '#7A82A8', padding: '2px 0' }}>Swipe left on a person for quick actions</div>}
        </div>
        <Fab bottom={44} />
      </div>
    )
  })() : null

  // Scope pill + dropdown, shared by the top-level tab headers.
  const ScopePill = () => (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={() => setScopeMenu(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(27,35,71,.8)', border: '1px solid rgba(246,241,231,.12)', borderRadius: 999, padding: '6px 12px', color: '#B4BAD6', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', minHeight: 32 }}>
        {scopeLabel(effectiveScope)}<Chevron dir="down" size={12} color="#B4BAD6" />
      </button>
      {scopeMenu && (
        <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, background: '#141B3D', border: '1px solid rgba(246,241,231,.14)', borderRadius: 12, overflow: 'hidden', minWidth: 160, boxShadow: '0 12px 30px -8px rgba(0,0,0,.7)' }}>
          {scopeChoices.map(s => (
            <button key={s} type="button" onClick={() => { onScopeChange(s); setScopeMenu(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: effectiveScope === s ? 'rgba(46,85,230,.25)' : 'transparent', border: 'none', color: '#F6F1E7', fontSize: 13, fontWeight: 600 }}>{scopeLabel(s)}</button>
          ))}
        </div>
      )}
    </div>
  )

  // ── PEOPLE (cross-stage directory; modeled on the 1c stage list) ───────────────
  const peopleScreen = (() => {
    const q = peopleSearch.trim().toLowerCase()
    let shown = q ? scoped.filter(e => e.person.name.toLowerCase().includes(q)) : scoped.slice()
    if (peopleFilter === 'priority') shown = shown.filter(e => e.person.priority)
    else if (peopleFilter === 'overdue') shown = shown.filter(e => e.follow?.overdue)
    shown.sort((a, b) => a.person.name.localeCompare(b.person.name))
    const nPriority = scoped.filter(e => e.person.priority).length
    const nOverdue = scoped.filter(e => e.follow?.overdue).length

    const chip = (key: typeof peopleFilter, label: string, active: boolean, color: string, activeBg: string, border?: string) => (
      <button key={key} type="button" onClick={() => setPeopleFilter(key)} style={{ flex: 'none', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '8px 14px', border: border ?? 'none', background: active ? activeBg : 'rgba(27,35,71,.8)', color: active ? (key === 'all' ? '#0B1027' : color) : '#B4BAD6' }}>{label}</button>
    )

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#F6F1E7' }}>
        <div style={{ padding: '58px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600 }}>People</div>
            <ScopePill />
          </div>
          <div style={{ fontSize: 11.5, color: '#7A82A8', marginTop: 2 }}>{scoped.length} people · {scopeLabel(effectiveScope)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1B2347', border: '1px solid rgba(246,241,231,.12)', borderRadius: 14, padding: '11px 14px', marginTop: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7A82A8" strokeWidth="1.75" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} placeholder="Find person…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#F6F1E7', fontSize: 14 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {chip('all', `All ${scoped.length}`, peopleFilter === 'all', '#0B1027', '#F6F1E7')}
            {chip('priority', `★ Priority ${nPriority}`, peopleFilter === 'priority', GOLD, 'rgba(242,200,121,.12)', '1px solid rgba(242,200,121,.3)')}
            {chip('overdue', `Overdue ${nOverdue}`, peopleFilter === 'overdue', PINK, 'rgba(242,114,138,.12)', '1px solid rgba(242,114,138,.3)')}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 16px 90px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.length === 0 && <div style={{ textAlign: 'center', fontSize: 12, color: '#7A82A8', padding: '20px 0' }}>No one here yet.</div>}
          {shown.map(e => (
            <button key={e.person.id} type="button" onClick={() => setSheetPerson(e.person)} style={{ background: '#141B3D', border: e.person.priority ? '1px solid rgba(244,182,80,.35)' : '1px solid rgba(246,241,231,.10)', boxShadow: e.person.priority ? '0 0 24px -8px rgba(244,182,80,.4)' : undefined, borderRadius: 16, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, width: '100%', textAlign: 'left', color: '#F6F1E7', flexShrink: 0 }}>
              <PersonMeta e={e} />
              {e.follow?.overdue
                ? <span style={{ fontSize: 10.5, fontWeight: 700, color: PINK, background: 'rgba(242,114,138,.14)', borderRadius: 999, padding: '4px 9px', flex: '0 0 auto' }}>{e.follow.label}</span>
                : e.person.priority
                  ? <span style={{ fontSize: 10.5, fontWeight: 700, color: GOLD, background: 'rgba(242,200,121,.14)', borderRadius: 999, padding: '4px 9px', flex: '0 0 auto' }}>★</span>
                  : null}
              <Chevron dir="right" size={18} />
            </button>
          ))}
        </div>
        <Fab bottom={104} />
        <TabBar />
      </div>
    )
  })()

  // ── GROUPS (3c Grace Groups) ───────────────────────────────────────────────────
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  const groupsScreen = (() => {
    // In a narrowed scope, only surface groups that have an in-scope member.
    const visibleGroups = allowedPersonIds
      ? groups.filter(g => (membersByGroup.get(g.id)?.length ?? 0) > 0)
      : groups
    const totalMembers = visibleGroups.reduce((s, g) => s + (membersByGroup.get(g.id)?.length ?? 0), 0)
    const byDay = new Map<string, VictoryGroup[]>()
    // A multi-day group is listed under each of its meeting days.
    visibleGroups.forEach(g => {
      const ds = daysOf(g).length ? daysOf(g) : ['Unscheduled']
      ds.forEach(d => { const l = byDay.get(d) || []; l.push(g); byDay.set(d, l) })
    })
    const dayKeys = [...byDay.keys()].sort((a, b) => {
      const ia = DAY_ORDER.indexOf(a), ib = DAY_ORDER.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#F6F1E7' }}>
        <div style={{ padding: '58px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
            <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600 }}>Grace Groups</div>
            <ScopePill />
          </div>
          <div style={{ fontSize: 11.5, color: '#7A82A8', marginTop: 2 }}>{visibleGroups.length} {visibleGroups.length === 1 ? 'group' : 'groups'} · {totalMembers} {totalMembers === 1 ? 'person' : 'people'} in a weekly rhythm</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '14px 16px 90px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visibleGroups.length === 0 && <div style={{ textAlign: 'center', fontSize: 13, color: '#7A82A8', padding: '24px 0' }}>No groups in this circle yet.</div>}
          {dayKeys.map(day => (
            <div key={day} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#7A82A8', padding: '4px 4px 0' }}>{day}</div>
              {byDay.get(day)!.map(g => {
                const members = membersByGroup.get(g.id) || []
                const stage = bookletStage(g.focus)
                const c = stage ? E_COLOR[stage] : '#7A82A8'
                const expanded = expandedGroup === g.id
                return (
                  <div key={g.id} style={{ background: '#141B3D', border: '1px solid rgba(246,241,231,.10)', borderRadius: 16, overflow: 'hidden', flexShrink: 0 }}>
                    <button type="button" onClick={() => setExpandedGroup(expanded ? null : g.id)} style={{ width: '100%', background: 'none', border: 'none', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', color: '#F6F1E7', minHeight: 44 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                        {g.focus && (
                          <div style={{ marginTop: 5 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: c, background: `${c}1F`, border: `1px solid ${c}4D`, borderRadius: 999, padding: '3px 8px' }}>{stage ? `${stage} · ` : ''}{g.focus}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#B4BAD6' }}>{g.meeting_time || '—'}</div>
                        <div style={{ fontSize: 10.5, color: '#7A82A8', marginTop: 2 }}>{members.length} {members.length === 1 ? 'person' : 'people'}</div>
                      </div>
                      <Chevron dir={expanded ? 'down' : 'right'} size={16} />
                    </button>
                    {expanded && (
                      <div style={{ borderTop: '1px solid rgba(246,241,231,.08)', padding: '6px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {members.length === 0 && <div style={{ fontSize: 12, color: '#7A82A8', padding: '8px 4px' }}>No members yet.</div>}
                        {members.map(m => {
                          const mc = E_COLOR[m.current_stage]
                          return (
                            <button key={m.id} type="button" onClick={() => setSheetPerson(m)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: '7px 6px', borderRadius: 10, textAlign: 'left', color: '#F6F1E7', minHeight: 40 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 999, border: `1.5px solid ${mc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: mc, flex: '0 0 auto' }}>{initials(m.name)}</div>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                              <span style={{ fontSize: 10.5, color: mc }}>{m.current_stage}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <TabBar />
      </div>
    )
  })()

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: SPACE_BG, fontFamily: "'Montserrat', system-ui, sans-serif", overflow: 'hidden' }}>
      {loading ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 32, height: 32, borderRadius: 999, border: '2px solid #2E55E6', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
          <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      ) : activeStage ? stageList : tab === 'people' ? peopleScreen : tab === 'groups' ? groupsScreen : Landing}

      {/* 1d — person action sheet */}
      {sheetPerson && (() => {
        const p = sheetPerson
        const c = E_COLOR[p.current_stage]
        const engs = engByPerson.get(p.id) || []
        const follow = nextFollowUp(engs)
        const last = lastTouch(engs)
        const i = stageOrder.indexOf(p.current_stage)
        const next = i < stageOrder.length - 1 ? stageOrder[i + 1] : null
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 45, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div onClick={() => setSheetPerson(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(6,8,20,.55)' }} />
            <div style={{ position: 'relative', background: 'rgba(20,27,61,.96)', backdropFilter: 'blur(24px)', borderRadius: '28px 28px 0 0', border: '1px solid rgba(246,241,231,.14)', borderBottom: 'none', boxShadow: '0 -24px 60px -16px rgba(0,0,0,.8), inset 0 1px 0 rgba(246,241,231,.08)', padding: '10px 20px 40px', color: '#F6F1E7' }}>
              <div style={{ width: 38, height: 4, borderRadius: 999, background: 'rgba(246,241,231,.25)', margin: '0 auto 16px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 56, height: 56, borderRadius: 999, border: `2px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: c, boxShadow: `0 0 26px -4px ${c}8C`, flex: '0 0 auto' }}>{initials(p.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 19, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: c, background: `${c}1F`, border: `1px solid ${c}4D`, borderRadius: 999, padding: '4px 10px' }}>✦ {p.current_stage}</span>
                    {daysSince(p.updated_at) !== null && <span style={{ fontSize: 10.5, fontWeight: 600, color: '#B4BAD6', background: 'rgba(27,35,71,.9)', border: '1px solid rgba(246,241,231,.12)', borderRadius: 999, padding: '4px 10px' }}>{daysSince(p.updated_at)}d in stage</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, margin: '16px 0 4px' }}>
                <div style={{ flex: 1, background: 'rgba(11,16,39,.6)', border: '1px solid rgba(246,241,231,.10)', borderRadius: 14, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7A82A8' }}>Last touch</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3 }}>{last ?? 'No touches yet'}</div>
                </div>
                <div style={{ flex: 1, background: 'rgba(11,16,39,.6)', border: '1px solid rgba(246,241,231,.10)', borderRadius: 14, padding: '10px 12px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7A82A8' }}>Next step</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 3, color: follow?.overdue ? PINK : '#F6F1E7' }}>{follow?.label ?? 'Nothing scheduled'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                <button type="button" onClick={() => { setSheetPerson(null); onOpenFullProfile(p, 'engagements') }} style={{ minHeight: 52, border: 'none', borderRadius: 14, background: 'linear-gradient(160deg,#2E55E6,#1539C9)', color: '#FBF6EC', fontSize: 15.5, fontWeight: 700, boxShadow: '0 0 0 1px rgba(91,141,247,.25), 0 0 32px -4px rgba(46,85,230,.6)' }}>Log a follow-up</button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={() => togglePriority(p)} style={{ flex: 1, minHeight: 48, borderRadius: 14, background: 'rgba(27,35,71,.9)', border: '1px solid rgba(242,200,121,.35)', color: GOLD, fontSize: 13.5, fontWeight: 600 }}>{p.priority ? '★ Priority' : '☆ Mark priority'}</button>
                  {next && <button type="button" onClick={() => advance(p)} style={{ flex: 1, minHeight: 48, borderRadius: 14, background: 'rgba(27,35,71,.9)', border: '1px solid rgba(91,141,247,.35)', color: '#5B8DF7', fontSize: 13.5, fontWeight: 600 }}>Move to {next} →</button>}
                </div>
                <button type="button" onClick={() => { setSheetPerson(null); onOpenFullProfile(p) }} style={{ minHeight: 48, borderRadius: 14, background: 'transparent', border: '1px solid rgba(246,241,231,.14)', color: '#B4BAD6', fontSize: 13.5, fontWeight: 600 }}>View full profile</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 2b — momentum sheet (reuses the desktop PipelineMomentum) */}
      {momentumOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 45, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div onClick={() => setMomentumOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(6,8,20,.55)' }} />
          <div style={{ position: 'relative', background: '#0E1430', borderRadius: '26px 26px 0 0', border: '1px solid rgba(246,241,231,.12)', borderBottom: 'none', boxShadow: '0 -18px 50px -12px rgba(0,0,0,.6)', padding: '12px 14px 28px', maxHeight: '82%', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(246,241,231,.22)', margin: '0 auto 8px' }} />
            <PipelineMomentum refreshKey={refreshKey} allowedPersonIds={allowedPersonIds} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Swipe-to-reveal row for the stage list (1c) ────────────────────────────────
function SwipeRow({ e, onOpen, onPriority, onAdvance }: {
  e: Enriched
  onOpen: () => void
  onPriority: () => void
  onAdvance: () => void
}) {
  const c = E_COLOR[e.person.current_stage]
  const i = stageOrder.indexOf(e.person.current_stage)
  const next = i < stageOrder.length - 1 ? stageOrder[i + 1] : null
  const revealW = next ? 144 : 72
  const [dx, setDx] = useState(0)
  const [open, setOpen] = useState(false)
  const [startX, setStartX] = useState<number | null>(null)

  const onStart = (x: number) => setStartX(x)
  const onMove = (x: number) => {
    if (startX === null) return
    const delta = x - startX + (open ? -revealW : 0)
    setDx(Math.max(-revealW, Math.min(0, delta)))
  }
  const onEnd = () => {
    if (startX === null) return
    const shouldOpen = dx < -revealW / 2
    setOpen(shouldOpen)
    setDx(shouldOpen ? -revealW : 0)
    setStartX(null)
  }

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', flexShrink: 0 }}>
      {/* action layer */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => { onPriority(); setOpen(false); setDx(0) }} style={{ width: 72, background: 'linear-gradient(180deg,#E0A94A,#C98F35)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: '#141B3D', border: 'none' }}>
          <span style={{ fontSize: 15 }}>{e.person.priority ? '★' : '☆'}</span><span style={{ fontSize: 9.5, fontWeight: 700 }}>Priority</span>
        </button>
        {next && (
          <button type="button" onClick={() => { onAdvance(); setOpen(false); setDx(0) }} style={{ width: 72, background: 'linear-gradient(180deg,#2E55E6,#1539C9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: '#FBF6EC', border: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
            <span style={{ fontSize: 9.5, fontWeight: 700 }}>To {next}</span>
          </button>
        )}
      </div>
      {/* front row */}
      <div
        onClick={() => { if (open) { setOpen(false); setDx(0) } else onOpen() }}
        onTouchStart={ev => onStart(ev.touches[0].clientX)}
        onTouchMove={ev => onMove(ev.touches[0].clientX)}
        onTouchEnd={onEnd}
        style={{
          position: 'relative', transform: `translateX(${dx}px)`, transition: startX === null ? 'transform .2s ease' : 'none',
          background: e.person.priority ? '#141B3D' : '#141B3D',
          border: e.person.priority ? '1px solid rgba(244,182,80,.35)' : '1px solid rgba(246,241,231,.10)',
          boxShadow: e.person.priority ? '0 0 24px -8px rgba(244,182,80,.4)' : undefined,
          borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, color: '#F6F1E7',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 999, border: `1.5px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: c, flex: '0 0 auto' }}>{initials(e.person.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.person.name}</div>
          <div style={{ fontSize: 11.5, color: '#7A82A8', marginTop: 1 }}>
            {e.daysInStage ?? 0}d in stage
            {e.prayerCount > 0 ? ` · ✦ ${e.prayerCount}` : ''}
            {e.follow?.overdue ? <span style={{ color: PINK }}> · {e.follow.label}</span> : null}
            {e.person.priority ? <span style={{ color: GOLD }}> · ★ Priority</span> : null}
          </div>
        </div>
        <Chevron dir="right" size={18} />
      </div>
    </div>
  )
}
