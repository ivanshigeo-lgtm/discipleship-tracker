// The Empower Leader Review scorecard — one implementation, shared by the web
// card and (over /api/leader-review) the native card, so the rubric can never
// drift between platforms.
//
// This is the in-app port of the generator scripts that produced the Aug-11
// scorecard artifact (_elr_data.mjs + the score() in _elr_artifact.mjs). Two
// deliberate changes from those scripts:
//
//   1. The leader team is DERIVED, not a hardcoded list of ten person IDs.
//      Anyone whose current_stage is 'Empower' is on the team, so reaching
//      Empower in the app earns a scorecard without anyone editing code.
//   2. Permission filtering happens HERE, next to the math (see buildPayload).
//      RLS is still read-permissive church-wide, so a leader seeing only their
//      own scorecard has to be enforced where the data is assembled — not by
//      hiding UI, which any client could ignore.
//
// A leader's "constellation" is their DIRECT disciples, one level of
// discipleship_connections. That is what the rubric's "Mentor ≥3" counts, and
// it differs from the transitive downline the old review card used.

import type {
  DiscipleshipConnection,
  Engagement,
  PipelineEvent,
  Person,
  Stage,
  VictoryGroup,
} from '../types/database'

// ── row shapes we read but that have no exported type ──
export type Membership = { person_id: string; victory_group_id: string; status?: string | null }
export type Attendance = {
  person_id: string
  victory_group_id: string
  meeting_date: string
  attended: boolean
}
export type SoapVisibility = {
  isoap_entry_id: string
  wc_person_id: string | null
  journal_date: string | null
}
export type SoapLink = { wc_person_id: string | null }
export type GroupMeetingStatus = {
  victory_group_id: string
  meeting_date: string
  status: string | null
  rescheduled_to: string | null
}

export type LeaderReviewRows = {
  people: Person[]
  groups: VictoryGroup[]
  memberships: Membership[]
  connections: DiscipleshipConnection[]
  engagements: Engagement[]
  pipelineEvents: PipelineEvent[]
  attendance: Attendance[]
  soapVisibility: SoapVisibility[]
  soapLinks: SoapLink[]
  meetingStatuses: GroupMeetingStatus[]
}

// ── rubric ──
export type Verdict = 'y' | 'p' | 'n'
export type CriterionKey = 'engage' | 'establish' | 'group' | 'equip' | 'mentor' | 'multiply'

export const CRITERIA: { key: CriterionKey; label: string; sub: string; tip: string }[] = [
  {
    key: 'engage',
    label: 'Engage',
    sub: '1:1 booked',
    tip: 'Green when a 1:1 is on the calendar in the next 7 days — any meeting with one other person, whatever type it is labelled. Amber when none is booked but they have driven someone forward a stage in the last 6 weeks.',
  },
  {
    key: 'establish',
    label: 'Establish',
    sub: 'group + SOAP',
    tip: 'Green needs both: a group of 6 or more, and at least one person in it doing SOAPs visible in WikiChurch. Amber when people are gathered but one half is missing.',
  },
  {
    key: 'group',
    label: 'Group',
    sub: '6 → 15 → microsite',
    tip: 'Measured on their biggest group. 6+ is green — big enough to go through Making Disciples together. Past 15 it becomes a microsite candidate. Amber while it is still forming under 6.',
  },
  {
    key: 'equip',
    label: 'Equip',
    sub: 'raise next leaders',
    tip: 'Green when they have someone at Equip now AND have already released someone to Empower. Amber with one but not the other.',
  },
  {
    key: 'mentor',
    label: 'Mentor ≥3',
    sub: 'discipling 3+',
    tip: 'Green when at least 3 people are linked to them as direct disciples. One level only — their disciples’ disciples are not counted.',
  },
  {
    key: 'multiply',
    label: 'Multiply',
    sub: 'emerging leader runs their own 1:1',
    tip: 'The biggest win. Green when someone they disciple is running their OWN 1:1 with someone else. Amber when an emerging leader leads a group or disciples someone but has not run a 1:1 yet.',
  },
]

