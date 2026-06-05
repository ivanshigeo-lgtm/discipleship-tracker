'use client'

import { useEffect, useMemo, useState } from 'react'
import { getStageChecklistItems } from '../lib/supabaseQueries'
import { stageChecklistTemplates, stages } from '../lib/stageChecklistTemplates'
import { stageLabels } from '../lib/stageLabels'
import type { ChecklistCategory, Person, Stage, StageChecklistItem } from '../types/database'

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

const stageRank: Record<Stage, number> = {
  Engage: 0,
  Establish: 1,
  Equip: 2,
  Empower: 3,
}

const initialsFor = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '★'
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
}

const gemKey = (stage: Stage, category: ChecklistCategory, label: string) => `${stage}-${category}-${label}`

function ProgressRing({
  stageStats,
  size = 160,
  progressPercent = 0,
}: {
  stageStats: Array<{ stage: Stage; completedCount: number; totalCount: number }>
  size?: number
  progressPercent?: number
}) {
  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2 - 4
  const circumference = 2 * Math.PI * radius
  const segmentLength = circumference / 4
  const gap = 8

  // Center glow grows from 15% to 45% of ring radius based on progress
  const minGlowRadius = radius * 0.15
  const maxGlowRadius = radius * 0.5
  const glowRadius = minGlowRadius + (maxGlowRadius - minGlowRadius) * (progressPercent / 100)

  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <defs>
        <filter id="ring-glow-filter">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="center-glow-filter">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="center-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="50%" stopColor="white" stopOpacity="0.5" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(246,241,231,0.08)"
        strokeWidth={strokeWidth}
      />

      {/* Stage segments */}
      {stageStats.map((stat, index) => {
        const color = STAGE_COLORS[stat.stage]
        const completionRatio = stat.totalCount > 0 ? stat.completedCount / stat.totalCount : 0
        const litLength = (segmentLength - gap) * completionRatio
        const offset = -index * segmentLength

        return (
          <g key={stat.stage}>
            {/* Dim segment background */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeOpacity={0.15}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${segmentLength - gap} ${circumference}`}
              strokeDashoffset={offset}
            />
            {/* Lit segment */}
            {litLength > 0 && (
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${litLength} ${circumference}`}
                strokeDashoffset={offset}
                filter="url(#ring-glow-filter)"
                className="transition-all duration-500"
              />
            )}
          </g>
        )
      })}

      {/* Center glow - grows with progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={glowRadius}
        fill="url(#center-glow)"
        filter="url(#center-glow-filter)"
        className="transition-all duration-700"
      />
    </svg>
  )
}

export default function DiscipleStarCard({
  person,
  currentStage,
  refreshKey = 0,
}: {
  person: Person
  currentStage: Stage
  refreshKey?: number
}) {
  const [items, setItems] = useState<StageChecklistItem[]>([])

  useEffect(() => {
    let isMounted = true

    const loadItems = async () => {
      const { data } = await getStageChecklistItems(person.id)
      if (!isMounted) return
      if (data) setItems(data as StageChecklistItem[])
    }

    loadItems()

    return () => {
      isMounted = false
    }
  }, [person.id, refreshKey])

  const stats = useMemo(() => {
    const completedItemKeys = new Set(
      items
        .filter(item => item.completed)
        .map(item => gemKey(item.stage, item.category, item.label))
    )

    const total = stages.reduce((sum, stage) => sum + stageChecklistTemplates[stage].length, 0)
    const stageStats = stages.map(stage => {
      const totalCount = stageChecklistTemplates[stage].length
      const completedCount = stageChecklistTemplates[stage].filter(templateItem => (
        completedItemKeys.has(gemKey(stage, templateItem.category, templateItem.label))
      )).length
      return { stage, completedCount, totalCount }
    })

    const completed = stageStats.reduce((sum, stageStat) => sum + stageStat.completedCount, 0)

    return { total, completed, stageStats }
  }, [items])

  const stageColor = STAGE_COLORS[currentStage]
  const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const initials = initialsFor(person.name)

  return (
    <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* Progress ring with person info */}
        <div className="relative flex flex-col items-center">
          <ProgressRing stageStats={stats.stageStats} size={140} progressPercent={progressPercent} />

          {/* Growing center star glow */}
          <div
            className="absolute left-1/2 top-[70px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-700"
            style={{
              width: 20 + (progressPercent * 0.5),
              height: 20 + (progressPercent * 0.5),
              background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 40%, rgba(255,255,255,0) 70%)',
              boxShadow: `0 0 ${10 + progressPercent * 0.3}px rgba(255,255,255,${0.3 + progressPercent * 0.005})`,
            }}
          />

          {/* Initials overlay */}
          <div
            className="absolute left-1/2 top-[70px] flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold"
            style={{
              background: 'rgba(20,27,61,0.85)',
              border: `2px solid ${stageColor}`,
              color: stageColor,
            }}
          >
            {initials}
          </div>

          {/* Stage label */}
          <div className="mt-2 text-center">
            <div className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">
              Stage {stageRank[currentStage] + 1}
            </div>
            <div className="text-lg font-semibold" style={{ color: stageColor, fontFamily: 'var(--font-display)' }}>
              {stageLabels[currentStage].action}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="flex-1">
          <div className="mb-3 text-xs text-[var(--fg-2)]">
            {person.name} · {stageLabels[currentStage].display}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {stats.stageStats.map(stat => {
              const color = STAGE_COLORS[stat.stage]
              const isCurrent = stat.stage === currentStage
              const percent = stat.totalCount > 0 ? Math.round((stat.completedCount / stat.totalCount) * 100) : 0

              return (
                <div
                  key={stat.stage}
                  className="rounded-lg p-2 text-center"
                  style={{
                    background: isCurrent ? `${color}15` : 'var(--indigo)',
                    border: isCurrent ? `1px solid ${color}40` : '1px solid var(--line-1)',
                  }}
                >
                  <div className="text-[10px] font-semibold" style={{ color }}>
                    {stageLabels[stat.stage].name}
                  </div>
                  <div className="mt-0.5 text-lg font-bold text-[var(--fg-1)]">
                    {stat.completedCount}/{stat.totalCount}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--indigo-2)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${percent}%`, background: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Overall progress */}
          <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-2">
            <div>
              <div className="text-[10px] text-[var(--fg-3)]">Journey Progress</div>
              <div className="text-sm font-bold text-[var(--fg-1)]">{progressPercent}%</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-[var(--fg-3)]">Completed</div>
              <div className="text-sm font-bold text-[var(--fg-1)]">{stats.completed}/{stats.total}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
