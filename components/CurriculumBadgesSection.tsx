'use client'

import { useEffect, useState, useMemo } from 'react'
import { getPeople, getAllEngagements, getAllStageChecklistItems } from '../lib/supabaseQueries'
import type { Person, Engagement, StageChecklistItem } from '../types/database'
import EngagementBadges, { type CurriculumCounts } from './EngagementBadges'

interface CurriculumBadgesSectionProps {
  refreshKey?: number
}

export default function CurriculumBadgesSection({ refreshKey = 0 }: CurriculumBadgesSectionProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])

  useEffect(() => {
    const loadData = async () => {
      const [peopleResult, engagementsResult, checklistResult] = await Promise.all([
        getPeople(),
        getAllEngagements(),
        getAllStageChecklistItems(),
      ])

      if (peopleResult.data) setPeople(peopleResult.data as Person[])
      if (engagementsResult.data) setEngagements(engagementsResult.data as Engagement[])
      if (checklistResult.data) setChecklistItems(checklistResult.data as StageChecklistItem[])
    }

    loadData()
  }, [refreshKey])

  const completedData = useMemo(() => {
    const peopleById = new Map(people.map(p => [p.id, p]))

    const counts: CurriculumCounts = {
      'One2One': 0,
      'Making Disciples': 0,
      'Coffee': 0,
      'Church Community': 0,
      'Empowering Leaders': 0,
    }

    const names: Record<keyof CurriculumCounts, string[]> = {
      'One2One': [],
      'Making Disciples': [],
      'Coffee': [],
      'Church Community': [],
      'Empowering Leaders': [],
    }

    const curriculumLabels: Record<string, keyof CurriculumCounts> = {
      'Completed One2One': 'One2One',
      'Completed Making Disciples': 'Making Disciples',
      'Completed Church Community': 'Church Community',
      'Completed Empowering Leaders': 'Empowering Leaders',
    }

    checklistItems
      .filter(item => item.completed && item.label in curriculumLabels)
      .forEach(item => {
        const curriculumType = curriculumLabels[item.label]
        if (curriculumType) {
          counts[curriculumType]++
          const person = peopleById.get(item.person_id)
          if (person) {
            names[curriculumType].push(person.name)
          }
        }
      })

    engagements
      .filter(e => e.status === 'Completed' && e.meeting_type === 'Coffee')
      .forEach(e => {
        const person = peopleById.get(e.person_id)
        if (person && !names['Coffee'].includes(person.name)) {
          names['Coffee'].push(person.name)
          counts['Coffee']++
        }
      })

    return { counts, names }
  }, [checklistItems, engagements, people])

  return <EngagementBadges completedCounts={completedData.counts} completedNames={completedData.names} />
}
