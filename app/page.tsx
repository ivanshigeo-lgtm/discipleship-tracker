'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'
import ErrorBoundary from '../components/ErrorBoundary'
import AddPersonForm from '../components/AddPersonForm'
import PeopleList from '../components/PeopleList'
import MultiplicationSnapshot from '../components/MultiplicationSnapshot'
import MyCircleMap from '../components/MyCircleMap'
import CoachingPipeline from '../components/CoachingPipeline'
import NeedAttentionSection from '../components/NeedAttentionSection'
import PointsOfActionSection from '../components/PointsOfActionSection'
import PrayerWallSection from '../components/PrayerWallSection'
import CurriculumBadgesSection from '../components/CurriculumBadgesSection'
import EmergingTeamSection from '../components/EmergingTeamSection'
import PersonProfileModal from '../components/PersonProfileModal'
import MobileNav from '../components/MobileNav'
import LoginPage from '../components/LoginPage'
import GoogleCalendarConnect from '../components/GoogleCalendarConnect'
import FocusDashboard from '../components/FocusDashboard'
import type { Person, Stage } from '../types/database'

type CircleFilter = {
  key: string
  label: string
  stages?: Stage[]
}

type CircleSort = 'az' | '4e'
type ViewMode = 'visual' | 'pipeline' | 'list'
type MobileTab = 'home' | 'meetings' | 'add' | 'pipeline'
type DashboardMode = 'focus' | 'full'

const allCircleFilter: CircleFilter = {
  key: 'All',
  label: 'All',
}

const uniqueStagesFromFilters = (filters: CircleFilter[]) => {
  const stages = Array.from(new Set(filters.flatMap(filter => filter.stages ?? [])))
  return stages.length > 0 ? stages : undefined
}

