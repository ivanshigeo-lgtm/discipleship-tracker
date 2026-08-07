'use client'

// Zone 3: the app picks 3–5 people who most need a touch and puts one-tap
// actions on each row. Ranking blends: overdue pending follow-up, longest
// silence since a Completed engagement (follow_up_date — engagements carry no
// completed_at in practice), a 2+ missed-group streak, and the coach's private
// priority stars. Each row also carries the person's NEXT journey step, so the
// touch always points at the mission.

import { useEffect, useMemo, useState } from 'react'
import {
  getPeople,
  getAllEngagements,
  getMyPriorityPersonIds,
  getAllStageChecklistItems,
  getVictoryGroups,
  getAllGroupMemberships,
  getRecentGroupAttendance,
  addEngagement,
} from '../../lib/supabaseQueries'
import { daysOf, WEEKDAY_NAMES } from '../../lib/meetingDays'
import { STAGE_COLORS, initials, nextStepFor, silenceDays, toLocalDateStr, ZoneLabel } from './coachModel'
import type { Person, Engagement, StageChecklistItem, VictoryGroup } from '../../types/database'

type Ranked = {
  person: Person
  score: number
  reason: string
  warn: boolean
  nextStep: string
  stall: string | null
}

const MISSED_WINDOW_DAYS = 35

