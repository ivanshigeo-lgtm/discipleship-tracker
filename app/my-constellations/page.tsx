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
import GroupJoinRequests from '../../components/GroupJoinRequests'
import NewDiscipleRequests from '../../components/NewDiscipleRequests'
import MeetingInvites from '../../components/MeetingInvites'
import MessagesInbox from '../../components/MessagesInbox'
import NewMeetingModal from '../../components/NewMeetingModal'
import SharedSoapFeed from '../../components/SharedSoapFeed'
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
import { getSoapJournals, getAllDiscipleshipConnections, getPeople, getLevelSignoffs, getAllEngagements, getAllActionItems, getVictoryGroups, getPrayerLifeForPerson, getMyConversations, getConfirmedEngagementIds, getPendingLevelSignoffs } from '../../lib/supabaseQueries'
import type { Person, SoapJournal, Stage, DiscipleshipConnection, Engagement } from '../../types/database'
import EngagementDetailModal from '../../components/EngagementDetailModal'
import { DashboardSkeleton } from '../../components/Skeleton'
import MobileConstellation from '../../components/mobile/MobileConstellation'
import PossibleDuplicatesPanel from '../../components/PossibleDuplicatesPanel'

// True at phone widths — drives the mobile "Our Journey" redesign overlay.
// Matches Tailwind's `sm` breakpoint (640px) used throughout this page.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', h)
  }, [])
  return isMobile
}

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
      { id: 'messages', label: 'My Messages',  dot: '#7EB3FF' },
    ],
  },
  {
    heading: 'My Disciplines',
    items: [
      { id: 'prayer',   label: 'My Prayer Wall', dot: '#9B80FF' },
      { id: 'soaps',    label: 'My SOAPs',       dot: '#36D6C3' },
    ],
  },
]

// ─── Coach invite helpers ──────────────────────────────────────────────────────
// A coach's shareable code = last 6 chars of their people.id, uppercased — the
// single reconciliation point disciples use to connect. The invite link bakes
// the code into /sign-up?code=… so an invited disciple auto-connects on finish.
const INVITE_ORIGIN = 'https://wikichurch.app'
const inviteUrl = (code: string) => `${INVITE_ORIGIN}/sign-up?code=${code}`
const inviteMessage = (code: string) =>
  `Join me on WikiChurch! Tap to set up your account — we'll be connected automatically:\n\n${inviteUrl(code)}`

async function shareInvite(code: string) {
  const text = inviteMessage(code)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ text }) } catch { /* user cancelled the share sheet */ }
    return
  }
  try { await navigator.clipboard.writeText(text) } catch { /* clipboard unavailable */ }
  alert('Invite copied — paste it into a text or email to your disciple.')
}

