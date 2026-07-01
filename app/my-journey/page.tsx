'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import LoginPage from '../../components/LoginPage'
import {
  getMyCoach,
  getMyGroups,
  getGroupsOwnedByPerson,
  getSoapJournals,
  getSoapStreak,
  getStageChecklistItems,
  upsertStageChecklistItem,
  getDiscipleshipConnections,
  getMyConversations,
  getLevelSignoffs,
  requestLevelSignoff,
  sendMessage,
} from '../../lib/supabaseQueries'
import { supabase } from '../../lib/supabaseClient'
import type { SoapJournal, StageChecklistItem, Person, VictoryGroup, DiscipleshipConnection, LevelSignoff } from '../../types/database'
import { computeJourney, computeBadges, ringProgressFromLevels, levelByStage, STEP_CHECKLIST, type JourneyStep } from '../../components/journey/journeyModel'
import { Starfield } from '../../components/journey/StarPrimitives'
import JourneyIntro from '../../components/journey/JourneyIntro'
import JourneyTour from '../../components/journey/JourneyTour'
import StarQuadrants from '../../components/journey/StarQuadrants'
import BadgeCelebration from '../../components/journey/BadgeCelebration'
import Milestones from '../../components/journey/Milestones'
import SoapEntryModal from '../../components/journey/SoapEntryModal'
import PrayerEntryModal from '../../components/journey/PrayerEntryModal'
import TestimonyModal from '../../components/journey/TestimonyModal'
import ConstellationRail, { useConstellationFeed } from '../../components/journey/ConstellationRail'
import StoryMusic from '../../components/journey/StoryMusic'
import MessageCoachModal from '../../components/journey/MessageCoachModal'
import MessageCenter from '../../components/MessageCenter'
import JoinGroupModal from '../../components/journey/JoinGroupModal'
import SelfConfirmModal, { type SelfConfirmKind } from '../../components/journey/SelfConfirmModal'
import JourneyMenu from '../../components/journey/JourneyMenu'
import EmpoweredCoachmark from '../../components/journey/EmpoweredCoachmark'
import SoapCalendarSection from '../../components/SoapCalendarSection'
import SignoffNotice from '../../components/journey/SignoffNotice'