export default function DiscipleshipTracker() {
  const router = useRouter()
  const { user, profile, loading, signOut, canEdit, refreshProfile } = useAuth()
  const [refreshKey, setRefreshKey] = useState(0)

  // Check if user is a disciple (not a coach)
  const isDisciple = profile && !profile.is_admin && profile.current_stage !== 'Empower'

  // Redirect disciples to their journey page
  useEffect(() => {
    if (isDisciple) {
      router.replace('/my-journey')
    }
  }, [isDisciple, router])
  const [circleFilters, setCircleFilters] = useState<CircleFilter[]>([])
  const [circleView, setCircleView] = useState<ViewMode>('pipeline')
  const [circleSort, setCircleSort] = useState<CircleSort>('4e')
  const [showAddPersonMenu, setShowAddPersonMenu] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [initialProfileTab, setInitialProfileTab] = useState<'profile' | 'journey' | 'connections' | 'engagements' | 'groups' | 'prayer'>('profile')
  const [mobileTab, setMobileTab] = useState<MobileTab>('home')
  const [journeyExpanded, setJourneyExpanded] = useState(false)
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('focus')
  const [profileLoading, setProfileLoading] = useState(true)

  // Handle return from Google Calendar OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'connected') {
      window.history.replaceState({}, '', '/')
      refreshProfile()
      setRefreshKey(prev => prev + 1)
    }
  }, [refreshProfile])

  // Profile loading timeout
  useEffect(() => {
    if (profile) {
      setProfileLoading(false)
    } else if (user && !loading) {
      const timeout = setTimeout(() => setProfileLoading(false), 8000)
      return () => clearTimeout(timeout)
    } else if (!loading) {
      setProfileLoading(false)
    }
  }, [profile, user, loading])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--fg-2)]">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  if (!profile && profileLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
        <p className="text-[var(--fg-2)]">Loading your data...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-center text-[var(--fg-2)]">
          Having trouble loading your profile.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              setProfileLoading(true)
              refreshProfile()
            }}
            className="rounded-lg bg-[var(--gbm-cobalt-bright)] px-4 py-2 font-semibold text-white"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-[var(--line-2)] px-4 py-2 text-[var(--fg-2)]"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  // Block disciples from seeing coach dashboard - show loading while redirecting
  if (isDisciple) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--void)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
      </div>
    )
  }

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
            <span className="whitespace-nowrap text-sm text-[var(--fg-3)]">Coaching Legacies of Disciples</span>
          </div>
          <div className="mx-6 h-14 w-px bg-[var(--line-2)]" />
          <div className="flex shrink-0 items-center gap-3">
            {profile && (
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--fg-2)]">{profile.name}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut()
                      window.location.href = '/'
                    }}
                    className="cn-chip !text-xs"
                  >
                    Sign Out
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <GoogleCalendarConnect />
                  <button
                    type="button"
                    onClick={() => {
                      const code = profile.id.slice(-6).toUpperCase()
                      navigator.clipboard.writeText(code)
                      alert(`Your coach code is: ${code}\n\nCopied to clipboard!`)
                    }}
                    className="flex items-center gap-1.5 text-xs text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                  >
                    <span className="font-mono">{profile.id.slice(-6).toUpperCase()}</span>
                    <span className="text-[10px]">📋</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="mb-4 flex items-center justify-between md:hidden">
        <img
          src="/gbm-horizontal-lockup-white.png"
          alt="Grace Bible Maui"
          className="h-12 w-auto"
        />
        <div className="flex items-center gap-2">
          <div className="text-right">
            <h1 className="text-lg font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              Constellations
            </h1>
            <span className="text-[10px] text-[var(--fg-3)]">{profile?.name || 'Coach'}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut()
              window.location.href = '/'
            }}
            className="rounded-full border border-[var(--line-2)] px-2 py-1 text-[10px] text-[var(--fg-3)]"
          >
            Sign Out
          </button>
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

      {/* Dashboard Mode Toggle */}
      <div className="mb-4 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setDashboardMode('focus')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
            dashboardMode === 'focus'
              ? 'bg-[var(--gbm-cobalt-bright)] text-white'
              : 'bg-[var(--indigo-2)] text-[var(--fg-2)] hover:bg-[var(--indigo-3)]'
          }`}
        >
          Focus
        </button>
        <button
          type="button"
          onClick={() => setDashboardMode('full')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
            dashboardMode === 'full'
              ? 'bg-[var(--gbm-cobalt-bright)] text-white'
              : 'bg-[var(--indigo-2)] text-[var(--fg-2)] hover:bg-[var(--indigo-3)]'
          }`}
        >
          Full Dashboard
        </button>
      </div>

      {/* Focus Dashboard */}
      {dashboardMode === 'focus' && (
        <FocusDashboard
          onPersonClick={(person) => setSelectedPerson(person)}
          onViewFullDashboard={() => setDashboardMode('full')}
          onAddPerson={() => setShowAddPersonMenu(true)}
        />
      )}

      {/* Full Dashboard - Main Content */}
      {dashboardMode === 'full' && (
      <div className={`${mobileTab !== 'home' && mobileTab !== 'meetings' && mobileTab !== 'pipeline' ? 'hidden md:block' : ''}`}>
        {/* Snapshot - always visible on desktop, only on home tab for mobile */}
        <div className={`${mobileTab !== 'home' ? 'hidden md:block' : ''}`}>
          <ErrorBoundary name="MultiplicationSnapshot">
            <MultiplicationSnapshot
              refreshKey={refreshKey}
              selectedFilterKeys={selectedFilterKeys}
              onToggleFilter={toggleCircleFilter}
              onAddPerson={() => setShowAddPersonMenu(true)}
              onPersonClick={(person) => setSelectedPerson(person)}
            />
          </ErrorBoundary>
        </div>

        {/* Emerging Team - only on home tab */}
        <div className={`${mobileTab !== 'home' ? 'hidden md:block' : ''}`}>
          <ErrorBoundary name="EmergingTeamSection">
            <EmergingTeamSection
              refreshKey={refreshKey}
              onPersonClick={(person) => setSelectedPerson(person)}
              onChanged={() => setRefreshKey(prev => prev + 1)}
            />
          </ErrorBoundary>
        </div>

        {/* My Meetings - visible on home and meetings tabs */}
        <div className={`${mobileTab !== 'home' && mobileTab !== 'meetings' ? 'hidden md:block' : ''}`}>
          <ErrorBoundary name="NeedAttentionSection">
            <NeedAttentionSection
              refreshKey={refreshKey}
              onPersonClick={(person, openTab) => {
                setSelectedPerson(person)
                setInitialProfileTab(openTab ?? 'profile')
              }}
              onAddNewPerson={() => setShowAddPersonMenu(true)}
              onGroupsChanged={() => setRefreshKey(prev => prev + 1)}
            />
          </ErrorBoundary>
        </div>

        {/* Points of Action - only on home tab */}
        <div className={`${mobileTab !== 'home' ? 'hidden md:block' : ''}`}>
          <ErrorBoundary name="PointsOfActionSection">
            <PointsOfActionSection
              refreshKey={refreshKey}
              onPersonClick={(person, openTab) => {
                setSelectedPerson(person)
                setInitialProfileTab(openTab ?? 'profile')
              }}
            />
          </ErrorBoundary>
        </div>

        {/* Prayer & Praise Wall - only on home tab */}
        <div className={`${mobileTab !== 'home' ? 'hidden md:block' : ''}`}>
          <ErrorBoundary name="PrayerWallSection">
            <PrayerWallSection
              refreshKey={refreshKey}
              onPersonClick={(person) => {
                setSelectedPerson(person)
                setInitialProfileTab('prayer')
              }}
            />
          </ErrorBoundary>
        </div>

        {/* Our Journey / Pipeline - visible on home and pipeline tabs */}
        <div className={`cn-card mb-6 p-4 ${mobileTab !== 'home' && mobileTab !== 'pipeline' ? 'hidden md:block' : ''}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="cn-h3">Our Journey</h2>
                <CurriculumBadgesSection refreshKey={refreshKey} />
              </div>
              <p className="mt-1 text-xs text-[var(--fg-2)] sm:text-sm">
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
              <ErrorBoundary name="CoachingPipeline">
                <CoachingPipeline
                  refreshKey={refreshKey}
                  collapsed={!journeyExpanded}
                  onPersonClick={(person, openTab) => {
                    setSelectedPerson(person)
                    setInitialProfileTab(openTab ?? 'profile')
                  }}
                  onChanged={() => setRefreshKey(prev => prev + 1)}
                />
              </ErrorBoundary>
            </div>
          )}

          {journeyExpanded && circleView === 'visual' && (
            <div className="mt-4">
              <ErrorBoundary name="MyCircleMap">
                <MyCircleMap
                  refreshKey={refreshKey}
                  filterStages={selectedStageFilters}
                  sortMode={circleSort}
                  onChanged={() => setRefreshKey(prev => prev + 1)}
                />
              </ErrorBoundary>
            </div>
          )}

          {journeyExpanded && circleView === 'list' && (
            <div className="mt-4">
              <ErrorBoundary name="PeopleList">
                <PeopleList
                  key={refreshKey}
                  filterStages={selectedStageFilters}
                  sortMode={circleSort}
                  onChanged={() => setRefreshKey(prev => prev + 1)}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
      </div>
      )}

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
          onPersonCreated={() => {
            setRefreshKey(prev => prev + 1)
          }}
        />
      )}

      {/* Mobile Navigation */}
      <MobileNav activeTab={mobileTab} onTabChange={handleMobileTabChange} />
    </div>
  )
}
