'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  getPeople,
  getAllEngagements,
  getAllPrayerRequests,
  getGroupsForPerson,
  getGroupAttendance,
  getVictoryGroups,
} from '../lib/supabaseQueries'
import type { Person, Engagement, PrayerRequest, VictoryGroup, GroupAttendance } from '../types/database'

interface NeedAttentionSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person) => void
}

type AttentionItem = {
  person: Person
  reasons: string[]
  priority: 'high' | 'medium' | 'low'
}

function daysSince(dateString: string | null): number | null {
  if (!dateString) return null
  const date = new Date(dateString)
  const now = new Date()
  const diffTime = now.getTime() - date.getTime()
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

export default function NeedAttentionSection({
  refreshKey = 0,
  onPersonClick,
}: NeedAttentionSectionProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)

  const loadData = async () => {
    setLoading(true)
    const [peopleResult, engagementsResult, prayerResult] = await Promise.all([
      getPeople(),
      getAllEngagements(),
      getAllPrayerRequests(),
    ])

    if (peopleResult.data) setPeople(peopleResult.data as Person[])
    if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
    if (prayerResult.data) setPrayerRequests(prayerResult.data as PrayerRequest[])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [refreshKey])

  const attentionItems = useMemo(() => {
    const items: AttentionItem[] = []

    const engagementsByPerson = new Map<string, Engagement[]>()
    engagements.forEach(e => {
      const list = engagementsByPerson.get(e.person_id) || []
      list.push(e)
      engagementsByPerson.set(e.person_id, list)
    })

    const activePrayersByPerson = new Map<string, number>()
    prayerRequests
      .filter(pr => pr.status === 'Active')
      .forEach(pr => {
        activePrayersByPerson.set(pr.person_id, (activePrayersByPerson.get(pr.person_id) || 0) + 1)
      })

    people.forEach(person => {
      const reasons: string[] = []
      let priority: 'high' | 'medium' | 'low' = 'low'

      const personEngagements = engagementsByPerson.get(person.id) || []
      const pendingEngagements = personEngagements.filter(e => e.status === 'Pending')

      const hasNoFollowUp = pendingEngagements.length === 0 || pendingEngagements.every(e => !e.follow_up_date)
      if (hasNoFollowUp) {
        reasons.push('No follow-up date set')
        priority = 'medium'
      }

      const overdueEngagements = pendingEngagements.filter(e => {
        if (!e.follow_up_date) return false
        const followUp = new Date(e.follow_up_date)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return followUp < today
      })
      if (overdueEngagements.length > 0) {
        reasons.push(`${overdueEngagements.length} overdue follow-up${overdueEngagements.length > 1 ? 's' : ''}`)
        priority = 'high'
      }

      const daysInStage = daysSince(person.updated_at)
      if (daysInStage !== null && daysInStage > 30) {
        const hasRecentActivity = personEngagements.some(e => {
          const daysSinceEngagement = daysSince(e.created_at)
          return daysSinceEngagement !== null && daysSinceEngagement < 14
        })
        if (!hasRecentActivity) {
          reasons.push(`Stalled: ${daysInStage}d in ${person.current_stage} with no recent activity`)
          if (priority === 'low') priority = 'medium'
        }
      }

      const activePrayerCount = activePrayersByPerson.get(person.id) || 0
      if (activePrayerCount >= 3) {
        reasons.push(`${activePrayerCount} open prayer needs`)
        if (priority === 'low') priority = 'medium'
      }

      if (reasons.length > 0) {
        items.push({ person, reasons, priority })
      }
    })

    items.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

    return items
  }, [people, engagements, prayerRequests])

  if (loading) {
    return null
  }

  if (attentionItems.length === 0) {
    return null
  }

  const highCount = attentionItems.filter(i => i.priority === 'high').length
  const mediumCount = attentionItems.filter(i => i.priority === 'medium').length

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <h2 className="text-lg font-semibold text-amber-900">People Needing Attention</h2>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {attentionItems.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-amber-800">
            {highCount > 0 && <span className="font-semibold">{highCount} urgent</span>}
            {highCount > 0 && mediumCount > 0 && ', '}
            {mediumCount > 0 && <span>{mediumCount} need review</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="self-start rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-2">
          {attentionItems.map(item => (
            <div
              key={item.person.id}
              onClick={() => onPersonClick?.(item.person)}
              className={`cursor-pointer rounded-xl border p-3 transition-all hover:shadow-md ${
                item.priority === 'high'
                  ? 'border-red-200 bg-red-50'
                  : 'border-amber-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-gray-900">{item.person.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.person.current_stage === 'Engage' ? 'bg-blue-100 text-blue-700' :
                      item.person.current_stage === 'Establish' ? 'bg-emerald-100 text-emerald-700' :
                      item.person.current_stage === 'Equip' ? 'bg-amber-100 text-amber-700' :
                      'bg-violet-100 text-violet-700'
                    }`}>
                      {item.person.current_stage}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {item.reasons.map((reason, idx) => (
                      <span
                        key={idx}
                        className={`text-xs ${
                          item.priority === 'high' ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        • {reason}
                      </span>
                    ))}
                  </div>
                </div>
                <span className="shrink-0 text-gray-400">→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
