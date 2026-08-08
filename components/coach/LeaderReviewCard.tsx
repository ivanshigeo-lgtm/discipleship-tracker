'use client'

// Per-coach Leader Review — the Empower leader-review assessment brought in-app,
// web mirror of native src/components/coach/leader-review-card.tsx. Deterministic
// from activity data (NO AI, NO SOAP). Self-fetches like MomentumCard /
// ConstellationLens, so it recomputes every open (never a stale weekly snapshot).
// Sunday-anchored week-to-date, matching the rest of the briefing.
//
// A coach normally sees only their OWN review. Only an admin (isAdmin) additionally
// gets a leader selector to view ANY leader's review — self first. Jonavan is the
// sole admin; Empower leaders do NOT see other leaders' reports.

import { useEffect, useMemo, useState } from 'react'
import {
  getPeople,
  getAllEngagements,
  getVictoryGroups,
  getAllGroupMemberships,
  getPipelineEvents,
  getRecentGroupAttendance,
  getAllDiscipleshipConnections,
} from '../../lib/supabaseQueries'
import { STAGE_COLORS, ZoneLabel, toLocalDateStr } from './coachModel'
import type {
  DiscipleshipConnection,
  Engagement,
  PipelineEvent,
  Person,
  Stage,
  VictoryGroup,
} from '../../types/database'

const GOLD = 'var(--gbm-gold, #F2C879)'
type Membership = { person_id: string; victory_group_id: string }
type Attn = { person_id: string; victory_group_id: string; meeting_date: string; attended: boolean }

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtSince = (iso: string) => {
  const d = new Date(iso)
  return `since ${MON[d.getMonth()]} ${d.getDate()}`
}
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

// small edit-distance for likely-duplicate name detection
function lev(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  const row = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return row[n]
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

// transitive downline closure (discipler → disciple), excluding the root
function closure(rootId: string, conns: DiscipleshipConnection[]): Set<string> {
  const ids = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const c of conns) {
      if (c.disciple_person_id && ids.has(c.discipler_person_id) && !ids.has(c.disciple_person_id)) {
        ids.add(c.disciple_person_id)
        changed = true
      }
    }
  }
  ids.delete(rootId)
  return ids
}

