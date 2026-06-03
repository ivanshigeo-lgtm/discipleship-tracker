'use client'

import { useEffect, useMemo, useState } from 'react'
import { getStageChecklistItems } from '../lib/supabaseQueries'
import { stageChecklistTemplates, stages } from '../lib/stageChecklistTemplates'
import { stageLabels } from '../lib/stageLabels'
import type { ChecklistCategory, Person, Stage, StageChecklistItem } from '../types/database'

const stageRank: Record<Stage, number> = {
  Engage: 0,
  Establish: 1,
  Equip: 2,
  Empower: 3,
}

const stageJourneyTitles: Record<Stage, { level: string; verb: string; title: string; mission: string }> = {
  Engage: {
    level: 'Stage 1',
    verb: 'Reaching',
    title: 'Engage — Reach',
    mission: 'Reach with love, SALT, testimony, prayer, and meaningful connection.',
  },
  Establish: {
    level: 'Stage 2',
    verb: 'Building',
    title: 'Establish — Build',
    mission: 'Build foundations, community, baptism steps, and daily Word rhythms.',
  },
  Equip: {
    level: 'Stage 3',
    verb: 'Training',
    title: 'Equip — Train',
    mission: 'Train toward serving, sharing, leading, and discipling others.',
  },
  Empower: {
    level: 'Stage 4',
    verb: 'Releasing',
    title: 'Empower — Release',
    mission: 'Release to lead a Grace Group, identify their circle, and form a new orbit.',
  },
}

const stageVisuals: Record<Stage, {
  aura: string
  star: string
  glow: string
  text: string
  ring: string
  ringSoft: string
  gem: string
  softGem: string
}> = {
  Engage: {
    aura: 'from-sky-500/28 via-blue-500/14 to-slate-950',
    star: 'from-sky-100 via-blue-300 to-blue-600',
    glow: 'shadow-[0_0_42px_rgba(96,165,250,0.62)]',
    text: 'text-sky-100',
    ring: '#38bdf8',
    ringSoft: 'rgba(56,189,248,0.18)',
    gem: 'border-sky-200 bg-sky-400 text-sky-950 shadow-sky-400/50',
    softGem: 'border-sky-300/30 bg-sky-400/15 text-sky-50',
  },
  Establish: {
    aura: 'from-emerald-400/28 via-green-500/14 to-slate-950',
    star: 'from-emerald-100 via-green-300 to-emerald-600',
    glow: 'shadow-[0_0_52px_rgba(52,211,153,0.68)]',
    text: 'text-emerald-100',
    ring: '#34d399',
    ringSoft: 'rgba(52,211,153,0.18)',
    gem: 'border-emerald-200 bg-emerald-400 text-emerald-950 shadow-emerald-400/50',
    softGem: 'border-emerald-300/30 bg-emerald-400/15 text-emerald-50',
  },
  Equip: {
    aura: 'from-purple-400/28 via-violet-500/14 to-slate-950',
    star: 'from-purple-100 via-violet-300 to-purple-600',
    glow: 'shadow-[0_0_62px_rgba(196,181,253,0.78)]',
    text: 'text-purple-100',
    ring: '#a78bfa',
    ringSoft: 'rgba(167,139,250,0.18)',
    gem: 'border-purple-200 bg-purple-400 text-purple-950 shadow-purple-400/50',
    softGem: 'border-purple-300/30 bg-purple-400/15 text-purple-50',
  },
  Empower: {
    aura: 'from-yellow-300/30 via-amber-400/16 to-slate-950',
    star: 'from-white via-yellow-200 to-amber-500',
    glow: 'shadow-[0_0_82px_rgba(251,191,36,0.95)]',
    text: 'text-amber-100',
    ring: '#facc15',
    ringSoft: 'rgba(250,204,21,0.2)',
    gem: 'border-yellow-100 bg-yellow-300 text-amber-950 shadow-yellow-300/60',
    softGem: 'border-yellow-300/30 bg-yellow-300/15 text-yellow-50',
  },
}

