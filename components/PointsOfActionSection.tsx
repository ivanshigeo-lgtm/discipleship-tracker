'use client'

import { useEffect, useState, useMemo } from 'react'
import { getPeople, getAllEngagements, markActionCompleted } from '../lib/supabaseQueries'
import type { Person, Stage, Engagement } from '../types/database'

interface PointsOfActionSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person, openTab?: 'engagements') => void
}

type ActionItem = {
  engagement: Engagement
  person: Person
}

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

function ActionCard({
  item,
  onClick,
  onToggleComplete,
}: {
  item: ActionItem
  onClick: () => void
  onToggleComplete: (completed: boolean) => void
}) {
  const stageColor = STAGE_COLORS[item.person.current_stage]
  const isCompleted = item.engagement.action_completed

  const initials = item.person.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleComplete(!isCompleted)
  }

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-[var(--line-1)] p-3 transition-all hover:border-[var(--line-2)]"
      style={{
        background: 'var(--indigo-2)',
        opacity: isCompleted ? 0.7 : 1,
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{
              background: 'var(--indigo)',
              border: `2px solid ${stageColor}`,
              color: stageColor,
            }}
          >
            {initials}
          </div>
          <button
            type="button"
            onClick={handleCheckboxClick}
            className="flex h-5 w-5 items-center justify-center rounded border-2 transition-all"
            style={{
              borderColor: isCompleted ? 'var(--success)' : 'var(--line-2)',
              background: isCompleted ? 'var(--success)' : 'transparent',
            }}
          >
            {isCompleted && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--void)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-sm font-semibold text-[var(--fg-1)] ${isCompleted ? 'line-through opacity-60' : ''}`}>
              {item.person.name}
            </span>
            {item.engagement.meeting_type && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: 'rgba(91,141,247,.15)', color: 'var(--equip)' }}
              >
                {item.engagement.meeting_type}
              </span>
            )}
          </div>

          <div className={`mt-1 text-[10px] text-[var(--fg-3)] ${isCompleted ? 'line-through opacity-60' : ''}`}>
            {item.engagement.description}
            {item.engagement.completed_at && (
              <span className="ml-1">
                · {new Date(item.engagement.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          <div className={`mt-2 rounded-lg bg-[var(--indigo)] p-2 text-xs text-[var(--fg-2)] ${isCompleted ? 'line-through opacity-60' : ''}`}>
            {item.engagement.notes}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PointsOfActionSection({
  refreshKey = 0,
  onPersonClick,
}: PointsOfActionSectionProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const [peopleResult, engagementsResult] = await Promise.race([
        Promise.all([
          getPeople(),
          getAllEngagements(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])

      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
    } catch (err) {
      console.error('PointsOfActionSection load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const handleToggleComplete = async (engagementId: string, completed: boolean) => {
    await markActionCompleted(engagementId, completed)
    loadData()
  }

  const actionItems = useMemo(() => {
    const peopleById = new Map(people.map(p => [p.id, p]))
    const oneDayAgo = new Date()
    oneDayAgo.setDate(oneDayAgo.getDate() - 1)

    const items: ActionItem[] = []

    engagements
      .filter(e => e.status === 'Completed' && e.notes && e.notes.trim())
      .filter(e => {
        if (!e.action_completed) return true
        if (!e.action_completed_at) return true
        return new Date(e.action_completed_at) > oneDayAgo
      })
      .forEach(engagement => {
        const person = peopleById.get(engagement.person_id)
        if (!person) return

        items.push({ engagement, person })
      })

    // Sort: incomplete first, then by completion date (most recent first)
    items.sort((a, b) => {
      if (a.engagement.action_completed && !b.engagement.action_completed) return 1
      if (!a.engagement.action_completed && b.engagement.action_completed) return -1
      const dateA = a.engagement.completed_at ? new Date(a.engagement.completed_at).getTime() : 0
      const dateB = b.engagement.completed_at ? new Date(b.engagement.completed_at).getTime() : 0
      return dateB - dateA
    })

    return items
  }, [people, engagements])

  if (loading) {
    return null
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="cn-h3">Points of Action</h2>
          <span className="cn-chip !py-0.5 !text-xs">{actionItems.length}</span>
        </div>

        {actionItems.length > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="cn-chip"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

      <p className="mt-1 text-sm text-[var(--fg-2)]">
        Action items from completed meetings
      </p>

      {actionItems.length === 0 && (
        <p className="mt-3 text-xs text-[var(--fg-3)] italic">
          No action items yet. Mark a meeting as complete and add points of action to see them here.
        </p>
      )}

      {isExpanded && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {actionItems.slice(0, 9).map(item => (
            <ActionCard
              key={item.engagement.id}
              item={item}
              onClick={() => onPersonClick?.(item.person, 'engagements')}
              onToggleComplete={(completed) => handleToggleComplete(item.engagement.id, completed)}
            />
          ))}
        </div>
      )}

      {isExpanded && actionItems.length > 9 && (
        <p className="mt-3 text-center text-xs text-[var(--fg-3)]">
          Showing 9 of {actionItems.length} action items
        </p>
      )}
    </section>
  )
}
