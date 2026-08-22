'use client'

import { useEffect, useState, useMemo, type ReactNode } from 'react'
import {
  getPeople,
  getAllEngagements,
  getVictoryGroups,
  getAllGroupMemberships,
  getConfirmedEngagementIds,
  getRecentGroupAttendance,
  getGroupAttendanceTakenSince,
  getGroupMeetingStatuses,
  getSeriesEndAcks,
  updateEngagement,
  getGroupAttendance,
  upsertGroupAttendance,
  upsertGroupMeetingStatus,
  clearGroupMeetingStatus,
  updateVictoryGroup,
} from '../lib/supabaseQueries'
import type { Person, Stage, Engagement, VictoryGroup, GroupMeetingStatus, GroupAttendance } from '../types/database'
import VictoryGroupsList from './VictoryGroupsList'
import MeetingBadges, { type MeetingCounts } from './MeetingBadges'
import { SectionSkeleton } from './Skeleton'
import { bookletStage } from '../lib/curriculum'
import { daysOf, occurrencesAroundToday, weekdayOf, shiftDayInSchedule } from '../lib/meetingDays'
import { useAuth } from '../contexts/AuthContext'
import { fmtTime12 } from '../lib/formatTime'
import { lastOfSeriesById } from '../lib/engagementSeries'
import { isCancelledArchived, isMeetingOverdue } from '../lib/meetingStatus'
import LastOfSeriesNote from './LastOfSeriesNote'
import OverdueMeetingActions from './OverdueMeetingActions'

interface MyOneToOnesSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person, openTab?: 'engagements') => void
  onOpenEngagement?: (engagement: Engagement, personName: string) => void
  onAddNewPerson?: (name?: string) => void
  onGroupsChanged?: () => void
  /* Engagements are visible only to the people involved: the coach who created
     it (created_by_person_id) and the person it's with (person_id). Admins see
     all. */
  viewerPersonId?: string
  isAdmin?: boolean
}

type MeetingItem = {
  engagement: Engagement
  person: Person
  daysUntil: number
  isOverdue: boolean
  isToday: boolean
  isUpcoming: boolean
}

// A single upcoming Grace Group meeting occurrence, surfaced on the agenda
// alongside 1:1s (mirrors the native coach dashboard, which merges group
// meetings into the day agenda). Derived from victory_groups.meeting_day/time
// with any per-occurrence group_meeting_status override applied.
type GroupMeetingItem = {
  group: VictoryGroup
  occDate: string       // original weekly occurrence date — the key for cancel/reschedule overrides
  date: string          // effective occurrence date (YYYY-MM-DD, reschedule applied)
  time: string | null   // effective time
  memberCount: number
  stage: Stage | null    // booklet stage of the group's focus, if any
  daysUntil: number
  isToday: boolean
  cancelled: boolean
  rescheduled: boolean
  overdue: boolean
  statusUpdatedAt: string | null
}

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}
const GROUP_ACCENT = '#A78BFA' // Grace Groups accent for unfocused/general groups