export type Scorecard = {
  id: string
  name: string
  first: string
  stage: Stage
  isSelf: boolean
  onTeam: boolean
  stats: {
    groupsLed: number
    peopleInGroups: number
    metThisWeek: number
    oneOnOnesNext7: number
    weeklyReach: number
    constellation: number
  }
  verdicts: Record<CriterionKey, Verdict>
  score: number
  groups: { id: string; name: string; day: string | null; count: number }[]
  stages: {
    stage: Stage
    people: { id: string; name: string; since: string | null; inStage: string | null; inRhythm: boolean }[]
  }[]
  futureLeaders: { equip: { name: string; inStage: string | null }[]; released: { name: string }[] }
  notInRhythm: string[]
  upcoming: { personId: string; person: string; date: string; time: string | null; location: string | null; kind: string | null }[]
  flags: string[]
  nextSteps: string[]
  soap: { ownEntries: number; poolSize: number; doersCount: number; doers: { name: string; entries: number }[] }
  emergingRuns1on1: string[]
  emergingRunning: string[]
  weekStrip: {
    date: string
    dow: string
    num: number
    isToday: boolean
    count: number
    entries: { person: string; stage: Stage; kind: 'group' | '1on1'; with: string | null }[]
    // groups whose attendance was taken and nobody came — shown greyed, counted zero
    noMeetings: { group: string; roster: number }[]
  }[]
  movements: { name: string; to: Stage; dateMD: string }[]
}

export type Consolidated = {
  weekOf: string
  generatedAt: string
  leaders: number
  uniquePeopleInRhythm: number
  totalSeats: number
  totalGroups: number
  totalReleased: number
  microsites: number
  metThisWeek: number
  // Counts only — no leader is ever named here, so this block is safe to show
  // to every leader on the team.
  teamGaps: {
    noEquipBench: number
    groupsUnder6: number
    noMultiply: number
    soapActive: number
  }
}

export type LeaderReviewPayload = {
  consolidated: Consolidated
  // The viewer's own scorecard. Present for any coach, whether or not they are
  // on the Empower team — a coach who is not yet Empower still gets to see how
  // they are tracking against the rhythm.
  you: Scorecard | null
  // Every leader's scorecard, ordered by weekly reach. ADMIN ONLY — omitted
  // entirely for everyone else rather than sent and hidden.
  team: Scorecard[] | null
  // Named team gaps. ADMIN ONLY, for the same reason.
  teamDetail: {
    readyToMultiply: { leader: string; names: string[] }[]
    noMultiply: string[]
    micrositeCandidates: { leader: string; group: string; count: number }[]
    noEquipBench: string[]
    groupsUnder6: { leader: string; group: string; count: number }[]
  } | null
  viewer: { id: string; isAdmin: boolean; onTeam: boolean }
}

// ── date helpers (local-time, Sunday-anchored to match the rest of the briefing) ──
const pad = (n: number) => String(n).padStart(2, '0')
export const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const fmtMD = (iso: string) => {
  const d = new Date(iso)
  return `${MON[d.getMonth()]} ${d.getDate()}`
}
const fmtDur = (days: number | null): string | null => {
  if (days == null) return null
  if (days < 31) return `${days}d`
  const mo = Math.round(days / 30.44)
  if (mo < 12) return `${mo}mo`
  const y = days / 365.25
  return `${y.toFixed(y < 10 ? 1 : 0)}yr`
}
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()
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

const STAGE_ORDER: Stage[] = ['Empower', 'Equip', 'Establish', 'Engage']

/**
 * Build the whole review, then hand back only the slice this viewer may see.
 *
 * `viewerIsTest` mirrors the app's test-viewer context: the App Review demo rig
 * (claude.tester and its fictional downline) is hidden from real viewers and
 * visible to itself, so the two never contaminate each other's numbers.
 */
