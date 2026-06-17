'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import LoginPage from '../../components/LoginPage'
import {
  getMyCoach,
  getMyGroups,
  getSoapJournals,
  getSoapStreak,
  getStageChecklistItems,
  getDiscipleshipConnections,
  getMyConversations,
} from '../../lib/supabaseQueries'
import { supabase } from '../../lib/supabaseClient'
import type { SoapJournal, StageChecklistItem, Person, VictoryGroup, DiscipleshipConnection } from '../../types/database'
import { computeJourney, computeBadges, ringProgressFromLevels, levelByStage, type JourneyStep } from '../../components/journey/journeyModel'
import { Starfield } from '../../components/journey/StarPrimitives'
import JourneyIntro from '../../components/journey/JourneyIntro'
import JourneyTour from '../../components/journey/JourneyTour'
import StarQuadrants from '../../components/journey/StarQuadrants'
import BadgeCelebration from '../../components/journey/BadgeCelebration'
import SoapEntryModal from '../../components/journey/SoapEntryModal'
import TestimonyModal from '../../components/journey/TestimonyModal'
import CommunityLights from '../../components/journey/CommunityLights'
import ConstellationRail, { ConstellationFeedInline, useConstellationFeed } from '../../components/journey/ConstellationRail'
import StoryMusic from '../../components/journey/StoryMusic'
import MessageCoachModal from '../../components/journey/MessageCoachModal'
import MessageCenter from '../../components/MessageCenter'
import JoinGroupModal from '../../components/journey/JoinGroupModal'
import SelfConfirmModal, { type SelfConfirmKind } from '../../components/journey/SelfConfirmModal'
import JourneyMenu from '../../components/journey/JourneyMenu'

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
  const [soapJournals, setSoapJournals] = useState<SoapJournal[]>([])
  const [soapStreak, setSoapStreak] = useState(0)
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [myDisciples, setMyDisciples] = useState<DiscipleshipConnection[]>([])
  const [showIntro, setShowIntro] = useState<boolean | null>(null)
  const [showTour, setShowTour] = useState(false)
  const [dataReady, setDataReady] = useState(false)
  const [demo, setDemo] = useState<DemoPhase>(null)
  const [activeModal, setActiveModal] = useState<'soap' | 'testimony' | 'coach' | 'message' | 'join-group' | null>(null)
  const [msgCenterOpen, setMsgCenterOpen] = useState(false)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [selfConfirm, setSelfConfirm] = useState<SelfConfirmKind | null>(null)
  const [selectedJournal, setSelectedJournal] = useState<SoapJournal | null>(null)
  const [processingOcr, setProcessingOcr] = useState(false)
  const [weeklySummary, setWeeklySummary] = useState<{ summary: string; journalCount: number } | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
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
    const [coachRes, groupsRes, journalsRes, streakRes, checklistRes, disciplesRes] = await Promise.all([
      getMyCoach(profile.id),
      getMyGroups(profile.id),
      getSoapJournals(profile.id, 30),
      getSoapStreak(profile.id),
      getStageChecklistItems(profile.id),
      getDiscipleshipConnections(profile.id),
    ])
    if (coachRes.data?.discipler) setCoach(coachRes.data.discipler as Person)
    if (disciplesRes.data) setMyDisciples(disciplesRes.data as DiscipleshipConnection[])
    if (groupsRes.data) {
      setGroups(groupsRes.data.map((g: { victory_groups: VictoryGroup }) => g.victory_groups).filter(Boolean))
    }
    if (journalsRes.data) setSoapJournals(journalsRes.data as SoapJournal[])
    if (streakRes.streak !== undefined) setSoapStreak(streakRes.streak)
    if (checklistRes.data) setChecklistItems(checklistRes.data as StageChecklistItem[])
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
            soapStreak,
            soapCount: soapJournals.length,
            hasSoapToday: soapJournals.some(j => j.journal_date === new Date().toISOString().split('T')[0]),
            checklist: checklistItems,
            disciples: myDisciples,
          }
        : null,
    [profile, coach, groups, soapStreak, soapJournals, checklistItems, myDisciples]
  )

  const levels = useMemo(() => (journeyData ? computeJourney(journeyData) : []), [journeyData])
  const badges = useMemo(() => (journeyData ? computeBadges(journeyData, levels) : []), [journeyData, levels])
  const earnedBadges = badges.filter(b => b.earned)
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

  // intro hands off to the tour — same star, focus unbroken
  const dismissIntro = useCallback(() => {
    setShowIntro(false)
    setShowTour(true)
  }, [])

  const dismissTour = useCallback(() => {
    localStorage.setItem(INTRO_KEY, '1')
    setShowTour(false)
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

  const fetchWeeklySummary = async () => {
    if (!profile?.id) return
    setLoadingSummary(true)
    try {
      const res = await fetch('/api/soap/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: profile.id, period: 'week' }),
      })
      const data = await res.json()
      if (data.summary) setWeeklySummary(data)
    } catch (err) {
      console.error('Summary error:', err)
    }
    setLoadingSummary(false)
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
          <div className="flex flex-1 flex-col items-center gap-2">
            <h1
              className="text-3xl font-semibold sm:text-4xl"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
            >
              My Journey
            </h1>
            {myDisciples.length > 0 && (
              <div className="flex rounded-full border border-[var(--line-2)] bg-[rgba(9,12,26,.6)] p-0.5 text-xs font-semibold">
                <span className="rounded-full px-3 py-1" style={{ background: 'var(--gbm-cobalt-bright)', color: '#fff' }}>
                  My Journey
                </span>
                <a
                  href="/"
                  className="rounded-full px-3 py-1 text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
                >
                  My Constellations
                </a>
              </div>
            )}
          </div>
          <div className="hidden h-12 w-px bg-[var(--line-2)] sm:block" />
          <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="max-w-[120px] truncate text-sm font-medium text-[var(--fg-2)] sm:max-w-none sm:text-base">
              {profile.name}
            </span>
            <button
              type="button"
              onClick={() => { setMsgCenterOpen(true); setUnreadMsgCount(0) }}
              className="relative flex items-center gap-1.5 rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-medium text-[var(--fg-2)] hover:border-[var(--gbm-cobalt-bright)] hover:text-[var(--fg-1)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Messages
              {unreadMsgCount > 0 && (
                <span
                  className="flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[9px] font-bold"
                  style={{ background: 'var(--establish)', color: 'var(--void)' }}
                >
                  {unreadMsgCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={async () => {
                await signOut()
                window.location.href = '/'
              }}
              className="cn-chip !text-xs"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-xl px-4 pb-20 sm:px-6">
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
            {soapStreak > 0 && (
              <span
                className="rounded-full border px-2.5 py-1 text-[11px] font-bold"
                style={{ borderColor: 'rgba(54,214,195,.4)', background: 'rgba(54,214,195,.12)', color: 'var(--establish)' }}
              >
                ✦ {soapStreak}d
              </span>
            )}
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
          {!journeyData?.hasSoapToday ? (
            <button type="button" onClick={() => setActiveModal('soap')} className="cn-btn cn-btn-primary mt-4">
              ✦ Open today&rsquo;s SOAP
            </button>
          ) : (
            <p className="mt-4 text-xs font-semibold" style={{ color: 'var(--establish)' }}>
              ✦ You&rsquo;ve been in the Word today
            </p>
          )}
        </section>

        {/* empowered → the dashboard opens; engaged → full circle */}
        {(levelByStage(levels, 'Empower')?.completed ?? false) && (
          <section
            className="mt-8 rounded-[var(--r-xl)] border p-6 text-center"
            style={{
              borderColor: fullCircle ? 'rgba(242,200,121,.4)' : 'rgba(240,114,159,.35)',
              background: fullCircle
                ? 'linear-gradient(180deg, rgba(242,200,121,.10) 0%, rgba(20,27,61,.6) 100%)'
                : 'linear-gradient(180deg, rgba(240,114,159,.10) 0%, rgba(20,27,61,.6) 100%)',
              boxShadow: fullCircle ? '0 0 48px -16px rgba(242,200,121,.55)' : '0 0 48px -16px rgba(240,114,159,.5)',
            }}
          >
            <p className="cn-label" style={{ color: fullCircle ? 'var(--gold)' : 'var(--empower)' }}>
              {fullCircle ? 'Full circle' : 'Empowered'}
            </p>
            <p className="mt-2 text-xl italic leading-relaxed" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
              {fullCircle
                ? 'You were engaged — and now a new star is being lit through you.'
                : 'Your coach dashboard is open. One thing remains: engage someone new.'}
            </p>
            <a href="/" className="cn-btn cn-btn-primary mt-4 inline-flex">
              Open your coach dashboard
            </a>
          </section>
        )}

        {/* lights you carry */}
        {earnedBadges.length > 0 && (
          <section className="mt-10">
            <div className="cn-label mb-3">Lights you carry</div>
            <div className="flex flex-wrap gap-2">
              {earnedBadges.map(b => (
                <span
                  key={b.id}
                  title={b.line}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                  style={{ borderColor: `${b.color}44`, background: `${b.color}14`, color: b.color }}
                >
                  ✦ {b.title}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* community rhythms */}
        <section className="mt-10">
          <CommunityLights myPersonId={profile.id} />
        </section>

        {/* shared lights inline (small screens) */}
        <section className="mt-10">
          <ConstellationFeedInline items={feedItems} />
        </section>

        {/* weekly insight */}
        {soapJournals.length >= 3 && (
          <section className="mt-10">
            <div className="flex items-center justify-between">
              <div className="cn-label">Weekly insight</div>
              {!weeklySummary && (
                <button type="button" onClick={fetchWeeklySummary} disabled={loadingSummary} className="text-xs font-semibold text-[var(--gbm-cobalt-soft)]">
                  {loadingSummary ? 'Listening…' : 'Gather this week'}
                </button>
              )}
            </div>
            {weeklySummary && (
              <div className="cn-card mt-3 p-4">
                <p className="text-sm leading-relaxed text-[var(--fg-2)]">{weeklySummary.summary}</p>
                <p className="mt-2 text-xs text-[var(--fg-3)]">From {weeklySummary.journalCount} entries this week</p>
              </div>
            )}
          </section>
        )}

        {/* recent entries */}
        {soapJournals.length > 0 && (
          <section className="mt-10">
            <div className="cn-label mb-3">Recent pages</div>
            <div className="grid grid-cols-4 gap-2">
              {soapJournals.slice(0, 8).map(journal => (
                <button
                  type="button"
                  key={journal.id}
                  onClick={() => setSelectedJournal(journal)}
                  className="aspect-square overflow-hidden rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] transition-transform hover:scale-105"
                >
                  {journal.photo_url ? (
                    <img src={journal.photo_url} alt={journal.journal_date} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-[var(--fg-3)]">
                      {journal.journal_date}
                    </span>
                  )}
                </button>
              ))}
            </div>
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
      </main>

      {/* modals */}
      {activeModal === 'soap' && profile && (
        <SoapEntryModal personId={profile.id} onClose={() => setActiveModal(null)} onSaved={loadData} />
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
          onClose={() => setActiveModal(null)}
          onJoined={loadData}
        />
      )}

      {/* Left nav menu */}
      <JourneyMenu
        personId={profile.id}
        onSoaps={() => setActiveModal('soap')}
        onMessage={() => { setMsgCenterOpen(true); setUnreadMsgCount(0) }}
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
