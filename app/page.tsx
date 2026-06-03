'use client'

import { useEffect, useState } from 'react'
import AddPersonForm from '../components/AddPersonForm'
import PeopleList from '../components/PeopleList'
import VictoryGroupsList from '../components/VictoryGroupsList'
import MultiplicationSnapshot from '../components/MultiplicationSnapshot'
import MyCircleMap from '../components/MyCircleMap'
import CoachingPipeline from '../components/CoachingPipeline'
import NeedAttentionSection from '../components/NeedAttentionSection'
import EmergingTeamSection from '../components/EmergingTeamSection'
import PersonProfileModal from '../components/PersonProfileModal'
import { getVictoryGroups } from '../lib/supabaseQueries'
import type { Person, Stage, VictoryGroup } from '../types/database'

type CircleFilter = {
  key: string
  label: string
  stages?: Stage[]
}

type CircleSort = 'az' | '4e'
type ViewMode = 'visual' | 'pipeline' | 'list'

const allCircleFilter: CircleFilter = {
  key: 'All',
  label: 'All',
}

const uniqueStagesFromFilters = (filters: CircleFilter[]) => {
  const stages = Array.from(new Set(filters.flatMap(filter => filter.stages ?? [])))
  return stages.length > 0 ? stages : undefined
}

export default function DiscipleshipTracker() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [circleFilters, setCircleFilters] = useState<CircleFilter[]>([])
  const [circleView, setCircleView] = useState<ViewMode>('pipeline')
  const [circleSort, setCircleSort] = useState<CircleSort>('4e')
  const [showAddPersonMenu, setShowAddPersonMenu] = useState(false)
  const [showGroupsMenu, setShowGroupsMenu] = useState(false)
  const [showGroupsPanel, setShowGroupsPanel] = useState(false)
  const [startAddingGroup, setStartAddingGroup] = useState(false)
  const [groupsPanelKey, setGroupsPanelKey] = useState(0)
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)

  const loadGroups = async () => {
    const { data } = await getVictoryGroups()
    setGroups((data ?? []) as VictoryGroup[])
  }

  useEffect(() => {
    loadGroups()
  }, [refreshKey])

  const handlePersonAdded = () => {
    setRefreshKey(prev => prev + 1)
    setShowAddPersonMenu(false)
  }

  const handleGroupsChanged = () => {
    setRefreshKey(prev => prev + 1)
    loadGroups()
  }

  const openGroupsPanel = (startWithAddForm = false) => {
    setStartAddingGroup(startWithAddForm)
    setGroupsPanelKey(prev => prev + 1)
    setShowGroupsPanel(true)
    setShowGroupsMenu(false)
  }


  const toggleCircleFilter = (filter: CircleFilter) => {
    if (filter.key === allCircleFilter.key) {
      setCircleFilters([])
      return
    }

    setCircleFilters(current => (
      current.some(selectedFilter => selectedFilter.key === filter.key)
        ? current.filter(selectedFilter => selectedFilter.key !== filter.key)
        : [...current, filter]
    ))
  }

  const selectedStageFilters = uniqueStagesFromFilters(circleFilters)
  const selectedFilterKeys = circleFilters.map(filter => filter.key)

  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-white p-4 sm:p-6 lg:p-8">
      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">Discipleship Tracker</h1>
            <p className="mt-2 text-gray-600">Helping people grow through the 4E process</p>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowAddPersonMenu(current => !current)
                  setShowGroupsMenu(false)
                }}
                className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
              >
                + Add Person
              </button>

              {showAddPersonMenu && (
                <div className="absolute right-0 z-30 mt-2 w-[min(92vw,420px)] rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-gray-900">Add New Person</h2>
                    <button
                      type="button"
                      onClick={() => setShowAddPersonMenu(false)}
                      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      Close
                    </button>
                  </div>
                  <AddPersonForm onPersonAdded={handlePersonAdded} />
                </div>
              )}
            </div>

            <div
              className="relative"
              onMouseEnter={() => setShowGroupsMenu(true)}
            >
              <button
                type="button"
                onClick={() => {
                  setShowGroupsMenu(current => !current)
                  setShowAddPersonMenu(false)
                }}
                className="rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50"
              >
                Grace Groups
              </button>

              {showGroupsMenu && (
                <div className="absolute right-0 z-20 mt-2 w-[min(90vw,320px)] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900">Current Groups</div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openGroupsPanel(true)}
                        className="rounded-full bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800"
                      >
                        + Add Group
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowGroupsMenu(false)}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  {groups.length === 0 ? (
                    <p className="rounded-xl bg-gray-50 p-3 text-sm text-gray-700">No Grace Groups yet.</p>
                  ) : (
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {groups.map(group => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => openGroupsPanel(false)}
                          className="block w-full rounded-xl px-3 py-2 text-left hover:bg-gray-50"
                        >
                          <div className="break-words text-sm font-semibold text-gray-900">{group.name}</div>
                          <div className="mt-0.5 text-xs text-gray-600">
                            {group.meeting_day || group.meeting_time
                              ? `${group.meeting_day ?? 'Recurring'}${group.meeting_time ? ` @ ${group.meeting_time}` : ''}`
                              : 'No recurring time set'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => openGroupsPanel(false)}
                    className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    Manage Groups, Members & Attendance
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {showGroupsPanel && (
        <div className="mb-8 rounded-3xl border border-gray-300 bg-gray-50 p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Grace Groups</h2>
              <p className="text-sm text-gray-700">Manage groups, members, recurring times, and attendance.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowGroupsPanel(false)}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-100"
            >
              Close
            </button>
          </div>
          <VictoryGroupsList
            key={groupsPanelKey}
            startWithForm={startAddingGroup}
            onChanged={handleGroupsChanged}
          />
        </div>
      )}

      <MultiplicationSnapshot
        refreshKey={refreshKey}
        selectedFilterKeys={selectedFilterKeys}
        onToggleFilter={toggleCircleFilter}
      />

      <NeedAttentionSection
        refreshKey={refreshKey}
        onPersonClick={(person) => setSelectedPerson(person)}
      />

      <EmergingTeamSection
        refreshKey={refreshKey}
        onPersonClick={(person) => setSelectedPerson(person)}
        onChanged={() => setRefreshKey(prev => prev + 1)}
      />

      <div>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Our Journey</h2>
            <p className="text-sm text-gray-600">
              {circleView === 'pipeline'
                ? 'Move people through stages with the coaching pipeline.'
                : 'Visualize people moving toward Christ together.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <div className="rounded-full border border-gray-200 bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setCircleView('pipeline')}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${circleView === 'pipeline' ? 'bg-black text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'}`}
              >
                Pipeline
              </button>
              <button
                type="button"
                onClick={() => setCircleView('visual')}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${circleView === 'visual' ? 'bg-black text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'}`}
              >
                Visual
              </button>
              <button
                type="button"
                onClick={() => setCircleView('list')}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${circleView === 'list' ? 'bg-black text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'}`}
              >
                List
              </button>
            </div>
            {circleView !== 'pipeline' && (
              <div className="rounded-full border border-gray-200 bg-gray-100 p-1">
                <button
                  type="button"
                  onClick={() => setCircleSort('4e')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${circleSort === '4e' ? 'bg-black text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'}`}
                >
                  4E
                </button>
                <button
                  type="button"
                  onClick={() => setCircleSort('az')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${circleSort === 'az' ? 'bg-black text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200'}`}
                >
                  A-Z
                </button>
              </div>
            )}
            {circleFilters.length > 0 && circleView !== 'pipeline' && (
              <>
                <span>Showing {circleFilters.map(filter => filter.label).join(' + ')}</span>
                <button
                  type="button"
                  onClick={() => setCircleFilters([])}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>


        {circleView === 'pipeline' && (
          <CoachingPipeline
            refreshKey={refreshKey}
            onPersonClick={(person) => setSelectedPerson(person)}
            onChanged={() => setRefreshKey(prev => prev + 1)}
          />
        )}

        {circleView === 'visual' && (
          <MyCircleMap
            refreshKey={refreshKey}
            filterStages={selectedStageFilters}
            sortMode={circleSort}
            onChanged={() => setRefreshKey(prev => prev + 1)}
          />
        )}

        {circleView === 'list' && (
          <PeopleList
            key={refreshKey}
            filterStages={selectedStageFilters}
            sortMode={circleSort}
            onChanged={() => setRefreshKey(prev => prev + 1)}
          />
        )}
      </div>

      {selectedPerson && (
        <PersonProfileModal
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onSaved={() => {
            setRefreshKey(prev => prev + 1)
          }}
          onDeleted={() => {
            setSelectedPerson(null)
            setRefreshKey(prev => prev + 1)
          }}
        />
      )}
    </div>
  )
}
