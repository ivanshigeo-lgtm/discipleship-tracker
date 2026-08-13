'use client'

// Engagements — a real page (not a popup): every meeting the home card cycles
// through, laid out at once as detailed cards. Group occurrences (with
// reschedule/cancel overrides) and 1:1s, each showing WHO it's with; later
// pending 1:1s and recent past meetings below.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../../contexts/AuthContext'
import LoginPage from '../../../components/LoginPage'
import MeetingInvites from '../../../components/MeetingInvites'
import NewMeetingModal from '../../../components/NewMeetingModal'
import {
  getEngagementsForPerson,
  getGroupsForPerson,
  getGroupMeetingStatuses,
  getMeetingParticipants,
  getPeopleByVictoryGroup,
  getPeopleNames,
} from '../../../lib/supabaseQueries'
import { daysOf, occurrencesWithin } from '../../../lib/meetingDays'
import { Starfield } from '../../../components/journey/StarPrimitives'
import type { Engagement, VictoryGroup, GroupMeetingStatus } from '../../../types/database'
import { fmtTime12 } from '@/lib/formatTime'

type MeetingItem = {
  kind: 'group' | 'one-on-one'
  title: string
  date: string | null // local YYYY-MM-DD (post-reschedule for groups)
  time: string | null
  rescheduled: boolean
  completed: boolean
  groupId: string | null
  engagementId: string | null
  headIds: string[]
  notes: string | null
}

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const dayLabel = (dateStr: string) => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' })
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