export function buildLeaderReview(
  rows: LeaderReviewRows,
  viewer: { id: string; isAdmin: boolean; isTest: boolean },
): LeaderReviewPayload {
  const { people, groups, memberships, connections, engagements, pipelineEvents, attendance } = rows

  const byId = new Map(people.map((p) => [p.id, p]))
  const visible = (p: Person | undefined): p is Person =>
    !!p && p.status !== 'Inactive' && (viewer.isTest ? true : p.is_test !== true)

  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayStr = toLocalDateStr(today)
  const sunday = new Date(today)
  sunday.setDate(sunday.getDate() - sunday.getDay())
  const sundayStr = toLocalDateStr(sunday)
  // Both ends of the upcoming window are inclusive, so today + 6 is seven days
  // counting today — "next 7 days" on the tile used to reach eight.
  const in7 = new Date(today)
  in7.setDate(in7.getDate() + 6)
  const in7Str = toLocalDateStr(in7)
  const sixWeeksAgo = new Date(today)
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42)

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(sunday)
    dt.setDate(sunday.getDate() + i)
    return toLocalDateStr(dt)
  })

  // group occurrences cancelled or moved off a date, and ones moved onto one
  const statusByKey = new Map(rows.meetingStatuses.map((s) => [`${s.victory_group_id}|${s.meeting_date}`, s]))
  const reschedIntoDate = new Map<string, GroupMeetingStatus[]>()
  for (const s of rows.meetingStatuses) {
    if (s.status === 'rescheduled' && s.rescheduled_to) {
      const l = reschedIntoDate.get(s.rescheduled_to) ?? []
      l.push(s)
      reschedIntoDate.set(s.rescheduled_to, l)
    }
  }

  const activeMemberships = memberships.filter((m) => m.status !== 'Inactive' && m.status !== 'removed')

  // ── SOAP: entries a person has made visible in WikiChurch. NOT private iSOAP
  //    journaling, which lives in a separate database we cannot read from here.
  const soapEntries = new Map<string, Set<string>>()
  for (const v of rows.soapVisibility) {
    if (!v.wc_person_id) continue
    if (!soapEntries.has(v.wc_person_id)) soapEntries.set(v.wc_person_id, new Set())
    soapEntries.get(v.wc_person_id)!.add(v.isoap_entry_id)
  }
  const soapCount = (pid: string) => soapEntries.get(pid)?.size ?? 0

  // ── multiplication signals: is this person themselves leading anything? ──
  const ownsGroup = new Set(groups.map((g) => g.owner_person_id).filter(Boolean) as string[])
  // a 1:1 is any meeting with exactly one other person — One2One, Making
  // Disciples, Coffee, Church Community, Empowering Leaders, SOAP or untyped.
  // Every engagement row IS such a meeting, so the label never matters here.
  const runs1on1 = new Map<string, number>()
  for (const e of engagements) {
    if (e.created_by_person_id) {
      runs1on1.set(e.created_by_person_id, (runs1on1.get(e.created_by_person_id) ?? 0) + 1)
    }
  }
  const disciplesOf = new Map<string, Set<string>>()
  for (const c of connections) {
    if (!c.discipler_person_id || !c.disciple_person_id) continue
    if (!disciplesOf.has(c.discipler_person_id)) disciplesOf.set(c.discipler_person_id, new Set())
    disciplesOf.get(c.discipler_person_id)!.add(c.disciple_person_id)
  }

  const enteredStage = (id: string, stage: Stage): string | null => {
    const ev = pipelineEvents
      .filter((e) => e.person_id === id && e.to_stage === stage)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0]
    return ev ? ev.created_at : null
  }
  const daysInStage = (id: string, stage: Stage): number | null => {
    const iso = enteredStage(id, stage)
    if (!iso) return null
    return Math.floor((now.getTime() - new Date(iso).getTime()) / 864e5)
  }
  // only surfaced while it is still recent news
  const stageSince = (id: string, stage: Stage): string | null => {
    const iso = enteredStage(id, stage)
    if (!iso) return null
    if (now.getTime() - new Date(iso).getTime() > 45 * 864e5) return null
    return fmtMD(iso)
  }

  // church-wide median time spent in a stage before advancing — the yardstick
  // for calling someone "stalled" without inventing an arbitrary threshold
  const stageMedians: Partial<Record<Stage, number | null>> = (() => {
    const bucket: Record<string, number[]> = { Engage: [], Establish: [], Equip: [] }
    const byPerson = new Map<string, PipelineEvent[]>()
    for (const e of pipelineEvents) {
      if (!byPerson.has(e.person_id)) byPerson.set(e.person_id, [])
      byPerson.get(e.person_id)!.push(e)
    }
    for (const [pid, evs] of byPerson) {
      if (!visible(byId.get(pid))) continue
      evs.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      for (let i = 0; i < evs.length - 1; i++) {
        const s = evs[i].to_stage
        if (!bucket[s]) continue
        const d = Math.floor((+new Date(evs[i + 1].created_at) - +new Date(evs[i].created_at)) / 864e5)
        if (d >= 0 && d < 3650) bucket[s].push(d)
      }
    }
    const med = (a: number[]) => {
      if (!a.length) return null
      const s = a.slice().sort((x, y) => x - y)
      const m = Math.floor(s.length / 2)
      return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
    }
    return { Engage: med(bucket.Engage), Establish: med(bucket.Establish), Equip: med(bucket.Equip) }
  })()

  // pipeline movements over the last 6 weeks, attributed to whoever disciples
  // the person who moved
  const disciplerOf = new Map<string, string>()
  for (const c of connections) {
    if (c.disciple_person_id && !disciplerOf.has(c.disciple_person_id)) {
      disciplerOf.set(c.disciple_person_id, c.discipler_person_id)
    }
  }

  // ── the Empower team: derived from the data, not a hardcoded list ──
  const teamIds = people
    .filter((p) => p.current_stage === 'Empower' && visible(p))
    .map((p) => p.id)

  // Church-wide roll-ups accumulate across the TEAM only, so the headline
  // numbers describe the Empower team's rhythm rather than the whole church.
  const inRhythmAll = new Set<string>()
  const metAll = new Set<string>()
  let totalGroups = 0
  let totalSeats = 0

  function buildScorecard(lid: string, opts: { countTowardTotals: boolean }): Scorecard | null {
    const L = byId.get(lid)
    if (!L) return null
    const first = firstName(L.name)
    const isSelf = lid === viewer.id

    // direct disciples, one level
    const directIds = [...(disciplesOf.get(lid) ?? new Set<string>())]
    const direct = directIds.map((id) => byId.get(id)).filter(visible)

    const ownedAll = groups
      .filter((g) => g.owner_person_id === lid && (viewer.isTest ? true : g.is_test !== true))
      .map((g) => {
        const memberIds = [
          ...new Set(
            activeMemberships
              .filter((m) => m.victory_group_id === g.id && m.person_id && m.person_id !== lid)
              .map((m) => m.person_id),
          ),
        ].filter((pid) => visible(byId.get(pid)))
        const day = g.meeting_day ?? (g.meeting_days?.length ? g.meeting_days.join(' / ') : null)
        return { id: g.id, name: g.name, day, members: memberIds }
      })
      .sort((a, b) => b.members.length - a.members.length)

    // A small group is 3 or more people — the leader plus at least two others.
    // A "group" holding exactly one other person is really a 1:1, and one with
    // nobody on the roster is not a meeting at all. `members` already excludes
    // the leader, so the split is on 2.
    const owned = ownedAll.filter((g) => g.members.length >= 2)
    const pairGroups = ownedAll.filter((g) => g.members.length === 1)

    // Attendance is read for BOTH kinds: a 1:1 that happens to be recorded as a
    // group still means the leader met that person this week.
    const ownedIds = new Set(ownedAll.map((g) => g.id))
    const inGroup = new Set<string>()
    for (const g of owned) for (const pid of g.members) inGroup.add(pid)

    if (opts.countTowardTotals) {
      totalGroups += owned.length
      for (const g of owned) {
        for (const pid of g.members) {
          inRhythmAll.add(pid)
          totalSeats++
        }
      }
    }

    // met this week — group attendance and completed meetings both count, so
    // this means the same thing as the church-wide headline of that name.
    // EVERY meeting type counts as a meeting (One2One, Making Disciples,
    // Empowering Leaders, Coffee, Church Community, untyped) — a leader who sat
    // down with someone met them whatever label the engagement carries.
    const myMeetings = engagements.filter((e) => e.created_by_person_id === lid)
    const met = new Set<string>()
    for (const a of attendance) {
      if (a.attended && ownedIds.has(a.victory_group_id) && a.meeting_date >= sundayStr && a.person_id !== lid && visible(byId.get(a.person_id))) {
        met.add(a.person_id)
        if (opts.countTowardTotals) metAll.add(a.person_id)
      }
    }
    for (const e of myMeetings) {
      // Compare date STRINGS, exactly as the attendance loop above does.
      // `new Date('2026-08-16')` parses as UTC midnight, which in HST (UTC-10)
      // is 14:00 the day BEFORE — so every Sunday meeting landed 10 hours
      // before the week boundary and was silently dropped from the week.
      if (e.status === 'Completed' && e.follow_up_date && e.follow_up_date >= sundayStr && e.person_id !== lid && visible(byId.get(e.person_id))) {
        met.add(e.person_id)
        if (opts.countTowardTotals) metAll.add(e.person_id)
      }
    }

    // ── week strip: Sun→Sat, who they are meeting each day ──
    // Attendance, where it was taken, is the TRUTH — the roster is only a
    // forecast. Without this the strip lists every member of every group
    // scheduled that weekday, so people who were marked absent (and groups that
    // never met at all) still show up as if the leader had seen them.
    const attnByKey = new Map<string, { present: Set<string>; roster: number }>()
    for (const a of attendance) {
      if (!ownedIds.has(a.victory_group_id)) continue
      const key = `${a.victory_group_id}|${a.meeting_date}`
      let rec = attnByKey.get(key)
      if (!rec) {
        rec = { present: new Set(), roster: 0 }
        attnByKey.set(key, rec)
      }
      if (a.person_id === lid) continue // the leader is never their own attendee
      rec.roster++
      if (a.attended) rec.present.add(a.person_id)
    }

    const meetingsByDate = new Map<string, Engagement[]>()
    for (const e of myMeetings) {
      if (!e.follow_up_date || e.status === 'Cancelled') continue
      const l = meetingsByDate.get(e.follow_up_date) ?? []
      l.push(e)
      meetingsByDate.set(e.follow_up_date, l)
    }
    const weekStrip = weekDates.map((dateStr, i) => {
      const dow = DAY_FULL[i]
      const entries: Scorecard['weekStrip'][number]['entries'] = []
      const noMeetings: Scorecard['weekStrip'][number]['noMeetings'] = []

      // one scheduled meeting → either its real attendees, or a "no meeting" note.
      // A roster of one other person is a 1:1, so it is marked as one here too.
      const pushGroup = (g: (typeof ownedAll)[number], label: string) => {
        const kind: 'group' | '1on1' = g.members.length >= 2 ? 'group' : '1on1'
        const att = attnByKey.get(`${g.id}|${dateStr}`)
        if (att) {
          if (att.present.size === 0) {
            noMeetings.push({ group: label, roster: att.roster })
            return
          }
          for (const pid of att.present) {
            const p = byId.get(pid)
            if (!visible(p)) continue
            entries.push({ person: p.name, stage: p.current_stage, kind, with: label })
          }
          return
        }
        // attendance not taken — the roster is the plan, which is all we know
        for (const pid of g.members) {
          const p = byId.get(pid)
          if (!visible(p)) continue
          entries.push({ person: p.name, stage: p.current_stage, kind, with: label })
        }
      }

      for (const g of [...owned, ...pairGroups]) {
        if (!g.day || !g.day.split(' / ').includes(dow)) continue
        const st = statusByKey.get(`${g.id}|${dateStr}`)
        // cancelled, or moved to another date where it shows up instead
        if (st?.status === 'cancelled' || st?.status === 'rescheduled') continue
        pushGroup(g, g.name)
      }
      for (const s of reschedIntoDate.get(dateStr) ?? []) {
        const g = ownedAll.find((x) => x.id === s.victory_group_id)
        if (!g) continue
        pushGroup(g, `${g.name} · rescheduled`)
      }
      for (const e of meetingsByDate.get(dateStr) ?? []) {
        const p = byId.get(e.person_id)
        if (!visible(p) || e.person_id === lid) continue
        // every one of these is a 1:1 — the leader and one other person. The
        // type is only a label, so it is shown but never used to filter.
        entries.push({ person: p.name, stage: p.current_stage, kind: '1on1', with: e.meeting_type ?? null })
      }
      entries.sort((a, b) => a.person.localeCompare(b.person))
      return {
        date: dateStr,
        dow: DOW_SHORT[i],
        num: Number(dateStr.slice(8, 10)),
        isToday: dateStr === todayStr,
        // distinct PEOPLE, so the badge means the same thing as the tiles.
        // Rows stay un-collapsed on purpose — someone in a group and a 1:1 the
        // same day shows twice, so you can see how many meetings they were in.
        count: new Set(entries.map((e) => e.person)).size,
        entries,
        noMeetings,
      }
    })

    // every booked meeting counts, whatever type it carries: a 1:1 is a meeting
    // with one other person, and the label on it says nothing about that
    const upcoming = myMeetings
      .filter((e) => e.follow_up_date && e.follow_up_date >= todayStr && e.follow_up_date <= in7Str && e.status !== 'Cancelled')
      .map((e) => ({
        personId: e.person_id as string,
        person: byId.get(e.person_id)?.name ?? '—',
        date: e.follow_up_date as string,
        time: e.follow_up_time,
        location: e.location,
        kind: e.meeting_type ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const reach = new Set(inGroup)
    for (const e of myMeetings) if (e.person_id && e.person_id !== lid) reach.add(e.person_id)

    const byStage: Record<Stage, Person[]> = { Empower: [], Equip: [], Establish: [], Engage: [] }
    for (const p of direct) (byStage[p.current_stage] ?? byStage.Engage).push(p)
    const nOf = (s: Stage) => byStage[s].length

    const stages = STAGE_ORDER.map((s) => ({
      stage: s,
      people: byStage[s]
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => {
          const dis = daysInStage(p.id, s)
          return {
            id: p.id,
            name: p.name,
            since: stageSince(p.id, s),
            inStage: fmtDur(dis),
            inRhythm: inGroup.has(p.id),
          }
        }),
    }))

    const futureLeaders = {
      equip: byStage.Equip.slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ name: p.name, inStage: fmtDur(daysInStage(p.id, 'Equip')) })),
      released: byStage.Empower.slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ name: p.name })),
    }

    // SOAP habit among the people this leader is establishing
    const pool = [...new Set([...direct.map((p) => p.id), ...inGroup])]
      .map((id) => byId.get(id))
      .filter(visible)
    const doers = pool
      .filter((p) => soapCount(p.id) > 0)
      .map((p) => ({ name: p.name, entries: soapCount(p.id) }))
      .sort((a, b) => b.entries - a.entries)
    const soap = { ownEntries: soapCount(lid), poolSize: pool.length, doersCount: doers.length, doers: doers.slice(0, 8) }

    // emerging leaders: of the people at Equip/Empower under them, who is
    // themselves multiplying?
    const emerging = [...byStage.Equip, ...byStage.Empower].map((p) => {
      const ones = runs1on1.get(p.id) ?? 0
      const disc = disciplesOf.get(p.id)?.size ?? 0
      return { name: p.name, runsOwn1on1: ones > 0, multiplying: ones > 0 || ownsGroup.has(p.id) || disc > 0 }
    })
    const emergingRuns1on1 = emerging.filter((e) => e.runsOwn1on1).map((e) => e.name)
    const emergingRunning = emerging.filter((e) => e.multiplying).map((e) => e.name)

    const movements = pipelineEvents
      .filter(
        (e) =>
          new Date(e.created_at) >= sixWeeksAgo &&
          visible(byId.get(e.person_id)) &&
          disciplerOf.get(e.person_id) === lid,
      )
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .map((e) => ({ name: byId.get(e.person_id)?.name ?? '—', to: e.to_stage, dateMD: fmtMD(e.created_at) }))

    const notInRhythm = direct
      .filter((p) => !inGroup.has(p.id))
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b))

    // ── verdicts ──
    const biggest = owned.length ? Math.max(...owned.map((g) => g.members.length)) : 0
    const groups6 = owned.filter((g) => g.members.length >= 6)
    const teamNames = new Set(teamIds.map((id) => byId.get(id)?.name).filter(Boolean) as string[])
    const disciplesALeader = direct.some((p) => p.name !== L.name && teamNames.has(p.name))

    const verdicts: Record<CriterionKey, Verdict> = {
      engage: upcoming.length > 0 ? 'y' : movements.length > 0 ? 'p' : 'n',
      establish: inGroup.size > 0 ? (groups6.length ? (soap.doersCount > 0 ? 'y' : 'p') : 'p') : 'n',
      group: biggest >= 6 ? 'y' : biggest > 0 ? 'p' : 'n',
      equip:
        futureLeaders.equip.length || futureLeaders.released.length
          ? futureLeaders.equip.length && futureLeaders.released.length
            ? 'y'
            : 'p'
          : 'n',
      mentor: direct.length >= 3 ? 'y' : 'n',
      multiply: emergingRuns1on1.length ? 'y' : emergingRunning.length || disciplesALeader ? 'p' : 'n',
    }
    const score = Object.values(verdicts).filter((v) => v === 'y').length

    // ── worth talking about ──
    const self = isSelf
    const Who = self ? 'You' : first
    const who = self ? 'you' : first
    const whoHave = self ? 'You have' : `${first} has`
    const poss = self ? 'your' : `${first}'s`
    const Poss = self ? 'Your' : `${first}'s`
    const C = direct.length
    const coverageGap = notInRhythm.length

    const flags: string[] = []
    if (owned.length === 0 && myMeetings.length > 0) {
      flags.push(`${Who}${self ? "'re" : ' is'} meeting people one-on-one but ${self ? "don't" : 'doesn’t'} lead a weekly group yet — is one forming?`)
    } else if (owned.length === 0 && C > 0) {
      flags.push(`${C} ${C === 1 ? 'person is' : 'people are'} on ${poss} constellation, but ${who} ${self ? "don't" : 'doesn’t'} lead a weekly group yet — where could they gather?`)
    } else if (coverageGap > 0 && C > 0) {
      flags.push(`${coverageGap} of the ${C} people ${who} ${self ? 'disciple' : 'disciples'} aren’t in any of ${poss} weekly groups — who among them needs a next step?`)
    } else if (C > 0 && owned.length > 0) {
      flags.push(`Every one of ${poss} ${C} people is in a weekly group — full coverage. ✦`)
    }

    const nm = direct.map((p) => ({ p, n: norm(p.name) })).filter((x) => x.n.length > 3)
    outer: for (let i = 0; i < nm.length; i++) {
      for (let j = i + 1; j < nm.length; j++) {
        const a = nm[i], b = nm[j]
        if (a.n === b.n || (Math.abs(a.n.length - b.n.length) <= 2 && lev(a.n, b.n) <= 2)) {
          flags.push(`${Poss} people list both "${a.p.name}" and "${b.p.name}" — likely the same person, worth a merge.`)
          break outer
        }
      }
    }
    for (const g of owned) {
      if (g.members.length === 0) {
        flags.push(`${Poss} ${g.name} group has no members added yet — is it forming, or does the roster need to be added?`)
        break
      }
    }
    for (const g of owned) {
      if (!g.day && g.members.length > 0) {
        flags.push(`${Poss} ${g.name} group has no meeting day set — worth confirming when it meets and adding it.`)
        break
      }
    }
    if (owned.length > 0 && myMeetings.length === 0) {
      flags.push(`${Poss} weekly rhythm runs entirely through groups — no one-on-ones logged. Who’s next for a one-on-one?`)
    }
    if (nOf('Establish') >= 3 && nOf('Equip') === 0) {
      flags.push(`${whoHave} a deep Establish bench and no one yet in Equip — who’s ready to be equipped as a leader next?`)
    } else if (nOf('Establish') >= 4 && nOf('Establish') > nOf('Equip') * 3) {
      flags.push(`${nOf('Establish')} people are rooted at Establish behind ${poss} emerging leaders — who’s ready to be equipped next?`)
    }
    for (const s of ['Equip', 'Establish'] as Stage[]) {
      const median = stageMedians[s]
      if (!median) continue
      const slow = byStage[s]
        .map((p) => ({ p, d: daysInStage(p.id, s) }))
        .filter((x) => x.d != null && x.d > median * 2.5)
        .sort((a, b) => (b.d as number) - (a.d as number))[0]
      if (slow) {
        flags.push(`${slow.p.name} has been at ${s} ${fmtDur(slow.d)} — longer than most — a good one to give focused time.`)
        break
      }
    }

    // ── next steps: what would turn an amber light green ──
    const nextSteps: string[] = []
    if (verdicts.engage !== 'y') nextSteps.push('Book a 1:1 with someone new this week.')
    if (biggest > 0 && biggest < 6) nextSteps.push(`Grow the group from ${biggest} toward 6 — the size where you can go through Making Disciples together.`)
    if (owned.length === 0 && C > 0) nextSteps.push('Gather the people you disciple into one weekly group.')
    if (verdicts.equip === 'n') nextSteps.push('Identify someone to begin equipping as a leader.')
    if (futureLeaders.equip.length && !futureLeaders.released.length) nextSteps.push('Release an equipped person to disciple someone of their own.')
    if (verdicts.multiply !== 'y' && (futureLeaders.equip.length || futureLeaders.released.length)) {
      nextSteps.push('Have an emerging leader start their own 1:1 with someone — the biggest win on this card.')
    }
    if (soap.poolSize > 0 && soap.doersCount === 0) nextSteps.push('Get people started on SOAPs — no one in your circle is journaling in WikiChurch yet.')
    if (notInRhythm.length) {
      nextSteps.push(`Find a weekly group for ${notInRhythm.slice(0, 3).join(', ')}${notInRhythm.length > 3 ? ` and ${notInRhythm.length - 3} more` : ''}.`)
    }

    return {
      id: lid,
      name: L.name,
      first,
      stage: L.current_stage,
      isSelf,
      onTeam: teamIds.includes(lid),
      stats: {
        groupsLed: owned.length,
        peopleInGroups: inGroup.size,
        metThisWeek: met.size,
        // distinct PEOPLE, matching the week strip's day badge and the way a
        // leader reads their own week: someone booked three times is one person
        // you are meeting, not three. The list below stays un-collapsed.
        oneOnOnesNext7: new Set(upcoming.map((u) => u.personId)).size,
        weeklyReach: reach.size,
        constellation: direct.length,
      },
      verdicts,
      score,
      groups: owned.map((g) => ({ id: g.id, name: g.name, day: g.day, count: g.members.length })),
      stages,
      futureLeaders,
      notInRhythm,
      upcoming,
      flags: flags.slice(0, 5),
      nextSteps,
      soap,
      emergingRuns1on1,
      emergingRunning,
      weekStrip,
      movements,
    }
  }

  // Build every team member's card first — the church-wide totals are the sum
  // of the team's rhythm, so they must be accumulated before anything is
  // filtered for the viewer.
  const team = teamIds
    .map((id) => buildScorecard(id, { countTowardTotals: true }))
    .filter((s): s is Scorecard => !!s)
    .sort((a, b) => b.stats.weeklyReach - a.stats.weeklyReach)

  // The viewer's own card. If they are on the team it is already built; if not
  // (a coach who has not reached Empower) build it without touching the totals.
  const you = team.find((s) => s.id === viewer.id) ?? buildScorecard(viewer.id, { countTowardTotals: false })

  const totalReleased = team.reduce((n, s) => n + s.futureLeaders.released.length, 0)
  const micrositeList = team.flatMap((s) =>
    s.groups.filter((g) => g.count > 15).map((g) => ({ leader: s.first, group: g.name, count: g.count })),
  )
  const noEquipBench = team.filter((s) => !s.futureLeaders.equip.length && s.stats.peopleInGroups > 0)
  const groupsUnder6 = team.flatMap((s) =>
    s.groups.filter((g) => g.count > 0 && g.count < 6).map((g) => ({ leader: s.first, group: g.name, count: g.count })),
  )
  const noMultiply = team.filter((s) => !s.emergingRuns1on1.length)

  const consolidated: Consolidated = {
    weekOf: `${DAY_FULL[now.getDay()]}, ${MONTH_FULL[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`,
    generatedAt: now.toISOString(),
    leaders: team.length,
    uniquePeopleInRhythm: inRhythmAll.size,
    totalSeats,
    totalGroups,
    totalReleased,
    microsites: micrositeList.length,
    metThisWeek: metAll.size,
    teamGaps: {
      noEquipBench: noEquipBench.length,
      groupsUnder6: groupsUnder6.length,
      noMultiply: noMultiply.length,
      soapActive: team.filter((s) => s.soap.doersCount > 0).length,
    },
  }

  return {
    consolidated,
    you,
    // Everything below names other leaders, so it is built only for an admin.
    team: viewer.isAdmin ? team : null,
    teamDetail: viewer.isAdmin
      ? {
          readyToMultiply: team.filter((s) => s.emergingRuns1on1.length).map((s) => ({ leader: s.first, names: s.emergingRuns1on1 })),
          noMultiply: noMultiply.map((s) => s.first),
          micrositeCandidates: micrositeList,
          noEquipBench: noEquipBench.map((s) => s.first),
          groupsUnder6,
        }
      : null,
    viewer: { id: viewer.id, isAdmin: viewer.isAdmin, onTeam: teamIds.includes(viewer.id) },
  }
}
