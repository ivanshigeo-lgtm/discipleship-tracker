'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllEngagements,
  getAllStageChecklistItems,
} from '../lib/supabaseQueries'
import type { Person, Stage, Engagement, StageChecklistItem } from '../types/database'
import EngagementBadges, { type CurriculumCounts, type CurriculumNames } from './EngagementBadges'
import VictoryGroupsList from './VictoryGroupsList'

interface MyOneToOnesSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person, openTab?: 'engagements') => void
  onAddNewPerson?: () => void
  onGroupsChanged?: () => void
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
}: {
  item: MeetingItem
  onClick: () => void
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
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{
            background: 'var(--indigo)',
            border: `2px solid ${stageColor}`,
            color: stageColor,
          }}
        >
          {initials}
        </div>

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
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
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
  onAddNewPerson,
  onGroupsChanged,
}: MyOneToOnesSectionProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [groupsKey, setGroupsKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const [peopleResult, engagementsResult, checklistResult] = await Promise.all([
      getPeople(),
      getAllEngagements(),
      getAllStageChecklistItems(),
    ])

    if (peopleResult.data) setPeople(peopleResult.data as Person[])
    if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
    if (checklistResult.data) setChecklistItems(checklistResult.data as StageChecklistItem[])

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const meetings = useMemo(() => {
    const peopleById = new Map(people.map(p => [p.id, p]))
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const items: MeetingItem[] = []

    engagements
      .filter(e => e.status === 'Pending' && e.follow_up_date)
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
  }, [people, engagements])

  const overdueCount = meetings.filter(m => m.isOverdue).length
  const todayCount = meetings.filter(m => m.isToday).length
  const upcomingCount = meetings.filter(m => m.isUpcoming).length

  const completedData = useMemo(() => {
    const peopleById = new Map(people.map(p => [p.id, p]))

    const counts: CurriculumCounts = {
      'One2One': 0,
      'Making Disciples': 0,
      'Coffee': 0,
      'Church Community': 0,
      'Empowering Leaders': 0,
    }

    const names: Record<keyof CurriculumCounts, string[]> = {
      'One2One': [],
      'Making Disciples': [],
      'Coffee': [],
      'Church Community': [],
      'Empowering Leaders': [],
    }

    const curriculumLabels: Record<string, keyof CurriculumCounts> = {
      'Completed One2One': 'One2One',
      'Completed Making Disciples': 'Making Disciples',
      'Completed Church Community': 'Church Community',
      'Completed Empowering Leaders': 'Empowering Leaders',
    }

    checklistItems
      .filter(item => item.completed && item.label in curriculumLabels)
      .forEach(item => {
        const curriculumType = curriculumLabels[item.label]
        if (curriculumType) {
          counts[curriculumType]++
          const person = peopleById.get(item.person_id)
          if (person) {
            names[curriculumType].push(person.name)
          }
        }
      })

    engagements
      .filter(e => e.status === 'Completed' && e.meeting_type === 'Coffee')
      .forEach(e => {
        const person = peopleById.get(e.person_id)
        if (person && !names['Coffee'].includes(person.name)) {
          names['Coffee'].push(person.name)
          counts['Coffee']++
        }
      })

    return { counts, names }
  }, [checklistItems, engagements, people])

  if (loading) {
    return null
  }

  if (meetings.length === 0) {
    return (
      <section className="cn-card mb-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="cn-h3">My Meetings</h2>
            <p className="text-sm text-[var(--fg-2)]">Scheduled meetings from Next Engagements</p>
          </div>
          <EngagementBadges completedCounts={completedData.counts} completedNames={completedData.names} />
        </div>
        <p className="mt-4 text-sm text-[var(--fg-3)]">
          No scheduled meetings. Add a follow-up date in someone's profile to see it here.
        </p>
      </section>
    )
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="cn-h3">My Meetings</h2>
          <span className="cn-chip !py-0.5 !text-xs">{meetings.length}</span>
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

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--fg-2)]">
          Scheduled meetings from Next Engagements
        </p>
        <EngagementBadges completedCounts={completedData.counts} completedNames={completedData.names} />
      </div>

      {isExpanded && (
        <>
          {/* One-to-One Meetings */}
          {meetings.length > 0 && (
            <>
              <div className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">
                One-to-One Meetings
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {meetings.slice(0, 12).map(item => (
                  <MeetingCard
                    key={item.engagement.id}
                    item={item}
                    onClick={() => onPersonClick?.(item.person, 'engagements')}
                  />
                ))}
              </div>
              {meetings.length > 12 && (
                <p className="mt-2 text-center text-xs text-[var(--fg-3)]">
                  Showing 12 of {meetings.length} scheduled meetings
                </p>
              )}
            </>
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
