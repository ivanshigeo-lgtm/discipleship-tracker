'use client'

// Zone 3: the app picks 3–5 people who most need a touch and puts one-tap
// actions on each row. Ranking blends: overdue pending follow-up, longest
// silence since a Completed engagement (follow_up_date — engagements carry no
// completed_at in practice), a 2+ missed-group streak, and the coach's private
// priority stars. Each row also carries the person's NEXT journey step, so the
// touch always points at the mission.
//
// v2 (the "touch" is now a first-class marker, NOT a meeting): a logged touch is
// a row in `touches` (created_by = the coach) — it does NOT count as a One2One /
// attendance / engagement and never resets silence. A touched person cools off
// the list within ~1h (then returns if still owed a touch). GRADUATION: someone
// who has not attended a group in >3 weeks AND has ≥3 touch points logged falls
// off entirely and stops nagging (and their priority star is cleared) until they
// attend again. A scope chip (My constellation / My people / GBC) filters the
// ranking person-set.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getPeople,
  getAllEngagements,
  getMyPriorityPersonIds,
  setPersonPriority,
  getAllStageChecklistItems,
  getVictoryGroups,
  getAllGroupMemberships,
  getRecentGroupAttendance,
  getRecentTouches,
  addTouch,
  deleteTouch,
} from '../../lib/supabaseQueries'
import { daysOf, WEEKDAY_NAMES } from '../../lib/meetingDays'
import { STAGE_COLORS, initials, nextStepFor, silenceDays, toLocalDateStr, ZoneLabel } from './coachModel'
import type { Person, Engagement, StageChecklistItem, VictoryGroup, Touch } from '../../types/database'

type Ranked = {
  person: Person
  score: number
  reason: string
  warn: boolean
  nextStep: string
  stall: string | null
}
type Mode = 'mine' | 'direct' | 'gbc'

const MISSED_WINDOW_DAYS = 35
// A freshly-logged touch stays visible this long (mis-tap undo), then the person
// drops off. Jonavan (Aug 8): 5s is enough. Timestamp-based (not remount-based)
// so the row leaves on its own via a self-scheduled tick.
const GRACE_MS = 5 * 1000
const COOLDOWN_MS = 60 * 60 * 1000
// If you actually MET with someone recently — a completed 1:1 or group
// attendance within this many days — they drop off entirely, even over a past
// group no-show or an overdue follow-up. Jonavan (Aug 8): "if I met with them
// this week, why would I need to reach out again?" A quick TOUCH does NOT count
// as a meeting (touches keep their own ~1h cooldown above).
const RECENT_MEET_DAYS = 7
const GRAD_NO_ATTEND_DAYS = 21
const GRAD_MIN_TOUCHES = 3