function buildReview(
  subjectId: string,
  self: boolean,
  byId: Map<string, Person>,
  people: Person[],
  engagements: Engagement[],
  groups: VictoryGroup[],
  memberships: Membership[],
  pipelineEvents: PipelineEvent[],
  recentAttn: Attn[],
  connections: DiscipleshipConnection[],
) {
  const subject = byId.get(subjectId)
  const first = subject ? firstName(subject.name) : 'This leader'
  // token helpers — second person for self, third person for others
  const Who = self ? 'You' : first
  const who = self ? 'you' : first
  const whoHave = self ? 'You have' : `${first} has`
  const poss = self ? 'your' : `${first}'s`
  const Poss = self ? 'Your' : `${first}'s`

  const dl = closure(subjectId, connections)
  const downline = [...dl]
    .map((id) => byId.get(id))
    .filter((p): p is Person => !!p && p.status !== 'Inactive')

  const ownedGroups = groups.filter((g) => g.owner_person_id === subjectId)
  const ownedIds = new Set(ownedGroups.map((g) => g.id))
  const membersByGroup = new Map<string, Set<string>>()
  ownedGroups.forEach((g) => membersByGroup.set(g.id, new Set()))
  for (const m of memberships) {
    if (ownedIds.has(m.victory_group_id) && m.person_id !== subjectId) {
      membersByGroup.get(m.victory_group_id)?.add(m.person_id)
    }
  }
  const inGroup = new Set<string>()
  for (const s of membersByGroup.values()) for (const id of s) inGroup.add(id)

  const sunday = new Date()
  sunday.setHours(0, 0, 0, 0)
  sunday.setDate(sunday.getDate() - sunday.getDay())
  const WK = sunday.getTime()
  const sundayStr = toLocalDateStr(sunday)

  const my1on1 = engagements.filter((e) => e.created_by_person_id === subjectId && e.meeting_type === 'One2One')

  const met = new Set<string>()
  for (const a of recentAttn) {
    if (a.attended && ownedIds.has(a.victory_group_id) && a.meeting_date >= sundayStr && a.person_id !== subjectId) {
      met.add(a.person_id)
    }
  }
  for (const e of my1on1) {
    if (e.status === 'Completed' && e.follow_up_date && new Date(e.follow_up_date).getTime() >= WK && e.person_id !== subjectId) {
      met.add(e.person_id)
    }
  }

  const reach = new Set<string>(inGroup)
  for (const e of my1on1) if (e.person_id && e.person_id !== subjectId) reach.add(e.person_id)

  const stats = {
    groupsLed: ownedGroups.length,
    peopleInGroups: inGroup.size,
    metThisWeek: met.size,
    weeklyReach: reach.size,
    constellation: downline.length,
  }

  const coverageGap = downline.filter((p) => !inGroup.has(p.id))

  const byStage: Record<Stage, Person[]> = { Engage: [], Establish: [], Equip: [], Empower: [] }
  for (const p of downline) byStage[p.current_stage]?.push(p)
  const nOf = (s: Stage) => byStage[s].length

  // ── Worth talking about (deterministic, priority order) ──
  const flags: string[] = []

  if (stats.groupsLed === 0 && my1on1.length > 0) {
    flags.push(`${Who}${self ? "'re" : ' is'} meeting people one-on-one but ${self ? "don't" : "doesn't"} lead a weekly group yet — is one forming?`)
  } else if (stats.groupsLed === 0 && stats.constellation > 0) {
    flags.push(`${stats.constellation} ${stats.constellation === 1 ? 'person is' : 'people are'} on ${poss} constellation, but ${who} ${self ? "don't" : "doesn't"} lead a weekly group yet — where could they gather?`)
  } else if (coverageGap.length > 0 && stats.constellation > 0) {
    flags.push(`${coverageGap.length} of the ${stats.constellation} people on ${poss} constellation aren't in any of ${poss} weekly groups. Who among them needs a next step?`)
  } else if (stats.constellation > 0 && stats.groupsLed > 0) {
    flags.push(`Every one of ${poss} ${stats.constellation} constellation people is in a weekly group — full coverage. ✦`)
  }

  const names = downline.map((p) => ({ p, n: norm(p.name) })).filter((x) => x.n.length > 3)
  let dupFound = false
  for (let i = 0; i < names.length && !dupFound; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j]
      if (a.n === b.n || (Math.abs(a.n.length - b.n.length) <= 2 && lev(a.n, b.n) <= 2)) {
        flags.push(`${Poss} constellation lists both "${a.p.name}" and "${b.p.name}" — likely the same person, worth a merge.`)
        dupFound = true
        break
      }
    }
  }

  for (const g of ownedGroups) {
    if ((membersByGroup.get(g.id)?.size ?? 0) === 0) {
      flags.push(`${Poss} ${g.name} group has no members added yet — is it forming, or does the roster need to be added?`)
      break
    }
  }
  for (const g of ownedGroups) {
    const hasDay = !!g.meeting_day || (g.meeting_days && g.meeting_days.length > 0)
    if (!hasDay && (membersByGroup.get(g.id)?.size ?? 0) > 0) {
      flags.push(`${Poss} ${g.name} group has no meeting day set — worth confirming when it meets and adding it.`)
      break
    }
  }

  if (stats.groupsLed > 0 && my1on1.length === 0) {
    flags.push(`${Poss} weekly rhythm runs entirely through groups — no one-on-ones on the calendar. Who’s next for a one-on-one?`)
  }

  if (nOf('Establish') >= 3 && nOf('Equip') === 0) {
    flags.push(`${whoHave} a deep Establish bench and no one yet in Equip — who’s ready to be equipped next?`)
  } else if (nOf('Establish') >= 4 && nOf('Establish') > nOf('Equip') * 3) {
    flags.push(`${nOf('Establish')} people are rooted at Establish behind ${poss} emerging leaders — who’s ready to be equipped next?`)
  }

  const shownFlags = flags.slice(0, 4)

  // ── Emerging leadership team (leaders first) ──
  const stageSince = (id: string, stage: Stage): string | null => {
    const ev = pipelineEvents.find((e) => e.person_id === id && e.to_stage === stage)
    if (!ev) return null
    if (Date.now() - new Date(ev.created_at).getTime() > 45 * 864e5) return null
    return fmtSince(ev.created_at)
  }
  const stageOrder: Stage[] = ['Empower', 'Equip', 'Establish', 'Engage']
  const emerging = stageOrder
    .map((stage) => ({
      stage,
      people: byStage[stage]
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ p, since: stageSince(p.id, stage) })),
    }))
    .filter((r) => r.people.length > 0 || r.stage === 'Equip')

  let nudge = ` ${Poss} emerging team forms as people at Engage take root.`
  if (nOf('Empower') > 0 && nOf('Establish') > 0) {
    nudge = ` ${whoHave} already released ${nOf('Empower')} into Empower, with a bench at Establish — who’s ready to be equipped next?`
  } else if (nOf('Equip') > 0) {
    nudge = ` ${firstName(byStage.Equip[0].name)} ${self ? 'is your' : `is ${first}'s`} emerging leader — the Establish bench behind them is where the next ones come from.`
  } else if (nOf('Establish') > 0) {
    nudge = ' A few are taking root at Establish — the emerging team grows as they take hold and someone steps into Equip.'
  }
  const caption = `The journey runs Engage → Establish → Equip → Empower.${nudge}`

  const subtitle =
    stats.groupsLed > 0
      ? `${self ? 'Reaching' : `${first} reaches`} ${stats.weeklyReach} ${stats.weeklyReach === 1 ? 'person' : 'people'} every week through ${stats.groupsLed} ${stats.groupsLed === 1 ? 'group' : 'groups'} · ${stats.constellation} on ${poss} constellation`
      : stats.constellation > 0
        ? `${stats.constellation} ${stats.constellation === 1 ? 'person' : 'people'} on ${poss} constellation`
        : self
          ? 'Your review fills in as you add people and start groups.'
          : `${first}'s review fills in as they add people and start groups.`

  const empty = stats.constellation === 0 && stats.groupsLed === 0

  return { stats, subtitle, shownFlags, emerging, caption, empty }
}

