'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import ErrorBoundary from '../../components/ErrorBoundary'
import AddPersonForm from '../../components/AddPersonForm'
import PeopleList from '../../components/PeopleList'
import MultiplicationSnapshot from '../../components/MultiplicationSnapshot'
import MyCircleMap from '../../components/MyCircleMap'
import CoachingPipeline from '../../components/CoachingPipeline'
import NeedAttentionSection from '../../components/NeedAttentionSection'
import SignoffRequestsSection from '../../components/SignoffRequestsSection'
import GroupJoinRequests from '../../components/GroupJoinRequests'
import SharedSoapFeed from '../../components/SharedSoapFeed'
import SharedPrayerFeed from '../../components/SharedPrayerFeed'
import PointsOfActionSection from '../../components/PointsOfActionSection'
import PrayerWallSection from '../../components/PrayerWallSection'
import VictoryGroupsList from '../../components/VictoryGroupsList'
import CurriculumBadgesSection from '../../components/CurriculumBadgesSection'
import PipelineMomentum from '../../components/PipelineMomentum'
import EmergingTeamSection from '../../components/EmergingTeamSection'
import PersonProfileModal from '../../components/PersonProfileModal'
import LoginPage from '../../components/LoginPage'
import GoogleCalendarConnect from '../../components/GoogleCalendarConnect'
import MessageCenter from '../../components/MessageCenter'
import SoapEntryModal from '../../components/journey/SoapEntryModal'
import SoapCalendarSection from '../../components/SoapCalendarSection'
import { getSoapJournals, getAllDiscipleshipConnections, getPeople, getLevelSignoffs } from '../../lib/supabaseQueries'
import type { Person, SoapJournal, Stage, DiscipleshipConnection, Engagement } from '../../types/database'
import EngagementDetailModal from '../../components/EngagementDetailModal'
import { DashboardSkeleton } from '../../components/Skeleton'

// ─── Types ───────────────────────────────────────────────────────────────────
type SectionId = 'journey' | 'snapshot' | 'emerging' | 'engagements' | 'points' | 'groups' | 'prayer' | 'messages' | 'soaps'
type CircleView = 'pipeline' | 'visual' | 'list'
type CircleSort = 'az' | '4e'
type CircleFilter = { key: string; label: string; stages?: Stage[] }

const allFilter: CircleFilter = { key: 'All', label: 'All' }

// localStorage key: remembers the last section a coach visited so the app
// reopens there instead of always landing on "Our Journey".
const LAST_SECTION_KEY = 'constellations:last-section'

// ─── Sidebar nav config ───────────────────────────────────────────────────────
const NAV: Array<{ heading: string; items: Array<{ id: SectionId; label: string; dot?: string }> }> = [
  {
    heading: 'Dashboard',
    items: [
      { id: 'journey',  label: 'Our Journey',      dot: '#5B8DF7' },
      { id: 'snapshot', label: 'Snapshot',          dot: '#F4B650' },
    ],
  },
  {
    heading: 'Coaching',
    items: [
      { id: 'emerging',     label: 'Emerging Team',     dot: '#F0729F' },
      { id: 'engagements',  label: 'Engagements',       dot: '#36D6C3' },
      { id: 'points',       label: 'Points of Action',  dot: '#F4B650' },
    ],
  },
  {
    heading: 'Community',
    items: [
      { id: 'groups',   label: 'Groups',       dot: '#F4B650' },
      { id: 'prayer',   label: 'Prayer Wall',  dot: '#9B80FF' },
      { id: 'messages', label: 'My Messages',  dot: '#7EB3FF' },
      { id: 'soaps',    label: 'My SOAPs',     dot: '#36D6C3' },
    ],
  },
]

