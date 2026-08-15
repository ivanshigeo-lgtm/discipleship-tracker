'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllStageChecklistItems,
  getAllDiscipleshipConnections,
  getAllBookletProgress,
  getAllEngagements,
  getAllGroupMemberships,
  upsertBookletProgress,
  updatePersonStage,
} from '../lib/supabaseQueries'
import {
  BOOKLETS,
  SERVING_MINISTRY_LABEL,
  ASSISTING_GROUP_LABEL,
  SALVATION_LABEL,
  BAPTISM_LABEL,
  SMALL_GROUP_LABEL,
} from '../lib/curriculum'
import {
  computeForecast,
  projectedLabel,
  type EmpowerForecast,
  type MilestoneStatus,
} from '../lib/empowerForecast'
import type {
  Person,
  StageChecklistItem,
  DiscipleshipConnection,
  BookletProgress,
  Engagement,
  Booklet,
  Stage,
} from '../types/database'
import { useAuth } from '../contexts/AuthContext'
import { SectionSkeleton } from './Skeleton'
import ChapterTrackerModal from './ChapterTrackerModal'

interface EmergingTeamSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person) => void
  onChanged?: () => void
}

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

function ProgressRing({ percentage, size = 48 }: { percentage: number; size?: number }) {
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (percentage / 100) * circumference
  const equipColor = STAGE_COLORS.Equip

  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(246,241,231,.1)" strokeWidth={strokeWidth} />
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
  forecast,
  onPersonClick,
  onEmpower,
  empowering,
  onOpenTracker,
  canEdit = true,
}: {
  forecast: EmpowerForecast
  onPersonClick: () => void
  onEmpower: () => void
  empowering: boolean
  onOpenTracker: () => void
  canEdit?: boolean
}) {
  const { person, isReady, percentComplete, currentBooklet, chaptersLeft, etaWeeks, projectedDate, unmetMilestones, cadenceFromData } = forecast
  const equipColor = STAGE_COLORS.Equip
  const empowerColor = STAGE_COLORS.Empower

  const initials = person.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

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
        <div className="relative">
          <ProgressRing percentage={percentComplete} size={52} />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: equipColor }}>
            {initials}
          </div>
        </div>

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
              {percentComplete}%
            </span>
          </div>

          {/* Forecast line */}
          {isReady ? (
            <p className="mt-1 text-xs font-semibold" style={{ color: empowerColor }}>
              All chapters & milestones complete — ready to lead
            </p>
          ) : projectedDate ? (
            <p className="mt-1 text-xs text-[var(--fg-2)]">
              {currentBooklet && (
                <span className="text-[var(--fg-1)]">
                  {currentBooklet.label} ch {currentBooklet.current}/{currentBooklet.chapters}
                </span>
              )}
              {currentBooklet && ' · '}
              {chaptersLeft} ch left · ~{etaWeeks}w → <span className="font-semibold" style={{ color: empowerColor }}>{projectedLabel(projectedDate)}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--fg-2)]">Chapters done — milestones remaining</p>
          )}

          {/* Cadence note */}
          {!isReady && (
            <p className="mt-0.5 text-[10px] text-[var(--fg-3)]">
              {cadenceFromData ? 'pace from meeting history' : 'pace est. 1 ch/week'}
            </p>
          )}

          {/* Progress bar */}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--indigo)]">
            <div
              className="h-full transition-all"
              style={{
                width: `${percentComplete}%`,
                background: isReady ? `linear-gradient(90deg, ${equipColor}, ${empowerColor})` : equipColor,
                boxShadow: `0 0 8px ${isReady ? empowerColor : equipColor}60`,
              }}
            />
          </div>

          {/* Unmet milestones */}
          {unmetMilestones.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-[var(--fg-3)]">Milestones needed:</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {unmetMilestones.map((item, idx) => (
                  <span key={idx} className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--indigo-3)', color: 'var(--fg-2)' }}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Open the focused chapter tracker */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenTracker() }}
            className="mt-2 text-[11px] font-semibold underline-offset-2 hover:underline"
            style={{ color: 'var(--gbm-cobalt-soft)' }}
          >
            Open chapter tracker →
          </button>
        </div>

        {/* Empower button or arrow — the promotion is can_edit_person, so in GBC
            scope a card outside the downline shows the arrow, not the button. */}
        {isReady && canEdit ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEmpower() }}
            disabled={empowering}
            className="shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all disabled:opacity-50"
            style={{ background: empowerColor, color: 'var(--void)', boxShadow: `0 0 16px ${empowerColor}50` }}
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