const INTRO_KEY = 'journey_intro_seen'
const DEMO_KEY = 'journey_quadrant_demo_seen'
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
  const { user, profile, loading, signOut } = useAuth()
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
  const [activeModal, setActiveModal] = useState<'soap' | 'testimony' | 'coach' | 'message' | 'join-group' | 'prayer' | null>(null)
  const [soapEntryDate, setSoapEntryDate] = useState<string | null>(null)
  const [msgCenterOpen, setMsgCenterOpen] = useState(false)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [selfConfirm, setSelfConfirm] = useState<SelfConfirmKind | null>(null)
  const [selectedJournal, setSelectedJournal] = useState<SoapJournal | null>(null)
  const [processingOcr, setProcessingOcr] = useState(false)
  const feedItems = useConstellationFeed()

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

  const loadData = useCallback(async () => {
    if (!profile?.id) return
    const [coachRes, groupsRes, journalsRes, streakRes, checklistRes, disciplesRes, signoffsRes, ownedRes] = await Promise.all([
      getMyCoach(profile.id),
      getMyGroups(profile.id),
      getSoapJournals(profile.id, 365),
      getSoapStreak(profile.id),
      getStageChecklistItems(profile.id),
      getDiscipleshipConnections(profile.id),
      getLevelSignoffs(profile.id),
      getGroupsOwnedByPerson(profile.id),
    ])
    setOwnsGroup(((ownedRes.data as unknown[] | null)?.length ?? 0) > 0)
    if (coachRes.data?.discipler) setCoach(coachRes.data.discipler as Person)
    if (disciplesRes.data) setMyDisciples(disciplesRes.data as DiscipleshipConnection[])
    if (groupsRes.data) {
      const rows = groupsRes.data as { victory_groups: VictoryGroup; victory_group_id: string; status?: string }[]
      // Only APPROVED memberships count as being "in" the group; pending ones
      // are awaiting the group owner's approval.
      setGroups(rows.filter(g => g.status !== 'pending').map(g => g.victory_groups).filter(Boolean))
      setPendingGroupIds(rows.filter(g => g.status === 'pending').map(g => g.victory_group_id))
    }
    if (journalsRes.data) setSoapJournals(journalsRes.data as SoapJournal[])
    if (streakRes.streak !== undefined) setSoapStreak(streakRes.streak)
    if (streakRes.current !== undefined) setCurrentStreak(streakRes.current)
    if (checklistRes.data) setChecklistItems(checklistRes.data as StageChecklistItem[])
    if (signoffsRes.data) setSignoffs(signoffsRes.data as LevelSignoff[])
    setDataReady(true)
  }, [profile?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

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
          }
        : null,
    [profile, coach, groups, ownsGroup, soapStreak, soapJournals, checklistItems, myDisciples, signoffs]
  )

  const levels = useMemo(() => (journeyData ? computeJourney(journeyData) : []), [journeyData])
  const badges = useMemo(() => (journeyData ? computeBadges(journeyData, levels) : []), [journeyData, levels])
  const ringProgress = ringProgressFromLevels(levels)
  // full circle = the disciple is engaging someone of their own
  const fullCircle = levelByStage(levels, 'Engage')?.completed ?? false

  const handleStepAction = (step: JourneyStep) => {
    if (step.action === 'soap') setActiveModal('soap')
    else if (step.action === 'testimony') setActiveModal('testimony')
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


  if (loading) {
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

      {/* header */}
      <header className="relative z-10 mx-auto max-w-5xl px-4 pb-2 pt-4 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-4 sm:gap-6">
          <img
            src="/gbm-horizontal-lockup-white.png"
            alt="Grace Bible Maui"
            className="h-16 w-auto shrink-0 sm:h-24"
          />
          <div className="hidden h-12 w-px bg-[var(--line-2)] sm:block" />
          <div className="relative flex flex-1 flex-col items-center gap-2">
            <h1
              className="text-3xl font-semibold sm:text-4xl"
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
            <span className="max-w-[120px] truncate text-sm font-medium text-[var(--fg-2)] sm:max-w-none sm:text-base">
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

      <main className="relative z-10 mx-auto max-w-xl px-4 pb-20 sm:px-6">
        {/* Coach: disciples waiting on a sign-off (banner + browser alerts) */}
        <SignoffNotice coachId={profile.id} />

        {/* hero — your star IS the interface */}
        <section className="flex flex-col items-center pt-2 text-center">
          <div className="relative">
            <p className={`text-xs uppercase tracking-[.14em] text-[var(--fg-3)] ${demo === 'meteor' ? 'jy-hint-glow' : ''}`}>
              Hover or tap a quadrant of your star
            </p>
            {demo === 'meteor' && <span className="jy-meteor" aria-hidden />}
          </div>
          <div className="relative z-20 mt-2 w-full">
            <StarQuadrants
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

          {/* today's invitation */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => setActiveModal('soap')} className="cn-btn cn-btn-primary inline-flex items-center gap-2">
              ✦ Today&rsquo;s SOAP
              {soapStreak > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                  title={`Longest ${soapStreak}d · current ${currentStreak}d`}
                  style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}
                >
                  {soapStreak}d best{currentStreak > 0 ? ` · ${currentStreak}d now` : ''}
                </span>
              )}
            </button>
            <button type="button" onClick={() => setActiveModal('prayer')} className="cn-btn cn-btn-primary">
              ✦ Today&rsquo;s Prayer / Praise
            </button>
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

        {/* lights you carry */}
        <Milestones badges={badges} />

        {/* "Shared With Me" (constellation + grace group) moved into the side
            menu — see the Spirit section of JourneyMenu. */}

        {/* SOAP journal calendar */}
        <section className="mt-10">
          <SoapCalendarSection
            soaps={soapJournals}
            onNewEntry={() => { setSoapEntryDate(null); setActiveModal('soap') }}
            soapStreak={soapStreak}
            currentStreak={currentStreak}
            onRefresh={loadData}
            onNewEntryForDate={date => { setSoapEntryDate(date); setActiveModal('soap') }}
            personId={profile.id}
          />
        </section>

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
      </main>

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
          onClose={() => { setActiveModal(null); setSoapEntryDate(null) }}
          onSaved={loadData}
        />
      )}
      {activeModal === 'testimony' && profile && (
        <TestimonyModal profile={profile} onClose={() => setActiveModal(null)} onSaved={loadData} />
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
