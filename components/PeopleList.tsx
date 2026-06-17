'use client'

import { useEffect, useState } from 'react'
import { getPeople, updatePersonStage } from '../lib/supabaseQueries'
import { useAuth } from '../contexts/AuthContext'
import type { Person, Stage } from '../types/database'
import NextStepsList from './NextStepsList'
import AddNextStepForm from './AddNextStepForm'
import PrayerRequestsList from './PrayerRequestsList'
import AddPrayerRequestForm from './AddPrayerRequestForm'
import PersonGroupsSection from './PersonGroupsSection'
import StageChecklist from './StageChecklist'
import DiscipleshipConnectionsSection from './DiscipleshipConnectionsSection'
import PersonProfileModal from './PersonProfileModal'
import StageLevelBadge from './StageLevelBadge'
import { stageLabels, stageOrder } from '../lib/stageLabels'

interface PeopleListProps {
  filterStages?: Stage[]
  sortMode?: 'az' | '4e'
  searchQuery?: string
  allowedPersonIds?: string[]
  onChanged?: () => void
}

type PersonSection = 'information' | 'stage' | 'connections' | 'groups' | 'prayer'

const stages: Stage[] = stageOrder
const stageSortRank: Record<Stage, number> = {
  Engage: 0,
  Establish: 1,
  Equip: 2,
  Empower: 3,
}

const defaultOpenSections: Record<PersonSection, boolean> = {
  information: false,
  stage: false,
  connections: false,
  groups: false,
  prayer: false,
}

function SectionCard({
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  subtitle?: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-gray-50"
      >
        <div>
          <div className="font-semibold text-gray-900">{title}</div>
          {subtitle && <div className="mt-0.5 text-sm text-gray-700">{subtitle}</div>}
        </div>
        <div className="text-2xl font-light text-gray-700">{isOpen ? '−' : '+'}</div>
      </button>

      {isOpen && <div className="border-t border-gray-200 p-3">{children}</div>}
    </div>
  )
}