// An interactive Grace Group meeting on the agenda. Mirrors native's group card
// action sheet (openGroupActions): take attendance, reschedule (this week / all
// future), cancel/undo. Attendance writes group_attendance and marks the card
// done (hidden for the session, like native's groupDone set). Cancel/reschedule
// write group_meeting_status and refresh the parent via onStatusChanged.
function GroupMeetingCard({
  item,
  members,
  canManage,
  viewerPersonId,
  onStatusChanged,
  onDone,
}: {
  item: GroupMeetingItem
  members: Person[]
  canManage: boolean
  viewerPersonId?: string
  onStatusChanged: () => void | Promise<void>
  onDone: (groupId: string, date: string) => void
}) {
  const accent = item.stage ? STAGE_COLORS[item.stage] : GROUP_ACCENT
  const initials = item.group.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const dateLabel = item.cancelled
    ? 'Cancelled'
    : item.overdue
    ? item.isToday
      ? 'Attendance overdue'
      : `${Math.abs(item.daysUntil)}d overdue`
    : item.isToday
    ? 'Today'
    : item.daysUntil === 1
    ? 'Tomorrow'
    : `In ${item.daysUntil}d`

  const [mode, setMode] = useState<null | 'attendance' | 'reschedule'>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Attendance roster: person_id -> present. Defaults everyone present (native),
  // then overlays any already-saved attendance for this occurrence date.
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  // Reschedule form.
  const [rsDate, setRsDate] = useState(item.date)
  const [rsTime, setRsTime] = useState(item.time?.slice(0, 5) ?? '')
  // Explicit scope: just this occurrence vs the standing weekly schedule.
  const [rsScope, setRsScope] = useState<'one' | 'all'>('one')

  const openAttendance = async () => {
    setErr('')
    const base: Record<string, boolean> = {}
    members.forEach(m => { base[m.id] = true })
    setDraft(base)
    setMode('attendance')
    const { data } = await getGroupAttendance(item.group.id)
    const saved = ((data ?? []) as GroupAttendance[]).filter(r => r.meeting_date === item.date)
    if (saved.length) {
      setDraft(prev => {
        const next = { ...prev }
        saved.forEach(r => { next[r.person_id] = r.attended })
        return next
      })
    }
  }

  const saveAttendance = async () => {
    setBusy(true); setErr('')
    const results = await Promise.all(members.map(m =>
      upsertGroupAttendance({
        victory_group_id: item.group.id,
        person_id: m.id,
        meeting_date: item.date,
        attended: draft[m.id] ?? false,
      })
    ))
    setBusy(false)
    if (results.some(r => r.error)) { setErr('Failed to save attendance.'); return }
    onDone(item.group.id, item.date) // hide the card for the session, like native
  }

  const cancelOccurrence = async () => {
    setBusy(true); setErr('')
    const { error } = await upsertGroupMeetingStatus({
      victory_group_id: item.group.id,
      meeting_date: item.occDate,
      status: 'cancelled',
      created_by_person_id: viewerPersonId ?? null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMode(null)
    await onStatusChanged()
  }

  const undoOverride = async () => {
    setBusy(true); setErr('')
    const { error } = await clearGroupMeetingStatus(item.group.id, item.occDate)
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMode(null)
    await onStatusChanged()
  }

  const openReschedule = () => {
    setRsDate(item.date)
    setRsTime(item.time?.slice(0, 5) ?? '')
    setRsScope('one')
    setErr('')
    setMode('reschedule')
  }

  const saveReschedule = async () => {
    if (!rsDate) return
    setBusy(true); setErr('')
    let error
    if (rsScope === 'all') {
      // Shift the standing schedule for every future week — only this
      // occurrence's weekday moves; a multi-day group keeps its other days.
      const res = await updateVictoryGroup(item.group.id, { ...shiftDayInSchedule(daysOf(item.group), item.occDate, rsDate), meeting_time: rsTime || null })
      if (!res.error) await clearGroupMeetingStatus(item.group.id, item.occDate)
      error = res.error
    } else {
      const res = await upsertGroupMeetingStatus({
        victory_group_id: item.group.id,
        meeting_date: item.occDate,
        status: 'rescheduled',
        rescheduled_to: rsDate,
        rescheduled_time: rsTime || null,
        created_by_person_id: viewerPersonId ?? null,
      })
      error = res.error
    }
    setBusy(false)
    if (error) { setErr(error.message); return }
    setMode(null)
    await onStatusChanged()
  }

  const presentCount = Object.values(draft).filter(Boolean).length

  return (
    <div
      className="rounded-xl border border-[var(--line-1)] p-3"
      style={{
        background: 'var(--indigo-2)',
        opacity: item.cancelled ? 0.75 : 1,
        boxShadow: item.cancelled
          ? 'none'
          : item.overdue
          ? '0 0 16px -4px rgba(242,114,138,.3)'
          : item.isToday
          ? '0 0 16px -4px rgba(167,139,250,.3)'
          : 'none',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{ background: 'var(--indigo)', border: `2px solid ${accent}`, color: accent }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--fg-1)]">{item.group.name}</div>
              <div className="mt-0.5 text-xs" style={{ color: accent }}>
                Grace Group{item.stage ? ` · ${item.stage}` : ''}
              </div>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                background: item.cancelled
                  ? 'rgba(240,114,159,.15)'
                  : item.overdue
                  ? 'rgba(242,114,138,.15)'
                  : 'rgba(167,139,250,.15)',
                color: item.cancelled ? '#F0729F' : item.overdue ? '#F2728A' : accent,
              }}
            >
              {dateLabel}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(167,139,250,.15)', color: accent }}>
              {item.memberCount} {item.memberCount === 1 ? 'member' : 'members'}
            </span>
            {item.group.focus && (
              <span className="truncate text-xs text-[var(--fg-2)]">{String(item.group.focus)}</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-[var(--fg-3)]">
            <span className={item.cancelled ? 'line-through' : ''}>
              {new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            {item.time && <span className={item.cancelled ? 'line-through' : ''}>@ {fmtTime12(item.time)}</span>}
            {item.rescheduled && !item.cancelled && <span style={{ color: accent }}>· rescheduled</span>}
          </div>

          {/* Quick actions — mirror native's group action sheet. Owner/admin only. */}
          {canManage && mode === null && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {item.cancelled || item.rescheduled ? (
                <button
                  type="button"
                  onClick={undoOverride}
                  disabled={busy}
                  className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-2 py-1 text-[11px] font-semibold text-[var(--fg-1)] transition-all hover:border-[var(--gbm-cobalt-bright)] disabled:opacity-50"
                >
                  {busy ? '…' : item.cancelled ? 'Reopen' : 'Undo reschedule'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={openAttendance}
                    disabled={busy || members.length === 0}
                    title={members.length === 0 ? 'No members to record' : 'Take attendance'}
                    className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all disabled:opacity-50"
                    style={{ borderColor: 'var(--establish)', color: 'var(--establish)', background: 'rgba(54,214,195,.1)' }}
                  >
                    ✓ Attendance
                  </button>
                  <button
                    type="button"
                    onClick={openReschedule}
                    disabled={busy}
                    className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-2 py-1 text-[11px] font-semibold text-[var(--fg-1)] transition-all hover:border-[var(--gbm-cobalt-bright)] disabled:opacity-50"
                  >
                    Reschedule
                  </button>
                  <button
                    type="button"
                    onClick={cancelOccurrence}
                    disabled={busy}
                    className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all disabled:opacity-50"
                    style={{ borderColor: 'rgba(240,114,159,.4)', color: '#F0729F', background: 'rgba(240,114,159,.1)' }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}

          {err && <p className="mt-2 rounded-lg bg-[rgba(240,114,159,.15)] px-2 py-1 text-[11px] text-[#F2728A]">{err}</p>}

          {/* Attendance roster */}
          {mode === 'attendance' && (
            <div className="mt-2 rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-2">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                Who attended · {new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="grid max-h-48 gap-1 overflow-auto">
                {members.map(person => {
                  const stageColor = STAGE_COLORS[person.current_stage]
                  const checked = draft[person.id] ?? false
                  return (
                    <label
                      key={person.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1 transition-all"
                      style={{ borderColor: checked ? 'var(--establish)' : 'var(--line-1)', background: 'var(--indigo-2)' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setDraft(prev => ({ ...prev, [person.id]: !prev[person.id] }))}
                        className="h-4 w-4 shrink-0 rounded border-[var(--line-2)] bg-[var(--indigo)] accent-[var(--establish)]"
                      />
                      <span className="truncate text-xs font-semibold text-[var(--fg-1)]">{person.name}</span>
                      <span className="ml-auto shrink-0 text-[10px]" style={{ color: stageColor }}>{person.current_stage}</span>
                    </label>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={saveAttendance}
                  disabled={busy}
                  className="flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'var(--establish)', color: 'var(--void)' }}
                >
                  {busy ? 'Saving…' : `Save (${presentCount}/${members.length})`}
                </button>
                <button type="button" onClick={() => setMode(null)} disabled={busy} className="cn-chip !text-xs">Cancel</button>
              </div>
            </div>
          )}

          {/* Reschedule form */}
          {mode === 'reschedule' && (
            <div className="mt-2 rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <input type="date" value={rsDate} onChange={e => setRsDate(e.target.value)} className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none" />
                <input type="time" value={rsTime} onChange={e => setRsTime(e.target.value)} className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2 py-1 text-xs text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none" />
              </div>
              {/* Explicit scope — pick which meetings move before saving. */}
              <div className="mt-1.5 flex flex-col gap-1">
                {([
                  ['one', `Just this meeting (${new Date(item.occDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`],
                  ['all', `All future ${weekdayOf(item.occDate)}s${rsDate ? ` → ${weekdayOf(rsDate)}s` : ''}`],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRsScope(val)}
                    className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition-all ${rsScope === val ? 'border-[var(--gbm-cobalt-bright)] bg-[rgba(91,141,247,.15)] text-[var(--fg-1)]' : 'border-[var(--line-2)] bg-[var(--indigo-2)] text-[var(--fg-2)] hover:border-[var(--line-3)]'}`}
                  >
                    {rsScope === val ? '● ' : '○ '}{label}
                  </button>
                ))}
              </div>
              {rsScope === 'all' && rsDate && (
                <p className="mt-1 text-[10px] text-[var(--fg-3)]">Moves the group’s regular {weekdayOf(item.occDate)} meeting to {weekdayOf(rsDate)}{rsTime ? ` @ ${rsTime}` : ''} every week{daysOf(item.group).length > 1 ? ' — other meeting days stay the same' : ''}.</p>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                <button type="button" onClick={saveReschedule} disabled={busy || !rsDate} className="cn-btn cn-btn-primary !px-2.5 !py-1 !text-xs disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => setMode(null)} disabled={busy} className="cn-chip !text-xs">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MeetingCard({
  item,
  onClick,
  onComplete,
  onOpenPerson,
  completing,
  cancelled = false,
  footer,
}: {
  item: MeetingItem
  onClick: () => void
  onComplete: () => void
  onOpenPerson: () => void
  completing: boolean
  cancelled?: boolean
  footer?: ReactNode
}) {
  const stageColor = STAGE_COLORS[item.person.current_stage]

  const initials = item.person.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const dateLabel = item.isOverdue
    ? item.isToday
      ? 'Attendance overdue'
      : `${Math.abs(item.daysUntil)}d overdue`
    : item.isToday
    ? 'Today'
    : item.daysUntil === 1
    ? 'Tomorrow'
    : `In ${item.daysUntil}d`

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-[var(--line-1)] p-3 transition-all hover:border-[var(--line-2)]"
      style={{
        background: 'var(--indigo-2)',
        opacity: cancelled ? 0.75 : 1,
        boxShadow: cancelled
          ? 'none'
          : item.isOverdue
          ? '0 0 16px -4px rgba(242,114,138,.3)'
          : item.isToday
          ? '0 0 16px -4px rgba(54,214,195,.3)'
          : 'none',
      }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenPerson() }}
          title="Open profile"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-transform hover:scale-105"
          style={{
            background: 'var(--indigo)',
            border: `2px solid ${stageColor}`,
            color: stageColor,
          }}
        >
          {initials}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[var(--fg-1)]">
                {item.person.name}
              </div>
              <div className="mt-0.5 text-xs" style={{ color: stageColor }}>
                {item.person.current_stage}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: cancelled
                    ? 'rgba(240,114,159,.15)'
                    : item.isOverdue
                    ? 'rgba(242,114,138,.15)'
                    : item.isToday
                    ? 'rgba(54,214,195,.15)'
                    : 'rgba(91,141,247,.15)',
                  color: cancelled
                    ? '#F0729F'
                    : item.isOverdue
                    ? '#F2728A'
                    : item.isToday
                    ? 'var(--establish)'
                    : 'var(--equip)',
                }}
              >
                {cancelled ? 'Cancelled' : dateLabel}
              </span>
              {!cancelled && (
                <button
                  type="button"
                  title="Mark meeting as done"
                  disabled={completing}
                  onClick={e => {
                    e.stopPropagation()
                    onComplete()
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold transition-all hover:scale-110 disabled:opacity-50"
                  style={{
                    borderColor: 'var(--establish)',
                    color: 'var(--establish)',
                    background: 'rgba(54,214,195,.1)',
                  }}
                >
                  {completing ? '·' : '✓'}
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            {item.engagement.meeting_type && (
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(91,141,247,.15)', color: 'var(--equip)' }}>
                {item.engagement.meeting_type}
              </span>
            )}
            <span className="truncate text-xs text-[var(--fg-2)]">
              {item.engagement.description}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-[var(--fg-3)]">
            {item.engagement.follow_up_date && (
              <span>
                {new Date(item.engagement.follow_up_date + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
            {item.engagement.follow_up_time && (
              <span>@ {fmtTime12(item.engagement.follow_up_time)}</span>
            )}
            {item.engagement.location && (
              <span className="text-[var(--fg-2)]">{item.engagement.location}</span>
            )}
          </div>
          {footer}
        </div>
      </div>
    </div>
  )
}

export default function NeedAttentionSection({
  refreshKey = 0,
  onPersonClick,
  onOpenEngagement,
  onAddNewPerson,
  onGroupsChanged,
  viewerPersonId,
  isAdmin = false,
}: MyOneToOnesSectionProps) {
  // An engagement is visible if you're an admin, you created it, or it's with
  // you.
  const involvedInEngagement = (e: Engagement) =>
    isAdmin || (!!viewerPersonId && (e.created_by_person_id === viewerPersonId || e.person_id === viewerPersonId))
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  // Engagement ids the viewer has confirmed being part of (their own meetings,
  // beyond ones they created).
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())
  const [victoryGroups, setVictoryGroups] = useState<VictoryGroup[]>([])
  const [groupMemberships, setGroupMemberships] = useState<{ person_id: string; victory_group_id: string }[]>([])
  // Small-group attendance in the rolling last-7-day window (attended=true).
  const [recentAttn, setRecentAttn] = useState<{ person_id: string; victory_group_id: string }[]>([])
  // Group+date keys where any attendance sheet was saved (clears overdue).
  const [attendanceTaken, setAttendanceTaken] = useState<Set<string>>(new Set())
  const [seriesEndAcks, setSeriesEndAcks] = useState<Set<string>>(new Set())
  // Per-occurrence cancel/reschedule overrides for group meetings.
  const [groupStatuses, setGroupStatuses] = useState<GroupMeetingStatus[]>([])
  const { profile } = useAuth()
  // Badge scope: GBC = whole church, mine = my constellation / my groups.
  const [badgeScope, setBadgeScope] = useState<'gbc' | 'mine'>('gbc')
  const [groupsKey, setGroupsKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)
  // Group meetings whose attendance was recorded this session — hidden from the
  // agenda afterwards, mirroring native's session-local `groupDone` set. Keyed
  // `${groupId}|${effectiveDate}`.
  const [groupDone, setGroupDone] = useState<Set<string>>(new Set())

  const loadData = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [peopleResult, engagementsResult, groupsResult, membershipsResult, statusesResult] = await Promise.race([
        Promise.all([
          getPeople(),
          getAllEngagements(),
          getVictoryGroups(),
          getAllGroupMemberships(),
          getGroupMeetingStatuses(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])

      if (peopleResult.error || engagementsResult.error) setLoadError(true)
      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
      setGroupStatuses((statusesResult.data as GroupMeetingStatus[]) ?? [])
      if (viewerPersonId) {
        const { data: cids } = await getConfirmedEngagementIds(viewerPersonId)
        setConfirmedIds(new Set(cids ?? []))
      }
      if (groupsResult.data) setVictoryGroups(groupsResult.data as VictoryGroup[])
      if (membershipsResult.data) setGroupMemberships(membershipsResult.data as { person_id: string; victory_group_id: string }[])
      // Rolling last-7-days group attendance (today plus the previous 6 days),
      // for the "met this week" tally on the header.
      const attnSince = new Date(); attnSince.setDate(attnSince.getDate() - 6)
      const attnSinceKey = `${attnSince.getFullYear()}-${String(attnSince.getMonth() + 1).padStart(2, '0')}-${String(attnSince.getDate()).padStart(2, '0')}`
      const [{ data: attnData }, { data: takenData }, ackRes] = await Promise.all([
        getRecentGroupAttendance(attnSinceKey),
        getGroupAttendanceTakenSince(attnSinceKey),
        viewerPersonId ? getSeriesEndAcks(viewerPersonId) : Promise.resolve({ data: [] as string[] }),
      ])
      setRecentAttn((attnData as { person_id: string; victory_group_id: string }[]) ?? [])
      setAttendanceTaken(new Set(
        ((takenData as { victory_group_id: string; meeting_date: string }[]) ?? [])
          .map(r => `${r.victory_group_id}|${r.meeting_date}`)
      ))
      setSeriesEndAcks(new Set(ackRes.data ?? []))
    } catch (err) {
      console.error('NeedAttentionSection load error:', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async (item: MeetingItem) => {
    setCompletingId(item.engagement.id)
    const { error } = await updateEngagement(item.engagement.id, {
      status: 'Completed',
      completed_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Failed to complete engagement:', error.message || JSON.stringify(error))
      alert(`Failed to mark as done: ${error.message || 'Unknown error'}`)
    } else {
      setEngagements(current =>
        current.map(e =>
          e.id === item.engagement.id ? { ...e, status: 'Completed' as const } : e
        )
      )
    }
    setCompletingId(null)
  }

  // Re-pull just the per-occurrence cancel/reschedule overrides after a group card
  // action, so the agenda reflects it without a full reload.
  const reloadGroupStatuses = async () => {
    const { data } = await getGroupMeetingStatuses()
    setGroupStatuses((data as GroupMeetingStatus[]) ?? [])
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const meetings = useMemo(() => {
    const peopleById = new Map(people.map(p => [p.id, p]))
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Rolling window: today through the next 7 days
    const next7 = new Date(today)
    next7.setDate(today.getDate() + 7)
    const next7Str = next7.toISOString().split('T')[0]

    const items: MeetingItem[] = []

    // The meeting list honors the GBC / Mine toggle: GBC (admin) shows the whole
    // church; Mine shows only meetings you're involved in. Non-admins are always
    // scoped to "mine".
    // "Mine" = meetings you OWN (created) or have CONFIRMED being part of — never
    // ones you were only invited to. GBC (admin) shows the whole church.
    const effectiveScope = isAdmin ? badgeScope : 'mine'
    const inScope = (e: Engagement) =>
      effectiveScope === 'gbc' || (!!viewerPersonId && (e.created_by_person_id === viewerPersonId || confirmedIds.has(e.id)))

    engagements
      .filter(e => {
        if (e.status !== 'Pending' || !e.follow_up_date) return false
        if (!inScope(e)) return false
        // Show meetings within the next 7 days + anything still overdue
        return e.follow_up_date <= next7Str
      })
      .forEach(engagement => {
        const person = peopleById.get(engagement.person_id)
        if (!person) return

        // Parse as local time by appending T00:00:00 (otherwise JS parses YYYY-MM-DD as UTC)
        const followUpDate = new Date(engagement.follow_up_date + 'T00:00:00')

        const diffTime = followUpDate.getTime() - today.getTime()
        const daysUntil = Math.round(diffTime / (1000 * 60 * 60 * 24))

        items.push({
          engagement,
          person,
          daysUntil,
          isOverdue: isMeetingOverdue(engagement.follow_up_date, engagement.follow_up_time),
          isToday: daysUntil === 0,
          isUpcoming: daysUntil > 0 && daysUntil <= 7,
        })
      })

    // Sort: overdue first, then today, then upcoming by date
    items.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1
      if (!a.isOverdue && b.isOverdue) return 1
      if (a.isToday && !b.isToday) return -1
      if (!a.isToday && b.isToday) return 1
      return a.daysUntil - b.daysUntil
    })

    return items
  }, [people, engagements, viewerPersonId, isAdmin, badgeScope, confirmedIds])

  const lastOfSeries = useMemo(
    () => lastOfSeriesById(engagements, viewerPersonId),
    [engagements, viewerPersonId],
  )

  // Cancelled 1:1s in the same window/scope. They stay on the agenda with a red
  // badge (so the coach can reopen them) but never feed any count — hence a
  // separate memo from `meetings`. Mirrors native's `cancelledEng`.
  const cancelledMeetings = useMemo(() => {
    const peopleById = new Map(people.map(p => [p.id, p]))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const next7 = new Date(today)
    next7.setDate(today.getDate() + 7)
    const next7Str = next7.toISOString().split('T')[0]

    const effectiveScope = isAdmin ? badgeScope : 'mine'
    const inScope = (e: Engagement) =>
      effectiveScope === 'gbc' || (!!viewerPersonId && (e.created_by_person_id === viewerPersonId || confirmedIds.has(e.id)))

    const items: MeetingItem[] = []
    engagements
      .filter(e =>
        e.status === 'Cancelled' &&
        !!e.follow_up_date &&
        inScope(e) &&
        e.follow_up_date <= next7Str &&
        !isCancelledArchived(e.cancelled_at, e.follow_up_date)
      )
      .forEach(engagement => {
        const person = peopleById.get(engagement.person_id)
        if (!person) return
        const followUpDate = new Date(engagement.follow_up_date + 'T00:00:00')
        const daysUntil = Math.round((followUpDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        items.push({ engagement, person, daysUntil, isOverdue: daysUntil < 0, isToday: daysUntil === 0, isUpcoming: daysUntil > 0 && daysUntil <= 7 })
      })
    items.sort((a, b) => a.daysUntil - b.daysUntil)
    return items
  }, [people, engagements, viewerPersonId, isAdmin, badgeScope, confirmedIds])

  // Upcoming Grace Group meetings for the rolling window, merged onto the agenda
  // like native. One card per occurrence in the next 7 days — a multi-day group
  // (e.g. Tue & Thu) surfaces each of its meetings — with any per-occurrence
  // cancel/reschedule override applied. Honors the GBC/Mine scope like the badges.
  const groupMeetings = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const effectiveScope = isAdmin ? badgeScope : 'mine'
    const scopeGroup = (g: VictoryGroup) => effectiveScope === 'gbc' || g.owner_person_id === profile?.id

    const membersByGroupId = new Map<string, number>()
    for (const m of groupMemberships) {
      membersByGroupId.set(m.victory_group_id, (membersByGroupId.get(m.victory_group_id) ?? 0) + 1)
    }
    const statusFor = (groupId: string, occDate: string) =>
      groupStatuses.find(s => s.victory_group_id === groupId && s.meeting_date === occDate) ?? null

    const items: GroupMeetingItem[] = []
    for (const group of victoryGroups) {
      if (!scopeGroup(group)) continue
      // 7 days back (overdue attendance) + 6 ahead (each weekday once).
      for (const occ of occurrencesAroundToday(daysOf(group), 6, 6)) {
        const st = statusFor(group.id, occ)
        const cancelled = st?.status === 'cancelled'
        const rescheduled = st?.status === 'rescheduled'
        if (cancelled && isCancelledArchived(st?.updated_at ?? st?.created_at, occ)) continue
        const date = rescheduled && st?.rescheduled_to ? st.rescheduled_to : occ
        const time = rescheduled ? st?.rescheduled_time ?? null : group.meeting_time
        const dt = new Date(date + 'T00:00:00')
        const daysUntil = Math.round((dt.getTime() - today.getTime()) / 86_400_000)
        const taken = attendanceTaken.has(`${group.id}|${date}`)
        const overdue = !cancelled && !taken && isMeetingOverdue(date, time)
        // Past sessions only stay on the agenda when attendance is still owed.
        if (daysUntil < 0 && !overdue && !cancelled) continue
        items.push({
          group,
          occDate: occ,
          date,
          time,
          memberCount: membersByGroupId.get(group.id) ?? 0,
          stage: bookletStage(group.focus),
          daysUntil,
          isToday: daysUntil === 0,
          cancelled,
          rescheduled,
          overdue,
          statusUpdatedAt: st?.updated_at ?? st?.created_at ?? null,
        })
      }
    }
    items.sort((a, b) => a.date.localeCompare(b.date))
    return items
  }, [victoryGroups, groupMemberships, groupStatuses, isAdmin, badgeScope, profile?.id, attendanceTaken])

  // Roster per group (resolved to Person for the attendance checklist), derived
  // from the flat memberships + people already loaded.
  const groupMembersById = useMemo(() => {
    const peopleById = new Map(people.map(p => [p.id, p]))
    const m = new Map<string, Person[]>()
    for (const gm of groupMemberships) {
      const p = peopleById.get(gm.person_id)
      if (!p) continue
      const arr = m.get(gm.victory_group_id) ?? []
      arr.push(p)
      m.set(gm.victory_group_id, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => a.name.localeCompare(b.name))
    return m
  }, [people, groupMemberships])

  // Hide meetings whose attendance was taken this session (native parity).
  const visibleGroupMeetings = groupMeetings.filter(g => !groupDone.has(`${g.group.id}|${g.date}`))
  const activeGroupMeetings = visibleGroupMeetings.filter(g => !g.cancelled)

  const overdueCount = meetings.filter(m => m.isOverdue).length
  const overdueGroupCount = visibleGroupMeetings.filter(g => g.overdue).length
  const todayCount = meetings.filter(m => m.isToday && !m.isOverdue).length

  const meetingCounts = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0] // YYYY-MM-DD format
    const todayDayOfWeek = now.getDay()
    // Non-admins only ever count their own groups; admins may toggle GBC/mine.
    const effectiveScope = isAdmin ? badgeScope : 'mine'
    const scopeGroup = (group: VictoryGroup) => effectiveScope === 'gbc' || group.owner_person_id === profile?.id

    // Tomorrow
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    const tomorrowDayOfWeek = tomorrow.getDay()

    // Rolling 7-day window: today through today + 7 (matches the meetings list).
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const next7 = new Date(todayStart)
    next7.setDate(todayStart.getDate() + 7)
    const next7Str = next7.toISOString().split('T')[0]

    const counts: MeetingCounts = {
      Engage: { today: 0, week: 0, names: [], groupPeople: 0 },
      Establish: { today: 0, week: 0, names: [], groupPeople: 0 },
      Equip: { today: 0, week: 0, names: [], groupPeople: 0 },
      Empower: { today: 0, week: 0, names: [], groupPeople: 0 },
      'Grace Groups': { today: 0, week: 0, names: [], groupPeople: 0 },
    }

    const peopleById = new Map(people.map(p => [p.id, p]))

    // Count engagements by person's stage (both pending and completed this week)
    engagements
      .filter(e => e.follow_up_date && involvedInEngagement(e))
      .forEach(e => {
        const person = peopleById.get(e.person_id)
        if (!person) return

        const stage = person.current_stage
        const followUpDateStr = e.follow_up_date! // Already YYYY-MM-DD format (filtered above)

        // Today, or within the rolling next-7-days window
        const isInWindow = followUpDateStr >= todayStr && followUpDateStr <= next7Str
        const isToday = followUpDateStr === todayStr

        if (isToday) {
          counts[stage].today++
        }

        if (isInWindow) {
          counts[stage].week++
          counts[stage].names.push(person.name)
        }
      })

    // Count Grace Groups
    const dayMap: Record<string, number> = {
      'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
      'Thursday': 4, 'Friday': 5, 'Saturday': 6
    }

    // People being moved through each 4E stage via groups (by group focus).
    const membersByGroupId = new Map<string, number>()
    for (const m of groupMemberships) {
      membersByGroupId.set(m.victory_group_id, (membersByGroupId.get(m.victory_group_id) ?? 0) + 1)
    }

    victoryGroups.forEach(group => {
      if (!scopeGroup(group)) return
      const memberCount = membersByGroupId.get(group.id) ?? 0
      const groupDays = daysOf(group)
      if (groupDays.length) {
        // Each meeting day counts as a meeting this week (Tue & Thu = 2).
        counts['Grace Groups'].week += groupDays.length
        counts['Grace Groups'].names.push(group.name)
        if (groupDays.some(d => dayMap[d] === todayDayOfWeek)) {
          counts['Grace Groups'].today++
        }
      }
      // Groups gem total = everyone in the scoped groups (so GBC, with more
      // groups, is higher than Mine). Focused groups also fold into their stage;
      // the gap between the total and the stage badges is unfocused/General groups.
      counts['Grace Groups'].groupPeople += memberCount
      const stage = bookletStage(group.focus)
      if (stage) {
        counts[stage].groupPeople += memberCount
      }
    })

    return counts
  }, [people, engagements, victoryGroups, groupMemberships, badgeScope, viewerPersonId, isAdmin, profile?.id])

  // Distinct people met with in the rolling last-7-days window, across BOTH small
  // groups (attendance) AND completed 1:1 meetings, deduped by person (met in both
  // counts once). Responds to the GBC/Mine toggle: GBC = whole church; Mine = the
  // groups I own + the 1:1s I'm involved in. The coach is excluded from their own
  // tally. Mirrors the native "My Meetings" card.
  const metThisWeekCount = useMemo(() => {
    const effectiveScope = isAdmin ? badgeScope : 'mine'
    const ownedGroupIds = new Set(
      victoryGroups.filter(g => g.owner_person_id === profile?.id).map(g => g.id)
    )
    const mineInvolved = (e: Engagement) =>
      !!viewerPersonId && (e.created_by_person_id === viewerPersonId || e.person_id === viewerPersonId || confirmedIds.has(e.id))
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - 6)
    const met = new Set<string>()
    // (a) small-group attendance
    for (const r of recentAttn) {
      if (effectiveScope === 'mine' && !ownedGroupIds.has(r.victory_group_id)) continue
      met.add(r.person_id)
    }
    // (b) completed 1:1 meetings in-window. No completed_at column — follow_up_date
    // is the meeting date; date-only strings anchor to local midnight.
    for (const e of engagements) {
      if (e.status !== 'Completed' || !e.follow_up_date) continue
      const d = e.follow_up_date
      if (new Date(d + (d.length === 10 ? 'T00:00:00' : '')).getTime() < cutoff.getTime()) continue
      if (effectiveScope === 'mine' && !mineInvolved(e)) continue
      met.add(e.person_id)
    }
    if (profile?.id) met.delete(profile.id)
    return met.size
  }, [recentAttn, engagements, victoryGroups, badgeScope, isAdmin, profile?.id, viewerPersonId, confirmedIds])

  if (loading) {
    return <SectionSkeleton title="My Meetings" />
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        {/* Left column — title, subtitle and section label stack up to fill the
            space beside the tall stage badges. */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="cn-h3">My Meetings</h2>
            {meetings.length > 0 && (
              <span className="cn-chip !py-0.5 !text-xs">{meetings.length}</span>
            )}
            {/* Scope the badge totals: whole church vs my groups (admins only). */}
            {isAdmin && (
              <div className="ml-1 flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-0.5">
                {([['gbc', 'GBC'], ['mine', 'Mine']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBadgeScope(val)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-all ${badgeScope === val ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            <span
              title="Distinct people you met with in the last 7 days — small groups + 1:1s, counted once. Follows the GBC/Mine scope."
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
            >
              🤝 {metThisWeekCount} met this week
            </span>
            {(overdueCount + overdueGroupCount) > 0 && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(242,114,138,.15)', color: '#F2728A' }}>
                {overdueCount + overdueGroupCount} overdue attendance
              </span>
            )}
            {todayCount > 0 && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}>
                {todayCount} today
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--fg-2)]">
            Meetings for the next 7 days — rolling from today
          </p>
          {isExpanded && meetings.length > 0 && (
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
              One-to-One Meetings
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-start gap-3">
          <MeetingBadges counts={meetingCounts} />
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="cn-chip"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          {/* One-to-One Meetings */}
          {meetings.length > 0 ? (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {meetings.slice(0, 12).map(item => {
                  const seriesInfo = lastOfSeries.get(item.engagement.id)
                  const showSeries = !!seriesInfo && !seriesEndAcks.has(item.engagement.id)
                  const owns = !!viewerPersonId && item.engagement.created_by_person_id === viewerPersonId
                  return (
                  <MeetingCard
                    key={item.engagement.id}
                    item={item}
                    onClick={() => onOpenEngagement?.(item.engagement, item.person.name)}
                    onComplete={() => handleComplete(item)}
                    onOpenPerson={() => onPersonClick?.(item.person)}
                    completing={completingId === item.engagement.id}
                    footer={(showSeries || (owns && item.isOverdue)) ? (
                      <div className="mt-2 space-y-2">
                        {showSeries && seriesInfo && (
                          <LastOfSeriesNote
                            engagement={item.engagement}
                            info={seriesInfo}
                            personName={item.person.name}
                            coachPersonId={viewerPersonId ?? null}
                            onExtended={() => { loadData() }}
                            onDismissed={() => setSeriesEndAcks(prev => new Set(prev).add(item.engagement.id))}
                          />
                        )}
                        {owns && item.isOverdue && (
                          <OverdueMeetingActions
                            engagement={item.engagement}
                            personName={item.person.name}
                            coachPersonId={viewerPersonId ?? null}
                            onChanged={() => { loadData() }}
                          />
                        )}
                      </div>
                    ) : undefined}
                  />
                  )
                })}
              </div>
              {meetings.length > 12 && (
                <p className="mt-2 text-center text-xs text-[var(--fg-3)]">
                  Showing 12 of {meetings.length} scheduled meetings
                </p>
              )}
            </>
          ) : loadError ? (
            <p className="mt-4 text-sm text-[var(--fg-3)]">
              Couldn&apos;t load meetings.{' '}
              <button
                type="button"
                onClick={loadData}
                className="font-semibold text-[var(--equip)] hover:underline"
              >
                Retry
              </button>
            </p>
          ) : (
            <p className="mt-4 text-sm text-[var(--fg-3)]">
              No one-to-one meetings scheduled. Add a follow-up date in someone's profile.
            </p>
          )}

          {/* Cancelled 1:1s — stay visible so they can be reopened; not counted */}
          {cancelledMeetings.length > 0 && (
            <>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                Cancelled ({cancelledMeetings.length})
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {cancelledMeetings.slice(0, 12).map(item => (
                  <MeetingCard
                    key={item.engagement.id}
                    item={item}
                    cancelled
                    onClick={() => onOpenEngagement?.(item.engagement, item.person.name)}
                    onComplete={() => {}}
                    onOpenPerson={() => onPersonClick?.(item.person)}
                    completing={false}
                  />
                ))}
              </div>
            </>
          )}

          {/* Grace Group Meetings — upcoming occurrences on the agenda (mirrors
              native, which merges group meetings into the day agenda). Cards are
              interactive: take attendance, reschedule, cancel/undo. */}
          {visibleGroupMeetings.length > 0 && (
            <>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                Grace Group Meetings ({activeGroupMeetings.length})
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visibleGroupMeetings.slice(0, 12).map(item => (
                  <GroupMeetingCard
                    key={`${item.group.id}|${item.occDate}`}
                    item={item}
                    members={groupMembersById.get(item.group.id) ?? []}
                    canManage={isAdmin || item.group.owner_person_id === profile?.id}
                    viewerPersonId={profile?.id}
                    onStatusChanged={reloadGroupStatuses}
                    onDone={(groupId, date) => {
                      setGroupDone(prev => new Set(prev).add(`${groupId}|${date}`))
                      setAttendanceTaken(prev => new Set(prev).add(`${groupId}|${date}`))
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Grace Groups (management) */}
          <div className="mt-4">
            <VictoryGroupsList
              key={groupsKey}
              onChanged={() => {
                setGroupsKey(k => k + 1)
                onGroupsChanged?.()
              }}
              onPersonClick={(person) => onPersonClick?.(person)}
              onAddNewPerson={onAddNewPerson}
            />
          </div>
        </>
      )}
    </section>
  )
}