export default function NeedsATouch({
  personId,
  myCircleIds,
  myPeopleIds,
  canSeeAllChurch,
  refreshKey,
  onPersonClick,
  onOpenMessages,
}: {
  personId: string
  myCircleIds?: string[]
  myPeopleIds?: string[]
  canSeeAllChurch: boolean
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
  const [touches, setTouches] = useState<Touch[]>([])
  const [ready, setReady] = useState(false)
  // My people only (direct reports). Jonavan (Aug 8): the list caps at 5, so a
  // "My constellation" scope is redundant — it'd surface the same five, and a
  // coach only reaches out to their own people anyway. Single scope, no toggle.
  const [mode, setMode] = useState<Mode>('direct')
  // Optimistic per-person override for the checkmark (true = logged, false =
  // un-logged) so a tap reads instantly; the persisted touch is the source of
  // truth once it lands. `pending` disables re-tap while a write is in flight.
  const [override, setOverride] = useState<Record<string, boolean>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  // Bumped by each touch's settle timer to recompute at the grace mark so the
  // just-touched row drops off even if the coach is still looking.
  const [, setTick] = useState(0)
  // Ids of touches created THIS viewing — lets the second tap find the row to
  // delete before the state round-trips (recentTouchByPerson covers it after).
  const localIds = useRef<Map<string, string>>(new Map())
  // Pending 5s settle timers, keyed by person — cleared on undo/unmount.
  const settleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const graduatedHandled = useRef<Set<string>>(new Set())
  const today = toLocalDateStr(new Date())

  useEffect(() => {
    let alive = true
    const since = new Date(); since.setDate(since.getDate() - MISSED_WINDOW_DAYS)
    ;(async () => {
      const [p, e, prio, cl, g, gm, att, tch] = await Promise.all([
        getPeople(),
        getAllEngagements(),
        getMyPriorityPersonIds(personId),
        getAllStageChecklistItems(),
        getVictoryGroups(),
        getAllGroupMemberships(),
        getRecentGroupAttendance(toLocalDateStr(since)),
        getRecentTouches(personId, new Date(Date.now() - MISSED_WINDOW_DAYS * 86_400_000).toISOString()),
      ])
      if (!alive) return
      if (p.data) setPeople(p.data as Person[])
      if (e.data) setEngagements(e.data as Engagement[])
      setPriorityIds(prio.ids)
      if (cl.data) setChecklist(cl.data as StageChecklistItem[])
      if (g.data) setGroups(g.data as VictoryGroup[])
      if (gm.data) setMemberships(gm.data as { person_id: string; victory_group_id: string }[])
      if (att.data) setAttendance(att.data as { person_id: string; victory_group_id: string; meeting_date: string }[])
      if (tch.data) setTouches(tch.data as Touch[])
      setReady(true)
    })()
    return () => { alive = false }
  }, [personId, refreshKey])

  // Clear any pending settle timers on unmount so they don't fire into a gone view.
  useEffect(() => () => { settleTimers.current.forEach(clearTimeout) }, [])

  // Most recent touch per person (live) — drives the ✓ and the delete id.
  const recentTouchByPerson = useMemo(() => {
    const m = new Map<string, Touch>()
    for (const t of touches) {
      const cur = m.get(t.person_id)
      if (!cur || t.created_at > cur.created_at) m.set(t.person_id, t)
    }
    return m
  }, [touches])

  const ranked = useMemo<{ list: Ranked[]; graduatedStars: string[] }>(() => {
    const allowIds = mode === 'gbc' ? null : mode === 'direct' ? myPeopleIds : myCircleIds
    const allow = mode === 'gbc' ? null : new Set(allowIds ?? [])
    const now = Date.now()

    // "Settled" = touches older than the 5s grace; a fresh tap keeps the person
    // visible for 5s (mis-tap undo), then the cooldown below drops them off.
    // Timestamp-based, so it fires on the settle-timer tick without a remount.
    const settledByPerson = new Map<string, Touch[]>()
    for (const t of touches) {
      if (now - new Date(t.created_at).getTime() < GRACE_MS) continue
      const l = settledByPerson.get(t.person_id) ?? []
      l.push(t); settledByPerson.set(t.person_id, l)
    }
    const cooledOff = (pid: string) => {
      const list = settledByPerson.get(pid)
      if (!list) return false
      let newest = 0
      for (const t of list) newest = Math.max(newest, new Date(t.created_at).getTime())
      return now - newest < COOLDOWN_MS
    }

    const engByPerson = new Map<string, Engagement[]>()
    engagements.forEach(e => {
      const l = engByPerson.get(e.person_id) ?? []
      l.push(e); engByPerson.set(e.person_id, l)
    })

    // Missed-streak + last-attendance inputs.
    const heldDates = new Map<string, Set<string>>() // groupId → dates
    const attended = new Set<string>() // `${personId}:${groupId}:${date}`
    const lastAttended = new Map<string, string>() // personId → max meeting_date
    for (const a of attendance) {
      const s = heldDates.get(a.victory_group_id) ?? new Set<string>()
      s.add(a.meeting_date); heldDates.set(a.victory_group_id, s)
      attended.add(`${a.person_id}:${a.victory_group_id}:${a.meeting_date}`)
      const prev = lastAttended.get(a.person_id)
      if (!prev || a.meeting_date > prev) lastAttended.set(a.person_id, a.meeting_date)
    }
    // Recently met in person → drop them for the week. A completed 1:1 (NOT a
    // legacy 'Quick touch' engagement) or group attendance within RECENT_MEET_DAYS.
    const metCutoff = toLocalDateStr(new Date(Date.now() - RECENT_MEET_DAYS * 86_400_000))
    const metRecently = (pid: string) => {
      const la = lastAttended.get(pid)
      if (la && la >= metCutoff) return true
      for (const e of engByPerson.get(pid) ?? []) {
        if (e.status === 'Completed' && e.description !== 'Quick touch'
          && e.follow_up_date && e.follow_up_date >= metCutoff) return true
      }
      return false
    }

    const cutoff21 = toLocalDateStr(new Date(Date.now() - GRAD_NO_ATTEND_DAYS * 86_400_000))
    const graduated = (pid: string) => {
      const touchCount = (settledByPerson.get(pid) ?? []).length
      if (touchCount < GRAD_MIN_TOUCHES) return false
      const last = lastAttended.get(pid)
      return !last || last < cutoff21
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
    const graduatedStars: string[] = []
    for (const p of people) {
      if (p.id === personId || p.status === 'Inactive') continue
      if (allow && !allow.has(p.id)) continue
      if (graduated(p.id)) {
        if (priorityIds.has(p.id)) graduatedStars.push(p.id)
        continue
      }
      if (cooledOff(p.id)) continue
      // Recently MET (1:1 or group attendance this week) → drop, overriding a
      // past group miss / overdue follow-up. You already reached out.
      if (metRecently(p.id)) continue

      const engs = engByPerson.get(p.id) ?? []

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
      if (score <= 5) continue

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
    return { list: out.sort((a, b) => b.score - a.score).slice(0, 5), graduatedStars }
  }, [people, engagements, priorityIds, checklist, groups, memberships, attendance, touches, mode, myCircleIds, myPeopleIds, personId, today])

  // Clear the coach's star on anyone who just graduated (fire once each).
  useEffect(() => {
    for (const pid of ranked.graduatedStars) {
      if (graduatedHandled.current.has(pid)) continue
      graduatedHandled.current.add(pid)
      setPriorityIds(prev => { const n = new Set(prev); n.delete(pid); return n })
      void setPersonPriority(personId, pid, false)
    }
  }, [ranked.graduatedStars, personId])

  const hasAnyPeople = useMemo(
    () => people.some(p => p.id !== personId && p.status !== 'Inactive'),
    [people, personId],
  )
  if (!ready || !hasAnyPeople) return null

  // ✓ shows during the 5s grace; after it the person has dropped off the list.
  const isLogged = (pid: string) => {
    if (pid in override) return override[pid]
    const t = recentTouchByPerson.get(pid)
    return !!t && Date.now() - new Date(t.created_at).getTime() < GRACE_MS
  }

  // My people only — single scope, so the toggle row stays hidden (see mode init).
  const modes: [Mode, string][] = [
    ['direct', 'My people'],
  ]

  // Toggle a quick touch. Optimistic checkmark first, then persist; on error we
  // roll the override back.
  const toggleTouch = async (p: Person) => {
    if (pending.has(p.id)) return
    const logged = isLogged(p.id)
    setPending(s => new Set(s).add(p.id))
    if (logged) {
      const t = settleTimers.current.get(p.id)
      if (t) { clearTimeout(t); settleTimers.current.delete(p.id) }
      const id = localIds.current.get(p.id) ?? recentTouchByPerson.get(p.id)?.id
      setOverride(o => ({ ...o, [p.id]: false }))
      if (id) {
        const { error } = await deleteTouch(id)
        if (error) setOverride(o => ({ ...o, [p.id]: true }))
        else { localIds.current.delete(p.id); setTouches(prev => prev.filter(t => t.id !== id)) }
      }
    } else {
      setOverride(o => ({ ...o, [p.id]: true }))
      const { data, error } = await addTouch(p.id, personId)
      if (error || !data) setOverride(o => ({ ...o, [p.id]: false }))
      else {
        localIds.current.set(p.id, (data as Touch).id); setTouches(prev => [data as Touch, ...prev])
        // Settle after the grace: drop the override + recompute so the row leaves
        // the list at ~5s even if the coach never navigates away.
        const prev = settleTimers.current.get(p.id)
        if (prev) clearTimeout(prev)
        settleTimers.current.set(p.id, setTimeout(() => {
          setOverride(o => { const n = { ...o }; delete n[p.id]; return n })
          localIds.current.delete(p.id)
          settleTimers.current.delete(p.id)
          setTick(x => x + 1)
        }, GRACE_MS + 50))
      }
    }
    setPending(s => { const n = new Set(s); n.delete(p.id); return n })
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
      {modes.length > 1 && (
        <div className="mb-2 flex justify-end">
          <div className="flex rounded-full border border-[var(--line-1)] bg-[var(--indigo-2)] p-0.5">
            {modes.map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setMode(val)}
                className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-all ${mode === val ? 'bg-[var(--indigo-3)] text-[var(--fg-1)]' : 'text-[var(--fg-3)] hover:text-[var(--fg-1)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {ranked.list.length === 0 ? (
        <div className="cn-card p-4 text-center text-[12.5px] text-[var(--fg-3)]">
          Everyone in {mode === 'gbc' ? 'GBC' : mode === 'direct' ? 'your people' : 'your constellation'} has a recent touch. 🙌
        </div>
      ) : (
      <div className="cn-card flex flex-col p-0">
        {ranked.list.map((r, i) => {
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
                {isLogged(r.person.id) ? (
                  <button
                    type="button"
                    title="Un-log this touch"
                    onClick={e => { e.stopPropagation(); toggleTouch(r.person) }}
                    className="grid h-8 place-items-center rounded-full border border-[var(--success)] bg-[var(--indigo-3)] px-2.5 text-[11px] font-semibold text-[var(--success)] transition-all hover:opacity-80"
                  >
                    Logged ✓
                  </button>
                ) : (
                  <IconChip title="Log a touch" onClick={() => toggleTouch(r.person)}>
                    <svg {...svgProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </IconChip>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}
    </section>
  )
}
