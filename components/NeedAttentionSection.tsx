'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllEngagements,
  getVictoryGroups,
  getAllGroupMemberships,
  getConfirmedEngagementIds,
  updateEngagement,
} from '../lib/supabaseQueries'
import type { Person, Stage, Engagement, VictoryGroup } from '../types/database'
import VictoryGroupsList from './VictoryGroupsList'
import MeetingBadges, { type MeetingCounts } from './MeetingBadges'
import { SectionSkeleton } from './Skeleton'
import { bookletStage } from '../lib/curriculum'
import { useAuth } from '../contexts/AuthContext'

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

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

function MeetingCard({
  item,
  onClick,
  onComplete,
  onOpenPerson,
  completing,
}: {
  item: MeetingItem
  onClick: () => void
  onComplete: () => void
  onOpenPerson: () => void
  completing: boolean
}) {
  const stageColor = STAGE_COLORS[item.person.current_stage]

  const initials = item.person.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const dateLabel = item.isToday
    ? 'Today'
    : item.isOverdue
    ? `${Math.abs(item.daysUntil)}d overdue`
    : item.daysUntil === 1
    ? 'Tomorrow'
    : `In ${item.daysUntil}d`

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-[var(--line-1)] p-3 transition-all hover:border-[var(--line-2)]"
      style={{
        background: 'var(--indigo-2)',
        boxShadow: item.isOverdue
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
                  background: item.isOverdue
                    ? 'rgba(242,114,138,.15)'
                    : item.isToday
                    ? 'rgba(54,214,195,.15)'
                    : 'rgba(91,141,247,.15)',
                  color: item.isOverdue
                    ? '#F2728A'
                    : item.isToday
                    ? 'var(--establish)'
                    : 'var(--equip)',
                }}
              >
                {dateLabel}
              </span>
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
              <span>@ {item.engagement.follow_up_time}</span>
            )}
            {item.engagement.location && (
              <span className="text-[var(--fg-2)]">{item.engagement.location}</span>
            )}
          </div>
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
  const { profile } = useAuth()
  // Badge scope: GBC = whole church, mine = my constellation / my groups.
  const [badgeScope, setBadgeScope] = useState<'gbc' | 'mine'>('gbc')
  const [groupsKey, setGroupsKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const [peopleResult, engagementsResult, groupsResult, membershipsResult] = await Promise.race([
        Promise.all([
          getPeople(),
          getAllEngagements(),
          getVictoryGroups(),
          getAllGroupMemberships(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])

      if (peopleResult.error || engagementsResult.error) setLoadError(true)
      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
      if (viewerPersonId) {
        const { data: cids } = await getConfirmedEngagementIds(viewerPersonId)
        setConfirmedIds(new Set(cids ?? []))
      }
      if (groupsResult.data) setVictoryGroups(groupsResult.data as VictoryGroup[])
      if (membershipsResult.data) setGroupMemberships(membershipsResult.data as { person_id: string; victory_group_id: string }[])
    } catch (err) {
      console.error('NeedAttentionSection load error:', err)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async (item: MeetingItem) => {
    setCompletingId(item.engagement.id)
    const { error } = await updateEngagement(item.engagement.id, { status: 'Completed' })

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
          isOverdue: daysUntil < 0,
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

  const overdueCount = meetings.filter(m => m.isOverdue).length
  const todayCount = meetings.filter(m => m.isToday).length

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
      if (group.meeting_day) {
        const meetingDayNum = dayMap[group.meeting_day]
        if (meetingDayNum !== undefined) {
          // Count for the week
          counts['Grace Groups'].week++
          counts['Grace Groups'].names.push(group.name)
          // Check if it's today
          if (meetingDayNum === todayDayOfWeek) {
            counts['Grace Groups'].today++
          }
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

  if (loading) {
    return <SectionSkeleton title="My Meetings" />
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="cn-h3">My Meetings</h2>
          {meetings.length > 0 && (
            <span className="cn-chip !py-0.5 !text-xs">{meetings.length}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col items-center gap-1.5">
            <MeetingBadges counts={meetingCounts} />
            {/* Scope the badge totals: whole church vs my groups (admins only). */}
            {isAdmin && (
              <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-0.5">
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
          </div>
          <div className="flex items-center gap-2">
            {overdueCount > 0 && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(242,114,138,.15)', color: '#F2728A' }}>
                {overdueCount} overdue
              </span>
            )}
            {todayCount > 0 && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}>
                {todayCount} today
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="cn-chip"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
      </div>

      <p className="mt-1 text-sm text-[var(--fg-2)]">
        Meetings for the next 7 days — rolling from today
      </p>

      {isExpanded && (
        <>
          {/* One-to-One Meetings */}
          {meetings.length > 0 ? (
            <>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                One-to-One Meetings
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {meetings.slice(0, 12).map(item => (
                  <MeetingCard
                    key={item.engagement.id}
                    item={item}
                    onClick={() => onOpenEngagement?.(item.engagement, item.person.name)}
                    onComplete={() => handleComplete(item)}
                    onOpenPerson={() => onPersonClick?.(item.person)}
                    completing={completingId === item.engagement.id}
                  />
                ))}
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

          {/* Grace Groups */}
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
