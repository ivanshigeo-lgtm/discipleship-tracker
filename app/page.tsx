'use client'

import { useEffect, useState } from 'react'
import AddPersonForm from '../components/AddPersonForm'
import PeopleList from '../components/PeopleList'
import MultiplicationSnapshot from '../components/MultiplicationSnapshot'
import MyCircleMap from '../components/MyCircleMap'
import CoachingPipeline from '../components/CoachingPipeline'
import NeedAttentionSection from '../components/NeedAttentionSection'
import PointsOfActionSection from '../components/PointsOfActionSection'
import EmergingTeamSection from '../components/EmergingTeamSection'
import PersonProfileModal from '../components/PersonProfileModal'
import MobileNav from '../components/MobileNav'
import type { Person, Stage } from '../types/database'

type CircleFilter = {
  key: string
  label: string
  stages?: Stage[]
}

type CircleSort = 'az' | '4e'
type ViewMode = 'visual' | 'pipeline' | 'list'
type MobileTab = 'home' | 'meetings' | 'add' | 'pipeline'

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
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [initialProfileTab, setInitialProfileTab] = useState<'profile' | 'journey' | 'connections' | 'engagements' | 'groups' | 'prayer'>('profile')
  const [mobileTab, setMobileTab] = useState<MobileTab>('home')
  const [journeyExpanded, setJourneyExpanded] = useState(false)

  const handlePersonAdded = () => {
    setRefreshKey(prev => prev + 1)
    setShowAddPersonMenu(false)
    setMobileTab('home')
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

  const handleMobileTabChange = (tab: string) => {
    if (tab === 'add') {
      setShowAddPersonMenu(true)
      return
    }
    setMobileTab(tab as MobileTab)
    setShowAddPersonMenu(false)
  }

  const selectedStageFilters = uniqueStagesFromFilters(circleFilters)
  const selectedFilterKeys = circleFilters.map(filter => filter.key)

  return (
    <div className="mx-auto min-h-screen max-w-6xl p-3 pb-24 sm:p-6 md:pb-8 lg:p-8">
      {/* Desktop Header */}
      <header className="-mb-2 hidden md:block">
        <div className="flex items-center">
          <img
            src="/gbm-horizontal-lockup-white.png"
            alt="Grace Bible Maui"
            className="h-[126px] w-auto shrink-0"
          />
          <div className="mx-6 h-14 w-px bg-[var(--line-2)]" />
          <div className="flex flex-1 items-baseline justify-center gap-2">
            <h1 className="text-3xl font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              Constellations
            </h1>
            <span className="text-sm text-[var(--fg-3)]">Coaching Legacies of Disciples</span>
          </div>
          <div className="mx-6 h-14 w-px bg-[var(--line-2)]" />
          <span className="shrink-0 text-3xl font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            Coach's Dashboard
          </span>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="mb-4 flex items-center justify-between md:hidden">
        <img
          src="/gbm-horizontal-lockup-white.png"
          alt="Grace Bible Maui"
          className="h-12 w-auto"
        />
        <div className="text-right">
          <h1 className="text-lg font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            Constellations
          </h1>
          <span className="text-[10px] text-[var(--fg-3)]">Coach's Dashboard</span>
        </div>
      </header>

      {/* Add Person Modal */}
      {showAddPersonMenu && (
        <div className="cn-card fixed inset-x-3 top-3 z-50 max-h-[85vh] overflow-y-auto p-4 sm:inset-auto sm:right-8 sm:top-4 sm:w-[min(92vw,420px)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="cn-h3">Add new person</h2>
            <button
              type="button"
              onClick={() => setShowAddPersonMenu(false)}
              className="cn-chip"
            >
              Close
            </button>
          </div>
          <AddPersonForm onPersonAdded={handlePersonAdded} />
        </div>
      )}

      {/* Main Content - Desktop shows all, Mobile shows based on tab */}
      <div className={`${mobileTab !== 'home' && mobileTab !== 'meetings' && mobileTab !== 'pipeline' ? 'hidden md:block' : ''}`}>
        {/* Snapshot - always visible on desktop, only on home tab for mobile */}
        <div className={`${mobileTab !== 'home' ? 'hidden md:block' : ''}`}>
          <MultiplicationSnapshot
            refreshKey={refreshKey}
            selectedFilterKeys={selectedFilterKeys}
            onToggleFilter={toggleCircleFilter}
            onAddPerson={() => setShowAddPersonMenu(true)}
          />
        </div>

        {/* My Meetings - visible on home and meetings tabs */}
        <div className={`${mobileTab !== 'home' && mobileTab !== 'meetings' ? 'hidden md:block' : ''}`}>
          <NeedAttentionSection
            refreshKey={refreshKey}
            onPersonClick={(person, openTab) => {
              setSelectedPerson(person)
              setInitialProfileTab(openTab ?? 'profile')
            }}
            onAddNewPerson={() => setShowAddPersonMenu(true)}
            onGroupsChanged={() => setRefreshKey(prev => prev + 1)}
          />
        </div>

        {/* Points of Action - only on home tab */}
        <div className={`${mobileTab !== 'home' ? 'hidden md:block' : ''}`}>
          <PointsOfActionSection
            refreshKey={refreshKey}
            onPersonClick={(person, openTab) => {
              setSelectedPerson(person)
              setInitialProfileTab(openTab ?? 'profile')
            }}
          />
        </div>

        {/* Emerging Team - only on home tab */}
        <div className={`${mobileTab !== 'home' ? 'hidden md:block' : ''}`}>
          <EmergingTeamSection
            refreshKey={refreshKey}
            onPersonClick={(person) => setSelectedPerson(person)}
            onChanged={() => setRefreshKey(prev => prev + 1)}
          />
        </div>

        {/* Our Journey / Pipeline - visible on home and pipeline tabs */}
        <div className={`cn-card mb-6 p-4 ${mobileTab !== 'home' && mobileTab !== 'pipeline' ? 'hidden md:block' : ''}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="cn-h3">Our Journey</h2>
              <p className="text-xs text-[var(--fg-2)] sm:text-sm">
                {circleView === 'pipeline'
                  ? 'Move people through stages with the coaching pipeline.'
                  : 'Visualize people moving toward Christ together.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-1">
                <button
                  type="button"
                  onClick={() => setCircleView('pipeline')}
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${circleView === 'pipeline' ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                >
                  Pipeline
                </button>
                <button
                  type="button"
                  onClick={() => setCircleView('visual')}
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${circleView === 'visual' ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                >
                  Visual
                </button>
                <button
                  type="button"
                  onClick={() => setCircleView('list')}
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${circleView === 'list' ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                >
                  List
                </button>
              </div>
              {circleView !== 'pipeline' && (
                <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-1">
                  <button
                    type="button"
                    onClick={() => setCircleSort('4e')}
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${circleSort === '4e' ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                  >
                    4E
                  </button>
                  <button
                    type="button"
                    onClick={() => setCircleSort('az')}
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${circleSort === 'az' ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                  >
                    A-Z
                  </button>
                </div>
              )}
              {circleFilters.length > 0 && circleView !== 'pipeline' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--fg-3)]">Showing {circleFilters.map(filter => filter.label).join(' + ')}</span>
                  <button
                    type="button"
                    onClick={() => setCircleFilters([])}
                    className="cn-chip !text-[10px]"
                  >
                    Clear
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setJourneyExpanded(!journeyExpanded)}
                className="cn-chip"
              >
                {journeyExpanded ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>

          {circleView === 'pipeline' && (
            <div className="mt-4">
              <CoachingPipeline
                refreshKey={refreshKey}
                collapsed={!journeyExpanded}
                onPersonClick={(person, openTab) => {
                  setSelectedPerson(person)
                  setInitialProfileTab(openTab ?? 'profile')
                }}
                onChanged={() => setRefreshKey(prev => prev + 1)}
              />
            </div>
          )}

          {journeyExpanded && circleView === 'visual' && (
            <div className="mt-4">
              <MyCircleMap
                refreshKey={refreshKey}
                filterStages={selectedStageFilters}
                sortMode={circleSort}
                onChanged={() => setRefreshKey(prev => prev + 1)}
              />
            </div>
          )}

          {journeyExpanded && circleView === 'list' && (
            <div className="mt-4">
              <PeopleList
                key={refreshKey}
                filterStages={selectedStageFilters}
                sortMode={circleSort}
                onChanged={() => setRefreshKey(prev => prev + 1)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Person Profile Modal */}
      {selectedPerson && (
        <PersonProfileModal
          person={selectedPerson}
          initialTab={initialProfileTab}
          onClose={() => {
            setSelectedPerson(null)
            setInitialProfileTab('profile')
          }}
          onSaved={() => {
            setRefreshKey(prev => prev + 1)
          }}
          onDeleted={() => {
            setSelectedPerson(null)
            setInitialProfileTab('profile')
            setRefreshKey(prev => prev + 1)
          }}
          onAddNewPerson={() => {
            setShowAddPersonMenu(true)
          }}
        />
      )}

      {/* Mobile Navigation */}
      <MobileNav activeTab={mobileTab} onTabChange={handleMobileTabChange} />
    </div>
  )
}
