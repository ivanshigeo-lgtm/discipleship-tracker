'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import LoginPage from '../../components/LoginPage'
import {
  getMyCoach,
  getMyGroups,
  getGroupsOwnedByPerson,
  getSoapJournalsLite,
  getSoapJournalTexts,
  getSoapStreak,
  getStageChecklistItems,
  getSpiritualGiftsResult,
  upsertStageChecklistItem,
  getDiscipleshipConnections,
  getMyConversations,
  getLevelSignoffs,
  requestLevelSignoff,
  sendMessage,
} from '../../lib/supabaseQueries'
import { supabase } from '../../lib/supabaseClient'
import type { SoapJournal, StageChecklistItem, Person, VictoryGroup, DiscipleshipConnection, LevelSignoff, Stage, SpiritualGiftsResult } from '../../types/database'
import { computeJourney, computeBadges, ringProgressFromLevels, levelByStage, STEP_CHECKLIST, JOURNEY_ORDER, type JourneyStep } from '../../components/journey/journeyModel'
import { Starfield } from '../../components/journey/StarPrimitives'
import JourneyIntro from '../../components/journey/JourneyIntro'
import JourneyTour from '../../components/journey/JourneyTour'
import StarQuadrants from '../../components/journey/StarQuadrants'
import BadgeCelebration from '../../components/journey/BadgeCelebration'
import Milestones from '../../components/journey/Milestones'
import SoapEntryModal from '../../components/journey/SoapEntryModal'
import PrayerEntryModal from '../../components/journey/PrayerEntryModal'
import TestimonyModal from '../../components/journey/TestimonyModal'
import SpiritualGiftsModal from '../../components/journey/SpiritualGiftsModal'
import ConstellationRail, { useConstellationFeed } from '../../components/journey/ConstellationRail'
import StoryMusic from '../../components/journey/StoryMusic'
import MessageCoachModal from '../../components/journey/MessageCoachModal'
import MessageCenter from '../../components/MessageCenter'
import JoinGroupModal from '../../components/journey/JoinGroupModal'
import SelfConfirmModal, { type SelfConfirmKind } from '../../components/journey/SelfConfirmModal'
import JourneyMenu, { EngagementsPanel } from '../../components/journey/JourneyMenu'
import EmpoweredCoachmark from '../../components/journey/EmpoweredCoachmark'
import SoapCalendarSection from '../../components/SoapCalendarSection'
import SignoffNotice from '../../components/journey/SignoffNotice'
import JourneyTabs, { type JourneyTab } from '../../components/journey/JourneyTabs'
import StageDock from '../../components/journey/StageDock'
import PrayerLifeSection from '../../components/journey/PrayerLifeSection'
import SoapFeedSection from '../../components/journey/SoapFeedSection'

const INTRO_KEY = 'journey_intro_seen'
const DEMO_KEY = 'journey_quadrant_demo_seen'

// Last-known journey data, cached per person so a returning visitor's star
// paints instantly while the network refresh happens behind it. The dashboard
// snapshot and the (bigger) slim SOAP list live under separate keys so either
// can fail/expire alone. Bump the version to invalidate old shapes.
const snapshotKey = (pid: string) => `journey-snapshot-v1-${pid}`
const soapCacheKey = (pid: string) => `journey-soaps-v1-${pid}`
type DemoPhase = 'meteor' | 'arrow' | 'open' | null