export default function NeedsATouch({
  personId,
  allowedPersonIds,
  refreshKey,
  onPersonClick,
  onOpenMessages,
}: {
  personId: string
  allowedPersonIds?: string[]
  refreshKey: number
  onPersonClick: (person: Person) => void
  onOpenMessages: (targetPersonId: string) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [priorityIds, setPriorityIds] = useState<Set<string>>(new Set())
  const [checklist, setChecklist] = useState<StageChecklistItem[]>([])
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [memberships, setMemberships] = useState<{ person_id: string; victory_group_id: string }[]>([])
  const [attendance, setAttendance] = useState<{ person_id: string; victory_group_id: string; meeting_date: string }[]>([])
  const [logged, setLogged] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    const since = new Date(); since.setDate(since.getDate() - MISSED_WINDOW_DAYS)
    ;(async () => {
      const [p, e, prio, cl, g, gm, att] = await Promise.all([
        getPeople(),
        getAllEngagements(),
        getMyPriorityPersonIds(personId),
        getAllStageChecklistItems(),
        getVictoryGroups(),
        getAllGroupMemberships(),
        getRecentGroupAttendance(toLocalDateStr(since)),
      ])
      if (!alive) return
      if (p.data) setPeople(p.data as Person[])
      if (e.data) setEngagements(e.data as Engagement[])
      setPriorityIds(prio.ids)
      if (cl.data) setChecklist(cl.data as StageChecklistItem[])
      if (g.data) setGroups(g.data as VictoryGroup[])
      if (gm.data) setMemberships(gm.data as { person_id: string; victory_group_id: string }[])
      if (att.data) setAttendance(att.data as { person_id: string; victory_group_id: string; meeting_date: string }[])
      setReady(true)
    })()
    return () => { alive = false }
  }, [personId, refreshKey])

  const ranked = useMemo<Ranked[]>(() => {
    const allow = allowedPersonIds ? new Set(allowedPersonIds) : null
    const today = toLocalDateStr(new Date())

    const engByPerson = new Map<string, Engagement[]>()
    engagements.forEach(e => {
      const l = engByPerson.get(e.person_id) ?? []
      l.push(e); engByPerson.set(e.person_id, l)
    })

    // Missed-streak inputs: for each group, which past dates actually HAPPENED
    // (someone has an attended row) — a person misses only meetings that
    // happened without them.
    const heldDates = new Map<string, Set<string>>() // groupId → dates
    const attended = new Set<string>() // `${personId}:${groupId}:${date}`
    for (const a of attendance) {
      const s = heldDates.get(a.victory_group_id) ?? new Set<string>()
      s.add(a.meeting_date); heldDates.set(a.victory_group_id, s)
      attended.add(`${a.person_id}:${a.victory_group_id}:${a.meeting_date}`)
    }
    const groupById = new Map(groups.map(g => [g.id, g]))
    const groupsByPerson = new Map<string, string[]>()
    for (const m of memberships) {
      const l = groupsByPerson.get(m.person_id) ?? []
      l.push(m.victory_group_id); groupsByPerson.set(m.person_id, l)
    }
    const missedCount = (pid: string) => {
      let missed = 0
      for (const gid of groupsByPerson.get(pid) ?? []) {
        const g = groupById.get(gid)
        const held = heldDates.get(gid)
        if (!g || !held) continue
        const dayIdx = new Set(daysOf(g).map(d => WEEKDAY_NAMES.indexOf(d)))
        for (const date of held) {
          if (date >= today) continue
          if (!dayIdx.has(new Date(date + 'T00:00:00').getDay())) continue
          if (!attended.has(`${pid}:${gid}:${date}`)) missed++
        }
      }
      return missed
    }

    const out: Ranked[] = []
    for (const p of people) {
      if (p.id === personId || p.status === 'Inactive') continue
      if (allow && !allow.has(p.id)) continue
      const engs = engByPerson.get(p.id) ?? []

      // Overdue pending follow-up (soonest pending date already in the past).
      const pendingDates = engs.filter(e => e.status === 'Pending' && e.follow_up_date).map(e => e.follow_up_date!).sort()
      const overdueDays = pendingDates.length && pendingDates[0] < today
        ? Math.round((new Date(today + 'T00:00:00').getTime() - new Date(pendingDates[0] + 'T00:00:00').getTime()) / 86_400_000)
        : 0

      const silence = silenceDays(engs, p.created_at) ?? 0
      const missed = missedCount(p.id)
      const priority = priorityIds.has(p.id)

      let score = 0
      if (overdueDays > 0) score += 50 + Math.min(overdueDays, 30)
      if (missed >= 2) score += 40 + missed * 5
      score += Math.min(silence, 45)
      if (priority) score += 25
      if (score <= 5) continue // freshly-touched people don't need a nudge

      const quiet = silence > 0 ? `quiet for ${silence}d` : null
      let reason: string; let warn = false
      if (missed >= 2) { reason = ['Missed group ×' + missed, quiet].filter(Boolean).join(' · '); warn = true }
      else if (overdueDays > 0) { reason = `Follow-up overdue by ${overdueDays}d`; warn = true }
      else if (priority) reason = ['★ Priority', quiet].filter(Boolean).join(' · ')
      else reason = quiet ? `Quiet for ${silence} days` : 'No touches logged yet'

      out.push({
        person: p,
        score,
        reason,
        warn,
        nextStep: nextStepFor(p, checklist),
        stall: silence >= 14 ? `stalled ${Math.floor(silence / 7)} wks` : silence > 0 ? `${silence}d quiet` : null,
      })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 5)
  }, [people, engagements, priorityIds, checklist, groups, memberships, attendance, allowedPersonIds, personId])

  if (!ready || ranked.length === 0) return null

  const logTouch = async (p: Person) => {
    setLogged(prev => new Set(prev).add(p.id))
    const { error } = await addEngagement({
      person_id: p.id,
      created_by_person_id: personId,
      description: 'Quick touch',
      follow_up_date: toLocalDateStr(new Date()),
      follow_up_time: null,
      location: null,
      meeting_type: 'One2One',
      status: 'Completed',
    })
    if (error) setLogged(prev => { const n = new Set(prev); n.delete(p.id); return n })
  }

  const IconChip = ({ title, onClick, children }: { title: string; onClick?: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onClick={e => { e.stopPropagation(); onClick?.() }}
      className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line-2)] bg-[var(--indigo-3)] transition-all hover:bg-[#2a3565]"
    >
      {children}
    </button>
  )
  const svgProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--fg-2)', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  return (
    <section className="mb-5">
      <ZoneLabel label="Needs a touch" />
      <div className="cn-card flex flex-col p-0">
        {ranked.map((r, i) => {
          const c = STAGE_COLORS[r.person.current_stage]
          return (
            <div
              key={r.person.id}
              role="button"
              tabIndex={0}
              onClick={() => onPersonClick(r.person)}
              onKeyDown={e => { if (e.key === 'Enter') onPersonClick(r.person) }}
              className={`flex cursor-pointer items-center gap-3 px-3.5 py-3 ${i > 0 ? 'border-t border-[var(--line-1)]' : ''}`}
            >
              <div
                className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-[11px] font-bold text-[#FBF6EC]"
                style={{ background: `radial-gradient(circle at 35% 30%, ${c}f2, ${c}40 75%)`, boxShadow: `0 0 14px -1px ${c}99` }}
              >
                {initials(r.person.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--fg-1)]">{r.person.name}</p>
                <p className={`mt-px truncate text-[11.5px] ${r.warn ? 'text-[var(--gold)]' : 'text-[var(--fg-3)]'}`}>{r.reason}</p>
                <p className="truncate text-[11.5px] text-[var(--fg-2)]">
                  next: <span className="font-medium text-[var(--fg-1)]">{r.nextStep}</span>
                  {r.stall && <span className="text-[var(--fg-3)]"> · {r.stall}</span>}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 gap-1.5">
                <IconChip title="Message" onClick={() => onOpenMessages(r.person.id)}>
                  <svg {...svgProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </IconChip>
                {r.person.phone && (
                  <a
                    href={`tel:${r.person.phone}`}
                    title="Call"
                    onClick={e => e.stopPropagation()}
                    className="grid h-8 w-8 place-items-center rounded-full border border-[var(--line-2)] bg-[var(--indigo-3)] transition-all hover:bg-[#2a3565]"
                  >
                    <svg {...svgProps}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  </a>
                )}
                {logged.has(r.person.id) ? (
                  <span className="grid h-8 place-items-center px-1 text-[11px] font-semibold text-[var(--success)]">Logged ✓</span>
                ) : (
                  <IconChip title="Log a touch" onClick={() => logTouch(r.person)}>
                    <svg {...svgProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </IconChip>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
