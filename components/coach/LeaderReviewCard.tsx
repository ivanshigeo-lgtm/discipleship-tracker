'use client'

// Leader Review — the Empower discipleship scorecard, in-app. Web mirror of
// native src/components/coach/leader-review-card.tsx.
//
// The numbers and the rubric come from POST /api/leader-review, which decides
// what this viewer may see BEFORE sending anything (see lib/leaderReview.ts).
// That is the whole reason this card no longer computes anything itself: RLS is
// read-permissive church-wide, so a client that merely declines to render other
// leaders is not a boundary. An admin gets every leader's card and the leader
// selector; every other leader gets the team totals plus their own card only,
// and the rest never reaches the browser.
//
// The one church-wide read kept here is getPeople(), used solely to turn a name
// in the scorecard back into the Person that opens the profile modal.

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getPeople } from '../../lib/supabaseQueries'
import { STAGE_COLORS, ZoneLabel } from './coachModel'
import { CRITERIA, type CriterionKey, type LeaderReviewPayload, type Scorecard, type Verdict } from '../../lib/leaderReview'
import type { Person, Stage } from '../../types/database'

const GOLD = 'var(--gbm-gold, #F2C879)'
const VERDICT_COLOR: Record<Verdict, string> = {
  y: 'var(--good, #6BCB9B)',
  p: 'var(--warn, #E8B54C)',
  n: 'var(--bad, #E8788A)',
}
const VERDICT_WORD: Record<Verdict, string> = { y: 'strong', p: 'forming', n: 'not started' }

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
  const { session } = useAuth()
  const [data, setData] = useState<LeaderReviewPayload | null>(null)
  const [failed, setFailed] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [subjectId, setSubjectId] = useState(personId)

  const token = session?.access_token

  useEffect(() => {
    if (!token) return
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/leader-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token }),
        })
        if (!alive) return
        if (!res.ok) { setFailed(true); return }
        setData(await res.json())
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => { alive = false }
  }, [token, refreshKey])

  // names → Person, only so tapping someone still opens their profile
  useEffect(() => {
    let alive = true
    getPeople().then(({ data: pp }) => { if (alive && pp) setPeople(pp as Person[]) })
    return () => { alive = false }
  }, [refreshKey])
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const openById = (id: string) => { const p = byId.get(id); if (p) onPersonClick(p) }

  const team = data?.team ?? null
  const subject: Scorecard | null = useMemo(() => {
    if (!data) return null
    if (team) return team.find((s) => s.id === subjectId) ?? data.you ?? team[0] ?? null
    return data.you
  }, [data, team, subjectId])

  if (failed || !data) return null
  const c = data.consolidated

  return (
    <section className="mb-6">
      <ZoneLabel label="Leader review" />
      <div className="cn-card p-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="text-[12px] leading-[17px] text-[var(--fg-2)]">
          The discipleship rhythm, measured: <b>engage</b> people One2One, <b>establish</b> them in a group and the
          SOAP habit, <b>equip</b> the next generation, and <b>multiply</b> — the day someone you disciple takes
          another person through their own One2One.
        </p>

        {/* ── consolidated team numbers — the same for everyone on the team ── */}
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-[var(--line-1)] bg-[var(--line-1)] sm:grid-cols-6">
          <Band n={c.leaders} l="Leaders" tip="Everyone at the Empower stage. Reaching Empower adds a scorecard automatically." />
          <Band n={c.uniquePeopleInRhythm} l="In weekly rhythm" tip={`Unique people across the ${c.totalGroups} groups these leaders own, counted once even if they are in several — ${c.totalSeats} total seats, so ${c.totalSeats - c.uniquePeopleInRhythm} are repeats.`} />
          <Band n={c.totalGroups} l="Groups" tip="Groups whose owner is one of the leaders. A co-led group counts once, for its owner." />
          <Band n={c.totalReleased} l="Released" tip="Direct disciples now at Empower, added up across all leaders. Someone released by two leaders counts twice." />
          <Band n={c.microsites} l="Microsites" tip="Groups grown past 15 members — big enough to plant a microsite." />
          <Band n={c.metThisWeek} l="Met this week" tip="Since Sunday 00:00 — NOT a rolling 7 days. It grows through the week and resets Sunday. Counts a person once whether they were met in a group or a completed One2One." />
        </div>

        {/* ── admin only: every leader, scored ── */}
        {team && team.length > 0 && (
          <>
            <Divider />
            <SectionHead>The scorecard</SectionHead>
            <p className="text-[11.5px] leading-[16px] text-[var(--fg-3)]">
              One row per leader, one column per part of the rhythm. Tap a name to see their detail below.
            </p>
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full border-collapse text-left" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th className="pb-2 pr-2 text-[9px] font-semibold uppercase tracking-[0.6px] text-[var(--fg-3)]">Leader</th>
                    {CRITERIA.map((cr) => (
                      <th key={cr.key} className="pb-2 text-center text-[9px] font-semibold uppercase tracking-[0.6px] text-[var(--fg-3)]" title={cr.tip}>
                        {cr.label}
                      </th>
                    ))}
                    <th className="pb-2 pl-2 text-right text-[9px] font-semibold uppercase tracking-[0.6px] text-[var(--fg-3)]">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSubjectId(s.id)}
                      className="cursor-pointer border-t border-[var(--line-1)] hover:bg-[var(--indigo)]"
                      style={s.id === subject?.id ? { background: 'var(--indigo)' } : undefined}
                    >
                      <td className="py-[7px] pr-2 text-[12.5px] font-medium text-[var(--fg-1)]">
                        {s.isSelf ? 'You' : s.name}
                      </td>
                      {CRITERIA.map((cr) => (
                        <td key={cr.key} className="py-[7px] text-center">
                          <Dot v={s.verdicts[cr.key]} />
                        </td>
                      ))}
                      <td className="py-[7px] pl-2 text-right text-[12px] font-semibold tabular-nums text-[var(--fg-1)]">{s.score}/6</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Legend />
          </>
        )}

        {/* ── the scorecard detail: your own, or the selected leader ── */}
        {subject && (
          <>
            <Divider />
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-[17px] leading-[21px] text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                {subject.isSelf ? 'Your scorecard' : subject.name}
              </h4>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--fg-1)]">{subject.score}/6</span>
            </div>

            {/* "Weekly reach" is deliberately not a tile: it matched "in a group"
                for 6 of 10 leaders. It lives in that tile's tooltip instead, and
                the slot went to the number nobody could see — who has no group. */}
            <div className="flex flex-wrap gap-2">
              <Stat n={subject.stats.groupsLed} l={subject.stats.groupsLed === 1 ? 'Group led' : 'Groups led'} tip="Groups where this leader is the recorded owner." />
              <Stat n={subject.stats.peopleInGroups} l="In a group" tip={`Unique people across their groups, not counting themselves. Their full weekly reach, including anyone they meet One2One outside a group, is ${subject.stats.weeklyReach}.`} />
              <Stat n={subject.notInRhythm.length} l="Not in a group" accent={subject.notInRhythm.length > 0} tip="People they disciple directly who are not in any of their weekly groups — the coverage gap." />
              <Stat n={subject.stats.constellation} l="Discipling" tip="People linked to them as direct disciples. One level only — their disciples' disciples are not counted." />
              <Stat n={subject.stats.oneOnOnesNext7} l="1:1 next 7d" tip="One2Ones they created, scheduled from today through the next 7 days and not cancelled. Forward-looking — a plan, not attendance." />
              <Stat n={subject.stats.metThisWeek} l="Met this week" tip="Their slice of the church-wide number: people met since Sunday in their own groups or a One2One they ran." />
            </div>

            {/* the six-part read */}
            <div className="flex flex-col gap-[6px]">
              {CRITERIA.map((cr) => (
                <div key={cr.key} className="flex items-start gap-2" title={cr.tip}>
                  <span className="mt-[5px] shrink-0"><Dot v={subject.verdicts[cr.key]} /></span>
                  <span className="w-[74px] shrink-0 text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--fg-2)]">{cr.label}</span>
                  <span className="flex-1 text-[11.5px] leading-[17px] text-[var(--fg-3)]">{criterionLine(cr.key, subject)}</span>
                </div>
              ))}
            </div>

            <WeekStrip strip={subject.weekStrip} />

            {subject.flags.length > 0 && (
              <>
                <Divider />
                <SectionHead>Worth talking about</SectionHead>
                <div className="flex flex-col gap-[7px]">
                  {subject.flags.map((f, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-[1px] text-[10px] leading-[18px]" style={{ color: GOLD }}>✦</span>
                      <span className="flex-1 text-[12.5px] leading-[18px] text-[var(--fg-1)]">{f}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {subject.nextSteps.length > 0 && (
              <>
                <Divider />
                <SectionHead>What would move a light to green</SectionHead>
                <ul className="flex list-none flex-col gap-[6px]">
                  {subject.nextSteps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px] leading-[18px] text-[var(--fg-1)]">
                      <span className="mt-[6px] h-[4px] w-[4px] shrink-0 rounded-full" style={{ background: 'var(--fg-3)' }} />
                      <span className="flex-1">{s}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Divider />
            <SectionHead>Emerging leadership team</SectionHead>
            <div className="flex flex-col gap-2">
              {subject.stages.map((row) => (
                <div key={row.stage} className="flex items-start gap-2">
                  <span className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: STAGE_COLORS[row.stage as Stage] }} />
                  <span className="w-[62px] shrink-0 pt-[2px] text-[8.5px] font-semibold uppercase tracking-[0.6px]" style={{ color: STAGE_COLORS[row.stage as Stage] }}>{row.stage}</span>
                  <div className="flex flex-1 flex-wrap">
                    {row.people.length === 0 ? (
                      <span className="text-[13px] italic text-[var(--fg-3)]" style={{ fontFamily: 'var(--font-display)' }}>
                        {row.stage === 'Equip' ? 'No one being equipped yet — this is the row the next leaders come from.' : 'No one here yet.'}
                      </span>
                    ) : (
                      row.people.map((pp, idx) => (
                        <span
                          key={pp.id}
                          className="cursor-pointer text-[12.5px] font-medium leading-[18px] text-[var(--fg-1)] hover:underline"
                          onClick={() => openById(pp.id)}
                        >
                          {pp.name}
                          {pp.since ? <span className="text-[11px] font-normal text-[var(--fg-3)]"> (since {pp.since})</span> : null}
                          {idx < row.people.length - 1 ? <span className="text-[var(--fg-3)]">, </span> : null}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── where the team turns next ── */}
        <Divider />
        <SectionHead>Where the team turns next</SectionHead>
        {data.teamDetail ? (
          <div className="flex flex-col gap-[7px] text-[12.5px] leading-[18px] text-[var(--fg-1)]">
            <TeamLine label="Ready to multiply" tone="good">
              {data.teamDetail.readyToMultiply.length
                ? data.teamDetail.readyToMultiply.map((r) => `${r.leader} (${r.names.join(', ')})`).join(' · ')
                : 'No emerging leader is running their own One2One yet.'}
            </TeamLine>
            <TeamLine label="No emerging leader yet" tone="bad">
              {data.teamDetail.noMultiply.join(', ') || '—'}
            </TeamLine>
            <TeamLine label="No one being equipped" tone="bad">
              {data.teamDetail.noEquipBench.join(', ') || '—'}
            </TeamLine>
            <TeamLine label="Groups under 6" tone="warn">
              {data.teamDetail.groupsUnder6.map((g) => `${g.leader}: ${g.group} (${g.count})`).join(' · ') || '—'}
            </TeamLine>
            <TeamLine label="Microsite candidates" tone="good">
              {data.teamDetail.micrositeCandidates.map((g) => `${g.leader}: ${g.group} (${g.count})`).join(' · ') || 'None yet'}
            </TeamLine>
          </div>
        ) : (
          // Counts only — no other leader is named for a non-admin.
          <div className="flex flex-col gap-[7px] text-[12.5px] leading-[18px] text-[var(--fg-1)]">
            <TeamLine label="Leaders with no emerging leader yet" tone="bad">{String(c.teamGaps.noMultiply)} of {c.leaders}</TeamLine>
            <TeamLine label="Leaders with no one being equipped" tone="bad">{String(c.teamGaps.noEquipBench)} of {c.leaders}</TeamLine>
            <TeamLine label="Groups still under 6" tone="warn">{String(c.teamGaps.groupsUnder6)}</TeamLine>
            <TeamLine label="Leaders whose people are doing SOAPs" tone="good">{String(c.teamGaps.soapActive)} of {c.leaders}</TeamLine>
          </div>
        )}

        <p className="text-[10.5px] leading-[15px] text-[var(--fg-3)]">
          Live from the app · {c.weekOf}
          {!data.viewer.isAdmin && ' · team totals are church-wide; the scorecard is your own'}
        </p>
      </div>
    </section>
  )
}

// ── one line of plain English per criterion, so a dot is never unexplained ──
function criterionLine(key: CriterionKey, s: Scorecard): string {
  switch (key) {
    case 'engage':
      return s.stats.oneOnOnesNext7 > 0
        ? `${s.stats.oneOnOnesNext7} One2One${s.stats.oneOnOnesNext7 === 1 ? '' : 's'} booked in the next 7 days.`
        : s.movements.length > 0
          ? `Nothing booked, but ${s.movements.length} stage move${s.movements.length === 1 ? '' : 's'} driven in the last 6 weeks.`
          : 'No One2One booked and no stage moves in the last 6 weeks.'
    case 'establish': {
      const g6 = s.groups.filter((g) => g.count >= 6).length
      const soap = s.soap.doersCount > 0 ? `${s.soap.doersCount} doing SOAPs` : 'no SOAP activity yet'
      return `${s.stats.peopleInGroups} across ${s.groups.length} group${s.groups.length === 1 ? '' : 's'}${g6 ? `, ${g6} at 6+` : ''} · ${soap}.`
    }
    case 'group': {
      const biggest = s.groups.length ? Math.max(...s.groups.map((g) => g.count)) : 0
      if (biggest > 15) return `Biggest group ${biggest} — a microsite candidate.`
      if (biggest >= 6) return `Biggest group ${biggest} — ready to go through Making Disciples together.`
      if (biggest > 0) return `Biggest group ${biggest} — build toward 6.`
      return 'No group yet.'
    }
    case 'equip':
      return `${s.futureLeaders.equip.length} being equipped${s.futureLeaders.equip.length ? ` (${s.futureLeaders.equip.map((e) => e.name).join(', ')})` : ''}; ${s.futureLeaders.released.length} released to Empower.`
    case 'mentor':
      return `Discipling ${s.stats.constellation} ${s.stats.constellation === 1 ? 'person' : 'people'} directly.`
    case 'multiply':
      return s.emergingOne2One.length
        ? `${s.emergingOne2One.join(', ')} ${s.emergingOne2One.length === 1 ? 'is running their' : 'are running their'} own One2One.`
        : s.emergingRunning.length
          ? `${s.emergingRunning.join(', ')} lead${s.emergingRunning.length === 1 ? 's' : ''} something, but no One2One of their own yet.`
          : 'No one they disciple is multiplying yet.'
  }
}

function WeekStrip({ strip }: { strip: Scorecard['weekStrip'] }) {
  const total = strip.reduce((n, d) => n + d.count, 0)
  if (total === 0) return null
  return (
    <>
      <Divider />
      <SectionHead>This week</SectionHead>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {strip.map((d) => (
          <div
            key={d.date}
            className="min-w-[112px] flex-1 rounded-[10px] border p-2"
            style={{
              borderColor: d.isToday ? 'rgba(232,181,76,.5)' : 'var(--line-1)',
              background: 'var(--indigo)',
            }}
          >
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-[0.6px] text-[var(--fg-3)]">{d.dow} {d.num}</span>
              {d.count > 0 && <span className="text-[10px] font-semibold tabular-nums" style={{ color: GOLD }}>{d.count}</span>}
            </div>
            {d.count === 0 ? (
              <span className="text-[11px] text-[var(--fg-3)]">—</span>
            ) : (
              <div className="flex flex-col gap-[3px]">
                {d.entries.slice(0, 5).map((e, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="mt-[5px] h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: STAGE_COLORS[e.stage as Stage] }} />
                    <span className="flex-1 text-[11px] leading-[15px] text-[var(--fg-1)]">
                      {e.person}
                      <span className="block text-[9.5px] leading-[13px] text-[var(--fg-3)]">{e.kind === '1on1' ? '1:1' : e.with}</span>
                    </span>
                  </div>
                ))}
                {d.entries.length > 5 && (
                  <span className="text-[10px] font-semibold" style={{ color: GOLD }}>+{d.entries.length - 5} more</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

function Dot({ v }: { v: Verdict }) {
  return (
    <span
      className="inline-block h-[9px] w-[9px] rounded-full align-middle"
      style={{ background: VERDICT_COLOR[v] }}
      aria-label={VERDICT_WORD[v]}
      title={VERDICT_WORD[v]}
    />
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-[var(--fg-3)]">
      <span className="flex items-center gap-1.5"><Dot v="y" /> Strong — happening now</span>
      <span className="flex items-center gap-1.5"><Dot v="p" /> Forming — partway there</span>
      <span className="flex items-center gap-1.5"><Dot v="n" /> Not started yet</span>
    </div>
  )
}

function Band({ n, l, tip }: { n: number; l: string; tip: string }) {
  return (
    <div className="bg-[var(--indigo)] px-2 py-[10px] text-center" title={tip}>
      <div className="text-[19px] font-semibold leading-[22px]" style={{ color: GOLD }}>{n}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.6px] text-[var(--fg-3)]">{l}</div>
    </div>
  )
}

function Stat({ n, l, tip, accent }: { n: number; l: string; tip: string; accent?: boolean }) {
  return (
    <div className="min-w-[86px] flex-1 rounded-[10px] border border-[var(--line-1)] bg-[var(--indigo)] px-2 py-[7px]" title={tip}>
      <div className="text-[19px] font-semibold leading-[22px]" style={{ color: accent ? GOLD : 'var(--cobalt-soft, #7FA9F5)' }}>{n}</div>
      <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.6px] text-[var(--fg-3)]">{l}</div>
    </div>
  )
}

function TeamLine({ label, tone, children }: { label: string; tone: 'good' | 'warn' | 'bad'; children: React.ReactNode }) {
  const color = tone === 'good' ? VERDICT_COLOR.y : tone === 'warn' ? VERDICT_COLOR.p : VERDICT_COLOR.n
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[6px] h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: color }} />
      <span className="flex-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-[var(--fg-3)]">{label}</span>
        <span className="block text-[12.5px] leading-[18px] text-[var(--fg-1)]">{children}</span>
      </span>
    </div>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-px text-[10.5px] font-semibold uppercase tracking-[1.5px] text-[var(--fg-3)]">{children}</h4>
}

function Divider() {
  return <div className="h-px bg-[var(--line-1)]" />
}