// "Leilani Santos & Marcus Chen" / "Leilani Santos, Marcus Chen +2"
const fmtWith = (names: string[]) => {
  if (names.length === 0) return null
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names[0]}, ${names[1]} +${names.length - 2}`
}

const itemKey = (m: MeetingItem) => `${m.kind}:${m.groupId ?? m.engagementId}:${m.date ?? 'undated'}`

function MeetingCard({ item, withLine }: { item: MeetingItem; withLine: string | null }) {
  const d = item.date ? new Date(item.date + 'T00:00:00') : null
  return (
    <div
      className="flex items-center gap-4 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[rgba(9,12,26,.55)] p-4"
      style={item.completed ? { opacity: 0.55 } : undefined}
    >
      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)]">
        {d ? (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">
              {d.toLocaleDateString(undefined, { month: 'short' })}
            </span>
            <span className="text-xl leading-none" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
              {d.getDate()}
            </span>
          </>
        ) : (
          <span className="text-lg text-[var(--fg-3)]">—</span>
        )}
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
        {item.date && (
          <p className="text-xs text-[var(--fg-2)]">
            <span className={dayLabel(item.date) === 'Today' ? 'font-semibold text-[var(--fg-1)]' : ''}>{dayLabel(item.date)}</span>
            {item.time && <span className="text-[var(--fg-3)]"> · {fmtTime12(item.time)}</span>}
            {item.rescheduled && <span style={{ color: '#A78BFA' }}> · rescheduled</span>}
          </p>
        )}
        {item.notes && <p className="mt-1 truncate text-xs text-[var(--fg-3)]">{item.notes}</p>}
      </div>
    </div>
  )
}

export default function EngagementsPage() {
  const { user, profile, loading, profileLoading } = useAuth()
  const router = useRouter()
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [statuses, setStatuses] = useState<GroupMeetingStatus[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [ready, setReady] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [showNewMeeting, setShowNewMeeting] = useState(false)
  const [namesByKey, setNamesByKey] = useState<Record<string, string[]>>({})

  const personId = profile?.id ?? null

  useEffect(() => {
    if (!personId) return
    let alive = true
    Promise.all([
      getGroupsForPerson(personId),
      getGroupMeetingStatuses(),
      getEngagementsForPerson(personId),
    ]).then(([gRes, stRes, engRes]) => {
      if (!alive) return
      const rows = (gRes.data as unknown as { victory_groups: VictoryGroup | null }[] | null) ?? []
      setGroups(rows.map(r => r.victory_groups).filter((g): g is VictoryGroup => Boolean(g)))
      if (stRes.data) setStatuses(stRes.data as GroupMeetingStatus[])
      if (engRes.data) setEngagements(engRes.data as Engagement[])
      setReady(true)
    })
    return () => { alive = false }
  }, [personId, reloadKey])

  const { thisWeek, later, past } = useMemo(() => {
    const week: MeetingItem[] = []
    for (const g of groups) {
      // 6 days ahead covers each weekday exactly once (weekly cadence).
      for (const occ of occurrencesWithin(daysOf(g), 6)) {
        const st = statuses.find(s => s.victory_group_id === g.id && s.meeting_date === occ) ?? null
        if (st?.status === 'cancelled') continue
        const rescheduled = st?.status === 'rescheduled'
        week.push({
          kind: 'group',
          title: g.name,
          date: rescheduled && st?.rescheduled_to ? st.rescheduled_to : occ,
          time: rescheduled ? st?.rescheduled_time ?? null : g.meeting_time,
          rescheduled,
          completed: false,
          groupId: g.id,
          engagementId: null,
          headIds: [],
          notes: null,
        })
      }
    }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 6)
    const todayStr = toLocalDateStr(today)
    const weekEndStr = toLocalDateStr(weekEnd)
    const laterItems: MeetingItem[] = []
    const pastItems: MeetingItem[] = []
    for (const e of engagements) {
      const item: MeetingItem = {
        kind: 'one-on-one',
        title: e.description,
        date: e.follow_up_date,
        time: e.follow_up_time,
        rescheduled: false,
        completed: e.status === 'Completed',
        groupId: null,
        engagementId: e.id,
        headIds: [e.person_id, e.created_by_person_id].filter((v): v is string => Boolean(v)),
        notes: e.notes,
      }
      if (e.status === 'Completed' || (e.follow_up_date && e.follow_up_date < todayStr)) pastItems.push(item)
      else if (e.follow_up_date && e.follow_up_date <= weekEndStr) week.push(item)
      else laterItems.push(item)
    }
    const byWhen = (a: MeetingItem, b: MeetingItem) =>
      (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99')
    week.sort(byWhen)
    laterItems.sort(byWhen)
    pastItems.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return { thisWeek: week, later: laterItems, past: pastItems.slice(0, 6) }
  }, [groups, statuses, engagements])

  // Who each meeting is with — group members / a 1:1's heads + invited
  // participants; the viewer never lists themselves.
  useEffect(() => {
    if (!ready || !personId) return
    let alive = true
    ;(async () => {
      const items = [...thisWeek, ...later, ...past]
      const groupNames: Record<string, string[]> = {}
      const next: Record<string, string[]> = {}
      for (const item of items) {
        const key = itemKey(item)
        if (namesByKey[key]) continue
        if (item.kind === 'group' && item.groupId) {
          if (!groupNames[item.groupId]) {
            const { data } = await getPeopleByVictoryGroup(item.groupId)
            groupNames[item.groupId] = ((data as { person_id: string; people: { name: string } | null }[] | null) ?? [])
              .filter(m => m.person_id !== personId)
              // `||` not `??` — rows can carry empty-string names
              .map(m => m.people?.name || '')
              .filter(Boolean)
          }
          next[key] = groupNames[item.groupId]
        } else if (item.engagementId) {
          const { data: parts } = await getMeetingParticipants(item.engagementId)
          const ids = new Set(item.headIds)
          for (const p of (parts as { person_id: string }[] | null) ?? []) {
            if (p.person_id) ids.add(p.person_id)
          }
          ids.delete(personId)
          if (ids.size === 0) { next[key] = []; continue }
          const { data: people } = await getPeopleNames(Array.from(ids))
          next[key] = (people ?? []).map(p => p.name || '').filter(Boolean)
        }
      }
      if (alive && Object.keys(next).length) setNamesByKey(prev => ({ ...prev, ...next }))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, personId, thisWeek, later, past])

  if (loading || (user && !profile && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--void)]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#F4B650] border-t-transparent" />
      </div>
    )
  }
  if (!user) return <LoginPage />
  if (!profile) return null

  const section = (title: string, items: MeetingItem[]) => items.length > 0 && (
    <section className="mb-7">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--fg-3)]">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(item => (
          <MeetingCard key={itemKey(item)} item={item} withLine={fmtWith(namesByKey[itemKey(item)] ?? [])} />
        ))}
      </div>
    </section>
  )

  return (
    <div className="relative min-h-screen bg-[var(--void)]">
      <div className="pointer-events-none fixed inset-0">
        <Starfield count={50} seed={7} />
      </div>
      <div className="relative mx-auto max-w-3xl px-4 pb-16 pt-6">
        <button
          type="button"
          onClick={() => router.push('/my-journey')}
          className="mb-4 text-sm text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
        >
          ‹ My Journey
        </button>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold" style={{ color: '#F4B650', fontFamily: 'var(--font-display)' }}>
            Engagements
          </h1>
          <button
            type="button"
            onClick={() => setShowNewMeeting(true)}
            className="rounded-full border border-[var(--line-2)] px-3.5 py-1.5 text-xs font-semibold text-[var(--fg-1)] hover:border-[var(--gbm-cobalt-bright)]"
          >
            + New meeting
          </button>
        </div>
        {showNewMeeting && (
          <NewMeetingModal onClose={() => setShowNewMeeting(false)} onCreated={() => setReloadKey(k => k + 1)} />
        )}
        <MeetingInvites personId={profile.id} refreshKey={reloadKey} onChanged={() => setReloadKey(k => k + 1)} />
        {!ready ? (
          <div className="flex justify-center py-10">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F4B650] border-t-transparent" />
          </div>
        ) : thisWeek.length === 0 && later.length === 0 && past.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--fg-3)]">No engagements yet.</p>
        ) : (
          <>
            {section('This week', thisWeek)}
            {section('Later', later)}
            {section('Past', past)}
          </>
        )}
      </div>
    </div>
  )
}