function CoachConnectModal({
  personId,
  onClose,
  onConnected,
}: {
  personId: string
  onClose: () => void
  onConnected: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const connect = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/connect-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), discipleId: personId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to connect')
      } else {
        onConnected()
        onClose()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6" style={{ boxShadow: 'var(--elev-2)' }}>
        <div className="cn-label" style={{ color: 'var(--establish)' }}>Establish · get connected</div>
        <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
          Connect with your coach
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">
          Ask your coach for their six-character code. Your stars will be joined in the constellation.
        </p>
        <input
          type="text"
          value={code}
          onChange={e => {
            setCode(e.target.value.toUpperCase())
            setError('')
          }}
          placeholder="ABC123"
          maxLength={6}
          className="mt-4 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-3 text-center font-mono text-lg uppercase tracking-[.4em] text-[var(--fg-1)] placeholder:tracking-normal placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
        />
        {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost flex-1">
            Later
          </button>
          <button
            type="button"
            onClick={connect}
            disabled={busy || code.length < 4}
            className="cn-btn cn-btn-primary flex-1 disabled:opacity-50"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MyJourneyPage() {
  const { user, profile, loading, profileLoading, signOut } = useAuth()
  const [coach, setCoach] = useState<Person | null>(null)
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [ownsGroup, setOwnsGroup] = useState(false)
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([])
  const [coachmarkActive, setCoachmarkActive] = useState(false)
  const [navConst, setNavConst] = useState(false)
  const router = useRouter()
  const [soapJournals, setSoapJournals] = useState<SoapJournal[]>([])
  const [soapStreak, setSoapStreak] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [myDisciples, setMyDisciples] = useState<DiscipleshipConnection[]>([])
  const [signoffs, setSignoffs] = useState<LevelSignoff[]>([])
  const [showIntro, setShowIntro] = useState<boolean | null>(null)
  const [showTour, setShowTour] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [demo, setDemo] = useState<DemoPhase>(null)
  const [activeModal, setActiveModal] = useState<'soap' | 'testimony' | 'spiritual-gifts' | 'coach' | 'message' | 'join-group' | 'prayer' | null>(null)
  const [giftsResult, setGiftsResult] = useState<SpiritualGiftsResult | null>(null)
  const [soapEntryDate, setSoapEntryDate] = useState<string | null>(null)
  const [soapEditEntry, setSoapEditEntry] = useState<SoapJournal | null>(null)
  const [msgCenterOpen, setMsgCenterOpen] = useState(false)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [engagementsOpen, setEngagementsOpen] = useState(false)
  const [selfConfirm, setSelfConfirm] = useState<SelfConfirmKind | null>(null)
  const [selectedJournal, setSelectedJournal] = useState<SoapJournal | null>(null)
  const [processingOcr, setProcessingOcr] = useState(false)
  const feedItems = useConstellationFeed()
  // Which of the five destinations is showing (native separates these onto
  // their own screens; on web the rail/bottom-bar switches between them).
  const [tab, setTab] = useState<JourneyTab>('home')
  // Home screen: which stage's checklist is docked below the star (null = none).
  const [dockStage, setDockStage] = useState<Stage | null>(null)

  useEffect(() => {
    setShowIntro(!localStorage.getItem(INTRO_KEY))
  }, [])

  const loadUnreadCount = useCallback(async () => {
    if (!profile?.id) return
    const { data: convs } = await getMyConversations(profile.id)
    if (convs) {
      const total = convs.reduce((sum: number, c: { unreadCount: number }) => sum + c.unreadCount, 0)
      setUnreadMsgCount(total)
    }
  }, [profile?.id])

  useEffect(() => {
    loadUnreadCount()
  }, [loadUnreadCount])

  // Refresh unread count when new messages arrive
  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase
      .channel(`msg-unread-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages' }, () => {
        if (!msgCenterOpen) loadUnreadCount()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, msgCenterOpen, loadUnreadCount])

  // Paint from the last visit's snapshot immediately (no dataReady — badge
  // celebrations only fire on FRESH data), then the network refresh below
  // overwrites everything.
  useEffect(() => {
    if (!profile?.id) return
    try {
      const snap = localStorage.getItem(snapshotKey(profile.id))
      if (snap) {
        const s = JSON.parse(snap)
        if (s.coach) setCoach(s.coach)
        if (s.myDisciples) setMyDisciples(s.myDisciples)
        if (s.groups) setGroups(s.groups)
        if (s.pendingGroupIds) setPendingGroupIds(s.pendingGroupIds)
        setOwnsGroup(Boolean(s.ownsGroup))
        setSoapStreak(s.soapStreak ?? 0)
        setCurrentStreak(s.currentStreak ?? 0)
        if (s.checklistItems) setChecklistItems(s.checklistItems)
        if (s.signoffs) setSignoffs(s.signoffs)
      }
      const soaps = localStorage.getItem(soapCacheKey(profile.id))
      // never clobber real rows if the network somehow won the race
      if (soaps) setSoapJournals(prev => (prev.length ? prev : JSON.parse(soaps)))
    } catch {
      // corrupt/oversized cache is harmless — the network load replaces it
    }
  }, [profile?.id])

  // Light data the STAR needs — kept off the big SOAP history so the star paints
  // fast. Soaps (hundreds of rows) load separately below.
  const loadData = useCallback(async () => {
    if (!profile?.id) return
    const [coachRes, groupsRes, streakRes, checklistRes, disciplesRes, signoffsRes, ownedRes, giftsRes] = await Promise.all([
      getMyCoach(profile.id),
      getMyGroups(profile.id),
      getSoapStreak(profile.id),
      getStageChecklistItems(profile.id),
      getDiscipleshipConnections(profile.id),
      getLevelSignoffs(profile.id),
      getGroupsOwnedByPerson(profile.id),
      getSpiritualGiftsResult(profile.id),
    ])
    setGiftsResult((giftsRes.data as SpiritualGiftsResult | null) ?? null)
    const ownsGroupNext = ((ownedRes.data as unknown[] | null)?.length ?? 0) > 0
    const coachNext = (coachRes.data?.discipler as Person | undefined) ?? null
    const disciplesNext = (disciplesRes.data as DiscipleshipConnection[] | null) ?? null
    const groupRows = groupsRes.data as { victory_groups: VictoryGroup; victory_group_id: string; status?: string }[] | null
    // Only APPROVED memberships count as being "in" the group; pending ones
    // are awaiting the group owner's approval.
    const groupsNext = groupRows ? groupRows.filter(g => g.status !== 'pending').map(g => g.victory_groups).filter(Boolean) : null
    const pendingNext = groupRows ? groupRows.filter(g => g.status === 'pending').map(g => g.victory_group_id) : null
    setOwnsGroup(ownsGroupNext)
    if (coachNext) setCoach(coachNext)
    if (disciplesNext) setMyDisciples(disciplesNext)
    if (groupsNext) setGroups(groupsNext)
    if (pendingNext) setPendingGroupIds(pendingNext)
    if (streakRes.streak !== undefined) setSoapStreak(streakRes.streak)
    if (streakRes.current !== undefined) setCurrentStreak(streakRes.current)
    if (checklistRes.data) setChecklistItems(checklistRes.data as StageChecklistItem[])
    if (signoffsRes.data) setSignoffs(signoffsRes.data as LevelSignoff[])
    setDataReady(true)
    try {
      localStorage.setItem(snapshotKey(profile.id), JSON.stringify({
        coach: coachNext,
        myDisciples: disciplesNext ?? [],
        groups: groupsNext ?? [],
        pendingGroupIds: pendingNext ?? [],
        ownsGroup: ownsGroupNext,
        soapStreak: streakRes.streak ?? 0,
        currentStreak: streakRes.current ?? 0,
        checklistItems: checklistRes.data ?? [],
        signoffs: signoffsRes.data ?? [],
      }))
    } catch { /* quota exceeded — instant paint just won't happen next visit */ }
  }, [profile?.id])

  // The full SOAP history (large) loads on its own so it never blocks the star.
  // Two phases: every row WITHOUT its OCR text first (~half the bytes), then
  // the text merges in behind the scenes so search/excerpts still work.
  const loadSoaps = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await getSoapJournalsLite(profile.id)
    if (!data) return
    setSoapJournals(data as SoapJournal[])
    try {
      // Slim projection for next visit's instant paint — enough for the star
      // (count, dates, streak feel) and the calendar grid, without the photo
      // URL strings that make the full list ~1MB.
      const slim = data.map(j => ({
        id: j.id, person_id: j.person_id, journal_date: j.journal_date,
        scripture_reference: j.scripture_reference, date_precision: j.date_precision,
        source: j.source, date_reviewed: j.date_reviewed, import_seq: j.import_seq,
        created_at: j.created_at,
      }))
      localStorage.setItem(soapCacheKey(profile.id), JSON.stringify(slim))
    } catch { /* quota exceeded — instant paint just won't happen next visit */ }
    const { data: texts } = await getSoapJournalTexts(profile.id)
    if (texts?.length) {
      const byId = new Map(texts.map(t => [t.id, t.ocr_text]))
      setSoapJournals(prev => prev.map(j => (byId.has(j.id) ? { ...j, ocr_text: byId.get(j.id)! } : j)))
    }
  }, [profile?.id])

  useEffect(() => {
    loadData()
    loadSoaps()
  }, [loadData, loadSoaps])

  // Reload SOAP data (+ streak) after an import/edit/rotate.
  const refreshSoaps = useCallback(async () => {
    await Promise.all([loadSoaps(), loadData()])
  }, [loadSoaps, loadData])

  // Re-fetch only checklist items when the coach updates them on their side
  const refreshChecklist = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await getStageChecklistItems(profile.id)
    if (data) setChecklistItems(data as StageChecklistItem[])
  }, [profile?.id])

  useEffect(() => {
    if (!profile?.id) return

    // Live-sync: coach checks something → disciple sees it immediately
    const channel = supabase
      .channel(`journey-checklist-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_checklist_items', filter: `person_id=eq.${profile.id}` },
        () => { refreshChecklist() }
      )
      .subscribe()

    // Fallback: refresh when the disciple switches back to this tab
    const onVisible = () => { if (document.visibilityState === 'visible') refreshChecklist() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [profile?.id, refreshChecklist])

  const journeyData = useMemo(
    () =>
      profile
        ? {
            profile,
            coach,
            groups,
            ownsGroup,
            soapStreak,
            soapCount: soapJournals.length,
            hasSoapToday: soapJournals.some(j => j.journal_date === new Date().toISOString().split('T')[0]),
            checklist: checklistItems,
            disciples: myDisciples,
            signoffs,
            hasGiftsResult: Boolean(giftsResult),
          }
        : null,
    [profile, coach, groups, ownsGroup, soapStreak, soapJournals, checklistItems, myDisciples, signoffs, giftsResult]
  )

  const levels = useMemo(() => (journeyData ? computeJourney(journeyData) : []), [journeyData])
  const badges = useMemo(() => (journeyData ? computeBadges(journeyData, levels) : []), [journeyData, levels])
  const ringProgress = ringProgressFromLevels(levels)
  // full circle = the disciple is engaging someone of their own
  const fullCircle = levelByStage(levels, 'Engage')?.completed ?? false

  const handleStepAction = (step: JourneyStep) => {
    if (step.action === 'soap') setActiveModal('soap')
    else if (step.action === 'testimony') setActiveModal('testimony')
    else if (step.action === 'spiritual-gifts') setActiveModal('spiritual-gifts')
    else if (step.action === 'coach-code') setActiveModal('coach')
    else if (step.action === 'message-coach') setActiveModal('message')
    else if (step.action === 'join-group') setActiveModal('join-group')
    else if (step.action === 'self-confirm') setSelfConfirm(step.id as SelfConfirmKind)
  }

  // Direct check/uncheck for any mapped step (tapping the star's circle).
  // Writes the step's checklist row, which acts as a non-destructive override.
  const handleStepToggle = async (step: JourneyStep) => {
    if (!profile) return
    const target = STEP_CHECKLIST[step.id]
    if (!target) return
    await upsertStageChecklistItem({
      person_id: profile.id,
      stage: target.stage,
      category: target.category,
      label: target.label,
      completed: !step.completed,
    })
    refreshChecklist()
  }

  // Disciple finished a level — ask the coach to sign off so the next unlocks.
  const handleRequestSignoff = async (stage: string) => {
    if (!profile) return
    await requestLevelSignoff(profile.id, stage)
    if (coach) {
      const last = stage === 'Engage'
      await sendMessage(
        profile.id,
        coach.id,
        'note',
        last
          ? `${profile.name} has completed the whole journey through Engage and is asking for your final sign-off. 🎉`
          : `${profile.name} has completed ${stage} and is asking for your sign-off to unlock the next level.`
      )
    }
    setSignoffs(prev => {
      const others = prev.filter(s => s.stage !== stage)
      return [...others, { id: `tmp-${stage}`, person_id: profile.id, stage: stage as LevelSignoff['stage'], status: 'requested', congrats_message: null, requested_at: new Date().toISOString(), approved_at: null, approved_by: null, created_at: new Date().toISOString() }]
    })
    loadData()
  }

  // intro hands off to the tour — same star, focus unbroken
  const dismissIntro = useCallback(() => {
    setShowIntro(false)
    setShowTour(true)
  }, [])

  const dismissTour = useCallback(() => {
    localStorage.setItem(INTRO_KEY, '1')
    setShowTour(false)
    // Land at the top of the homepage, not wherever the page was scrolled
    // before the story played.
    window.scrollTo({ top: 0, behavior: 'auto' })
    // The coachmark is the story's closing beat — a meteor lights the
    // instruction, an arrow presses the quadrant open. Every showing ends
    // with it, so the handoff into the app is always demonstrated.
    window.setTimeout(() => setDemo('meteor'), 900)
  }, [])

  // Visitors who land with the story already seen but who've never been
  // shown the quadrant interaction get the coachmark once on its own.
  useEffect(() => {
    if (showIntro === false && !showTour && dataReady && !localStorage.getItem(DEMO_KEY)) {
      const t = setTimeout(() => setDemo('meteor'), 900)
      return () => clearTimeout(t)
    }
  }, [showIntro, showTour, dataReady])

  useEffect(() => {
    if (!demo) return
    const hold = demo === 'meteor' ? 1700 : demo === 'arrow' ? 1600 : 3600
    const t = setTimeout(() => {
      if (demo === 'meteor') setDemo('arrow')
      else if (demo === 'arrow') setDemo('open')
      else {
        setDemo(null)
        localStorage.setItem(DEMO_KEY, '1')
      }
    }, hold)
    return () => clearTimeout(t)
  }, [demo])

  const runOcrOnJournal = async (journalId: string) => {
    setProcessingOcr(true)
    try {
      const res = await fetch('/api/soap/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalId }),
      })
      const data = await res.json()
      if (data.ocr_text && selectedJournal) {
        setSelectedJournal({ ...selectedJournal, ocr_text: data.ocr_text, scripture_reference: data.scripture_reference })
        await loadData()
      }
    } catch (err) {
      console.error('OCR error:', err)
    }
    setProcessingOcr(false)
  }


  // Keep the spinner while the profile row is still on its way — never flash
  // "no profile linked" at someone whose profile just hasn't arrived yet.
  if (loading || (user && !profile && profileLoading)) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[var(--void)]">
        <Starfield count={40} seed={3} />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (!profile) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--void)] p-4">
        <Starfield count={40} seed={3} />
        <p className="text-[var(--fg-2)]">No profile linked to your account.</p>
        <p className="text-sm text-[var(--fg-3)]">Ask your coach for an invite link.</p>
      </div>
    )
  }

  const currentLevel = levels.find(l => l.unlocked && !l.completed) ?? levels[levels.length - 1]

  // Home dock: the chosen stage's level + its journey-order predecessor (for the
  // "opens when your coach signs off …" note on locked stages).
  const dockLevel = dockStage ? (levels.find(l => l.stage === dockStage) ?? null) : null
  const dockPrev = (() => {
    if (!dockStage) return undefined
    const i = JOURNEY_ORDER.indexOf(dockStage)
    return i > 0 ? levels.find(l => l.stage === JOURNEY_ORDER[i - 1]) : undefined
  })()

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[var(--void)]">
      {/* cosmic backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% 0%, rgba(46,85,230,.14) 0%, rgba(6,8,20,0) 55%), radial-gradient(70% 50% at 80% 90%, rgba(240,114,159,.06) 0%, rgba(6,8,20,0) 60%)',
        }}
      />
      <div className="pointer-events-none fixed inset-0">
        <Starfield count={70} seed={21} />
      </div>

      <StoryMusic active={Boolean(showIntro || showTour)} />
      {showIntro && <JourneyIntro personId={profile.id} name={profile.name} onDone={dismissIntro} />}
      {showTour && (
        <JourneyTour realProgress={ringProgress} realColor={currentLevel?.color ?? '#FBF6EC'} onDone={dismissTour} />
      )}
      {showIntro === false && !showTour && <BadgeCelebration badges={badges} ready={dataReady} />}

      <ConstellationRail items={feedItems} />

      {/* the five destinations — left rail on desktop, bottom bar on phones */}
      <JourneyTabs
        active={tab}
        onChange={t => { setTab(t); window.scrollTo({ top: 0, behavior: 'auto' }) }}
        onMessage={() => { setMsgCenterOpen(true); setUnreadMsgCount(0) }}
        onEngagements={() => {
          // Empowered people are coaches too — send them to the real
          // My Constellations page (mirrors JourneyMenu's handleItem).
          if (Boolean(profile.is_admin) || signoffs.some(s => s.stage === 'Empower' && s.status === 'approved')) {
            router.push('/my-constellations?section=engagements')
          } else {
            setEngagementsOpen(true)
          }
        }}
      />

      {/* everything to the right of the desktop rail */}
      <div className="md:pl-52">
      {/* header */}
      <header className="relative z-10 mx-auto max-w-5xl px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <img
            src="/gbm-horizontal-lockup-white.png"
            alt="Grace Bible Maui"
            className="hidden w-auto shrink-0 sm:block sm:h-24"
          />
          <div className="hidden h-12 w-px bg-[var(--line-2)] sm:block" />
          <div className="relative flex min-w-0 flex-1 flex-col items-center gap-2">
            <h1
              className="whitespace-nowrap text-2xl font-semibold sm:text-4xl"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
            >
              My Journey
            </h1>
            {(profile.is_admin || signoffs.some(s => s.stage === 'Empower' && s.status === 'approved')) && (
              <div className="flex rounded-full border border-[var(--line-2)] bg-[rgba(9,12,26,.6)] p-0.5 text-xs font-semibold">
                <span className="rounded-full px-3 py-1" style={{ background: 'var(--gbm-cobalt-bright)', color: '#fff' }}>
                  My Journey
                </span>
                <button
                  type="button"
                  id="my-constellations-toggle"
                  disabled={navConst}
                  onClick={() => { setNavConst(true); router.push('/my-constellations') }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors hover:text-[var(--fg-1)] ${navConst ? 'text-[var(--fg-1)]' : coachmarkActive ? 'jy-toggle-glow text-[var(--fg-1)]' : 'text-[var(--fg-3)]'}`}
                  style={navConst ? { background: 'var(--gbm-cobalt-bright)', color: '#fff' } : undefined}
                >
                  {navConst && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  {navConst ? 'Opening…' : 'My Constellations'}
                </button>
              </div>
            )}
            <EmpoweredCoachmark
              personId={profile.id}
              enabled={Boolean(profile.is_admin) || signoffs.some(s => s.stage === 'Empower' && s.status === 'approved')}
              onActiveChange={setCoachmarkActive}
            />
          </div>
          <div className="hidden h-12 w-px bg-[var(--line-2)] sm:block" />
          <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="hidden truncate text-sm font-medium text-[var(--fg-2)] sm:block sm:max-w-none sm:text-base">
              {profile.name}
            </span>
            <button
              type="button"
              disabled={signingOut}
              onClick={async () => {
                if (signingOut) return
                setSigningOut(true)
                await signOut()
                window.location.href = '/'
              }}
              className="cn-chip !text-xs disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-28 sm:px-6 md:pb-16">
        {/* Coach: disciples waiting on a sign-off (banner + browser alerts) */}
        <SignoffNotice coachId={profile.id} />

        {/* ── Home: the star + its docked steps ── */}
        {tab === 'home' && (
          <div className="mx-auto max-w-xl">
            {/* hero — your star IS the interface */}
            <section className="flex flex-col items-center pt-2 text-center">
              <div className="relative">
                <p className={`text-xs uppercase tracking-[.14em] text-[var(--fg-3)] ${demo === 'meteor' ? 'jy-hint-glow' : ''}`}>
                  Tap a point of your star to see its steps
                </p>
                {demo === 'meteor' && <span className="jy-meteor" aria-hidden />}
              </div>
              <div className="relative z-20 mt-2 w-full">
                <StarQuadrants
                  docked
                  onQuadrant={setDockStage}
                  onStepToggle={handleStepToggle}
                  onRequestSignoff={handleRequestSignoff}
                  levels={levels}
                  color={currentLevel?.color ?? '#FBF6EC'}
                  onStepAction={handleStepAction}
                  demo={demo === 'arrow' || demo === 'open' ? demo : null}
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <h1 className="text-3xl sm:text-4xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
                  {profile.name}
                </h1>
              </div>
              <p className="mt-1 text-sm text-[var(--fg-3)]">
                {fullCircle ? (
                  <span style={{ color: 'var(--empower)' }}>You&rsquo;ve come full circle — light that gives light.</span>
                ) : (
                  <>
                    Walking through <span style={{ color: currentLevel.color }}>{currentLevel.stage}</span>
                    {coach ? <> with {coach.name}</> : null}
                  </>
                )}
              </p>

              {/* the steps dock here — the space the two blue CTAs used to hold */}
              <div className="w-full">
                <StageDock
                  level={dockLevel}
                  prev={dockPrev}
                  onStepAction={handleStepAction}
                  onStepToggle={handleStepToggle}
                  onRequestSignoff={handleRequestSignoff}
                  onClose={() => setDockStage(null)}
                />
              </div>
            </section>

            {/* Completed Empower but the coach hasn't signed off yet → no toggle to
                point at, so keep an informative note. (Once signed off, the toggle
                appears and the one-time EmpoweredCoachmark points to it instead.) */}
            {(levelByStage(levels, 'Empower')?.completed ?? false) &&
              !(profile.is_admin || signoffs.some(s => s.stage === 'Empower' && s.status === 'approved')) && (
              <section
                className="mt-8 rounded-[var(--r-xl)] border p-6 text-center"
                style={{
                  borderColor: 'rgba(240,114,159,.35)',
                  background: 'linear-gradient(180deg, rgba(240,114,159,.10) 0%, rgba(20,27,61,.6) 100%)',
                  boxShadow: '0 0 48px -16px rgba(240,114,159,.5)',
                }}
              >
                <p className="cn-label" style={{ color: 'var(--empower)' }}>Empowered</p>
                <p className="mt-2 text-xl italic leading-relaxed" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
                  You’ve completed Empower. Once your coach signs off, your coach dashboard opens.
                </p>
                <p className="mt-4 text-xs text-[var(--fg-3)]">Awaiting your coach&rsquo;s Empower sign-off.</p>
              </section>
            )}

            {/* footer */}
            <footer className="mt-14 flex flex-col items-center gap-2 text-center">
              <p className="max-w-sm text-xs italic leading-relaxed text-[var(--fg-3)]" style={{ fontFamily: 'var(--font-display)', fontSize: 14 }}>
                &ldquo;He determines the number of the stars and calls them each by name.&rdquo; — Psalm 147:4
              </p>
              <button
                type="button"
                onClick={() => setShowIntro(true)}
                className="text-[11px] text-[var(--fg-3)] underline-offset-2 hover:underline"
              >
                Replay the story
              </button>
            </footer>
          </div>
        )}

        {/* ── SOAPs ── */}
        {tab === 'soaps' && (
          <section className="pt-2">
            <SoapCalendarSection
              soaps={soapJournals}
              onNewEntry={() => { setSoapEntryDate(null); setActiveModal('soap') }}
              soapStreak={soapStreak}
              currentStreak={currentStreak}
              onRefresh={refreshSoaps}
              onNewEntryForDate={date => { setSoapEntryDate(date); setActiveModal('soap') }}
              onEditEntry={entry => { setSoapEditEntry(entry); setActiveModal('soap') }}
              personId={profile.id}
            />
          </section>
        )}

        {/* ── Prayer Wall ── */}
        {tab === 'prayer' && (
          <section className="pt-2">
            <h2 className="mb-4 text-center text-2xl sm:text-3xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>Prayer &amp; Praise</h2>
            <PrayerLifeSection personId={profile.id} isAdmin={Boolean(profile.is_admin)} />
          </section>
        )}

        {/* ── Feed (shared SOAPs) ── */}
        {tab === 'feed' && (
          <section className="pt-2">
            <h2 className="mb-4 text-center text-2xl sm:text-3xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>Feed</h2>
            <SoapFeedSection personId={profile.id} />
          </section>
        )}

        {/* ── Milestones ── */}
        {tab === 'milestones' && (
          <section className="pt-2">
            <h2 className="mb-4 text-center text-2xl sm:text-3xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>Milestones</h2>
            <Milestones badges={badges} />
          </section>
        )}
      </main>
      </div>

      {/* modals */}
      {activeModal === 'prayer' && profile && (
        <PrayerEntryModal
          personId={profile.id}
          onClose={() => setActiveModal(null)}
          onSaved={loadData}
        />
      )}
      {activeModal === 'soap' && profile && (
        <SoapEntryModal
          personId={profile.id}
          initialDate={soapEntryDate ?? undefined}
          editEntry={soapEditEntry ?? undefined}
          onClose={() => { setActiveModal(null); setSoapEntryDate(null); setSoapEditEntry(null) }}
          onSaved={loadData}
        />
      )}
      {activeModal === 'testimony' && profile && (
        <TestimonyModal profile={profile} onClose={() => setActiveModal(null)} onSaved={loadData} />
      )}
      {activeModal === 'spiritual-gifts' && profile && (
        <SpiritualGiftsModal
          profile={profile}
          existingResult={giftsResult}
          onClose={() => setActiveModal(null)}
          onSaved={loadData}
        />
      )}
      {activeModal === 'coach' && profile && (
        <CoachConnectModal personId={profile.id} onClose={() => setActiveModal(null)} onConnected={loadData} />
      )}
      {activeModal === 'message' && profile && coach && (
        <MessageCoachModal personId={profile.id} coach={coach} onClose={() => setActiveModal(null)} />
      )}
      {selfConfirm && profile && (
        <SelfConfirmModal
          kind={selfConfirm}
          personId={profile.id}
          coach={coach}
          onClose={() => setSelfConfirm(null)}
          onSaved={loadData}
        />
      )}
      {activeModal === 'join-group' && profile && (
        <JoinGroupModal
          personId={profile.id}
          coach={coach}
          myGroupIds={groups.map(g => g.id)}
          pendingGroupIds={pendingGroupIds}
          onClose={() => setActiveModal(null)}
          onJoined={loadData}
        />
      )}

      {/* Left nav menu */}
      <JourneyMenu
        personId={profile.id}
        levels={levels}
        onSoaps={() => setActiveModal('soap')}
        onMessage={() => { setMsgCenterOpen(true); setUnreadMsgCount(0) }}
        onStepAction={handleStepAction}
        onStepToggle={handleStepToggle}
        onRequestSignoff={handleRequestSignoff}
        soapStreak={soapStreak}
        currentStreak={currentStreak}
        unreadCount={unreadMsgCount}
        isAdmin={Boolean(profile.is_admin)}
        empowered={Boolean(profile.is_admin) || signoffs.some(s => s.stage === 'Empower' && s.status === 'approved')}
      />

      {/* Engagements overlay — opened from the desktop rail (non-empowered users) */}
      {engagementsOpen && (
        <EngagementsPanel personId={profile.id} onClose={() => setEngagementsOpen(false)} />
      )}

      {/* Message Center */}
      <MessageCenter
        myPersonId={profile.id}
        myName={profile.name}
        isOpen={msgCenterOpen}
        onClose={() => setMsgCenterOpen(false)}
        initialTargetPersonId={coach?.id ?? null}
        onConsumedTarget={() => {}}
      />

      {/* journal viewer */}
      {selectedJournal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
                {selectedJournal.journal_date}
              </h2>
              <button type="button" onClick={() => setSelectedJournal(null)} className="text-[var(--fg-3)]">
                ✕
              </button>
            </div>
            {selectedJournal.scripture_reference && (
              <p className="mb-2 text-sm font-medium text-[var(--establish)]">{selectedJournal.scripture_reference}</p>
            )}
            {selectedJournal.photo_url && (
              <img src={selectedJournal.photo_url} alt="Journal" className="mb-3 w-full rounded-lg" />
            )}
            {selectedJournal.ocr_text ? (
              <div className="rounded-lg bg-[var(--indigo-2)] p-3">
                <p className="whitespace-pre-wrap text-sm text-[var(--fg-2)]">{selectedJournal.ocr_text}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => runOcrOnJournal(selectedJournal.id)}
                disabled={processingOcr}
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] py-3 text-sm text-[var(--fg-2)] transition-colors hover:border-[var(--gbm-cobalt-bright)]"
              >
                {processingOcr ? 'Reading…' : 'Read this entry'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