// Church-wide forecast: how many new Empowered leaders, and when.
function ForecastStrip({ forecasts }: { forecasts: EmpowerForecast[] }) {
  const empowerColor = STAGE_COLORS.Empower
  const dated = forecasts
    .filter(f => !f.isReady && f.projectedDate)
    .sort((a, b) => (a.projectedDate!.getTime() - b.projectedDate!.getTime()))

  const readyNow = forecasts.filter(f => f.isReady).length
  const now = new Date()
  const within = (days: number) =>
    dated.filter(f => (f.projectedDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) <= days).length

  if (forecasts.length === 0) return null

  return (
    <div className="rounded-xl border border-[var(--line-1)] p-4" style={{ background: `linear-gradient(135deg, ${empowerColor}12 0%, var(--indigo-2) 100%)` }}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: empowerColor }}>Leadership Forecast</span>
        <span className="text-[10px] text-[var(--fg-3)]">projected new Empowered leaders</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <ForecastStat value={readyNow} label="ready now" color={empowerColor} />
        <ForecastStat value={within(90)} label="in 90 days" color={empowerColor} />
        <ForecastStat value={within(180)} label="in 6 months" color="var(--fg-2)" />
      </div>
      {dated.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {dated.slice(0, 5).map(f => (
            <span key={f.person.id} className="rounded-full border border-[var(--line-2)] px-2 py-0.5 text-[11px] text-[var(--fg-2)]">
              {f.person.name.split(' ')[0]} · <span style={{ color: empowerColor }}>{projectedLabel(f.projectedDate)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ForecastStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[var(--fg-3)]">{label}</div>
    </div>
  )
}

export default function EmergingTeamSection({
  refreshKey = 0,
  onPersonClick,
  onChanged,
}: EmergingTeamSectionProps) {
  const { profile, canEdit: checkCanEdit } = useAuth()
  // GBC = all Equip-stage people; My Constellation = only people in my circle.
  const [scope, setScope] = useState<'gbc' | 'mine'>('mine')
  const [people, setPeople] = useState<Person[]>([])
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [connections, setConnections] = useState<DiscipleshipConnection[]>([])
  const [bookletProgress, setBookletProgress] = useState<BookletProgress[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [groupMemberPersonIds, setGroupMemberPersonIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)
  const [empowering, setEmpowering] = useState<string | null>(null)
  const [savingChapterFor, setSavingChapterFor] = useState<string | null>(null)
  const [trackerForId, setTrackerForId] = useState<string | null>(null)

  const loadData = async (retry = true) => {
    setLoading(true)
    try {
      const [peopleResult, checklistResult, connectionsResult, bookletResult, engagementsResult, membershipsResult] = await Promise.race([
        Promise.all([
          getPeople(['Equip']),
          getAllStageChecklistItems(),
          getAllDiscipleshipConnections(),
          getAllBookletProgress(),
          getAllEngagements(),
          getAllGroupMemberships(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ])

      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (checklistResult.data) setChecklistItems(checklistResult.data as StageChecklistItem[])
      if (connectionsResult.data) setConnections(connectionsResult.data as DiscipleshipConnection[])
      if (bookletResult.data) setBookletProgress(bookletResult.data as BookletProgress[])
      if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
      if (membershipsResult.data) {
        setGroupMemberPersonIds(new Set((membershipsResult.data as { person_id: string }[]).map(m => m.person_id)))
      }
      setLoading(false)
    } catch (err) {
      console.error('EmergingTeamSection load error:', err)
      if (retry) setTimeout(() => loadData(false), 2000)
      else setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  // Same "My Constellation" definition as the Journey view: my whole downline
  // (discipler → disciple edges, transitively) plus whoever directly coaches me.
  const myCircleIds = useMemo(() => {
    if (!profile?.id) return undefined
    const ids = new Set<string>([profile.id])
    let changed = true
    while (changed) {
      changed = false
      for (const c of connections) {
        if (c.disciple_person_id && ids.has(c.discipler_person_id) && !ids.has(c.disciple_person_id)) {
          ids.add(c.disciple_person_id)
          changed = true
        }
      }
    }
    for (const c of connections) {
      if (c.disciple_person_id === profile.id) ids.add(c.discipler_person_id)
    }
    return ids
  }, [connections, profile?.id])

  const forecasts = useMemo(() => {
    const scopedPeople = scope === 'mine' && myCircleIds
      ? people.filter(p => myCircleIds.has(p.id))
      : people
    return scopedPeople.map(person => {
      const personItems = checklistItems.filter(i => i.person_id === person.id && i.completed)
      const completedLabels = new Set(personItems.map(i => i.label))

      const milestones: MilestoneStatus = {
        saved: !!person.spiritual_birthday || completedLabels.has(SALVATION_LABEL),
        baptized: !!person.baptism_date || completedLabels.has(BAPTISM_LABEL),
        small_group: !!person.victory_group_id || groupMemberPersonIds.has(person.id) || completedLabels.has(SMALL_GROUP_LABEL),
        serving_ministry: completedLabels.has(SERVING_MINISTRY_LABEL),
        assisting_group: completedLabels.has(ASSISTING_GROUP_LABEL),
      }

      return computeForecast(
        person,
        bookletProgress.filter(b => b.person_id === person.id),
        milestones,
        engagements.filter(e => e.person_id === person.id),
      )
    }).sort((a, b) => b.percentComplete - a.percentComplete)
  }, [people, checklistItems, bookletProgress, engagements, groupMemberPersonIds, scope, myCircleIds])

  const readyToEmpower = forecasts.filter(f => f.isReady)
  const inProgress = forecasts.filter(f => !f.isReady)
  const trackerForecast = trackerForId ? forecasts.find(f => f.person.id === trackerForId) : undefined

  const handleEmpower = async (personId: string) => {
    // In GBC scope this list reaches well past the viewer's downline; the
    // Empower promotion writes people.current_stage (can_edit_person).
    if (!checkCanEdit(personId)) return
    setEmpowering(personId)
    await updatePersonStage(personId, 'Empower')
    await loadData()
    onChanged?.()
    setEmpowering(null)
  }

  const handleSetChapter = async (personId: string, booklet: Booklet, chapter: number) => {
    // Guard ahead of the optimistic paint — otherwise the stepper advances and
    // silently reverts on the next load. booklet_progress is can_edit_person.
    if (!checkCanEdit(personId)) return
    setSavingChapterFor(personId)
    // Optimistic update so the steppers feel instant.
    setBookletProgress(prev => {
      const idx = prev.findIndex(b => b.person_id === personId && b.booklet === booklet)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], current_chapter: chapter }
        return next
      }
      return [...prev, { id: `temp-${personId}-${booklet}`, person_id: personId, booklet, current_chapter: chapter, updated_at: new Date().toISOString() }]
    })
    await upsertBookletProgress(personId, booklet, chapter)
    setSavingChapterFor(null)
  }

  if (loading) {
    return <SectionSkeleton title="Emerging Team" />
  }

  if (people.length === 0) return null

  const equipColor = STAGE_COLORS.Equip
  const empowerColor = STAGE_COLORS.Empower

  return (
    <>
    <section className="cn-card mb-6 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm"
              style={{ background: `${equipColor}20`, border: `2px solid ${equipColor}`, boxShadow: `0 0 12px ${equipColor}40`, color: equipColor }}
            >
              ✦
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="cn-h3">Emerging Team</h2>
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${equipColor}20`, color: equipColor }}>
                  {forecasts.length}
                </span>
              </div>
              <p className="text-sm text-[var(--fg-2)]">People being equipped to lead and multiply</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          {/* GBC = all Equip people; Mine = only my constellation */}
          <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-0.5">
            {([['gbc', 'GBC Constellation'], ['mine', 'My Constellation']] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setScope(val)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all ${scope === val ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="cn-chip">
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-5 space-y-5">
          <ForecastStrip forecasts={forecasts} />

          {/* Ready to Empower */}
          {readyToEmpower.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ background: empowerColor, boxShadow: `0 0 8px ${empowerColor}` }} />
                <span className="text-sm font-semibold" style={{ color: empowerColor }}>Ready to Empower</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${empowerColor}20`, color: empowerColor }}>
                  {readyToEmpower.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {readyToEmpower.map(forecast => (
                  <TeamMemberCard
                    key={forecast.person.id}
                    forecast={forecast}
                    onPersonClick={() => onPersonClick?.(forecast.person)}
                    onEmpower={() => handleEmpower(forecast.person.id)}
                    canEdit={checkCanEdit(forecast.person.id)}
                    empowering={empowering === forecast.person.id}
                    onOpenTracker={() => setTrackerForId(forecast.person.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* In Progress */}
          {inProgress.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full" style={{ background: equipColor, boxShadow: `0 0 8px ${equipColor}` }} />
                <span className="text-sm font-semibold" style={{ color: equipColor }}>In Progress</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: `${equipColor}20`, color: equipColor }}>
                  {inProgress.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {inProgress.map(forecast => (
                  <TeamMemberCard
                    key={forecast.person.id}
                    forecast={forecast}
                    onPersonClick={() => onPersonClick?.(forecast.person)}
                    onEmpower={() => {}}
                    empowering={false}
                    onOpenTracker={() => setTrackerForId(forecast.person.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>

    {trackerForecast && (
      <ChapterTrackerModal
        forecast={trackerForecast}
        onClose={() => setTrackerForId(null)}
        onSetChapter={(b, c) => handleSetChapter(trackerForecast.person.id, b, c)}
        onEmpower={async () => { await handleEmpower(trackerForecast.person.id); setTrackerForId(null) }}
        empowering={empowering === trackerForecast.person.id}
        saving={savingChapterFor === trackerForecast.person.id}
        canEdit={checkCanEdit(trackerForecast.person.id)}
      />
    )}
    </>
  )
}
