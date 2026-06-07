'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllStageChecklistItems,
  getAllDiscipleshipConnections,
  updatePersonStage,
} from '../lib/supabaseQueries'
import { stageChecklistTemplates } from '../lib/stageChecklistTemplates'
import type { Person, StageChecklistItem, DiscipleshipConnection, Stage } from '../types/database'

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

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

const STAGE_ORDER: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']

function ProgressRing({ percentage, size = 48 }: { percentage: number; size?: number }) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (percentage / 100) * circumference
  const equipColor = STAGE_COLORS.Equip

  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(246,241,231,.1)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={equipColor}
        strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 4px ${equipColor})` }}
      />
    </svg>
  )
}

function TeamMemberCard({
  progress,
  isReady,
  onPersonClick,
  onEmpower,
  empowering,
}: {
  progress: EquipProgress
  isReady: boolean
  onPersonClick: () => void
  onEmpower: () => void
  empowering: boolean
}) {
  const { person, percentage, missingItems, coachingCount } = progress
  const equipColor = STAGE_COLORS.Equip
  const empowerColor = STAGE_COLORS.Empower

  const initials = person.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      onClick={onPersonClick}
      className="group cursor-pointer rounded-xl border border-[var(--line-1)] p-4 transition-all hover:border-[var(--line-2)]"
      style={{
        background: isReady
          ? `linear-gradient(135deg, rgba(240,114,159,.08) 0%, var(--indigo-2) 100%)`
          : 'var(--indigo-2)',
        boxShadow: isReady
          ? `0 0 20px -6px ${empowerColor}40, inset 0 1px 0 rgba(246,241,231,.05)`
          : 'inset 0 1px 0 rgba(246,241,231,.05)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Progress ring with initials */}
        <div className="relative">
          <ProgressRing percentage={percentage} size={52} />
          <div
            className="absolute inset-0 flex items-center justify-center text-xs font-bold"
            style={{ color: equipColor }}
          >
            {initials}
          </div>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-[var(--fg-1)]">{person.name}</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold"
              style={{
                background: isReady ? `${empowerColor}25` : `${equipColor}20`,
                color: isReady ? empowerColor : equipColor,
              }}
            >
              {percentage}%
            </span>
          </div>

          {coachingCount > 0 && (
            <p className="mt-1 text-xs" style={{ color: empowerColor }}>
              Coaching {coachingCount} {coachingCount === 1 ? 'person' : 'people'}
            </p>
          )}

          {/* Progress bar */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--indigo)]">
            <div
              className="h-full transition-all"
              style={{
                width: `${percentage}%`,
                background: isReady
                  ? `linear-gradient(90deg, ${equipColor}, ${empowerColor})`
                  : equipColor,
                boxShadow: `0 0 8px ${isReady ? empowerColor : equipColor}60`,
              }}
            />
          </div>

          {/* Missing items */}
          {!isReady && missingItems.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-[var(--fg-3)]">Still needed:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {missingItems.slice(0, 2).map((item, idx) => (
                  <span
                    key={idx}
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{
                      background: 'var(--indigo-3)',
                      color: 'var(--fg-2)',
                    }}
                  >
                    {item.length > 25 ? item.slice(0, 25) + '...' : item}
                  </span>
                ))}
                {missingItems.length > 2 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: 'var(--indigo-3)', color: 'var(--fg-3)' }}
                  >
                    +{missingItems.length - 2} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Empower button or arrow */}
        {isReady ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onEmpower()
            }}
            disabled={empowering}
            className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all disabled:opacity-50"
            style={{
              background: empowerColor,
              color: 'var(--void)',
              boxShadow: `0 0 16px ${empowerColor}50`,
            }}
          >
            {empowering ? 'Moving...' : 'Empower →'}
          </button>
        ) : (
          <span className="shrink-0 text-[var(--fg-3)] group-hover:text-[var(--fg-2)]">→</span>
        )}
      </div>
    </div>
  )
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
  const [isExpanded, setIsExpanded] = useState(false)
  const [empowering, setEmpowering] = useState<string | null>(null)

  const loadData = async (retry = true) => {
    setLoading(true)
    try {
      const [peopleResult, checklistResult, connectionsResult] = await Promise.race([
        Promise.all([
          getPeople(['Equip']),
          getAllStageChecklistItems(),
          getAllDiscipleshipConnections(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])

      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (checklistResult.data) setChecklistItems(checklistResult.data as StageChecklistItem[])
      if (connectionsResult.data) setConnections(connectionsResult.data as DiscipleshipConnection[])
      setLoading(false)
    } catch (err) {
      console.error('EmergingTeamSection load error:', err)
      if (retry) {
        setTimeout(() => loadData(false), 2000)
      } else {
        setLoading(false)
      }
    }
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
    return (
      <section className="cn-card mb-6 p-4">
        <h2 className="cn-h3">Emerging Team</h2>
        <p className="mt-2 text-sm text-[var(--fg-3)]">Loading...</p>
      </section>
    )
  }

  if (people.length === 0) {
    return null
  }

  const equipColor = STAGE_COLORS.Equip
  const empowerColor = STAGE_COLORS.Empower

  return (
    <section className="cn-card mb-6 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm"
              style={{
                background: `${equipColor}20`,
                border: `2px solid ${equipColor}`,
                boxShadow: `0 0 12px ${equipColor}40`,
                color: equipColor,
              }}
            >
              ✦
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="cn-h3">Emerging Team</h2>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ background: `${equipColor}20`, color: equipColor }}
                >
                  {people.length}
                </span>
              </div>
              <p className="text-sm text-[var(--fg-2)]">
                People being equipped to lead and multiply
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="cn-chip self-start sm:self-center"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-5 space-y-5">
          {/* Ready to Empower */}
          {readyToEmpower.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: empowerColor, boxShadow: `0 0 8px ${empowerColor}` }}
                />
                <span className="text-sm font-semibold" style={{ color: empowerColor }}>
                  Ready to Empower
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ background: `${empowerColor}20`, color: empowerColor }}
                >
                  {readyToEmpower.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {readyToEmpower.map(progress => (
                  <TeamMemberCard
                    key={progress.person.id}
                    progress={progress}
                    isReady={true}
                    onPersonClick={() => onPersonClick?.(progress.person)}
                    onEmpower={() => handleEmpower(progress.person.id)}
                    empowering={empowering === progress.person.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* In Progress */}
          {inProgress.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: equipColor, boxShadow: `0 0 8px ${equipColor}` }}
                />
                <span className="text-sm font-semibold" style={{ color: equipColor }}>
                  In Progress
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-bold"
                  style={{ background: `${equipColor}20`, color: equipColor }}
                >
                  {inProgress.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {inProgress.map(progress => (
                  <TeamMemberCard
                    key={progress.person.id}
                    progress={progress}
                    isReady={false}
                    onPersonClick={() => onPersonClick?.(progress.person)}
                    onEmpower={() => {}}
                    empowering={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
