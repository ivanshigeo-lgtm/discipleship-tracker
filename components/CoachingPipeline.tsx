'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllEngagements,
  getAllPrayerRequests,
  updatePersonStage,
  updatePerson,
} from '../lib/supabaseQueries'
import { stageLabels, stageOrder } from '../lib/stageLabels'
import type { Person, Stage, Engagement, PrayerRequest } from '../types/database'

interface CoachingPipelineProps {
  refreshKey?: number
  collapsed?: boolean
  onPersonClick?: (person: Person, openTab?: 'engagements') => void
  onChanged?: () => void
}

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

const STAGE_LABELS: Record<Stage, string> = {
  Engage: 'Reaching',
  Establish: 'Building',
  Equip: 'Training',
  Empower: 'Releasing',
}

function daysSince(dateString: string | null): number | null {
  if (!dateString) return null
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = now.getTime() - date.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

function formatNextFollowUp(engagements: Engagement[]): string | null {
  const pending = engagements
    .filter(e => e.status === 'Pending' && e.follow_up_date)
    .sort((a, b) => new Date(a.follow_up_date! + 'T00:00:00').getTime() - new Date(b.follow_up_date! + 'T00:00:00').getTime())

  if (pending.length === 0) return null

  const nextDate = new Date(pending[0].follow_up_date! + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const diffDays = Math.round((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return `In ${diffDays}d`
}

function PersonCard({
  person,
  engagements,
  prayerCount,
  daysInStage,
  onAdvance,
  onClick,
  onFollowUpClick,
  onPriorityToggle,
}: {
  person: Person
  engagements: Engagement[]
  prayerCount: number
  daysInStage: number | null
  onAdvance?: (newStage: Stage) => void
  onClick?: () => void
  onFollowUpClick?: () => void
  onPriorityToggle?: () => void
}) {
  const nextFollowUp = formatNextFollowUp(engagements)
  const stageIndex = stageOrder.indexOf(person.current_stage)
  const nextStage = stageIndex < stageOrder.length - 1 ? stageOrder[stageIndex + 1] : null
  const isOverdue = nextFollowUp?.includes('overdue')
  const stageColor = STAGE_COLORS[person.current_stage]
  const nextStageColor = nextStage ? STAGE_COLORS[nextStage] : stageColor

  const hasEngagementThisWeek = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekFromNow = new Date(today)
    weekFromNow.setDate(weekFromNow.getDate() + 7)

    return engagements.some(eng => {
      if (eng.status !== 'Pending' || !eng.follow_up_date) return false
      const followUpDate = new Date(eng.follow_up_date + 'T00:00:00')
      return followUpDate >= today && followUpDate <= weekFromNow
    })
  }, [engagements])

  const initials = person.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const isPriority = person.priority

  const getCardStyle = () => {
    if (isPriority) {
      return {
        borderColor: 'rgba(244,182,80,.7)',
        boxShadow: '0 0 24px 0px rgba(244,182,80,.6), 0 0 8px 0px rgba(244,182,80,.4), inset 0 1px 0 rgba(246,241,231,.04)',
      }
    }
    if (hasEngagementThisWeek) {
      return {
        borderColor: 'rgba(54,214,195,.6)',
        boxShadow: '0 0 24px 0px rgba(54,214,195,.5), 0 0 8px 0px rgba(54,214,195,.3), inset 0 1px 0 rgba(246,241,231,.04)',
      }
    }
    return {
      borderColor: 'var(--line-1)',
      boxShadow: 'inset 0 1px 0 rgba(246,241,231,.04)',
    }
  }

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border p-3 transition-all hover:border-[var(--line-2)]"
      style={{
        background: 'var(--indigo-2)',
        ...getCardStyle(),
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold"
          style={{
            background: 'var(--indigo)',
            border: `2px solid ${stageColor}`,
            boxShadow: `0 0 10px ${stageColor}30`,
            color: stageColor,
          }}
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[var(--fg-1)]">{person.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--fg-3)]">
            {daysInStage !== null && (
              <span className={daysInStage > 30 ? 'text-[var(--warning)]' : ''}>
                {daysInStage}d in stage
              </span>
            )}
            {prayerCount > 0 && (
              <span className="flex items-center gap-1">
                ✦ {prayerCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Status badges */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {nextFollowUp ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: isOverdue ? 'rgba(242,114,138,.15)' : 'var(--indigo-3)',
              color: isOverdue ? '#F2728A' : 'var(--fg-2)',
            }}
          >
            {nextFollowUp}
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onFollowUpClick?.()
            }}
            className="rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{ background: 'rgba(91,141,247,.15)', color: 'var(--equip)' }}
          >
            + Follow Up
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onPriorityToggle?.()
          }}
          className="rounded-full px-2 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
          style={{
            background: isPriority ? 'rgba(244,182,80,.25)' : 'rgba(244,182,80,.1)',
            color: 'var(--engage)',
          }}
        >
          {isPriority ? '★ Priority' : '☆ Priority'}
        </button>
      </div>

      {/* Advance button */}
      {nextStage && onAdvance && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAdvance(nextStage)
          }}
          className="mt-3 w-full rounded-lg border px-2 py-1.5 text-xs font-semibold transition-all"
          style={{
            borderColor: `${nextStageColor}40`,
            background: 'var(--indigo)',
            color: nextStageColor,
          }}
        >
          Move to {stageLabels[nextStage].name} →
        </button>
      )}
    </div>
  )
}