export default function PeopleList({ filterStages, sortMode = '4e', searchQuery = '', allowedPersonIds, onChanged }: PeopleListProps) {
  const { profile } = useAuth()
  const [people, setPeople] = useState<Person[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [openSectionsByPerson, setOpenSectionsByPerson] = useState<Record<string, Record<PersonSection, boolean>>>({})

  const filterKey = filterStages?.join('|') ?? 'All'

  const loadPeople = async () => {
    const { data } = await getPeople(filterStages)
    if (data) {
      const sortedPeople = ([...(data as Person[])]).sort((a, b) => {
        if (sortMode === 'az') return a.name.localeCompare(b.name)
        return stageSortRank[a.current_stage] - stageSortRank[b.current_stage] || a.name.localeCompare(b.name)
      })
      setPeople(sortedPeople)
    }
  }

  useEffect(() => {
    loadPeople()
  }, [refreshKey, filterKey, sortMode])

  const scopedPeople = allowedPersonIds
    ? people.filter(p => allowedPersonIds.includes(p.id))
    : people
  const visiblePeople = searchQuery
    ? scopedPeople.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : scopedPeople

  const toggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
    setOpenSectionsByPerson(current => ({
      ...current,
      [id]: current[id] ?? defaultOpenSections,
    }))
  }

  const toggleSection = (personId: string, section: PersonSection) => {
    setOpenSectionsByPerson(current => {
      const currentSections = current[personId] ?? defaultOpenSections
      return {
        ...current,
        [personId]: {
          ...currentSections,
          [section]: !currentSections[section],
        },
      }
    })
  }

  const handleStageChange = async (personId: string, newStage: Stage) => {
    await updatePersonStage(personId, newStage)
    setRefreshKey(k => k + 1)
    onChanged?.()
  }

  const getStageColor = (stage: Stage) => {
    switch (stage) {
      case 'Engage': return 'bg-blue-100 text-blue-800'
      case 'Establish': return 'bg-emerald-100 text-emerald-800'
      case 'Equip': return 'bg-amber-100 text-amber-800'
      case 'Empower': return 'bg-violet-100 text-violet-800'
    }
  }

  if (people.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gray-50 py-12 text-center">
        <p className="text-gray-700">No people found in this stage yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {visiblePeople.map((person) => {
        const openSections = openSectionsByPerson[person.id] ?? defaultOpenSections

        return (
          <div key={person.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div
              onClick={() => toggle(person.id)}
              onDoubleClick={(event) => {
                event.stopPropagation()
                setEditingPerson(person)
              }}
              title="Click to expand. Double-click to edit profile."
              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
            >
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-gray-900">{person.name}</div>
                  <div className="truncate text-sm text-gray-700">
                    {person.email || person.phone || 'No contact info yet'}
                  </div>
                </div>
                <StageLevelBadge stage={person.current_stage} size="sm" />
              </div>
              <div className="shrink-0 text-xl font-light text-gray-700">
                {expandedId === person.id ? '−' : '+'}
              </div>
            </div>

            {expandedId === person.id && (
              <div className="space-y-3 border-t bg-gray-50 p-3">
                <SectionCard
                  title="Information"
                  subtitle="Contact details, dates, and notes"
                  isOpen={openSections.information}
                  onToggle={() => toggleSection(person.id, 'information')}
                >
                  <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                    <div>
                      <div className="font-semibold text-gray-700">Email</div>
                      <div className="text-gray-900">{person.email || 'Not added'}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-700">Phone</div>
                      <div className="text-gray-900">{person.phone || 'Not added'}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-700">Spiritual Birthday</div>
                      <div className="text-gray-900">
                        {person.spiritual_birthday ? new Date(person.spiritual_birthday + 'T00:00:00').toLocaleDateString() : 'Not added'}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-700">Baptism Date</div>
                      <div className="text-gray-900">
                        {person.baptism_date ? new Date(person.baptism_date + 'T00:00:00').toLocaleDateString() : 'Not added'}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="font-semibold text-gray-700">Notes</div>
                      <div className="whitespace-pre-wrap text-gray-900">{person.notes || 'No notes yet.'}</div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Current Stage & Next Steps"
                  subtitle="Move this person through Reach → Build → Train → Release and track follow-ups"
                  isOpen={openSections.stage}
                  onToggle={() => toggleSection(person.id, 'stage')}
                >
                  <div className="space-y-5">
                    <div>
                      <div className="mb-3 font-semibold text-gray-900">Current Stage</div>
                      <div className="flex flex-wrap gap-2">
                        {stages.map(stage => (
                          <button
                            key={stage}
                            onClick={() => handleStageChange(person.id, stage)}
                            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                              person.current_stage === stage
                                ? 'bg-black text-white'
                                : 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-100'
                            }`}
                          >
                            {stageLabels[stage].display}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-3 font-semibold text-gray-900">4E Tools & Action Steps</div>
                      <StageChecklist personId={person.id} currentStage={person.current_stage} />
                    </div>

                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="font-semibold text-gray-900">Next Steps</div>
                        <span className="text-xs font-medium text-gray-700">Follow-up dates</span>
                      </div>
                      <NextStepsList personId={person.id} personName={person.name} coachPersonId={profile?.id} refreshKey={refreshKey} />
                      <AddNextStepForm
                        personId={person.id}
                        personName={person.name}
                        onAdded={() => setRefreshKey(k => k + 1)}
                      />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Discipleship Connections"
                  subtitle="Being coached by, called to coach, and notes"
                  isOpen={openSections.connections}
                  onToggle={() => toggleSection(person.id, 'connections')}
                >
                  <DiscipleshipConnectionsSection personId={person.id} />
                </SectionCard>

                <SectionCard
                  title="Groups"
                  subtitle="Grace Group membership and recurring group connection"
                  isOpen={openSections.groups}
                  onToggle={() => toggleSection(person.id, 'groups')}
                >
                  <div className="space-y-3">
                    <PersonGroupsSection
                      personId={person.id}
                      onChanged={() => {
                        setRefreshKey(k => k + 1)
                        onChanged?.()
                      }}
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Prayer Requests"
                  subtitle="Current prayer needs and answered prayers / praise reports"
                  isOpen={openSections.prayer}
                  onToggle={() => toggleSection(person.id, 'prayer')}
                >
                  <PrayerRequestsList
                    personId={person.id}
                    refreshKey={refreshKey}
                    onUpdate={() => setRefreshKey(k => k + 1)}
                  />
                  <AddPrayerRequestForm
                    personId={person.id}
                    onAdded={() => setRefreshKey(k => k + 1)}
                  />
                </SectionCard>
              </div>
            )}
          </div>
        )
      })}

      {editingPerson && (
        <PersonProfileModal
          person={editingPerson}
          onClose={() => setEditingPerson(null)}
          onSaved={() => {
            setRefreshKey(k => k + 1)
            onChanged?.()
          }}
          onDeleted={() => {
            setEditingPerson(null)
            setExpandedId(null)
            setRefreshKey(k => k + 1)
            onChanged?.()
          }}
        />
      )}
    </div>
  )
}
