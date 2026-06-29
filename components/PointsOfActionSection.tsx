'use client'

import { useEffect, useState, useMemo } from 'react'
import { getPeople, getAllEngagements, getAllActionItems, updateActionItem } from '../lib/supabaseQueries'
import type { Person, Stage, Engagement, ActionItem } from '../types/database'
import { SectionSkeleton } from './Skeleton'

interface PointsOfActionSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person, openTab?: 'engagements') => void
  onOpenEngagement?: (engagement: Engagement, personName: string) => void
  /* Only show action points for engagements the viewer is involved in (created
     it, or it's with them). Admins see all. */
  viewerPersonId?: string
  isAdmin?: boolean
}

type Row = {
  item: ActionItem
  engagement: Engagement
  person: Person
}

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

function ActionRow({
  row,
  onOpen,
  onToggle,
}: {
  row: Row
  onOpen: () => void
  onToggle: (completed: boolean) => void
}) {
  const stageColor = STAGE_COLORS[row.person.current_stage]
  const { completed } = row.item
  const initials = row.person.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line-1)] p-3 transition-all hover:border-[var(--line-2)]"
      style={{ background: 'var(--indigo-2)', opacity: completed ? 0.6 : 1 }}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(!completed) }}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all"
        style={{ borderColor: completed ? 'var(--equip)' : 'var(--line-2)', background: completed ? 'var(--equip)' : 'transparent' }}
      >
        {completed && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--void)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm text-[var(--fg-1)] ${completed ? 'line-through opacity-60' : ''}`}>{row.item.text}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--fg-3)]">
          <span
            className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold"
            style={{ border: `1.5px solid ${stageColor}`, color: stageColor }}
          >
            {initials}
          </span>
          <span className="truncate">{row.person.name}</span>
          {row.engagement.meeting_type && <span>· {row.engagement.meeting_type}</span>}
        </div>
      </div>
    </div>
  )
}

export default function PointsOfActionSection({
  refreshKey = 0,
  onOpenEngagement,
  viewerPersonId,
  isAdmin = false,
}: PointsOfActionSectionProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const [peopleResult, engagementsResult, itemsResult] = await Promise.race([
        Promise.all([getPeople(), getAllEngagements(), getAllActionItems()]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ])
      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
      if (itemsResult.data) setActionItems(itemsResult.data as ActionItem[])
    } catch (err) {
      console.error('PointsOfActionSection load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [refreshKey])

  const handleToggle = async (id: string, completed: boolean) => {
    setActionItems(prev => prev.map(i => i.id === id ? { ...i, completed } : i))
    await updateActionItem(id, { completed })
  }

  const rows = useMemo(() => {
    const involved = (e: Engagement) =>
      isAdmin || (!!viewerPersonId && (e.created_by_person_id === viewerPersonId || e.person_id === viewerPersonId))
    const peopleById = new Map(people.map(p => [p.id, p]))
    const engById = new Map(engagements.map(e => [e.id, e]))
    const out: Row[] = []
    for (const item of actionItems) {
      const engagement = engById.get(item.engagement_id)
      if (!engagement) continue
      if (!involved(engagement)) continue
      const person = peopleById.get(engagement.person_id)
      if (!person) continue
      out.push({ item, engagement, person })
    }
    // Incomplete first, then most recent
    out.sort((a, b) => {
      if (a.item.completed !== b.item.completed) return a.item.completed ? 1 : -1
      return new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime()
    })
    return out
  }, [people, engagements, actionItems, viewerPersonId, isAdmin])

  const openCount = rows.filter(r => !r.item.completed).length

  if (loading) return <SectionSkeleton title="Points of Action" count={3} />

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="cn-h3">Points of Action</h2>
          <span className="cn-chip !py-0.5 !text-xs">{openCount}</span>
        </div>
        {rows.length > 0 && (
          <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="cn-chip">
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

      <p className="mt-1 text-sm text-[var(--fg-2)]">Action steps captured across your engagements</p>

      {rows.length === 0 && (
        <p className="mt-3 text-xs italic text-[var(--fg-3)]">
          No action steps yet. Open a meeting and add action points to see them consolidated here.
        </p>
      )}

      {isExpanded && rows.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.slice(0, 12).map(row => (
            <ActionRow
              key={row.item.id}
              row={row}
              onOpen={() => onOpenEngagement?.(row.engagement, row.person.name)}
              onToggle={(completed) => handleToggle(row.item.id, completed)}
            />
          ))}
        </div>
      )}

      {isExpanded && rows.length > 12 && (
        <p className="mt-3 text-center text-xs text-[var(--fg-3)]">Showing 12 of {rows.length}</p>
      )}
    </section>
  )
}
