'use client'

// "Next meeting" on My Journey home: upcoming gatherings — occurrences of the
// viewer's Grace Groups (multi-day schedules, with per-occurrence
// cancel/reschedule overrides applied) and their own pending 1:1s — shown one
// at a time, soonest first, swipeable to peek at what's after (snap carousel
// with dots; no tap-through — the Engagements panel stays reachable from the
// nav rail). Shows WHO each meeting is with (1:1 heads / group members,
// viewer excluded). Renders nothing while loading or when nothing is coming up.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getWeekEngagementsForPerson,
  getGroupMeetingStatuses,
  getMeetingParticipants,
  getPeopleByVictoryGroup,
  getPeopleNames,
} from '../../lib/supabaseQueries'
import { daysOf, occurrencesWithin } from '../../lib/meetingDays'
import type { Engagement, VictoryGroup, GroupMeetingStatus } from '../../types/database'
import { fmtTime12 } from '../../lib/formatTime'

type MeetingItem = {
  kind: 'group' | 'one-on-one'
  title: string
  date: string // local YYYY-MM-DD (post-reschedule for groups)
  time: string | null
  rescheduled: boolean
  groupId: string | null
  engagementId: string | null
  // subject + creator of a 1:1 (participants come from a separate fetch)
  headIds: string[]
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

// "Leilani Santos & Marcus Chen" / "Leilani Santos, Marcus Chen +2"
const fmtWith = (names: string[]) => {
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names[0]}, ${names[1]} +${names.length - 2}`
}

const itemKey = (m: MeetingItem) => `${m.kind}:${m.groupId ?? m.engagementId}:${m.date}`

export default function NextMeetingCard({
  personId,
  groups,
}: {
  personId: string
  groups: VictoryGroup[]
}) {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [statuses, setStatuses] = useState<GroupMeetingStatus[]>([])
  const [ready, setReady] = useState(false)
  const [idx, setIdx] = useState(0)
  // who-with names per meeting, filled lazily as slides come into view
  const [namesByKey, setNamesByKey] = useState<Record<string, string[]>>({})
  const trackRef = useRef<HTMLDivElement>(null)

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

  const upcoming = useMemo<MeetingItem[]>(() => {
    const out: (MeetingItem & { cancelled: boolean })[] = []
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
          groupId: g.id,
          engagementId: null,
          headIds: [],
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
        groupId: null,
        engagementId: e.id,
        headIds: [e.person_id, e.created_by_person_id].filter((v): v is string => Boolean(v)),
      })
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99').localeCompare(b.time ?? '99'))
    return out.filter(i => !i.cancelled)
  }, [groups, statuses, engagements])

  const current = upcoming[idx] ?? null

  // Who it's with — group members, or a 1:1's heads (subject/creator) plus
  // invited participants; the viewer never lists themselves.
  useEffect(() => {
    if (!current) return
    const key = itemKey(current)
    if (namesByKey[key]) return
    let alive = true
    ;(async () => {
      let names: string[] = []
      if (current.kind === 'group' && current.groupId) {
        const { data } = await getPeopleByVictoryGroup(current.groupId)
        names = ((data as { person_id: string; people: { name: string } | null }[] | null) ?? [])
          .filter(m => m.person_id !== personId)
          // `||` not `??` — rows can carry empty-string names
          .map(m => m.people?.name || '')
          .filter(Boolean)
      } else if (current.engagementId) {
        const { data: parts } = await getMeetingParticipants(current.engagementId)
        const ids = new Set(current.headIds)
        for (const p of (parts as { person_id: string }[] | null) ?? []) {
          if (p.person_id) ids.add(p.person_id)
        }
        ids.delete(personId)
        const { data: people } = await getPeopleNames(Array.from(ids))
        names = (people ?? []).map(p => p.name || '').filter(Boolean)
      }
      if (alive) setNamesByKey(prev => ({ ...prev, [key]: names }))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current ? itemKey(current) : null, personId])

  if (!ready || upcoming.length === 0) return null

  return (
    <section className="mt-4">
      <div className="rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[rgba(9,12,26,.55)]">
        <div
          ref={trackRef}
          onScroll={(e) => {
            const el = e.currentTarget
            const i = Math.round(el.scrollLeft / el.clientWidth)
            if (i !== idx && i >= 0 && i < upcoming.length) setIdx(i)
          }}
          className="flex snap-x snap-mandatory overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {upcoming.map(item => {
            const d = new Date(item.date + 'T00:00:00')
            const withLine = fmtWith(namesByKey[itemKey(item)] ?? [])
            return (
              <div key={itemKey(item)} className="flex w-full shrink-0 snap-center items-center gap-4 p-4">
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
                      background: item.kind === 'group' ? 'rgba(167,139,250,.15)' : 'rgba(244,182,80,.15)',
                      color: item.kind === 'group' ? '#A78BFA' : '#F4B650',
                    }}
                  >
                    {item.kind === 'group' ? 'Group' : '1-on-1'}
                  </span>
                  <p className="mt-1 truncate text-base font-medium text-[var(--fg-1)]">{item.title}</p>
                  {withLine && (
                    <p className="truncate text-xs text-[var(--fg-2)]">
                      With <span className="font-medium text-[var(--fg-1)]">{withLine}</span>
                    </p>
                  )}
                  <p className="text-xs text-[var(--fg-2)]">
                    <span className={dayLabel(item.date) === 'Today' ? 'font-semibold text-[var(--fg-1)]' : ''}>{dayLabel(item.date)}</span>
                    {item.time && <span className="text-[var(--fg-3)]"> · {fmtTime12(item.time)}</span>}
                    {item.rescheduled && <span style={{ color: '#A78BFA' }}> · rescheduled</span>}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        {upcoming.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-3">
            {upcoming.map((item, i) => (
              <button
                key={itemKey(item)}
                type="button"
                aria-label={`Meeting ${i + 1} of ${upcoming.length}`}
                onClick={() => {
                  const el = trackRef.current
                  if (el) el.scrollTo({ left: el.clientWidth * i, behavior: 'smooth' })
                }}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === idx ? 16 : 6,
                  background: i === idx ? '#A78BFA' : 'var(--line-2)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
