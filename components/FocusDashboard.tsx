'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllEngagements,
  getPrayerWallForViewer,
  getVictoryGroups,
  getAllStageChecklistItems,
  getMyPriorityPersonIds,
  setPersonPriority,
} from '../lib/supabaseQueries'
import type { Person, Engagement, PrayerRequest, VictoryGroup, StageChecklistItem, Stage } from '../types/database'
import { stageChecklistTemplates } from '../lib/stageChecklistTemplates'

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

const COACH_CAPACITY = 6

type SuggestedAction = {
  person: Person
  reason: string
  actionType: 'empower' | 'meet' | 'prayer' | 'faith-candidate'
  score: number
}

function daysSince(dateString: string): number {
  const date = new Date(dateString)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function getLastMeetingDate(personId: string, engagements: Engagement[]): Date | null {
  const completed = engagements
    .filter(e => e.person_id === personId && e.status === 'Completed' && e.completed_at)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
  return completed.length > 0 ? new Date(completed[0].completed_at!) : null
}

function getChecklistProgress(personId: string, stage: Stage, items: StageChecklistItem[]): number {
  const template = stageChecklistTemplates[stage]
  if (!template || template.length === 0) return 0

  const personItems = items.filter(i => i.person_id === personId && i.stage === stage && i.completed)
  return personItems.length / template.length
}

export default function FocusDashboard({
  viewerPersonId,
  isAdmin,
  onPersonClick,
  onViewFullDashboard,
  onAddPerson,
}: {
  viewerPersonId: string
  isAdmin: boolean
  onPersonClick?: (person: Person) => void
  onViewFullDashboard?: () => void
  onAddPerson?: () => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([])
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())

  const loadData = async () => {
    setLoading(true)
    try {
      const [peopleRes, engagementsRes, prayerRes, checklistRes, priorityRes] = await Promise.all([
        getPeople(),
        getAllEngagements(),
        getPrayerWallForViewer(viewerPersonId, isAdmin),
        getAllStageChecklistItems(),
        getMyPriorityPersonIds(viewerPersonId),
      ])

      // Priority is per-coach — overlay this viewer's private stars.
      if (peopleRes.data) {
        const mine = priorityRes.ids
        setPeople((peopleRes.data as Person[]).map(p => ({ ...p, priority: mine.has(p.id) })))
      }
      if (engagementsRes.data) setEngagements(engagementsRes.data as Engagement[])
      if (prayerRes.data) setPrayerRequests(prayerRes.data as PrayerRequest[])
      if (checklistRes.data) setChecklistItems(checklistRes.data as StageChecklistItem[])
    } catch (err) {
      console.error('FocusDashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerPersonId, isAdmin])

  const pipelineHealth = useMemo(() => {
    const empowered = people.filter(p => p.current_stage === 'Empower').length
    const capacity = Math.max(empowered * COACH_CAPACITY, COACH_CAPACITY) // At least 1 coach capacity
    const inPipeline = people.filter(p => ['Engage', 'Establish', 'Equip'].includes(p.current_stage)).length
    const ratio = inPipeline / capacity

    let status: 'overloaded' | 'balanced' | 'room'
    let message: string
    let color: string

    if (ratio > 1) {
      status = 'overloaded'
      message = 'Focus on developing leaders before engaging more people'
      color = '#F0729F'
    } else if (ratio >= 0.5) {
      status = 'balanced'
      message = 'Pipeline is healthy. Maintain care for your people'
      color = '#36D6C3'
    } else {
      status = 'room'
      message = 'You have room to grow. Consider inviting new people'
      color = '#5B8DF7'
    }

    return { empowered, capacity, inPipeline, ratio, status, message, color }
  }, [people])

  const suggestedActions = useMemo(() => {
    const actions: SuggestedAction[] = []
    const now = new Date()

    people.forEach(person => {
      // Skip Empower stage for suggestions (they're the coaches)
      if (person.current_stage === 'Empower') return

      let score = 0
      let reasons: string[] = []

      // Priority people get base boost
      if (person.priority) {
        score += 50
        reasons.push('Priority')
      }

      // Days since last meeting
      const lastMeeting = getLastMeetingDate(person.id, engagements)
      const daysSinceLastMeeting = lastMeeting
        ? Math.floor((now.getTime() - lastMeeting.getTime()) / (1000 * 60 * 60 * 24))
        : 999

      if (daysSinceLastMeeting > 21) {
        score += 20
        reasons.push(`${daysSinceLastMeeting} days since meeting`)
      } else if (daysSinceLastMeeting > 14) {
        score += 10
        reasons.push(`${daysSinceLastMeeting} days since meeting`)
      }

      // Active prayer requests
      const activePrayers = prayerRequests.filter(p => p.person_id === person.id && p.status === 'Active')
      if (activePrayers.length > 0) {
        score += 15
        reasons.push(`${activePrayers.length} prayer need${activePrayers.length > 1 ? 's' : ''}`)
      }

      // Equip stage (strategic - future multiplier)
      if (person.current_stage === 'Equip') {
        score += 25
        reasons.push('Future leader')

        // Check if close to Empower
        const progress = getChecklistProgress(person.id, 'Equip', checklistItems)
        if (progress >= 0.8) {
          score += 30
          reasons.push(`${Math.round(progress * 100)}% to Empower`)
        }
      }

      // Days stuck in stage
      const daysInStage = daysSince(person.updated_at)
      if (daysInStage > 60) {
        score += 15
        reasons.push(`${daysInStage} days in stage`)
      }

      if (score > 0 || person.priority) {
        actions.push({
          person,
          reason: reasons.slice(0, 2).join(' · '),
          actionType: person.current_stage === 'Equip' ? 'empower' : 'meet',
          score,
        })
      }
    })

    // Sort by score descending
    return actions.sort((a, b) => b.score - a.score).slice(0, 5)
  }, [people, engagements, prayerRequests, checklistItems])

  const upcomingMeetings = useMemo(() => {
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const peopleById = new Map(people.map(p => [p.id, p]))

    return engagements
      .filter(e => {
        if (e.status !== 'Pending' || !e.follow_up_date) return false
        const meetingDate = new Date(e.follow_up_date)
        return meetingDate >= now && meetingDate <= weekFromNow
      })
      .map(e => ({
        engagement: e,
        person: peopleById.get(e.person_id),
      }))
      .filter(m => m.person)
      .sort((a, b) => new Date(a.engagement.follow_up_date!).getTime() - new Date(b.engagement.follow_up_date!).getTime())
      .slice(0, 5)
  }, [engagements, people])

  const faithCandidates = useMemo(() => {
    // People NOT marked priority but showing good engagement signals
    return people
      .filter(p => !p.priority && p.current_stage !== 'Empower')
      .map(person => {
        let signals = 0
        let signalReasons: string[] = []

        // Has recent meetings (Faithful - shows up)
        const lastMeeting = getLastMeetingDate(person.id, engagements)
        const recentMeetings = engagements.filter(e =>
          e.person_id === person.id &&
          e.status === 'Completed' &&
          e.completed_at &&
          daysSince(e.completed_at) < 30
        ).length
        if (recentMeetings >= 2) {
          signals++
          signalReasons.push('Meeting regularly')
        }

        // Checklist progress (Teachable)
        const progress = getChecklistProgress(person.id, person.current_stage, checklistItems)
        if (progress >= 0.5) {
          signals++
          signalReasons.push(`${Math.round(progress * 100)}% checklist`)
        }

        // Fast stage progression (Hungry)
        const daysInStage = daysSince(person.updated_at)
        if (daysInStage < 30 && progress > 0.3) {
          signals++
          signalReasons.push('Progressing quickly')
        }

        // In a Grace Group (Involved)
        if (person.victory_group_id) {
          signals++
          signalReasons.push('In Grace Group')
        }

        return { person, signals, reasons: signalReasons }
      })
      .filter(c => c.signals >= 2)
      .sort((a, b) => b.signals - a.signals)
      .slice(0, 3)
  }, [people, engagements, checklistItems])

  const handleMarkPriority = async (personId: string) => {
    // Optimistic update
    setPeople(prev => prev.map(p => p.id === personId ? { ...p, priority: true } : p))

    const { error } = await setPersonPriority(viewerPersonId, personId, true)
    if (error) {
      // Revert on error
      setPeople(prev => prev.map(p => p.id === personId ? { ...p, priority: false } : p))
    }
  }

  const handleDismiss = (personId: string) => {
    setDismissedSuggestions(prev => new Set([...prev, personId]))
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-[var(--fg-2)]">Loading...</p>
      </div>
    )
  }

  const healthPercent = Math.min(Math.round(pipelineHealth.ratio * 100), 150)

  return (
    <div className="space-y-6">
      {/* Pipeline Health */}
      <div className="rounded-2xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--fg-1)]">Pipeline Health</h2>
          <span
            className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{ background: `${pipelineHealth.color}20`, color: pipelineHealth.color }}
          >
            {pipelineHealth.inPipeline} / {pipelineHealth.capacity} capacity
          </span>
        </div>

        <div className="mb-3 h-3 overflow-hidden rounded-full bg-[var(--indigo)]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(healthPercent, 100)}%`,
              background: pipelineHealth.color,
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--fg-2)]">{pipelineHealth.message}</p>
          {pipelineHealth.status === 'room' && onAddPerson && (
            <button
              type="button"
              onClick={onAddPerson}
              className="shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold"
              style={{ background: 'var(--gbm-cobalt-bright)', color: 'white' }}
            >
              + Add Person
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--fg-3)]">
          <span style={{ color: STAGE_COLORS.Empower }}>{pipelineHealth.empowered} Empowered</span>
          <span style={{ color: STAGE_COLORS.Equip }}>{people.filter(p => p.current_stage === 'Equip').length} Equip</span>
          <span style={{ color: STAGE_COLORS.Establish }}>{people.filter(p => p.current_stage === 'Establish').length} Establish</span>
          <span style={{ color: STAGE_COLORS.Engage }}>{people.filter(p => p.current_stage === 'Engage').length} Engage</span>
        </div>
      </div>

      {/* Suggested Focus This Week */}
      <div className="rounded-2xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-5">
        <h2 className="mb-4 text-lg font-semibold text-[var(--fg-1)]">Suggested Focus This Week</h2>

        {suggestedActions.length === 0 ? (
          <p className="text-sm text-[var(--fg-3)]">No urgent actions. Your people are being cared for well.</p>
        ) : (
          <div className="space-y-3">
            {suggestedActions
              .filter(a => !dismissedSuggestions.has(a.person.id))
              .slice(0, 3)
              .map((action, idx) => {
                const stageColor = STAGE_COLORS[action.person.current_stage]
                const initials = action.person.name
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()

                return (
                  <div
                    key={action.person.id}
                    className="flex items-center gap-4 rounded-xl border border-[var(--line-1)] bg-[var(--indigo)] p-4 transition-all hover:border-[var(--line-2)]"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-[var(--fg-3)]">
                      {idx + 1}
                    </div>

                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{ border: `2px solid ${stageColor}`, color: stageColor }}
                    >
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onPersonClick?.(action.person)}
                        className="truncate text-base font-semibold text-[var(--fg-1)] hover:underline"
                      >
                        {action.person.name}
                      </button>
                      <p className="text-sm text-[var(--fg-3)]">{action.reason}</p>
                    </div>

                    {action.person.priority && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: 'rgba(244,182,80,.2)', color: '#F4B650' }}
                      >
                        ★ Priority
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDismiss(action.person.id)}
                      className="text-xs text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                    >
                      Dismiss
                    </button>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* Upcoming Meetings This Week */}
      {upcomingMeetings.length > 0 && (
        <div className="rounded-2xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-5">
          <h2 className="mb-4 text-lg font-semibold text-[var(--fg-1)]">Meetings This Week</h2>
          <div className="space-y-2">
            {upcomingMeetings.map(({ engagement, person }) => {
              const stageColor = STAGE_COLORS[person!.current_stage]
              const meetingDate = new Date(engagement.follow_up_date + 'T00:00:00')
              const dayName = meetingDate.toLocaleDateString('en-US', { weekday: 'short' })
              const dateStr = meetingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

              return (
                <div
                  key={engagement.id}
                  onClick={() => onPersonClick?.(person!)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-3 transition-all hover:border-[var(--line-2)]"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-center"
                    style={{ background: `${stageColor}20` }}
                  >
                    <span className="text-[10px] font-bold" style={{ color: stageColor }}>{dayName}</span>
                    <span className="text-xs text-[var(--fg-2)]">{dateStr.split(' ')[1]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--fg-1)]">{person!.name}</p>
                    <p className="truncate text-xs text-[var(--fg-3)]">
                      {engagement.description || engagement.meeting_type || 'Meeting'}
                      {engagement.follow_up_time && ` · ${engagement.follow_up_time}`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* FAITH Candidates */}
      {faithCandidates.length > 0 && (
        <div className="rounded-2xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-5">
          <h2 className="mb-2 text-lg font-semibold text-[var(--fg-1)]">Potential Priority People</h2>
          <p className="mb-4 text-sm text-[var(--fg-3)]">
            These people are showing FAITH signals. Consider marking them as Priority.
          </p>

          <div className="space-y-3">
            {faithCandidates.map(candidate => {
              const stageColor = STAGE_COLORS[candidate.person.current_stage]
              const initials = candidate.person.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              return (
                <div
                  key={candidate.person.id}
                  className="flex items-center gap-4 rounded-xl border border-dashed border-[var(--engage)] bg-[var(--indigo)] p-4"
                  style={{ borderColor: `${STAGE_COLORS.Engage}50` }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ border: `2px solid ${stageColor}`, color: stageColor }}
                  >
                    {initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onPersonClick?.(candidate.person)}
                      className="truncate font-semibold text-[var(--fg-1)] hover:underline"
                    >
                      {candidate.person.name}
                    </button>
                    <p className="text-xs text-[var(--fg-3)]">{candidate.reasons.join(' · ')}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleMarkPriority(candidate.person.id)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
                    style={{ background: 'rgba(244,182,80,.15)', color: '#F4B650' }}
                  >
                    ☆ Mark Priority
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* View Full Dashboard */}
      <div className="text-center">
        <button
          type="button"
          onClick={onViewFullDashboard}
          className="text-sm text-[var(--fg-2)] underline hover:text-[var(--fg-1)]"
        >
          View Full Dashboard →
        </button>
      </div>
    </div>
  )
}