// ─── Sidebar component ────────────────────────────────────────────────────────
function CoachSidebar({
  active,
  open,
  onClose,
  onSelect,
  profileName,
  profileId,
  onSignOut,
  onAddPerson,
  soapStreak = 0,
}: {
  active: SectionId
  open: boolean
  onClose: () => void
  onSelect: (id: SectionId) => void
  profileName: string
  profileId: string
  onSignOut: () => void
  onAddPerson: () => void
  soapStreak?: number
}) {
  // close on Escape
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const coachCode = profileId.slice(-6).toUpperCase()

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[rgba(6,8,20,.5)] backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-[var(--line-2)] transition-transform duration-300 ease-in-out"
        style={{
          background: 'rgba(9,12,26,.98)',
          backdropFilter: 'blur(20px)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        {/* Drawer header — close only */}
        <div className="flex shrink-0 items-center justify-end border-b border-[var(--line-2)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-1)]"
          >
            ✕
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(section => (
            <div key={section.heading} className="mb-1">
              <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--fg-3)]">
                {section.heading}
              </p>
              {section.items.map(item => {
                const isActive = active === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelect(item.id); onClose() }}
                    className="flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-sm transition-colors hover:bg-[var(--indigo-2)]"
                    style={{
                      color: isActive ? 'var(--fg-1)' : 'var(--fg-2)',
                      background: isActive ? 'rgba(91,141,247,.10)' : 'transparent',
                      borderLeft: isActive ? `2px solid ${item.dot ?? '#5B8DF7'}` : '2px solid transparent',
                      fontWeight: isActive ? 500 : 400,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: item.dot ?? '#5B8DF7',
                        opacity: isActive ? 1 : 0.45,
                        boxShadow: isActive ? `0 0 6px 1px ${item.dot ?? '#5B8DF7'}` : 'none',
                      }}
                    />
                    <span className="flex-1">{item.label}</span>
                    {item.id === 'soaps' && soapStreak > 0 && (
                      <span className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(251,191,36,.15)', color: '#FBBF24' }}>
                        ⚡{soapStreak}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Footer — user info */}
        <div className="shrink-0 space-y-2 border-t border-[var(--line-2)] px-4 py-3">
          <GoogleCalendarConnect />
          <div className="flex items-center justify-between">
            <div>
              <p className="truncate text-xs font-medium text-[var(--fg-1)]">{profileName}</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(coachCode)
                  alert(`Coach code: ${coachCode}\n\nCopied!`)
                }}
                className="font-mono text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
              >
                {coachCode} 📋
              </button>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-[var(--line-2)] px-2 py-1 text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-1)]"
            >
              Sign out
            </button>
          </div>
          <button
            type="button"
            onClick={onAddPerson}
            className="w-full rounded-lg border border-[rgba(91,141,247,.4)] py-1.5 text-xs font-medium text-[var(--gbm-cobalt-bright)] transition-colors hover:bg-[rgba(91,141,247,.1)]"
          >
            + Add person
          </button>
        </div>
      </aside>
    </>
  )
}