export default function CoachingPipeline({
  refreshKey = 0,
  collapsed = false,
  onPersonClick,
  onChanged,
}: CoachingPipelineProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const [peopleResult, engagementsResult, prayerResult] = await Promise.race([
        Promise.all([
          getPeople(),
          getAllEngagements(),
          getAllPrayerRequests(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])

      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
      if (prayerResult.data) setPrayerRequests(prayerResult.data as PrayerRequest[])
    } catch (err) {
      console.error('CoachingPipeline load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const engagementsByPerson = useMemo(() => {
    const map = new Map<string, Engagement[]>()
    engagements.forEach(e => {
      const list = map.get(e.person_id) || []
      list.push(e)
      map.set(e.person_id, list)
    })
    return map
  }, [engagements])

  const activePrayerCountByPerson = useMemo(() => {
    const map = new Map<string, number>()
    prayerRequests
      .filter(pr => pr.status === 'Active')
      .forEach(pr => {
        map.set(pr.person_id, (map.get(pr.person_id) || 0) + 1)
      })
    return map
  }, [prayerRequests])

  const peopleByStage = useMemo(() => {
    const map: Record<Stage, Person[]> = {
      Engage: [],
      Establish: [],
      Equip: [],
      Empower: [],
    }
    people.forEach(person => {
      map[person.current_stage].push(person)
    })
    Object.values(map).forEach(list => {
      list.sort((a, b) => a.name.localeCompare(b.name))
    })
    return map
  }, [people])

  const handleAdvanceStage = async (personId: string, newStage: Stage) => {
    await updatePersonStage(personId, newStage)
    await loadData()
    onChanged?.()
  }

  const handlePriorityToggle = async (person: Person) => {
    const { error } = await updatePerson(person.id, { priority: !person.priority })
    if (error) {
      console.error('Priority toggle error:', error)
      return
    }
    await loadData()
    onChanged?.()
  }

  if (loading) {
    return (
      <div className="cn-card py-12 text-center">
        <p className="text-[var(--fg-2)]">Loading pipeline...</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stageOrder.map(stage => {
        const stageColor = STAGE_COLORS[stage]
        const stageLabel = STAGE_LABELS[stage]

        return (
          <div key={stage} className="flex flex-col">
            {/* Column header */}
            <div
              className="mb-3 rounded-xl border p-3"
              style={{
                background: `linear-gradient(135deg, ${stageColor}15 0%, var(--indigo-2) 100%)`,
                borderColor: `${stageColor}30`,
                boxShadow: `0 0 20px -8px ${stageColor}40`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs"
                    style={{
                      background: `${stageColor}20`,
                      border: `2px solid ${stageColor}`,
                      color: stageColor,
                    }}
                  >
                    ✦
                  </div>
                  <span className="text-sm font-bold" style={{ color: stageColor }}>
                    {stageLabels[stage].name}
                  </span>
                </div>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{ background: `${stageColor}20`, color: stageColor }}
                >
                  {peopleByStage[stage].length}
                </span>
              </div>
              <div className="mt-1.5 text-xs text-[var(--fg-3)]">{stageLabel}</div>
            </div>

            {/* Cards container */}
            {!collapsed && (
              <div
                className="flex-1 space-y-2 rounded-xl border border-[var(--line-1)] p-2"
                style={{ background: 'var(--indigo)' }}
              >
                {peopleByStage[stage].length === 0 ? (
                  <div
                    className="rounded-lg p-4 text-center text-xs"
                    style={{ background: 'var(--indigo-2)', color: 'var(--fg-3)' }}
                  >
                    No one in this stage yet
                  </div>
                ) : (
                  peopleByStage[stage].map(person => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      engagements={engagementsByPerson.get(person.id) || []}
                      prayerCount={activePrayerCountByPerson.get(person.id) || 0}
                      daysInStage={daysSince(person.updated_at)}
                      onAdvance={(newStage) => handleAdvanceStage(person.id, newStage)}
                      onClick={() => onPersonClick?.(person)}
                      onFollowUpClick={() => onPersonClick?.(person, 'engagements')}
                      onPriorityToggle={() => handlePriorityToggle(person)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