const cosmicStars = [
  { left: '7%', top: '12%', size: 2, delay: '0s' },
  { left: '18%', top: '78%', size: 1, delay: '0.4s' },
  { left: '31%', top: '18%', size: 1, delay: '0.9s' },
  { left: '46%', top: '86%', size: 2, delay: '1.2s' },
  { left: '57%', top: '10%', size: 1, delay: '0.2s' },
  { left: '68%', top: '72%', size: 1, delay: '1.5s' },
  { left: '79%', top: '22%', size: 2, delay: '0.7s' },
  { left: '91%', top: '58%', size: 1, delay: '1.1s' },
  { left: '12%', top: '42%', size: 1, delay: '1.8s' },
  { left: '38%', top: '62%', size: 2, delay: '0.6s' },
  { left: '84%', top: '84%', size: 1, delay: '0.3s' },
  { left: '63%', top: '39%', size: 1, delay: '1.4s' },
]

const orbitSparkles = [
  { angle: -78, radius: 67, size: 2, delay: '0s' },
  { angle: -28, radius: 75, size: 1, delay: '0.5s' },
  { angle: 18, radius: 64, size: 2, delay: '1s' },
  { angle: 66, radius: 78, size: 1, delay: '1.5s' },
  { angle: 124, radius: 70, size: 2, delay: '0.8s' },
  { angle: 172, radius: 76, size: 1, delay: '1.8s' },
  { angle: 218, radius: 66, size: 2, delay: '0.25s' },
  { angle: 286, radius: 80, size: 1, delay: '1.25s' },
]

const gemIconFor = (label: string) => {
  const lower = label.toLowerCase()
  if (lower.includes('salt')) return '◆'
  if (lower.includes('testimony')) return '✦'
  if (lower.includes('pray')) return '✧'
  if (lower.includes('one2one') || lower.includes('one-to-one')) return '◇'
  if (lower.includes('baptism')) return '✹'
  if (lower.includes('soap')) return '✥'
  if (lower.includes('group')) return '✶'
  if (lower.includes('leadership')) return '✷'
  if (lower.includes('serving') || lower.includes('ministry')) return '✣'
  if (lower.includes('circle')) return '✺'
  if (lower.includes('disciples')) return '✸'
  return '◆'
}

const gemRarityFor = (label: string) => {
  const lower = label.toLowerCase()
  if (lower.includes('making disciples') || lower.includes('lead a grace group') || lower.includes('empowering leaders')) return 'Legendary'
  if (lower.includes('one2one') || lower.includes('biblical foundation') || lower.includes('church community') || lower.includes('leadership')) return 'Rare'
  if (lower.includes('salt') || lower.includes('testimony') || lower.includes('baptism')) return 'Milestone'
  return 'Gem'
}

const rarityClassFor = (rarity: string) => {
  if (rarity === 'Legendary') return 'ring-2 ring-yellow-100/80 shadow-[0_0_22px_rgba(250,204,21,0.75)]'
  if (rarity === 'Rare') return 'ring-2 ring-white/55 shadow-[0_0_18px_rgba(255,255,255,0.45)]'
  if (rarity === 'Milestone') return 'ring-1 ring-white/35 shadow-[0_0_14px_rgba(255,255,255,0.32)]'
  return ''
}

const shortGemLabel = (label: string) => {
  return label
    .replace('Use SALT (Start a conversation, Ask Questions, Listen, Testimony)', 'SALT')
    .replace('Prepare 2min Testimony', '2min Testimony')
    .replace('Meaningful Connection - Implement SALT. Hear their story. Share yours.', 'Meaningful Connection')
    .replace('Completed One2One', 'One-to-One')
    .replace('Completed Biblical Foundation', 'Biblical Foundation')
    .replace('Completed Church Community', 'Church Community')
    .replace('Water baptism conversation', 'Baptism Conversation')
    .replace('Confirm salvation / spiritual birthday', 'Spiritual Birthday')
    .replace('Practice Sharing Testimony/Gospel', 'Share Testimony/Gospel')
    .replace('Begin Serving in a Ministry/Mission', 'Serve in Ministry')
    .replace('Assist in Leading Small Group', 'Assist Grace Group')
    .replace('Lead a Grace Group', 'Lead Grace Group')
    .replace('Identified Their Circle', 'Their Circle')
    .replace('Completed ', '')
}