// ─── Section title bar ────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-[var(--fg-3)]">{subtitle}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DiscipleshipTracker() {
  const router = useRouter()
  const { user, profile, loading, signOut, refreshProfile } = useAuth()

  const [refreshKey, setRefreshKey] = useState(0)
  const [activeSection, setActiveSection] = useState<SectionId>('journey')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Circle / journey view state
  const [circleFilters, setCircleFilters] = useState<CircleFilter[]>([])
  const [circleView, setCircleView] = useState<CircleView>('pipeline')
  const [circleSort, setCircleSort] = useState<CircleSort>('4e')
  const [circleScope, setCircleScope] = useState<'gbc' | 'mine'>('gbc')
  const [connections, setConnections] = useState<DiscipleshipConnection[]>([])
  const [journeyExpanded, setJourneyExpanded] = useState(true)
  const [journeySearch, setJourneySearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)

  // Engagements section: find an existing person to engage with
  const [engSearch, setEngSearch] = useState('')
  const [engSearchFocused, setEngSearchFocused] = useState(false)
  // Open engagement detail (action/prayer/praise points)
  const [detailEngagement, setDetailEngagement] = useState<{ engagement: Engagement; personName: string } | null>(null)

  // Person modal
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [initialProfileTab, setInitialProfileTab] = useState<'profile' | 'journey' | 'connections' | 'engagements' | 'groups' | 'prayer'>('profile')

  // Add person
  const [showAddPerson, setShowAddPerson] = useState(false)
  const [newPersonName, setNewPersonName] = useState('')

  // Message center
  const [msgCenterOpen, setMsgCenterOpen] = useState(false)
  const [msgCenterTarget, setMsgCenterTarget] = useState<string | null>(null)

  // SOAPs
  const [coachSoaps, setCoachSoaps] = useState<SoapJournal[]>([])
  const [soapsLoaded, setSoapsLoaded] = useState(false)
  const [selectedSoap, setSelectedSoap] = useState<SoapJournal | null>(null)
  const [showSoapEntry, setShowSoapEntry] = useState(false)
  const [soapEntryDate, setSoapEntryDate] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)

  // Coach-dashboard access is gated on the coach having signed off this
  // person's Empower stage (admins always allowed). null = still loading.
  const [empowerApproved, setEmpowerApproved] = useState<boolean | null>(null)
  useEffect(() => {
    if (!profile?.id) return
    if (profile.is_admin) { setEmpowerApproved(true); return }
    getLevelSignoffs(profile.id).then(({ data }) => {
      setEmpowerApproved(Boolean(data?.some(s => s.stage === 'Empower' && s.status === 'approved')))
    })
  }, [profile?.id, profile?.is_admin])

  // Disciple = not admin and Empower not yet signed off. While we don't yet know
  // (null), don't redirect or render the dashboard.
  const accessUnknown = profile && !profile.is_admin && empowerApproved === null
  const isDisciple = profile && !profile.is_admin && empowerApproved === false
  useEffect(() => {
    if (isDisciple) router.replace('/my-journey')
  }, [isDisciple, router])

  // Remember the last section visited, and reopen there next time.
  // Persisted per-device in localStorage. 'messages' is excluded so we never
  // restore straight into the message-center modal.
  const [sectionRestored, setSectionRestored] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem(LAST_SECTION_KEY)
    if (saved && saved !== 'messages' && NAV.some(g => g.items.some(i => i.id === saved))) {
      setActiveSection(saved as SectionId)
    }
    setSectionRestored(true)
  }, [])
  useEffect(() => {
    if (!sectionRestored || activeSection === 'messages') return
    localStorage.setItem(LAST_SECTION_KEY, activeSection)
  }, [activeSection, sectionRestored])

  // Profile loading timeout
  useEffect(() => {
    if (profile) { setProfileLoading(false); return }
    if (!loading) {
      const t = setTimeout(() => setProfileLoading(false), 8000)
      return () => clearTimeout(t)
    }
  }, [profile, loading])

  // Handle Google Calendar OAuth return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'connected') {
      window.history.replaceState({}, '', '/my-constellations')
      refreshProfile()
      setRefreshKey(p => p + 1)
    }
  }, [refreshProfile])

  // Load coach SOAPs when that section becomes active
  const loadSoaps = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await getSoapJournals(profile.id)
    if (data) setCoachSoaps(data as SoapJournal[])
    setSoapsLoaded(true)
  }, [profile?.id])

  // Discipleship connections — used to scope the journey to "My Constellation"
  useEffect(() => {
    getAllDiscipleshipConnections().then(({ data }) => {
      if (data) setConnections(data as DiscipleshipConnection[])
    })
  }, [refreshKey])

  // All people — used for the search dropdown under "Find person…"
  const [allPeople, setAllPeople] = useState<Person[]>([])
  useEffect(() => {
    getPeople().then(({ data }) => {
      if (data) setAllPeople(data as Person[])
    })
  }, [refreshKey])

  // "My Constellation" = everyone in my DOWNSTREAM coaching tree (people I
  // coach, people they coach, …). Excludes whoever coaches ME, and excludes ME
  // — a coach can't coach themselves, so the coach never appears as a person in
  // their own pipeline/momentum (their own journey lives on My Journey).
  const myCircleIds = useMemo(() => {
    if (!profile?.id) return undefined
    const ids = new Set<string>([profile.id])
    let changed = true
    while (changed) {
      changed = false
      for (const c of connections) {
        if (c.disciple_person_id && ids.has(c.discipler_person_id) && !ids.has(c.disciple_person_id)) {
          ids.add(c.disciple_person_id)
          changed = true
        }
      }
    }
    ids.delete(profile.id)
    return ids
  }, [connections, profile?.id])

  // Only admins may view the whole church (GBC). Everyone else is locked to
  // their own circle so a coach never sees another coach's people/meetings.
  const isAdmin = Boolean(profile?.is_admin)
  const effectiveScope: 'gbc' | 'mine' = isAdmin ? circleScope : 'mine'
  const allowedPersonIds = effectiveScope === 'mine' && myCircleIds
    ? Array.from(myCircleIds)
    : undefined

  // Matches for the search dropdown (respects the current scope).
  const searchMatches = useMemo(() => {
    const q = journeySearch.trim().toLowerCase()
    if (!q) return []
    const allow = allowedPersonIds ? new Set(allowedPersonIds) : null
    return allPeople
      .filter(p => (!allow || allow.has(p.id)) && p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [journeySearch, allPeople, allowedPersonIds])

  // Engagements search: all people, unscoped — pick someone to engage with.
  const engMatches = useMemo(() => {
    const q = engSearch.trim().toLowerCase()
    if (!q) return []
    return allPeople
      .filter(p => p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [engSearch, allPeople])

  const soapStreak = (() => {
    if (!coachSoaps.length) return 0
    const dates = new Set(coachSoaps.map(j => j.journal_date.slice(0, 10)))
    const today = new Date()
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      if (dates.has(key)) {
        streak++
      } else if (i === 0) {
        // missing today is OK — check yesterday before breaking
        continue
      } else {
        break
      }
    }
    return streak
  })()

  useEffect(() => {
    if (!soapsLoaded) loadSoaps()
  }, [soapsLoaded, loadSoaps])

  // ── Guard renders ──────────────────────────────────────────────────────────
  if (loading) {
    return <DashboardSkeleton />
  }
  if (!user) return <LoginPage />
  if (!profile && profileLoading) {
    return <DashboardSkeleton />
  }
  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-center text-[var(--fg-2)]">Having trouble loading your profile.</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => { setProfileLoading(true); refreshProfile() }} className="rounded-lg bg-[var(--gbm-cobalt-bright)] px-4 py-2 font-semibold text-white">Retry</button>
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-[var(--line-2)] px-4 py-2 text-[var(--fg-2)]">Refresh</button>
        </div>
      </div>
    )
  }
  if (isDisciple || accessUnknown) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--void)]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" /></div>
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const selectedStageFilters = circleFilters.flatMap(f => f.stages ?? [])
  const openPerson = (person: Person, tab?: typeof initialProfileTab) => {
    setSelectedPerson(person)
    setInitialProfileTab(tab ?? 'profile')
  }

  const handleSignOut = async () => { await signOut(); window.location.href = '/my-journey' }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-[var(--void)]">
      {/* Sidebar */}
      <CoachSidebar
        active={activeSection}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={id => { setActiveSection(id); if (id === 'messages') setMsgCenterOpen(true) }}
        profileName={profile.name}
        profileId={profile.id}
        onSignOut={handleSignOut}
        onAddPerson={() => setShowAddPerson(true)}
        soapStreak={soapStreak}
      />

      {/* Main content */}
      <div className="flex min-h-screen flex-1 flex-col">

        {/* Top bar */}
        <div className="sticky top-0 z-30 flex items-center gap-4 border-b border-[var(--line-2)] px-4 py-0" style={{ background: 'rgba(9,12,26,.96)', backdropFilter: 'blur(12px)' }}>
          {/* Hamburger */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-8 w-8 shrink-0 flex-col items-center justify-center gap-[5px] rounded-lg border border-[var(--line-2)]"
          >
            <span className="h-px w-4 rounded-full bg-[var(--fg-2)]" />
            <span className="h-px w-4 rounded-full bg-[var(--fg-2)]" />
            <span className="h-px w-4 rounded-full bg-[var(--fg-2)]" />
          </button>

          {/* Logo + title */}
          <div className="flex flex-1 items-center gap-4">
            <img src="/gbm-horizontal-lockup-white.png" alt="Grace Bible Maui" className="h-[88px] w-auto shrink-0" />
            <div className="hidden h-10 w-px bg-[var(--line-2)] sm:block" />
            <div className="hidden items-center gap-4 sm:flex">
              <div className="flex items-baseline gap-2">
                <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>Constellations</h1>
                <span className="whitespace-nowrap text-xs text-[var(--fg-3)]">Coaching Legacies of Disciples</span>
              </div>
              <div className="h-8 w-px shrink-0 bg-[var(--line-2)]" />
              <div className="flex rounded-full border border-[var(--line-2)] bg-[rgba(9,12,26,.6)] p-0.5 text-xs font-semibold w-fit">
                <span className="rounded-full px-3 py-0.5" style={{ background: 'var(--gbm-cobalt-bright)', color: '#fff' }}>
                  My Constellations
                </span>
                <a
                  href="/my-journey"
                  className="rounded-full px-3 py-0.5 text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
                >
                  My Journey
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Section content */}
        <main className="flex-1 p-3 sm:p-4">

          {/* ── Our Journey (default) ── */}
          {activeSection === 'journey' && (
            <div>
              <div className="cn-card mb-6 p-4">
                {/* Header row */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="cn-h3">Our Journey</h2>
                      <CurriculumBadgesSection refreshKey={refreshKey} allowedPersonIds={allowedPersonIds} />
                    </div>
                    <p className="mt-1 text-xs text-[var(--fg-2)] sm:text-sm">
                      {circleView === 'pipeline' ? 'Move people through stages with the coaching pipeline.' : 'Visualize people moving toward Christ together.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Scope: whole church vs my coaching circle (admin only) */}
                    {isAdmin && (
                      <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-1">
                        {([['gbc', 'GBC Constellation'], ['mine', 'My Constellation']] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setCircleScope(val)}
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${circleScope === val ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Search + live results dropdown */}
                    <div className="relative">
                      <input
                        type="text"
                        value={journeySearch}
                        onChange={e => setJourneySearch(e.target.value)}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                        placeholder="Find person..."
                        className="h-8 w-full rounded-full border border-[var(--line-2)] bg-[var(--indigo)] px-3 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none focus:ring-1 focus:ring-[var(--gbm-cobalt-bright)]"
                        style={{ minWidth: 140 }}
                      />
                      {searchFocused && searchMatches.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] shadow-lg">
                          {searchMatches.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={() => {
                                openPerson(p)
                                setJourneySearch('')
                                setSearchFocused(false)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--fg-1)] transition-colors hover:bg-[var(--indigo-2)]"
                            >
                              <span className="truncate font-medium">{p.name}</span>
                              <span className="ml-auto shrink-0 text-[10px] text-[var(--fg-3)]">{p.current_stage}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Add person */}
                    <button
                      type="button"
                      onClick={() => setShowAddPerson(true)}
                      className="h-8 rounded-full bg-[var(--gbm-cobalt-bright)] px-3 text-xs font-semibold text-white hover:opacity-90"
                    >
                      + Add Person
                    </button>
                    {/* View toggle */}
                    <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-1">
                      {(['pipeline', 'visual', 'list'] as CircleView[]).map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setCircleView(v)}
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${circleView === v ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                        >
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </button>
                      ))}
                    </div>
                    {circleView !== 'pipeline' && (
                      <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-1">
                        {(['4e', 'az'] as CircleSort[]).map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setCircleSort(s)}
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${circleSort === s ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                          >
                            {s.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => setJourneyExpanded(!journeyExpanded)} className="cn-chip">
                      {journeyExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>

                <ErrorBoundary name="PipelineMomentum">
                  <PipelineMomentum refreshKey={refreshKey} allowedPersonIds={allowedPersonIds} />
                </ErrorBoundary>

                {circleView === 'pipeline' && (
                  <div className="mt-4">
                    <ErrorBoundary name="CoachingPipeline">
                      <CoachingPipeline
                        refreshKey={refreshKey}
                        collapsed={!journeyExpanded}
                        searchQuery={journeySearch}
                        allowedPersonIds={allowedPersonIds}
                        onPersonClick={(p, tab) => openPerson(p, tab)}
                        onChanged={() => setRefreshKey(p => p + 1)}
                      />
                    </ErrorBoundary>
                  </div>
                )}
                {journeyExpanded && circleView === 'visual' && (
                  <div className="mt-4">
                    <ErrorBoundary name="MyCircleMap">
                      <MyCircleMap refreshKey={refreshKey} filterStages={selectedStageFilters.length ? selectedStageFilters : undefined} sortMode={circleSort} searchQuery={journeySearch} allowedPersonIds={allowedPersonIds} onChanged={() => setRefreshKey(p => p + 1)} />
                    </ErrorBoundary>
                  </div>
                )}
                {journeyExpanded && circleView === 'list' && (
                  <div className="mt-4">
                    <ErrorBoundary name="PeopleList">
                      <PeopleList key={refreshKey} filterStages={selectedStageFilters.length ? selectedStageFilters : undefined} sortMode={circleSort} searchQuery={journeySearch} allowedPersonIds={allowedPersonIds} onChanged={() => setRefreshKey(p => p + 1)} />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Snapshot ── */}
          {activeSection === 'snapshot' && (
            <div>
              <SectionHeader title="Snapshot" subtitle="Pipeline health and your full circle at a glance" />
              <ErrorBoundary name="MultiplicationSnapshot">
                <MultiplicationSnapshot
                  refreshKey={refreshKey}
                  selectedFilterKeys={circleFilters.map(f => f.key)}
                  myPersonId={profile.id}
                  onToggleFilter={f => {
                    if (f.key === allFilter.key) { setCircleFilters([]); return }
                    setCircleFilters(cur => cur.some(x => x.key === f.key) ? cur.filter(x => x.key !== f.key) : [...cur, f])
                  }}
                  onAddPerson={() => setShowAddPerson(true)}
                  onPersonClick={p => openPerson(p)}
                />
              </ErrorBoundary>
            </div>
          )}

          {/* ── Emerging Team ── */}
          {activeSection === 'emerging' && (
            <div>
              <SectionHeader title="Emerging Team" subtitle="Leaders being developed in your circle" />
              <ErrorBoundary name="EmergingTeamSection">
                <EmergingTeamSection
                  refreshKey={refreshKey}
                  onPersonClick={p => openPerson(p)}
                  onChanged={() => setRefreshKey(p => p + 1)}
                />
              </ErrorBoundary>
            </div>
          )}

          {/* ── Engagements ── */}
          {activeSection === 'engagements' && (
            <div>
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="cn-h3">Engagements</h2>
                  <p className="mt-1 text-xs text-[var(--fg-2)] sm:text-sm">Who needs your attention and upcoming meetings</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Find an existing person to engage with */}
                  <div className="relative">
                    <input
                      type="text"
                      value={engSearch}
                      onChange={e => setEngSearch(e.target.value)}
                      onFocus={() => setEngSearchFocused(true)}
                      onBlur={() => setTimeout(() => setEngSearchFocused(false), 150)}
                      placeholder="Find person to engage..."
                      className="h-8 w-full rounded-full border border-[var(--line-2)] bg-[var(--indigo)] px-3 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none focus:ring-1 focus:ring-[var(--gbm-cobalt-bright)]"
                      style={{ minWidth: 160 }}
                    />
                    {engSearchFocused && engMatches.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] shadow-lg">
                        {engMatches.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => {
                              openPerson(p, 'engagements')
                              setEngSearch('')
                              setEngSearchFocused(false)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--fg-1)] transition-colors hover:bg-[var(--indigo-2)]"
                          >
                            <span className="truncate font-medium">{p.name}</span>
                            <span className="ml-auto shrink-0 text-[10px] text-[var(--fg-3)]">{p.current_stage}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Add a new person */}
                  <button
                    type="button"
                    onClick={() => setShowAddPerson(true)}
                    className="h-8 rounded-full bg-[var(--gbm-cobalt-bright)] px-3 text-xs font-semibold text-white hover:opacity-90"
                  >
                    + Add Person
                  </button>
                </div>
              </div>
              <ErrorBoundary name="SignoffRequestsSection">
                <SignoffRequestsSection
                  coachId={profile.id}
                  isAdmin={Boolean(profile.is_admin)}
                  refreshKey={refreshKey}
                  onChanged={() => setRefreshKey(p => p + 1)}
                />
              </ErrorBoundary>
              <ErrorBoundary name="GroupJoinRequests">
                <GroupJoinRequests
                  ownerPersonId={profile.id}
                  refreshKey={refreshKey}
                  onChanged={() => setRefreshKey(p => p + 1)}
                />
              </ErrorBoundary>
              <ErrorBoundary name="NeedAttentionSection">
                <NeedAttentionSection
                  refreshKey={refreshKey}
                  viewerPersonId={profile.id}
                  isAdmin={isAdmin}
                  onPersonClick={(p, tab) => openPerson(p, tab)}
                  onOpenEngagement={(engagement, personName) => setDetailEngagement({ engagement, personName })}
                  onAddNewPerson={(name) => { setNewPersonName(name ?? ''); setShowAddPerson(true) }}
                  onGroupsChanged={() => setRefreshKey(p => p + 1)}
                />
              </ErrorBoundary>
              <div className="mt-6">
                <ErrorBoundary name="PointsOfActionSection">
                  <PointsOfActionSection
                    refreshKey={refreshKey}
                    viewerPersonId={profile.id}
                    isAdmin={isAdmin}
                    onPersonClick={(p, tab) => openPerson(p, tab)}
                    onOpenEngagement={(engagement, personName) => setDetailEngagement({ engagement, personName })}
                  />
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* ── Points of Action ── */}
          {activeSection === 'points' && (
            <div>
              <SectionHeader title="Points of Action" subtitle="Next steps and follow-ups across your circle" />
              <ErrorBoundary name="PointsOfActionSection">
                <PointsOfActionSection
                  refreshKey={refreshKey}
                  viewerPersonId={profile.id}
                  isAdmin={isAdmin}
                  onPersonClick={(p, tab) => openPerson(p, tab)}
                  onOpenEngagement={(engagement, personName) => setDetailEngagement({ engagement, personName })}
                />
              </ErrorBoundary>
            </div>
          )}

          {/* ── Prayer Wall ── */}
          {activeSection === 'groups' && (
            <div>
              <SectionHeader title="Groups" subtitle="Your Grace Groups and who's in them" />
              <ErrorBoundary name="VictoryGroupsList">
                <VictoryGroupsList
                  onChanged={() => setRefreshKey(p => p + 1)}
                  onPersonClick={p => openPerson(p)}
                  onAddNewPerson={(name) => { setNewPersonName(name ?? ''); setShowAddPerson(true) }}
                />
              </ErrorBoundary>
            </div>
          )}

          {activeSection === 'prayer' && (
            <div>
              <SectionHeader title="Prayer Wall" subtitle="Requests and praises shared with everyone" />
              <ErrorBoundary name="SharedPrayerFeed">
                <SharedPrayerFeed personId={profile.id} scope="coach" refreshKey={refreshKey} />
              </ErrorBoundary>
              <ErrorBoundary name="PrayerWallSection">
                <PrayerWallSection
                  refreshKey={refreshKey}
                  onPersonClick={p => openPerson(p, 'prayer')}
                />
              </ErrorBoundary>
            </div>
          )}

          {/* ── My Messages ── (opens the MessageCenter overlay on select; landing state shown here) */}
          {activeSection === 'messages' && (
            <div>
              <SectionHeader title="My Messages" subtitle="Conversations with disciples" />
              <div className="flex flex-col items-center gap-4 py-12 text-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p className="text-sm text-[var(--fg-3)]">Your conversations are in the message center.</p>
                <button
                  type="button"
                  onClick={() => setMsgCenterOpen(true)}
                  className="cn-btn cn-btn-primary"
                >
                  Open Messages
                </button>
              </div>
            </div>
          )}

          {/* ── My SOAPs ── */}
          {activeSection === 'soaps' && (
            <div>
              <ErrorBoundary name="SharedSoapFeed">
                <SharedSoapFeed personId={profile.id} scope="coach" refreshKey={refreshKey} />
              </ErrorBoundary>
              {!soapsLoaded ? (
                <div className="flex justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--establish)] border-t-transparent" />
                </div>
              ) : (
                <SoapCalendarSection
                  soaps={coachSoaps}
                  onNewEntry={() => { setSoapEntryDate(null); setShowSoapEntry(true) }}
                  soapStreak={soapStreak}
                  onRefresh={loadSoaps}
                  onNewEntryForDate={date => { setSoapEntryDate(date); setShowSoapEntry(true) }}
                />
              )}
              {/* Prayer & praise wall so you can pray over your people while you SOAP */}
              <div className="mt-6">
                <SectionHeader title="Prayer &amp; Praise Wall" subtitle="People and praises to lift up as you pray" />
                <ErrorBoundary name="PrayerWallSection">
                  <PrayerWallSection
                    refreshKey={refreshKey}
                    onPersonClick={p => openPerson(p, 'prayer')}
                  />
                </ErrorBoundary>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ── Add Person modal ── */}
      {showAddPerson && (
        <div className="cn-card fixed inset-x-3 top-3 z-50 max-h-[85vh] overflow-y-auto p-4 sm:inset-auto sm:right-8 sm:top-4 sm:w-[min(92vw,420px)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="cn-h3">Add new person</h2>
            <button type="button" onClick={() => { setShowAddPerson(false); setNewPersonName('') }} className="cn-chip">Close</button>
          </div>
          <AddPersonForm initialName={newPersonName} onPersonAdded={() => { setRefreshKey(p => p + 1); setShowAddPerson(false); setNewPersonName('') }} />
        </div>
      )}

      {/* ── Person Profile modal ── */}
      {selectedPerson && (
        <PersonProfileModal
          person={selectedPerson}
          initialTab={initialProfileTab}
          onClose={() => { setSelectedPerson(null); setInitialProfileTab('profile') }}
          onSaved={() => setRefreshKey(p => p + 1)}
          onDeleted={() => { setSelectedPerson(null); setInitialProfileTab('profile'); setRefreshKey(p => p + 1) }}
          onPersonCreated={() => setRefreshKey(p => p + 1)}
          onOpenEngagement={(engagement, personName) => setDetailEngagement({ engagement, personName })}
        />
      )}

      {/* ── Engagement detail (action / prayer / praise points) ── */}
      {detailEngagement && (
        <EngagementDetailModal
          engagement={detailEngagement.engagement}
          personName={detailEngagement.personName}
          onClose={() => setDetailEngagement(null)}
          onChanged={() => setRefreshKey(p => p + 1)}
        />
      )}

      {/* ── Message Center ── */}
      {profile && (
        <MessageCenter
          myPersonId={profile.id}
          myName={profile.name}
          isOpen={msgCenterOpen}
          onClose={() => { setMsgCenterOpen(false); if (activeSection === 'messages') setActiveSection('journey') }}
          initialTargetPersonId={msgCenterTarget}
          onConsumedTarget={() => setMsgCenterTarget(null)}
        />
      )}

      {/* ── SOAP entry modal ── */}
      {showSoapEntry && profile && (
        <SoapEntryModal
          personId={profile.id}
          initialDate={soapEntryDate ?? undefined}
          onClose={() => { setShowSoapEntry(false); setSoapEntryDate(null) }}
          onSaved={() => { setSoapsLoaded(false); loadSoaps() }}
        />
      )}

      {/* ── SOAP viewer ── */}
      {selectedSoap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>{selectedSoap.journal_date}</h2>
              <button type="button" onClick={() => setSelectedSoap(null)} className="text-[var(--fg-3)]">✕</button>
            </div>
            {selectedSoap.scripture_reference && <p className="mb-2 text-sm font-medium text-[var(--establish)]">{selectedSoap.scripture_reference}</p>}
            {selectedSoap.photo_url && <img src={selectedSoap.photo_url} alt="Journal" className="mb-3 w-full rounded-lg" />}
            {selectedSoap.ocr_text && (
              <div className="rounded-lg bg-[var(--indigo-2)] p-3">
                <p className="whitespace-pre-wrap text-sm text-[var(--fg-2)]">{selectedSoap.ocr_text}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
