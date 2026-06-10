'use client'

import { useEffect, useMemo, useState } from 'react'
import { getStageChecklistItems } from '../lib/supabaseQueries'
import { stageChecklistTemplates, stages } from '../lib/stageChecklistTemplates'
import { stageLabels } from '../lib/stageLabels'
import type { ChecklistCategory, Person, Stage, StageChecklistItem } from '../types/database'

const pulseKeyframes = `
@keyframes starTwinkle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
`

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

const STAR_COLORS: Record<Stage, { core: string; glow: string }> = {
  Engage: { core: '#FFFFFF', glow: '#FFB840' },      // Yellow/Gold
  Establish: { core: '#FFFFFF', glow: '#40C060' },   // Green
  Equip: { core: '#FFFFFF', glow: '#4080FF' },       // Blue
  Empower: { core: '#FFFFFF', glow: '#FF4060' },     // Red
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
}: {
  stageStats: Array<{ stage: Stage; completedCount: number; totalCount: number }>
  size?: number
}) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2 - 4
  const circumference = 2 * Math.PI * radius
  const segmentLength = circumference / 4
  const gap = 8

  return (
    <svg width={size} height={size} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
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
      {(stageStats || []).map((stat, index) => {
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
                className="transition-all duration-500"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

function ProgressStar({
  stage,
  progressPercent = 0,
  size = 140,
  stageStats,
}: {
  stage: Stage
  progressPercent?: number
  size?: number
  stageStats: Array<{ stage: Stage; completedCount: number; totalCount: number }>
}) {
  const starColor = STAR_COLORS[stage]

  // Scale factor for core and spikes
  const scale = 1 + (progressPercent * 0.006) // 1.0 at 0%, 1.6 at 100%

  const coreSize = 14 * scale
  // Glow fills the entire ring at 100% (ring is ~130px diameter inside the 140px container)
  const glowSize = 40 + (progressPercent * 0.9) // 40px at 0%, 130px at 100%

  // Spike lengths scale with progress
  const bottomSpike = 42 * scale
  const topSpike = 32 * scale
  const horizontalSpike = 26 * scale
  const diagonalSpike = 16 * scale

  const cx = size / 2
  const cy = size / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Progress ring */}
      <ProgressRing stageStats={stageStats} size={size} />

      {/* Warm glow halo */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: glowSize,
          height: glowSize,
          background: `radial-gradient(circle, ${starColor.glow}60 0%, ${starColor.glow}30 40%, transparent 70%)`,
        }}
      />

      {/* 8-point star spikes */}
      <svg
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        width={size}
        height={size}
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Spike going UP - gradient from tip to center */}
          <linearGradient id={`upSpike-${stage}`} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor={starColor.glow} stopOpacity="0.1" />
            <stop offset="70%" stopColor={starColor.glow} stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
          </linearGradient>
          {/* Spike going DOWN */}
          <linearGradient id={`downSpike-${stage}`} x1="50%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stopColor={starColor.glow} stopOpacity="0.1" />
            <stop offset="70%" stopColor={starColor.glow} stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
          </linearGradient>
          {/* Spike going LEFT */}
          <linearGradient id={`leftSpike-${stage}`} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor={starColor.glow} stopOpacity="0.1" />
            <stop offset="70%" stopColor={starColor.glow} stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
          </linearGradient>
          {/* Spike going RIGHT */}
          <linearGradient id={`rightSpike-${stage}`} x1="100%" y1="50%" x2="0%" y2="50%">
            <stop offset="0%" stopColor={starColor.glow} stopOpacity="0.1" />
            <stop offset="70%" stopColor={starColor.glow} stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* Main 4 spikes - tapered triangles */}
        {/* Top spike */}
        <polygon
          points={`${cx},${cy - topSpike} ${cx - 2.5},${cy} ${cx + 2.5},${cy}`}
          fill={`url(#upSpike-${stage})`}
        />
        {/* Bottom spike (longest) */}
        <polygon
          points={`${cx},${cy + bottomSpike} ${cx - 3},${cy} ${cx + 3},${cy}`}
          fill={`url(#downSpike-${stage})`}
        />
        {/* Left spike */}
        <polygon
          points={`${cx - horizontalSpike},${cy} ${cx},${cy - 2.5} ${cx},${cy + 2.5}`}
          fill={`url(#leftSpike-${stage})`}
        />
        {/* Right spike */}
        <polygon
          points={`${cx + horizontalSpike},${cy} ${cx},${cy - 2.5} ${cx},${cy + 2.5}`}
          fill={`url(#rightSpike-${stage})`}
        />

        {/* Diagonal spikes - thinner, shorter */}
        {/* Top-left */}
        <polygon
          points={`${cx - diagonalSpike * 0.707},${cy - diagonalSpike * 0.707} ${cx - 1},${cy + 1} ${cx + 1},${cy - 1}`}
          fill={starColor.glow}
          fillOpacity="0.6"
        />
        {/* Top-right */}
        <polygon
          points={`${cx + diagonalSpike * 0.707},${cy - diagonalSpike * 0.707} ${cx - 1},${cy - 1} ${cx + 1},${cy + 1}`}
          fill={starColor.glow}
          fillOpacity="0.6"
        />
        {/* Bottom-left */}
        <polygon
          points={`${cx - diagonalSpike * 0.707},${cy + diagonalSpike * 0.707} ${cx + 1},${cy + 1} ${cx - 1},${cy - 1}`}
          fill={starColor.glow}
          fillOpacity="0.6"
        />
        {/* Bottom-right */}
        <polygon
          points={`${cx + diagonalSpike * 0.707},${cy + diagonalSpike * 0.707} ${cx + 1},${cy - 1} ${cx - 1},${cy + 1}`}
          fill={starColor.glow}
          fillOpacity="0.6"
        />
      </svg>

      {/* Bright core - white center fading to color */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: coreSize,
          height: coreSize,
          background: `radial-gradient(circle at 45% 45%, #FFFFFF 0%, #FFFFFF 30%, ${starColor.glow} 100%)`,
          boxShadow: `
            0 0 ${8 + progressPercent * 0.15}px #FFFFFF,
            0 0 ${15 + progressPercent * 0.25}px ${starColor.glow},
            0 0 ${25 + progressPercent * 0.35}px ${starColor.glow}90
          `,
        }}
      />
    </div>
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
        {/* Star with progress-based glow */}
        <div className="relative flex flex-col items-center">
          <style>{pulseKeyframes}</style>
          <ProgressStar stage={currentStage} progressPercent={progressPercent} size={140} stageStats={stats.stageStats} />

          {/* Stage label */}
          <div className="mt-1 text-center">
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