// Prominent labeled coach-code card for the top of "Our Journey". Tap the code
// to copy it; "Invite a disciple" shares a ready-made sign-up link with the code
// baked in.
function CoachCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(code) } catch { return }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="cn-card mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--fg-3)]">Your coach code</p>
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={copy}
            title="Copy code"
            className="font-mono text-2xl font-semibold tracking-[.2em] text-[var(--fg-1)] transition-colors hover:text-[var(--gbm-cobalt-bright)]"
          >
            {code}
          </button>
          <span className="text-xs text-[var(--fg-3)]">{copied ? 'Copied ✓' : 'tap to copy'}</span>
        </div>
        <p className="mt-1 text-xs text-[var(--fg-2)]">Disciples enter this to connect with you.</p>
      </div>
      <button
        type="button"
        onClick={() => shareInvite(code)}
        className="shrink-0 rounded-lg border border-[rgba(91,141,247,.4)] px-4 py-2 text-sm font-medium text-[var(--gbm-cobalt-bright)] transition-colors hover:bg-[rgba(91,141,247,.1)]"
      >
        ✦ Invite a disciple
      </button>
    </div>
  )
}

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
  badges = {},
  pendingSignoffs = 0,
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
  badges?: Record<string, { text: string; title: string }>
  pendingSignoffs?: number
}) {
  // close on Escape
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  // Instant hover tooltip (rendered outside the transformed drawer).
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)

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
                    {/* A pending sign-off flashes on My Messages so it can't be missed. */}
                    {item.id === 'messages' && pendingSignoffs > 0 && (
                      <span
                        title={`${pendingSignoffs} sign-off ${pendingSignoffs === 1 ? 'request' : 'requests'} waiting`}
                        className="jy-signoff-pulse mr-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'var(--gold, #F2C879)', color: 'var(--void)' }}
                      >
                        ✦ {pendingSignoffs} sign-off
                      </span>
                    )}
                    {badges[item.id] && (
                      <span
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect()
                          setTip({ text: badges[item.id].title, x: r.right + 10, y: r.top + r.height / 2 })
                        }}
                        onMouseLeave={() => setTip(null)}
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                        style={{ background: `${item.dot ?? '#5B8DF7'}22`, color: item.dot ?? '#5B8DF7', border: `1px solid ${item.dot ?? '#5B8DF7'}55` }}
                      >
                        {badges[item.id].text}
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
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-[var(--fg-1)]">{profileName}</p>
              <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--fg-3)]">Coach code</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(coachCode)
                  alert(`Coach code: ${coachCode}\n\nCopied!`)
                }}
                className="font-mono text-xs font-semibold tracking-[.15em] text-[var(--fg-2)] hover:text-[var(--fg-1)]"
              >
                {coachCode} 📋
              </button>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="shrink-0 rounded-lg border border-[var(--line-2)] px-2 py-1 text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-1)]"
            >
              Sign out
            </button>
          </div>
          <button
            type="button"
            onClick={() => shareInvite(coachCode)}
            className="w-full rounded-lg border border-[rgba(91,141,247,.4)] py-1.5 text-xs font-medium text-[var(--gbm-cobalt-bright)] transition-colors hover:bg-[rgba(91,141,247,.1)]"
          >
            ✦ Invite a disciple
          </button>
          <button
            type="button"
            onClick={onAddPerson}
            className="w-full rounded-lg border border-[var(--line-2)] py-1.5 text-xs font-medium text-[var(--fg-2)] transition-colors hover:bg-[var(--indigo-2)]"
          >
            + Add person
          </button>
        </div>
      </aside>

      {tip && (
        <div
          className="pointer-events-none fixed z-[120] -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fg-1)] shadow-xl"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>
      )}
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
  const [circleScope, setCircleScope] = useState<'gbc' | 'mine' | 'direct'>('gbc')
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
  const [showNewMeeting, setShowNewMeeting] = useState(false)
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
  const isMobile = useIsMobile()

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
    // A ?section= deep-link (e.g. from the My Journey menu) wins over the saved
    // section, so an empowered person lands exactly where they tapped.
    const requested = new URLSearchParams(window.location.search).get('section')
    if (requested && NAV.some(g => g.items.some(i => i.id === requested))) {
      setActiveSection(requested as SectionId)
      setSectionRestored(true)
      return
    }
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

  // Remember the journey scope (GBC / My Constellation / My People) per device.
  const [scopeRestored, setScopeRestored] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('cn-circle-scope-v1')
    if (saved === 'gbc' || saved === 'mine' || saved === 'direct') setCircleScope(saved)
    setScopeRestored(true)
  }, [])
  useEffect(() => {
    if (scopeRestored) localStorage.setItem('cn-circle-scope-v1', circleScope)
  }, [circleScope, scopeRestored])

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

  // "My People" = ONLY the people I directly coach — no transitive tree. A
  // coach whose disciple is themselves a coach of many (e.g. Eddie coaching
  // Jonavan) can use this to cut the view down to just their own disciples.
  const myPeopleIds = useMemo(() => {
    if (!profile?.id) return undefined
    return new Set<string>(
      connections
        .filter(c => c.discipler_person_id === profile.id && c.disciple_person_id)
        .map(c => c.disciple_person_id as string)
    )
  }, [connections, profile?.id])

  // Admins AND empowered coaches (approved Empower sign-off) may view the whole
  // church (GBC) — mirrors the native coach dashboard. Everyone else is locked
  // to their own circle so a coach never sees another coach's people/meetings —
  // but anyone may narrow further to just their direct people.
  const isAdmin = Boolean(profile?.is_admin)
  const canSeeAllChurch = empowerApproved === true
  const effectiveScope: 'gbc' | 'mine' | 'direct' =
    canSeeAllChurch ? circleScope : circleScope === 'direct' ? 'direct' : 'mine'
  const allowedPersonIds = effectiveScope === 'direct' && myPeopleIds
    ? Array.from(myPeopleIds)
    : effectiveScope === 'mine' && myCircleIds
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

  // Longest + current SOAP runs, timezone-correct (compare local date strings,
  // never parse the stored date as UTC).
  const { soapStreak, currentStreak } = useMemo(() => {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const logged = new Set(coachSoaps.map(j => j.journal_date.slice(0, 10)))
    const days = Array.from(logged).sort()
    let best = 0, run = 0, prev: string | null = null
    for (const day of days) {
      if (prev) {
        const n = new Date(prev + 'T00:00:00'); n.setDate(n.getDate() + 1)
        run = fmt(n) === day ? run + 1 : 1
      } else run = 1
      if (run > best) best = run
      prev = day
    }
    const c = new Date(); c.setHours(0, 0, 0, 0)
    if (!logged.has(fmt(c))) c.setDate(c.getDate() - 1)
    let cur = 0
    while (logged.has(fmt(c))) { cur++; c.setDate(c.getDate() - 1) }
    return { soapStreak: best, currentStreak: cur }
  }, [coachSoaps])

  useEffect(() => {
    if (!soapsLoaded) loadSoaps()
  }, [soapsLoaded, loadSoaps])

  // Count badges for the sidebar — same data each page shows inside.
  const [sidebarBadges, setSidebarBadges] = useState<Record<string, { text: string; title: string }>>({})
  const [pendingSignoffs, setPendingSignoffs] = useState(0)
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    ;(async () => {
      // Coach-scoped (matches the sign-off inbox inside the Message Center).
      const soRes = await getPendingLevelSignoffs(profile.id)
      if (!cancelled) setPendingSignoffs((soRes.data as unknown[] | null)?.length ?? 0)
    })()
    ;(async () => {
      // The sidebar badges always reflect "Mine" — your own work — never the
      // church-wide GBC view, even for admins. (getPrayerLifeForPerson with
      // isAdmin=false stays scoped to your people + your groups + constellation.)
      const [engRes, aiRes, prayerRes, groupsRes, convRes, confirmedRes] = await Promise.all([
        getAllEngagements(),
        getAllActionItems(),
        getPrayerLifeForPerson(profile.id, false),
        getVictoryGroups(),
        getMyConversations(profile.id),
        getConfirmedEngagementIds(profile.id),
      ])
      if (cancelled) return
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const in7 = new Date(today); in7.setDate(today.getDate() + 7)
      const iso = (d: Date) => d.toISOString().split('T')[0]
      const next7Str = iso(in7)
      // "Mine" = meetings you created or have confirmed being part of.
      const confirmed = new Set((confirmedRes.data as string[]) ?? [])
      const involved = (e: { id: string; created_by_person_id: string | null }) =>
        e.created_by_person_id === profile.id || confirmed.has(e.id)
      const engs = (engRes.data as { id: string; status: string; follow_up_date: string | null; created_by_person_id: string | null; person_id: string }[]) ?? []
      const eng7 = engs.filter(e => e.status === 'Pending' && e.follow_up_date && e.follow_up_date <= next7Str && involved(e)).length
      const engById = new Map(engs.map(e => [e.id, e]))
      const openPoints = ((aiRes.data as { engagement_id: string; completed: boolean }[]) ?? [])
        .filter(it => { const e = engById.get(it.engagement_id); return !it.completed && e && involved(e) }).length
      const prayers = (prayerRes.data as { status: string }[]) ?? []
      // "Mine" = the groups you own (not all GBC groups, even for admins).
      const groups = ((groupsRes.data as { owner_person_id: string | null }[]) ?? []).filter(g => g.owner_person_id === profile.id).length
      const unread = ((convRes.data as { unreadCount?: number }[]) ?? []).reduce((s, c) => s + (c.unreadCount ?? 0), 0)
      setSidebarBadges({
        engagements: { text: `${eng7}`, title: 'Meetings in the next 7 days' },
        points: { text: `${openPoints}`, title: 'Open action points' },
        groups: { text: `${groups}`, title: 'Your Grace Groups' },
        prayer: { text: `${prayers.length}/${prayers.filter(p => p.status === 'Answered').length}`, title: 'Prayers / answered' },
        messages: { text: `${unread}`, title: 'Unread messages' },
        soaps: { text: `${currentStreak}/${soapStreak}`, title: 'Current / longest streak (days)' },
      })
    })()
    return () => { cancelled = true }
  }, [profile, isAdmin, refreshKey, currentStreak, soapStreak])

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
        badges={sidebarBadges}
        pendingSignoffs={pendingSignoffs}
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

          {/* ── Our Journey (default) — desktop; mobile uses MobileConstellation overlay ── */}
          {activeSection === 'journey' && !isMobile && (
            <div>
              <CoachCodeCard code={profile.id.slice(-6).toUpperCase()} />
              {/* Church-wide duplicate scan — admins and approved-Empower coaches only */}
              {canSeeAllChurch && (
                <ErrorBoundary name="PossibleDuplicatesPanel">
                  <PossibleDuplicatesPanel refreshKey={refreshKey} onMerged={() => setRefreshKey(p => p + 1)} />
                </ErrorBoundary>
              )}
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
                    {/* Scope: whole church (admins + empowered coaches) vs full coaching tree vs direct people */}
                    <div className="flex rounded-full border border-[var(--line-2)] bg-[var(--indigo)] p-1">
                      {(
                        (canSeeAllChurch
                          ? [['gbc', 'GBC'], ['mine', 'My Constellation'], ['direct', 'My People']]
                          : [['mine', 'My Constellation'], ['direct', 'My People']]) as ['gbc' | 'mine' | 'direct', string][]
                      ).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setCircleScope(val)}
                          className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold transition-all sm:px-3 sm:text-xs ${effectiveScope === val ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'text-[var(--fg-2)] hover:text-[var(--fg-1)]'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
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
                      {/* Searched someone who isn't here yet → offer to add them, name carried over */}
                      {searchFocused && journeySearch.trim() !== '' && searchMatches.length === 0 && (
                        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] shadow-lg">
                          <button
                            type="button"
                            onMouseDown={() => {
                              setNewPersonName(journeySearch.trim())
                              setShowAddPerson(true)
                              setJourneySearch('')
                              setSearchFocused(false)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--fg-1)] transition-colors hover:bg-[var(--indigo-2)]"
                          >
                            <span className="shrink-0 font-semibold text-[var(--gbm-cobalt-bright)]">+</span>
                            <span className="truncate">Add &ldquo;{journeySearch.trim()}&rdquo; as a new person</span>
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Add person — carries whatever was just searched into the form */}
                    <button
                      type="button"
                      onClick={() => {
                        setNewPersonName(journeySearch.trim())
                        setShowAddPerson(true)
                        setJourneySearch('')
                      }}
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
                        viewerPersonId={profile.id}
                        isAdmin={isAdmin}
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
                    {/* Searched someone who isn't here yet → offer to add them, name carried over */}
                    {engSearchFocused && engSearch.trim() !== '' && engMatches.length === 0 && (
                      <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] shadow-lg">
                        <button
                          type="button"
                          onMouseDown={() => {
                            setNewPersonName(engSearch.trim())
                            setShowAddPerson(true)
                            setEngSearch('')
                            setEngSearchFocused(false)
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--fg-1)] transition-colors hover:bg-[var(--indigo-2)]"
                        >
                          <span className="shrink-0 font-semibold text-[var(--gbm-cobalt-bright)]">+</span>
                          <span className="truncate">Add &ldquo;{engSearch.trim()}&rdquo; as a new person</span>
                        </button>
                      </div>
                    )}
                  </div>
                  {/* New meeting — pick everyone from scratch */}
                  <button
                    type="button"
                    onClick={() => setShowNewMeeting(true)}
                    className="h-8 rounded-full border border-[var(--line-2)] px-3 text-xs font-semibold text-[var(--fg-1)] hover:border-[var(--gbm-cobalt-bright)]"
                  >
                    + New meeting
                  </button>
                  {/* Add a new person — carries whatever was just searched into the form */}
                  <button
                    type="button"
                    onClick={() => {
                      setNewPersonName(engSearch.trim())
                      setShowAddPerson(true)
                      setEngSearch('')
                    }}
                    className="h-8 rounded-full bg-[var(--gbm-cobalt-bright)] px-3 text-xs font-semibold text-white hover:opacity-90"
                  >
                    + Add Person
                  </button>
                </div>
              </div>
              <ErrorBoundary name="NewDiscipleRequests">
                <NewDiscipleRequests
                  coachPersonId={profile.id}
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
              <ErrorBoundary name="MeetingInvites">
                <MeetingInvites
                  personId={profile.id}
                  refreshKey={refreshKey}
                  onChanged={() => setRefreshKey(p => p + 1)}
                />
              </ErrorBoundary>
              <ErrorBoundary name="MessagesInbox">
                <MessagesInbox
                  personId={profile.id}
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
              <SectionHeader title="Prayer Wall" subtitle="Private to you — only prayers you've written" />
              <ErrorBoundary name="PrayerWallSection">
                <PrayerWallSection
                  refreshKey={refreshKey}
                  viewerPersonId={profile.id}
                  isAdmin={isAdmin}
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
                  currentStreak={currentStreak}
                  onRefresh={loadSoaps}
                  onNewEntryForDate={date => { setSoapEntryDate(date); setShowSoapEntry(true) }}
                  personId={profile.id}
                />
              )}
              {/* Prayer & praise wall so you can pray over your people while you SOAP */}
              <div className="mt-6">
                <SectionHeader title="Prayer &amp; Praise Wall" subtitle="Private to you — only prayers you've written" />
                <ErrorBoundary name="PrayerWallSection">
                  <PrayerWallSection
                    refreshKey={refreshKey}
                    viewerPersonId={profile.id}
                    isAdmin={isAdmin}
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

      {/* ── Mobile "Our Journey" redesign (phone widths only) ── */}
      {isMobile && activeSection === 'journey' && (
        <MobileConstellation
          allowedPersonIds={allowedPersonIds}
          effectiveScope={effectiveScope}
          isAdmin={isAdmin}
          viewerPersonId={profile.id}
          onScopeChange={setCircleScope}
          refreshKey={refreshKey}
          onChanged={() => setRefreshKey(p => p + 1)}
          onAddPerson={() => { setNewPersonName(''); setShowAddPerson(true) }}
          onOpenFullProfile={(person, tab) => openPerson(person, tab)}
          onTab={t => {
            // Pass 2: People + Groups are now real in-overlay mobile screens
            // (handled inside MobileConstellation without leaving activeSection
            // 'journey', so the overlay stays mounted). Only Me routes out, to
            // the coach's own mobile journey page.
            if (t === 'me') window.location.href = '/my-journey'
          }}
        />
      )}

      {/* ── New meeting modal ── */}
      {showNewMeeting && (
        <NewMeetingModal
          onClose={() => setShowNewMeeting(false)}
          onCreated={() => setRefreshKey(p => p + 1)}
        />
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
          canBroadcast={empowerApproved === true}
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
