'use client'

// "This week" on My Journey home: the viewer's meetings for the next 7 days —
// every occurrence of their Grace Groups (multi-day schedules included, with
// per-occurrence cancel/reschedule overrides applied) merged with their own
// pending 1:1s. Renders nothing while loading or when the week is empty, so
// the hero star stays the page's centerpiece.

import { useEffect, useMemo, useState } from 'react'
import { getWeekEngagementsForPerson, getGroupMeetingStatuses } from '../../lib/supabaseQueries'
import { daysOf, occurrencesWithin } from '../../lib/meetingDays'
import { isCancelledArchived } from '../../lib/meetingStatus'
import type { Engagement, VictoryGroup, GroupMeetingStatus } from '../../types/database'
import { fmtTime12 } from '../../lib/formatTime'

type WeekItem = {
  key: string
  kind: 'group' | 'one-on-one'
  title: string
  date: string // local YYYY-MM-DD (post-reschedule for groups)
  time: string | null
  cancelled: boolean
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
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function WeekMeetings({ personId, groups }: { personId: string; groups: VictoryGroup[] }) {
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

  const items = useMemo(() => {
    const out: WeekItem[] = []
    for (const g of groups) {
      // 6 days ahead covers each weekday exactly once (weekly cadence).
      for (const occ of occurrencesWithin(daysOf(g), 6)) {
        const st = statuses.find(s => s.victory_group_id === g.id && s.meeting_date === occ) ?? null
        const cancelled = st?.status === 'cancelled'
        const rescheduled = st?.status === 'rescheduled'
        if (cancelled && isCancelledArchived(st?.updated_at ?? st?.created_at, occ)) continue
        out.push({
          key: `g-${g.id}-${occ}`,
          kind: 'group',
          title: g.name,
          date: rescheduled && st?.rescheduled_to ? st.rescheduled_to : occ,
          time: rescheduled ? st?.rescheduled_time ?? null : g.meeting_time,
          cancelled,
          rescheduled,
        })
      }
    }
    for (const e of engagements) {
      if (!e.follow_up_date) continue
      out.push({
        key: `e-${e.id}`,
        kind: 'one-on-one',
        title: e.description,
        date: e.follow_up_date,
        time: e.follow_up_time,
        cancelled: false,
        rescheduled: false,
      })
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
    return out
  }, [groups, statuses, engagements])

  if (!ready || items.length === 0) return null

  return (
    <section className="mt-8">
      <p className="cn-label mb-2 text-center" style={{ color: 'var(--fg-3)' }}>This week</p>
      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.key}
            className="flex items-center gap-3 rounded-xl border border-[var(--line-2)] bg-[rgba(9,12,26,.55)] px-3 py-2.5"
            style={{ opacity: item.cancelled ? 0.7 : 1 }}
          >
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: item.kind === 'group' ? 'rgba(167,139,250,.15)' : 'rgba(244,182,80,.15)',
                color: item.kind === 'group' ? '#A78BFA' : '#F4B650',
              }}
            >
              {item.kind === 'group' ? 'Group' : '1-on-1'}
            </span>
            <p className={`min-w-0 flex-1 truncate text-sm font-medium text-[var(--fg-1)] ${item.cancelled ? 'line-through' : ''}`}>
              {item.title}
            </p>
            <p className="shrink-0 text-right text-xs text-[var(--fg-2)]">
              {item.cancelled ? (
                <span style={{ color: '#F0729F' }}>Cancelled</span>
              ) : (
                <>
                  <span className={dayLabel(item.date) === 'Today' ? 'font-semibold text-[var(--fg-1)]' : ''}>{dayLabel(item.date)}</span>
                  {item.time && <span className="text-[var(--fg-3)]"> · {fmtTime12(item.time)}</span>}
                  {item.rescheduled && <span className="block text-[10px]" style={{ color: '#A78BFA' }}>rescheduled</span>}
                </>
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