const initialsFor = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '★'
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
}

const gemKey = (stage: Stage, category: ChecklistCategory, label: string) => `${stage}-${category}-${label}`

function ProgressRing({ stageStats }: { stageStats: Array<{ stage: Stage; completedCount: number; totalCount: number }> }) {
  const radius = 82
  const circumference = 2 * Math.PI * radius
  const segment = circumference / 4
  const gap = 12

  return (
    <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 220 220" aria-hidden="true">
      <defs>
        <filter id="ring-glow">
          <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="110" cy="110" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
      {stageStats.map((stageStat, index) => {
        const visual = stageVisuals[stageStat.stage]
        const completionRatio = stageStat.totalCount > 0 ? stageStat.completedCount / stageStat.totalCount : 0
        const litLength = Math.max(0.01, (segment - gap) * completionRatio)
        const baseOffset = -index * segment
        const isComplete = completionRatio >= 1

        return (
          <g key={stageStat.stage}>
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${segment - gap} ${circumference - (segment - gap)}`}
              strokeDashoffset={baseOffset}
            />
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke={visual.ring}
              strokeWidth={isComplete ? '14' : '12'}
              strokeLinecap="round"
              strokeDasharray={`${litLength} ${circumference - litLength}`}
              strokeDashoffset={baseOffset}
              filter={completionRatio > 0 ? 'url(#ring-glow)' : undefined}
              className="transition-all duration-700"
              opacity={completionRatio > 0 ? 0.82 + completionRatio * 0.18 : 0}
            />
            {isComplete && (
              <circle
                cx="110"
                cy="110"
                r={radius}
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`10 ${circumference - 10}`}
                strokeDashoffset={baseOffset - segment + 22}
                opacity="0.9"
                filter="url(#ring-glow)"
              />
            )}
          </g>
        )
      })}
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
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadItems = async () => {
      setError('')
      const { data, error } = await getStageChecklistItems(person.id)
      if (!isMounted) return
      if (error) {
        setError(error.message)
        return
      }
      setItems((data ?? []) as StageChecklistItem[])
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
    const earnedGems = stages.flatMap(stage => (
      stageChecklistTemplates[stage]
        .filter(templateItem => completedItemKeys.has(gemKey(stage, templateItem.category, templateItem.label)))
        .map(templateItem => ({ ...templateItem, stage, rarity: gemRarityFor(templateItem.label) }))
    ))
    const allStagesComplete = stageStats.every(stageStat => stageStat.completedCount === stageStat.totalCount)

    return { total, completed, stageStats, earnedGems, allStagesComplete }
  }, [items])

  const visual = stageVisuals[currentStage]
  const journey = stageJourneyTitles[currentStage]
  const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const stagePercent = Math.round(((stageRank[currentStage] + 1) / stages.length) * 100)
  const starSize = 72 + stageRank[currentStage] * 18 + Math.min(stats.completed, 10) * 2
  const starBrightness = 0.9 + progressPercent / 180
  const isReadyToMultiply = stats.allStagesComplete
  const displayedGems = stats.earnedGems.slice(0, 10).map((gem, index) => {
    const visibleGemCount = Math.max(1, Math.min(stats.earnedGems.length, 10))
    const angle = (index / visibleGemCount) * Math.PI * 2 - Math.PI / 2
    const radius = 103
    return {
      ...gem,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    }
  })
  const legacyScore = Math.min(100, Math.round((progressPercent * 0.7) + (stageRank[currentStage] + 1) * 7.5))
  const cardGlow = `0 0 ${18 + progressPercent * 0.38}px ${stageVisuals[currentStage].ringSoft}, inset 0 0 42px rgba(255,255,255,0.025)`

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-4 text-white shadow-xl sm:p-5"
      style={{ boxShadow: cardGlow }}
    >
      <div className={`absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,var(--tw-gradient-stops))] ${visual.aura}`} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_15%,rgba(168,85,247,0.18),transparent_28%),radial-gradient(circle_at_12%_82%,rgba(14,165,233,0.16),transparent_32%),linear-gradient(120deg,rgba(15,23,42,0.05),rgba(15,23,42,0.76))]" />
      {cosmicStars.map((star, index) => (
        <span
          key={index}
          className="absolute animate-pulse rounded-full bg-white"
          style={{ left: star.left, top: star.top, width: star.size, height: star.size, opacity: 0.25 + progressPercent / 190, animationDelay: star.delay }}
        />
      ))}
      <div className="absolute right-5 top-5 h-24 w-24 rounded-full bg-white/5 blur-2xl" />
      <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-yellow-300/10 blur-3xl" />
      {isReadyToMultiply && (
        <>
          <div className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border border-yellow-200/30" />
          <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-200/10 blur-3xl" />
        </>
      )}

      <div className="relative grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr] lg:items-center">
        <div className="flex flex-col items-center rounded-3xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur">
          <div className="mb-4 flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-slate-950/55 p-4 text-left shadow-inner">
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 bg-gradient-to-br from-white/30 to-white/5 text-lg font-black text-white shadow-lg"
              style={{ borderColor: visual.ring, boxShadow: `0 0 22px ${visual.ringSoft}` }}
            >
              {initialsFor(person.name)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xl font-black text-white">{person.name}</div>
              <div className={`mt-0.5 text-sm font-bold ${visual.text}`}>{journey.title}</div>
              <div className="mt-1 text-xs font-semibold text-slate-300">{journey.level} — {journey.verb}</div>
            </div>
          </div>

          <div className="relative flex h-60 w-60 items-center justify-center">
            <ProgressRing stageStats={stats.stageStats} />

            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 240 240" aria-hidden="true">
              {displayedGems.map((gem, index) => {
                const nextGem = displayedGems[(index + 1) % displayedGems.length]
                if (!nextGem || displayedGems.length < 2) return null
                return (
                  <line
                    key={`${gem.stage}-${gem.label}-line`}
                    x1={120 + gem.x}
                    y1={120 + gem.y}
                    x2={120 + nextGem.x}
                    y2={120 + nextGem.y}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                  />
                )
              })}
            </svg>

            <div className="absolute h-[62%] w-[62%] rounded-full border border-white/10" />
            <div
              className={`relative flex items-center justify-center rounded-full bg-gradient-to-br ${visual.star} ${visual.glow} animate-pulse`}
              style={{ width: starSize, height: starSize, filter: `brightness(${starBrightness}) saturate(${1 + progressPercent / 130})` }}
              aria-label={`${person.name} disciple star`}
            >
              <div className="absolute inset-2 rounded-full bg-white/25 blur-sm" />
              <div className="absolute inset-0 rounded-full bg-white/10" />
              <div className="relative text-5xl drop-shadow-lg">✦</div>
            </div>

            {orbitSparkles.slice(0, Math.min(orbitSparkles.length, 3 + Math.floor(stats.completed / 3))).map((sparkle, index) => {
              const angle = sparkle.angle * (Math.PI / 180)
              const x = Math.cos(angle) * sparkle.radius
              const y = Math.sin(angle) * sparkle.radius
              return (
                <span
                  key={index}
                  className="absolute animate-pulse rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                  style={{ transform: `translate(${x}px, ${y}px)`, width: sparkle.size + 2, height: sparkle.size + 2, animationDelay: sparkle.delay }}
                />
              )
            })}

            {displayedGems.map(gem => {
              const gemVisual = stageVisuals[gem.stage]
              const rarityClass = rarityClassFor(gem.rarity)

              return (
                <div
                  key={`${gem.stage}-${gem.label}`}
                  title={`${gem.rarity}: ${stageLabels[gem.stage].display} — ${gem.label}`}
                  className={`absolute flex h-10 w-10 items-center justify-center rounded-full border text-base font-black shadow-lg ${gemVisual.gem} ${rarityClass}`}
                  style={{ transform: `translate(${gem.x}px, ${gem.y}px)` }}
                >
                  {gemIconFor(gem.label)}
                </div>
              )
            })}
          </div>

          <div className={`mt-4 text-sm font-semibold uppercase tracking-[0.25em] ${visual.text}`}>{journey.level}</div>
          <div className="mt-1 text-3xl font-black text-white">{journey.verb}</div>
          <div className="mt-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-white">
            {journey.title}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Disciple Making Journey</div>
            <h3 className="mt-2 text-2xl font-black text-white sm:text-3xl">
              A star card for the 4E path: Reaching, Building, Training, Releasing.
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              {journey.mission} The ring keeps the 4E process visible, while gems mark completed tools and action steps. When all four sections are filled, the star bursts with light and signals multiplication readiness.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Journey Power</div>
              <div className="mt-1 text-2xl font-black text-white">{progressPercent}%</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-300 via-purple-300 to-yellow-300" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Gems Earned</div>
              <div className="mt-1 text-2xl font-black text-white">{stats.completed}/{stats.total}</div>
              <div className="mt-2 text-xs font-medium text-slate-300">Tools and action steps completed</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Stage</div>
              <div className="mt-1 text-2xl font-black text-white">{stageRank[currentStage] + 1}/4</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-white" style={{ width: `${stagePercent}%` }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            {stats.stageStats.map(stageStat => {
              const isActive = currentStage === stageStat.stage
              const isComplete = stageStat.completedCount === stageStat.totalCount
              const stageJourney = stageJourneyTitles[stageStat.stage]
              const stageCompletion = stageStat.totalCount > 0 ? Math.round((stageStat.completedCount / stageStat.totalCount) * 100) : 0
              const stageVisual = stageVisuals[stageStat.stage]

              return (
                <div
                  key={stageStat.stage}
                  className={`rounded-2xl border p-3 ${isActive ? 'border-white/40 bg-white/15' : 'border-white/10 bg-white/5'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-black text-white">{stageLabels[stageStat.stage].name}</div>
                    <div className="text-sm">{isComplete ? '🌟' : isActive ? '✨' : '○'}</div>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-300">{stageJourney.verb}</div>
                  <div className="mt-2 text-xs font-bold text-slate-200">{stageStat.completedCount}/{stageStat.totalCount}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full" style={{ width: `${stageCompletion}%`, backgroundColor: stageVisual.ring, boxShadow: stageCompletion === 100 ? `0 0 12px ${stageVisual.ring}` : undefined }} />
                  </div>
                </div>
              )
            })}
          </div>

          {stats.earnedGems.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-300">Completed Tool Gems</div>
                <div className="text-[11px] font-semibold text-slate-400">Rare and Legendary milestones glow brighter</div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {stats.earnedGems.slice(0, 15).map(gem => {
                  const gemVisual = stageVisuals[gem.stage]
                  return (
                    <span
                      key={`${gem.stage}-${gem.label}`}
                      title={`${gem.rarity}: ${gem.label}`}
                      className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${gemVisual.softGem} ${rarityClassFor(gem.rarity)}`}
                    >
                      <span className="mr-1.5">{gemIconFor(gem.label)}</span>
                      {shortGemLabel(gem.label)}
                      {gem.rarity !== 'Gem' && <span className="ml-1 text-[10px] uppercase tracking-wide opacity-80">{gem.rarity}</span>}
                    </span>
                  )
                })}
                {stats.earnedGems.length > 15 && (
                  <span className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white">+{stats.earnedGems.length - 15} more</span>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-3 text-sm text-slate-300">
              No gems yet. Complete the first Engage tool or action step to light up this disciple star.
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-300">Legacy Score</div>
                <div className="mt-1 text-sm text-slate-300">Multiplication potential based on 4E progress and completed gems.</div>
              </div>
              <div className="text-2xl font-black text-white">{legacyScore}</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-300 via-purple-300 to-yellow-300" style={{ width: `${legacyScore}%` }} />
            </div>
          </div>

          {isReadyToMultiply && (
            <div className="rounded-2xl border border-yellow-200/40 bg-yellow-300/10 p-3 text-sm font-semibold text-yellow-50 shadow-[0_0_28px_rgba(250,204,21,0.16)]">
              Multiplication moment: all four E sections are complete. This disciple is ready to be released into their own orbit — forming a Grace Group and discipling their circle.
            </div>
          )}

          {error && <p className="rounded-xl border border-red-300/40 bg-red-500/10 p-2 text-sm text-red-100">{error}</p>}
        </div>
      </div>
    </section>
  )
}
