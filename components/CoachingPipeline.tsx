'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllEngagements,
  getAllPrayerRequests,
  updatePersonStage,
} from '../lib/supabaseQueries'
import { stageLabels, stageOrder } from '../lib/stageLabels'
import type { Person, Stage, Engagement, PrayerRequest } from '../types/database'
import StageLevelBadge from './StageLevelBadge'

interface CoachingPipelineProps {
  refreshKey?: number
  onPersonClick?: (person: Person) => void
  onChanged?: () => void
}

const stageColors: Record<Stage, string> = {
  Engage: 'border-blue-200 bg-blue-50',
  Establish: 'border-emerald-200 bg-emerald-50',
  Equip: 'border-amber-200 bg-amber-50',
  Empower: 'border-violet-200 bg-violet-50',
}

const stageHeaderColors: Record<Stage, string> = {
  Engage: 'bg-blue-100 text-blue-900',
  Establish: 'bg-emerald-100 text-emerald-900',
  Equip: 'bg-amber-100 text-amber-900',
  Empower: 'bg-violet-100 text-violet-900',
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
    .sort((a, b) => new Date(a.follow_up_date!).getTime() - new Date(b.follow_up_date!).getTime())

  if (pending.length === 0) return null

  const nextDate = new Date(pending[0].follow_up_date!)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  nextDate.setHours(0, 0, 0, 0)

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
}: {
  person: Person
  engagements: Engagement[]
  prayerCount: number
  daysInStage: number | null
  onAdvance?: (newStage: Stage) => void
  onClick?: () => void
}) {
  const nextFollowUp = formatNextFollowUp(engagements)
  const stageIndex = stageOrder.indexOf(person.current_stage)
  const nextStage = stageIndex < stageOrder.length - 1 ? stageOrder[stageIndex + 1] : null
  const isOverdue = nextFollowUp?.includes('overdue')

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer rounded-xl border p-3 transition-all hover:shadow-md ${stageColors[person.current_stage]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-gray-900">{person.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {daysInStage !== null && (
              <span className={daysInStage > 30 ? 'font-semibold text-amber-700' : ''}>
                {daysInStage}d in stage
              </span>
            )}
            {prayerCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-base">🙏</span>
                {prayerCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {nextFollowUp && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isOverdue
              ? 'bg-red-100 text-red-700'
              : 'bg-white/60 text-gray-700'
          }`}>
            {nextFollowUp}
          </span>
        )}
        {!nextFollowUp && (
          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
            No follow-up set
          </span>
        )}
      </div>

      {nextStage && onAdvance && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAdvance(nextStage)
          }}
          className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Move to {stageLabels[nextStage].name} →
        </button>
      )}
    </div>
  )
}

export default function CoachingPipeline({
  refreshKey = 0,
  onPersonClick,
  onChanged,
}: CoachingPipelineProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    const [peopleResult, engagementsResult, prayerResult] = await Promise.all([
      getPeople(),
      getAllEngagements(),
      getAllPrayerRequests(),
    ])

    if (peopleResult.data) setPeople(peopleResult.data as Person[])
    if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
    if (prayerResult.data) setPrayerRequests(prayerResult.data as PrayerRequest[])
    setLoading(false)
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 py-12 text-center">
        <p className="text-gray-600">Loading pipeline...</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stageOrder.map(stage => (
        <div key={stage} className="flex flex-col">
          <div className={`mb-2 rounded-t-xl px-3 py-2 ${stageHeaderColors[stage]}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StageLevelBadge stage={stage} size="sm" />
                <span className="text-sm font-semibold">{stageLabels[stage].name}</span>
              </div>
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold">
                {peopleByStage[stage].length}
              </span>
            </div>
            <div className="mt-1 text-xs opacity-80">{stageLabels[stage].action}</div>
          </div>

          <div className="flex-1 space-y-2 rounded-b-xl border border-gray-200 bg-gray-50 p-2">
            {peopleByStage[stage].length === 0 ? (
              <div className="rounded-lg bg-white/50 p-3 text-center text-xs text-gray-500">
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
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
