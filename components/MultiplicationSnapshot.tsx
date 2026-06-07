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
  onAddPerson?: () => void
  onPersonClick?: (person: Person) => void
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

const stageColors: Record<Stage, { color: string; glow: string }> = {
  Engage: { color: 'var(--engage)', glow: 'var(--engage-glow)' },
  Establish: { color: 'var(--establish)', glow: 'var(--establish-glow)' },
  Equip: { color: 'var(--equip)', glow: 'var(--equip-glow)' },
  Empower: { color: 'var(--empower)', glow: 'var(--empower-glow)' },
}

function MultiplicationRatioVisual({ ratio, label, color }: { ratio: number; label: string; color?: string }) {
  const barWidth = Math.min(ratio, 100)
  const isHealthy = ratio >= 50
  const isGood = ratio >= 75

  const barColor = color || (isGood ? 'var(--success)' : isHealthy ? 'var(--warning)' : 'var(--danger)')

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--fg-2)]">{label}</span>
        <span className="font-bold" style={{ color: barColor }}>
          {ratio}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--indigo)]">
        <div
          className="h-full transition-all"
          style={{ width: `${barWidth}%`, background: barColor }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--fg-3)]">
        <span>0%</span>
        <span style={{ color: 'var(--line-2)' }}>|</span>
        <span>50%</span>
        <span style={{ color: 'var(--line-2)' }}>|</span>
        <span>100%+</span>
      </div>
    </div>
  )
}

export default function MultiplicationSnapshot({
  refreshKey = 0,
  selectedFilterKeys = [],
  onToggleFilter,
  onAddPerson,
  onPersonClick,
}: MultiplicationSnapshotProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [connections, setConnections] = useState<DiscipleshipConnection[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)

  const searchResults = searchQuery.trim()
    ? people
        .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 5)
    : []

  useEffect(() => {
    const loadData = async () => {
      try {
        const [peopleResult, connectionsResult] = await Promise.race([
          Promise.all([
            getPeople(),
            getAllDiscipleshipConnections(),
          ]),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ])
        if (peopleResult.data) setPeople(peopleResult.data as Person[])
        if (connectionsResult.data) setConnections(connectionsResult.data as DiscipleshipConnection[])
      } catch (err) {
        console.error('MultiplicationSnapshot load error:', err)
      }
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

  const renderStageButton = (stage: Stage) => {
    const filter = stageFilters[stage]
    const isSelected = selectedFilterKeys.includes(filter.key)
    const colors = stageColors[stage]

    return (
      <button
        key={stage}
        type="button"
        onClick={() => onToggleFilter?.(filter)}
        className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
        style={{
          background: isSelected ? colors.color : 'var(--indigo)',
          color: isSelected ? 'var(--void)' : colors.color,
          boxShadow: isSelected ? `0 0 12px ${colors.glow}` : 'none',
          border: `1px solid ${isSelected ? colors.color : 'var(--line-2)'}`,
        }}
        aria-pressed={isSelected}
      >
        {stageButtonLabel[stage]}
      </button>
    )
  }

  const metrics: Array<{
    label: string
    value: number
    description: string
    stages: Stage[]
    accentColor: string
    glowColor: string
  }> = [
    {
      label: 'Reach & Build',
      value: peopleBeingReachedAndBuilt,
      description: 'People in Engage + Establish who need relational care',
      stages: ['Engage', 'Establish'],
      accentColor: 'var(--engage)',
      glowColor: 'var(--engage-glow)',
    },
    {
      label: 'Emerging Team',
      value: equipCount,
      description: 'People being trained to carry others',
      stages: ['Equip'],
      accentColor: 'var(--equip)',
      glowColor: 'var(--equip-glow)',
    },
    {
      label: 'Empowered Leaders',
      value: empowerCount,
      description: 'People released to lead and multiply',
      stages: ['Empower'],
      accentColor: 'var(--empower)',
      glowColor: 'var(--empower-glow)',
    },
    {
      label: 'Leader Pipeline',
      value: leadersBeingFormed,
      description: `${leaderPipelineRatio}% as many leaders forming as people being reached/built`,
      stages: ['Equip', 'Empower'],
      accentColor: 'var(--establish)',
      glowColor: 'var(--establish-glow)',
    },
  ]

  return (
    <section className="cn-card mb-8 p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="cn-h3">Multiplication Snapshot</h2>
            <p className="text-sm text-[var(--fg-2)]">Are you building a team that disciples people?</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {/* Search */}
            {onPersonClick && (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowSearchResults(true)
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 150)}
                  placeholder="Search people..."
                  className="w-36 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-2.5 py-1.5 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none sm:w-44"
                />
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] py-1 shadow-xl">
                    {searchResults.map(person => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => {
                          onPersonClick(person)
                          setSearchQuery('')
                          setShowSearchResults(false)
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--indigo-3)]"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                          style={{
                            border: `1.5px solid ${stageColors[person.current_stage].color}`,
                            color: stageColors[person.current_stage].color,
                          }}
                        >
                          {person.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate text-[var(--fg-1)]">{person.name}</span>
                        <span className="ml-auto text-[10px]" style={{ color: stageColors[person.current_stage].color }}>
                          {person.current_stage}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {onAddPerson && (
              <button
                type="button"
                onClick={onAddPerson}
                className="cn-btn cn-btn-primary !px-3 !py-1.5 !text-xs"
              >
                + Add Person
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsExpanded(current => !current)}
              className="cn-chip"
              aria-expanded={isExpanded}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

      {isExpanded && (
        <>
          <div className="mt-4 rounded-xl border border-[var(--line-1)] bg-[var(--indigo)] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-[var(--fg-1)]">Multiplication Health</div>
                <p className="mt-1 text-xs text-[var(--fg-3)]">
                  {activeDisciplers.size} of {totalPeople} people are actively coaching someone
                </p>
                <MultiplicationRatioVisual ratio={multiplicationRatio} label="People who are coaching" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--fg-1)]">Leader Pipeline Health</div>
                <p className="mt-1 text-xs text-[var(--fg-3)]">
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
                className="rounded-xl border p-3 text-left"
                style={{
                  background: 'var(--indigo)',
                  borderColor: `color-mix(in srgb, ${metric.accentColor} 30%, transparent)`,
                  boxShadow: `inset 0 1px 0 rgba(246,241,231,.04), 0 0 20px -8px ${metric.glowColor}`,
                }}
              >
                <div
                  className="text-2xl font-bold"
                  style={{ color: metric.accentColor }}
                >
                  {metric.value}
                </div>
                <div className="mt-1 text-sm font-semibold leading-5 text-[var(--fg-1)]">{metric.label}</div>
                <div className="mt-1 text-xs leading-4 text-[var(--fg-3)]">{metric.description}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {metric.stages.map(stage => renderStageButton(stage))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
    </section>
  )
}
