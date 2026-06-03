'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllStageChecklistItems,
  getAllDiscipleshipConnections,
  updatePersonStage,
} from '../lib/supabaseQueries'
import { stageChecklistTemplates } from '../lib/stageChecklistTemplates'
import type { Person, StageChecklistItem, DiscipleshipConnection } from '../types/database'
import StageLevelBadge from './StageLevelBadge'

interface EmergingTeamSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person) => void
  onChanged?: () => void
}

type EquipProgress = {
  person: Person
  completedCount: number
  totalCount: number
  percentage: number
  missingItems: string[]
  isCoachingOthers: boolean
  coachingCount: number
}

export default function EmergingTeamSection({
  refreshKey = 0,
  onPersonClick,
  onChanged,
}: EmergingTeamSectionProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [connections, setConnections] = useState<DiscipleshipConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)
  const [empowering, setEmpowering] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    const [peopleResult, checklistResult, connectionsResult] = await Promise.all([
      getPeople(['Equip']),
      getAllStageChecklistItems(),
      getAllDiscipleshipConnections(),
    ])

    if (peopleResult.data) setPeople(peopleResult.data as Person[])
    if (checklistResult.data) setChecklistItems(checklistResult.data as StageChecklistItem[])
    if (connectionsResult.data) setConnections(connectionsResult.data as DiscipleshipConnection[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const equipProgressList = useMemo(() => {
    const equipTemplate = stageChecklistTemplates['Equip']
    const totalCount = equipTemplate.length

    return people.map(person => {
      const personItems = checklistItems.filter(item =>
        item.person_id === person.id && item.stage === 'Equip'
      )

      const completedLabels = new Set(
        personItems.filter(item => item.completed).map(item => item.label)
      )

      const completedCount = equipTemplate.filter(
        template => completedLabels.has(template.label)
      ).length

      const missingItems = equipTemplate
        .filter(template => !completedLabels.has(template.label))
        .map(template => template.label)

      const coachingConnections = connections.filter(
        c => c.discipler_person_id === person.id
      )

      return {
        person,
        completedCount,
        totalCount,
        percentage: Math.round((completedCount / totalCount) * 100),
        missingItems,
        isCoachingOthers: coachingConnections.length > 0,
        coachingCount: coachingConnections.length,
      } as EquipProgress
    }).sort((a, b) => b.percentage - a.percentage)
  }, [people, checklistItems, connections])

  const readyToEmpower = equipProgressList.filter(p => p.percentage >= 80)
  const inProgress = equipProgressList.filter(p => p.percentage < 80)

  const handleEmpower = async (personId: string) => {
    setEmpowering(personId)
    await updatePersonStage(personId, 'Empower')
    await loadData()
    onChanged?.()
    setEmpowering(null)
  }

  if (loading) {
    return null
  }

  if (people.length === 0) {
    return null
  }

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StageLevelBadge stage="Equip" size="sm" />
            <h2 className="text-lg font-semibold text-amber-900">Emerging Team</h2>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {people.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-amber-800">
            People being equipped to lead and multiply
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="self-start rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {readyToEmpower.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-emerald-800">Ready to Empower</span>
                <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {readyToEmpower.length}
                </span>
              </div>
              <div className="space-y-2">
                {readyToEmpower.map(({ person, percentage, coachingCount }) => (
                  <div
                    key={person.id}
                    className="cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50 p-3 transition-all hover:shadow-md"
                    onClick={() => onPersonClick?.(person)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-gray-900">{person.name}</span>
                          <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {percentage}% complete
                          </span>
                        </div>
                        {coachingCount > 0 && (
                          <p className="mt-1 text-xs text-emerald-700">
                            Already coaching {coachingCount} {coachingCount === 1 ? 'person' : 'people'}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEmpower(person.id)
                        }}
                        disabled={empowering === person.id}
                        className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {empowering === person.id ? 'Moving...' : 'Empower →'}
                      </button>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-200">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inProgress.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold text-amber-800">In Progress</span>
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {inProgress.length}
                </span>
              </div>
              <div className="space-y-2">
                {inProgress.map(({ person, percentage, missingItems, coachingCount }) => (
                  <div
                    key={person.id}
                    className="cursor-pointer rounded-xl border border-amber-200 bg-white p-3 transition-all hover:shadow-md"
                    onClick={() => onPersonClick?.(person)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-gray-900">{person.name}</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            {percentage}%
                          </span>
                        </div>
                        {coachingCount > 0 && (
                          <p className="mt-1 text-xs text-violet-700">
                            Coaching {coachingCount} {coachingCount === 1 ? 'person' : 'people'}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-gray-400">→</span>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full bg-amber-400 transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>

                    {missingItems.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-600">Still needed:</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {missingItems.slice(0, 3).map((item, idx) => (
                            <span
                              key={idx}
                              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                            >
                              {item.length > 30 ? item.slice(0, 30) + '...' : item}
                            </span>
                          ))}
                          {missingItems.length > 3 && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              +{missingItems.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
