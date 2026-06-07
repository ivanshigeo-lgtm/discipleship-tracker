'use client'

import { useEffect, useState, useMemo } from 'react'
import { getAllPrayerRequests, getPeople } from '../lib/supabaseQueries'
import type { PrayerRequest, Person, Stage } from '../types/database'

interface PrayerWallSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person) => void
}

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

type GroupedRequests = {
  person: Person | undefined
  requests: PrayerRequest[]
}

function PrayerCard({
  group,
  onClick,
}: {
  group: GroupedRequests
  onClick?: () => void
}) {
  const { person, requests } = group
  const stageColor = person ? STAGE_COLORS[person.current_stage] : 'var(--fg-3)'
  const initials = person
    ? person.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  return (
    <div
      onClick={onClick}
      className={`group rounded-xl border border-[var(--line-1)] p-3 transition-all ${onClick ? 'cursor-pointer hover:border-[var(--line-2)]' : ''}`}
      style={{ background: 'var(--indigo-2)' }}
    >
      <div className="flex items-start gap-3">
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

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-[var(--fg-1)]">
              {person?.name ?? 'Unknown'}
            </span>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: 'rgba(244,182,80,.15)', color: 'var(--engage)' }}
            >
              {requests.length}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {requests.map(req => (
              <li key={req.id} className="flex items-start gap-1.5 text-xs text-[var(--fg-2)]">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--engage)]" />
                <span className="line-clamp-2">{req.request}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function PraiseCard({
  group,
  onClick,
}: {
  group: GroupedRequests
  onClick?: () => void
}) {
  const { person, requests } = group
  const stageColor = person ? STAGE_COLORS[person.current_stage] : 'var(--fg-3)'
  const initials = person
    ? person.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  return (
    <div
      onClick={onClick}
      className={`group rounded-xl border border-[var(--line-1)] p-3 transition-all ${onClick ? 'cursor-pointer hover:border-[var(--line-2)]' : ''}`}
      style={{
        background: 'linear-gradient(135deg, rgba(54,214,195,.08) 0%, var(--indigo-2) 100%)',
      }}
    >
      <div className="flex items-start gap-3">
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

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-[var(--fg-1)]">
              {person?.name ?? 'Unknown'}
            </span>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
            >
              ✓ {requests.length}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {requests.map(req => (
              <li key={req.id} className="text-xs">
                <span className="text-[var(--fg-3)] line-through">{req.request}</span>
                {req.answer_notes && (
                  <span className="ml-1 text-[var(--establish)]">— {req.answer_notes}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function PrayerWallSection({
  refreshKey = 0,
  onPersonClick,
}: PrayerWallSectionProps) {
  const [requests, setRequests] = useState<PrayerRequest[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [requestsResult, peopleResult] = await Promise.race([
        Promise.all([
          getAllPrayerRequests(),
          getPeople(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
      ])

      if (requestsResult.data) setRequests(requestsResult.data as PrayerRequest[])
      if (peopleResult.data) setPeople(peopleResult.data as Person[])
    } catch (err) {
      console.error('PrayerWallSection load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const peopleById = useMemo(() => {
    return new Map(people.map(p => [p.id, p]))
  }, [people])

  const activeRequests = useMemo(() => {
    return requests.filter(r => r.status === 'Active')
  }, [requests])

  const answeredRequests = useMemo(() => {
    return requests.filter(r => r.status === 'Answered')
  }, [requests])

  const groupedActive = useMemo(() => {
    const groups = new Map<string, PrayerRequest[]>()
    activeRequests.forEach(req => {
      const list = groups.get(req.person_id) || []
      list.push(req)
      groups.set(req.person_id, list)
    })
    return Array.from(groups.entries())
      .map(([personId, reqs]) => ({
        person: peopleById.get(personId),
        requests: reqs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      }))
      .sort((a, b) => b.requests.length - a.requests.length)
  }, [activeRequests, peopleById])

  const groupedAnswered = useMemo(() => {
    const groups = new Map<string, PrayerRequest[]>()
    answeredRequests.forEach(req => {
      const list = groups.get(req.person_id) || []
      list.push(req)
      groups.set(req.person_id, list)
    })
    return Array.from(groups.entries())
      .map(([personId, reqs]) => ({
        person: peopleById.get(personId),
        requests: reqs.sort((a, b) => {
          const dateA = a.answered_date ? new Date(a.answered_date).getTime() : 0
          const dateB = b.answered_date ? new Date(b.answered_date).getTime() : 0
          return dateB - dateA
        }),
      }))
      .sort((a, b) => b.requests.length - a.requests.length)
  }, [answeredRequests, peopleById])

  if (loading) {
    return null
  }

  if (activeRequests.length === 0 && answeredRequests.length === 0) {
    return null
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="cn-h3">Prayer Wall</h2>
          <span className="cn-chip !py-0.5 !text-xs">{requests.length}</span>
        </div>

        <div className="flex items-center gap-2">
          {activeRequests.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'rgba(244,182,80,.15)', color: 'var(--engage)' }}
            >
              {activeRequests.length} active
            </span>
          )}
          {answeredRequests.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
            >
              {answeredRequests.length} answered
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="cn-chip"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      <p className="mt-1 text-sm text-[var(--fg-2)]">
        Prayer requests and answered prayers across all people
      </p>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Prayer Wall */}
          {groupedActive.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--engage)]">✦ Prayer Wall</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'rgba(244,182,80,.15)', color: 'var(--engage)' }}
                >
                  {activeRequests.length}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groupedActive.map(group => (
                  <PrayerCard
                    key={group.person?.id ?? 'unknown'}
                    group={group}
                    onClick={
                      onPersonClick && group.person
                        ? () => onPersonClick(group.person!)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Praise Wall */}
          {groupedAnswered.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--establish)]">✦ Praise Wall</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
                >
                  {answeredRequests.length}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groupedAnswered.map(group => (
                  <PraiseCard
                    key={group.person?.id ?? 'unknown'}
                    group={group}
                    onClick={
                      onPersonClick && group.person
                        ? () => onPersonClick(group.person!)
                        : undefined
                    }
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