export default function LeaderReviewCard({
  personId,
  isAdmin,
  refreshKey,
  onPersonClick,
}: {
  personId: string
  isAdmin: boolean
  refreshKey: number
  onPersonClick: (p: Person) => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([])
  const [recentAttn, setRecentAttn] = useState<Attn[]>([])
  const [connections, setConnections] = useState<DiscipleshipConnection[]>([])
  const [ready, setReady] = useState(false)
  const [subjectId, setSubjectId] = useState(personId)

  useEffect(() => {
    let alive = true
    // "met this week" only reads attendance from Sunday on, so that's all we fetch.
    const sunday = new Date(); sunday.setHours(0, 0, 0, 0); sunday.setDate(sunday.getDate() - sunday.getDay())
    ;(async () => {
      const [pp, ee, gg, mm, pe, at, cc] = await Promise.all([
        getPeople(),
        getAllEngagements(),
        getVictoryGroups(),
        getAllGroupMemberships(),
        getPipelineEvents(),
        getRecentGroupAttendance(toLocalDateStr(sunday)),
        getAllDiscipleshipConnections(),
      ])
      if (!alive) return
      if (pp.data) setPeople(pp.data as Person[])
      if (ee.data) setEngagements(ee.data as Engagement[])
      if (gg.data) setGroups(gg.data as VictoryGroup[])
      if (mm.data) setMemberships(mm.data as Membership[])
      if (pe.data) setPipelineEvents(pe.data as PipelineEvent[])
      if (at.data) setRecentAttn(at.data as Attn[])
      if (cc.data) setConnections(cc.data as DiscipleshipConnection[])
      setReady(true)
    })()
    return () => { alive = false }
  }, [refreshKey])

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  // leaders to offer in the selector: anyone who owns a group, disciples someone, or is Empower.
  const leaders = useMemo(() => {
    if (!isAdmin) return []
    const ids = new Set<string>([personId])
    for (const g of groups) if (g.owner_person_id) ids.add(g.owner_person_id)
    for (const c of connections) ids.add(c.discipler_person_id)
    for (const p of people) if (p.current_stage === 'Empower') ids.add(p.id)
    const list = [...ids]
      .map((id) => byId.get(id))
      .filter((p): p is Person => !!p && p.status !== 'Inactive')
    list.sort((a, b) => (a.id === personId ? -1 : b.id === personId ? 1 : a.name.localeCompare(b.name)))
    return list
  }, [isAdmin, groups, connections, people, byId, personId])

  const activeSubject = byId.has(subjectId) ? subjectId : personId
  const model = useMemo(
    () =>
      buildReview(
        activeSubject,
        activeSubject === personId,
        byId,
        people,
        engagements,
        groups,
        memberships,
        pipelineEvents,
        recentAttn,
        connections,
      ),
    [activeSubject, personId, byId, people, engagements, groups, memberships, pipelineEvents, recentAttn, connections],
  )

  if (!ready) return null
  const { stats, subtitle, shownFlags, emerging, caption, empty } = model
  const showSelector = isAdmin && leaders.length > 1

  return (
    <section className="mb-6">
      <ZoneLabel label="Leader review" />
      <div className="cn-card p-4" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {showSelector && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
            {leaders.map((l) => {
              const on = l.id === activeSubject
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSubjectId(l.id)}
                  className="shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-all"
                  style={on
                    ? { color: 'var(--fg-1)', background: 'var(--indigo-3)', borderColor: 'rgba(91,141,247,.45)' }
                    : { color: 'var(--fg-3)', background: 'var(--indigo)', borderColor: 'var(--line-1)' }}
                >
                  {l.id === personId ? 'You' : firstName(l.name)}
                </button>
              )
            })}
          </div>
        )}

        <p className="text-[18px] leading-[22px] text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>{subtitle}</p>

        {!empty && (
          <div className="flex gap-2">
            <Stat n={stats.groupsLed} l={stats.groupsLed === 1 ? 'Group led' : 'Groups led'} />
            <Stat n={stats.peopleInGroups} l="In groups" />
            <Stat n={stats.metThisWeek} l="Met this week" />
            <Stat n={stats.weeklyReach} l="Weekly reach" accent />
          </div>
        )}

        {shownFlags.length > 0 && (
          <>
            <div className="h-px bg-[var(--line-1)]" />
            <h4 className="mb-px text-[10.5px] font-semibold uppercase tracking-[1.5px] text-[var(--fg-3)]">Worth talking about</h4>
            <div className="flex flex-col gap-[7px]">
              {shownFlags.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-[1px] text-[10px] leading-[18px]" style={{ color: GOLD }}>✦</span>
                  <span className="flex-1 text-[12.5px] leading-[18px] text-[var(--fg-1)]">{f}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {emerging.length > 0 && (
          <>
            <div className="h-px bg-[var(--line-1)]" />
            <h4 className="mb-px text-[10.5px] font-semibold uppercase tracking-[1.5px] text-[var(--fg-3)]">Emerging leadership team</h4>
            <div className="flex flex-col gap-2">
              {emerging.map((row) => (
                <div key={row.stage} className="flex items-start gap-2">
                  <span className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: STAGE_COLORS[row.stage] }} />
                  <span className="w-[62px] shrink-0 pt-[2px] text-[8.5px] font-semibold uppercase tracking-[0.6px]" style={{ color: STAGE_COLORS[row.stage] }}>{row.stage}</span>
                  <div className="flex flex-1 flex-wrap">
                    {row.people.length === 0 ? (
                      <span className="text-[13px] italic text-[var(--fg-3)]" style={{ fontFamily: 'var(--font-display)' }}>
                        {row.stage === 'Equip'
                          ? 'No one being equipped yet — this is the row the next leaders come from.'
                          : 'No one here yet.'}
                      </span>
                    ) : (
                      row.people.map((pp, idx) => (
                        <span
                          key={pp.p.id}
                          className="cursor-pointer text-[12.5px] font-medium leading-[18px] text-[var(--fg-1)] hover:underline"
                          onClick={() => onPersonClick(pp.p)}
                        >
                          {pp.p.name}
                          {pp.since ? <span className="text-[11px] font-normal text-[var(--fg-3)]"> ({pp.since})</span> : null}
                          {idx < row.people.length - 1 ? <span className="text-[var(--fg-3)]">, </span> : null}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-0.5 text-[11.5px] leading-[17px] text-[var(--fg-2)]">{caption}</p>
          </>
        )}
      </div>
    </section>
  )
}

function Stat({ n, l, accent }: { n: number; l: string; accent?: boolean }) {
  return (
    <div className="flex-1 rounded-[10px] border border-[var(--line-1)] bg-[var(--indigo)] px-2 py-[7px]">
      <div className="text-[19px] font-semibold leading-[22px]" style={{ color: accent ? GOLD : 'var(--cobalt-soft, #7FA9F5)' }}>{n}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.6px] text-[var(--fg-3)]">{l}</div>
    </div>
  )
}
