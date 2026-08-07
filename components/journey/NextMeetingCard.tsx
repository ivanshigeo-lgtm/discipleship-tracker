'use client'

// "Next meeting" on My Journey home: the single NEXT gathering — the earliest
// upcoming occurrence of the viewer's Grace Groups (multi-day schedules, with
// per-occurrence cancel/reschedule overrides applied) or their own pending
// 1:1s, whichever comes first. The full week strip (WeekMeetings) stays on
// coach surfaces; the home page asks for one date, not a calendar. Renders
// nothing while loading or when nothing is coming up.

import { useEffect, useMemo, useState } from 'react'
import { getWeekEngagementsForPerson, getGroupMeetingStatuses } from '../../lib/supabaseQueries'
import { daysOf, occurrencesWithin } from '../../lib/meetingDays'
import type { Engagement, VictoryGroup, GroupMeetingStatus } from '../../types/database'

type NextItem = {
  kind: 'group' | 'one-on-one'
  title: string
  date: string // local YYYY-MM-DD (post-reschedule for groups)
  time: string | null
  rescheduled: boolean
}

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayLabel = (dateStr: string) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return d.toLocaleDateString(undefined, { weekday: 'long' })
}

export default function NextMeetingCard({ personId, groups }: { personId: string; groups: VictoryGroup[] }) {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [statuses, setStatuses] = useState<GroupMeetingStatus[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const until = new Date(today); until.setDate(today.getDate() + 7)
    Promise.all([
      getWeekEngagementsForPerson(personId, toLocalDateStr(today), toLocalDateStr(until)),
      groups.length ? getGroupMeetingStatuses() : Promise.resolve({ data: [] as GroupMeetingStatus[], error: null }),
    ]).then(([engRes, stRes]) => {
      if (!alive) return
      if (engRes.data) setEngagements(engRes.data as Engagement[])
      if (stRes.data) setStatuses(stRes.data as GroupMeetingStatus[])
      setReady(true)
    })
    return () => { alive = false }
  }, [personId, groups.length])

  const next = useMemo<NextItem | null>(() => {
    const out: (NextItem & { cancelled: boolean })[] = []
    for (const g of groups) {
      // 6 days ahead covers each weekday exactly once (weekly cadence).
      for (const occ of occurrencesWithin(daysOf(g), 6)) {
        const st = statuses.find(s => s.victory_group_id === g.id && s.meeting_date === occ) ?? null
        const rescheduled = st?.status === 'rescheduled'
        out.push({
          kind: 'group',
          title: g.name,
          date: rescheduled && st?.rescheduled_to ? st.rescheduled_to : occ,
          time: rescheduled ? st?.rescheduled_time ?? null : g.meeting_time,
          rescheduled,
          cancelled: st?.status === 'cancelled',
        })
      }
    }
    for (const e of engagements) {
      if (!e.follow_up_date) continue
      out.push({
        kind: 'one-on-one',
        title: e.description,
        date: e.follow_up_date,
        time: e.follow_up_time,
        rescheduled: false,
        cancelled: false,
      })
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
    return out.find(i => !i.cancelled) ?? null
  }, [groups, statuses, engagements])

  if (!ready || !next) return null

  const d = new Date(next.date + 'T00:00:00')

  return (
    <section className="mt-4">
      <div className="flex items-center gap-4 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[rgba(9,12,26,.55)] p-4">
        {/* date box */}
        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">
            {d.toLocaleDateString(undefined, { month: 'short' })}
          </span>
          <span className="text-xl leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            {d.getDate()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              background: next.kind === 'group' ? 'rgba(167,139,250,.15)' : 'rgba(244,182,80,.15)',
              color: next.kind === 'group' ? '#A78BFA' : '#F4B650',
            }}
          >
            {next.kind === 'group' ? 'Group' : '1-on-1'}
          </span>
          <p className="mt-1 truncate text-base font-medium text-[var(--fg-1)]">{next.title}</p>
          <p className="text-xs text-[var(--fg-2)]">
            <span className={dayLabel(next.date) === 'Today' ? 'font-semibold text-[var(--fg-1)]' : ''}>{dayLabel(next.date)}</span>
            {next.time && <span className="text-[var(--fg-3)]"> · {next.time.slice(0, 5)}</span>}
            {next.rescheduled && <span style={{ color: '#A78BFA' }}> · rescheduled</span>}
          </p>
        </div>
      </div>
    </section>
  )
}
