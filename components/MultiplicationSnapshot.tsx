'use client'

import { useEffect, useState } from 'react'
import { getPeople, getAllDiscipleshipConnections } from '../lib/supabaseQueries'
import { stageLabels } from '../lib/stageLabels'
import type { Person, Stage, DiscipleshipConnection } from '../types/database'

type SnapshotFilter = {
  key: string
  label: string
  stages?: Stage[]
}

interface MultiplicationSnapshotProps {
  refreshKey?: number
  selectedFilterKeys?: string[]
  onToggleFilter?: (filter: SnapshotFilter) => void
}

const stageFilters: Record<Stage, SnapshotFilter> = {
  Engage: { key: 'Engage', label: stageLabels.Engage.display, stages: ['Engage'] },
  Establish: { key: 'Establish', label: stageLabels.Establish.display, stages: ['Establish'] },
  Equip: { key: 'Equip', label: stageLabels.Equip.display, stages: ['Equip'] },
  Empower: { key: 'Empower', label: stageLabels.Empower.display, stages: ['Empower'] },
}

const stageButtonLabel: Record<Stage, string> = {
  Engage: 'Engage',
  Establish: 'Establish',
  Equip: 'Equip',
  Empower: 'Empower',
}

function MultiplicationRatioVisual({ ratio, label }: { ratio: number; label: string }) {
  const barWidth = Math.min(ratio, 100)
  const isHealthy = ratio >= 50
  const isGood = ratio >= 75

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className={`font-bold ${isGood ? 'text-emerald-600' : isHealthy ? 'text-amber-600' : 'text-red-600'}`}>
          {ratio}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full transition-all ${
            isGood ? 'bg-emerald-500' : isHealthy ? 'bg-amber-500' : 'bg-red-400'
          }`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-500">
        <span>0%</span>
        <span className="text-gray-400">|</span>
        <span>50%</span>
        <span className="text-gray-400">|</span>
        <span>100%+</span>
      </div>
    </div>
  )
}

export default function MultiplicationSnapshot({
  refreshKey = 0,
  selectedFilterKeys = [],
  onToggleFilter,
}: MultiplicationSnapshotProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [connections, setConnections] = useState<DiscipleshipConnection[]>([])
  const [isExpanded, setIsExpanded] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const [peopleResult, connectionsResult] = await Promise.all([
        getPeople(),
        getAllDiscipleshipConnections(),
      ])
      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (connectionsResult.data) setConnections(connectionsResult.data as DiscipleshipConnection[])
    }

    loadData()
  }, [refreshKey])

  const engageCount = people.filter(person => person.current_stage === 'Engage').length
  const establishCount = people.filter(person => person.current_stage === 'Establish').length
  const equipCount = people.filter(person => person.current_stage === 'Equip').length
  const empowerCount = people.filter(person => person.current_stage === 'Empower').length
  const totalPeople = people.length

  const peopleBeingReachedAndBuilt = engageCount + establishCount
  const leadersBeingFormed = equipCount + empowerCount
  const leaderPipelineRatio = peopleBeingReachedAndBuilt > 0
    ? Math.round((leadersBeingFormed / peopleBeingReachedAndBuilt) * 100)
    : 100

  const activeDisciplers = new Set(connections.map(c => c.discipler_person_id))
  const multiplicationRatio = totalPeople > 0
    ? Math.round((activeDisciplers.size / totalPeople) * 100)
    : 0

  const renderStageButton = (stage: Stage, detail?: string) => {
    const filter = stageFilters[stage]
    const isSelected = selectedFilterKeys.includes(filter.key)

    return (
      <button
        key={`${stage}-${detail ?? 'stage'}`}
        type="button"
        onClick={() => onToggleFilter?.(filter)}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
          isSelected
            ? 'bg-black text-white ring-2 ring-black ring-offset-1'
            : 'bg-black text-white hover:bg-gray-800'
        }`}
        aria-pressed={isSelected}
      >
        {stageButtonLabel[stage]}{detail ? ` ${detail}` : ''}
      </button>
    )
  }

  const metrics = [
    {
      label: 'Reach & Build',
      value: peopleBeingReachedAndBuilt,
      description: 'People in Engage + Establish who need relational care',
      tone: 'border-blue-200 bg-blue-50 text-blue-900',
      stageButtons: [renderStageButton('Engage'), renderStageButton('Establish')],
    },
    {
      label: 'Emerging Team',
      value: equipCount,
      description: 'People being trained to carry others',
      tone: 'border-amber-200 bg-amber-50 text-amber-900',
      stageButtons: [renderStageButton('Equip')],
    },
    {
      label: 'Empowered Leaders',
      value: empowerCount,
      description: 'People released to lead and multiply',
      tone: 'border-violet-200 bg-violet-50 text-violet-900',
      stageButtons: [renderStageButton('Empower')],
    },
    {
      label: 'Leader Pipeline',
      value: leadersBeingFormed,
      description: `${leaderPipelineRatio}% as many leaders forming as people being reached/built`,
      tone: leaderPipelineRatio >= 50
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
        : 'border-yellow-200 bg-yellow-50 text-yellow-900',
      stageButtons: [renderStageButton('Equip'), renderStageButton('Empower')],
    },
  ]

  return (
    <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Multiplication Snapshot</h2>
            <p className="text-sm text-gray-700">Are you building a team that disciples people?</p>
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(current => !current)}
            className="self-start rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 sm:self-center"
            aria-expanded={isExpanded}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-gray-700">Multiplication Health</div>
                <p className="mt-1 text-xs text-gray-600">
                  {activeDisciplers.size} of {totalPeople} people are actively coaching someone
                </p>
                <MultiplicationRatioVisual ratio={multiplicationRatio} label="People who are coaching" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700">Leader Pipeline Health</div>
                <p className="mt-1 text-xs text-gray-600">
                  {leadersBeingFormed} leaders forming for {peopleBeingReachedAndBuilt} being reached
                </p>
                <MultiplicationRatioVisual ratio={leaderPipelineRatio} label="Leaders per people reached" />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map(metric => (
              <div
                key={metric.label}
                className={`rounded-xl border p-3 text-left ${metric.tone}`}
              >
                <div className="text-2xl font-bold">{metric.value}</div>
                <div className="mt-1 text-sm font-semibold leading-5">{metric.label}</div>
                <div className="mt-1 text-xs leading-4 opacity-80">{metric.description}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {metric.stageButtons}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
