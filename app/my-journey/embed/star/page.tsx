'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../../contexts/AuthContext'
import {
  getMyCoach,
  getMyGroups,
  getGroupsOwnedByPerson,
  getSoapJournalsLite,
  getSoapStreak,
  getStageChecklistItems,
  upsertStageChecklistItem,
  getDiscipleshipConnections,
  getLevelSignoffs,
} from '../../../../lib/supabaseQueries'
import { supabase } from '../../../../lib/supabaseClient'
import type { SoapJournal, StageChecklistItem, Person, VictoryGroup, DiscipleshipConnection, LevelSignoff } from '../../../../types/database'
import { computeJourney, STEP_CHECKLIST, type JourneyStep } from '../../../../components/journey/journeyModel'
import StarQuadrants from '../../../../components/journey/StarQuadrants'

const postToApp = (payload: Record<string, unknown>) => {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView
  rn?.postMessage(JSON.stringify(payload))
}

/*
 * The progressing star for the WikiChurch app — the REAL StarQuadrants
 * component on the real journey data, so the key visual is identical to web.
 * Loaded in a WebView after /embed/boot. Step circles toggle here (same
 * upsert as web); step CTAs and sign-off requests bridge to the app, which
 * opens its native modals: {type:'step_action'|'request_signoff'}. The app
 * can push {"type":"refresh"} after its own writes (SOAP save etc.); checklist
 * changes also live-sync via postgres_changes like the web page.
 */
export default function EmbedStar() {
  const { user, profile, loading, profileLoading, refreshProfile } = useAuth()
  // Testimony/salvation-style steps derive from the people row itself, so an
  // app-pushed refresh must refetch the profile too — kept in a ref so the
  // listener effect doesn't re-subscribe on every render.
  const refreshProfileRef = useRef(refreshProfile)
  refreshProfileRef.current = refreshProfile
  const [coach, setCoach] = useState<Person | null>(null)
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [ownsGroup, setOwnsGroup] = useState(false)
  const [soapStreak, setSoapStreak] = useState(0)
  const [soapJournals, setSoapJournals] = useState<SoapJournal[]>([])
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [myDisciples, setMyDisciples] = useState<DiscipleshipConnection[]>([])
  const [signoffs, setSignoffs] = useState<LevelSignoff[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    if (!profile?.id) return
    const [coachRes, groupsRes, streakRes, checklistRes, disciplesRes, signoffsRes, ownedRes, soapsRes] = await Promise.all([
      getMyCoach(profile.id),
      getMyGroups(profile.id),
      getSoapStreak(profile.id),
      getStageChecklistItems(profile.id),
      getDiscipleshipConnections(profile.id),
      getLevelSignoffs(profile.id),
      getGroupsOwnedByPerson(profile.id),
      getSoapJournalsLite(profile.id),
    ])
    setOwnsGroup(((ownedRes.data as unknown[] | null)?.length ?? 0) > 0)
    setCoach((coachRes.data?.discipler as Person | undefined) ?? null)
    if (disciplesRes.data) setMyDisciples(disciplesRes.data as DiscipleshipConnection[])
    const groupRows = groupsRes.data as { victory_groups: VictoryGroup; status?: string }[] | null
    if (groupRows) setGroups(groupRows.filter(g => g.status !== 'pending').map(g => g.victory_groups).filter(Boolean))
    if (streakRes.streak !== undefined) setSoapStreak(streakRes.streak)
    if (checklistRes.data) setChecklistItems(checklistRes.data as StageChecklistItem[])
    if (signoffsRes.data) setSignoffs(signoffsRes.data as LevelSignoff[])
    if (soapsRes.data) setSoapJournals(soapsRes.data as SoapJournal[])
  }, [profile?.id])

  useEffect(() => { loadData() }, [loadData])

  // Same live-sync as the web page, plus a refresh channel from the app.
  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase
      .channel(`journey-embed-star-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_checklist_items', filter: `person_id=eq.${profile.id}` },
        () => { loadData() }
      )
      .subscribe()
    const onAppMessage = (e: MessageEvent) => {
      try {
        if (JSON.parse(String(e.data))?.type === 'refresh') {
          loadData()
          refreshProfileRef.current()
        }
      } catch { /* not ours */ }
    }
    window.addEventListener('message', onAppMessage)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('message', onAppMessage)
    }
  }, [profile?.id, loadData])

  // Tell the app how tall the star wants to be, so the WebView fits exactly.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const report = () => postToApp({ type: 'size', height: Math.ceil(el.getBoundingClientRect().height) })
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading, profileLoading])

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
  const currentLevel = levels.find(l => l.unlocked && !l.completed) ?? levels[levels.length - 1]

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
    loadData()
  }

  if (loading || profileLoading || !user || !profile || !levels.length) {
    return <div style={{ minHeight: 320, background: 'transparent' }} />
  }

  return (
    <>
      {/* the app's own cosmic gradient shows through */}
      <style>{'html, body { background: transparent !important; }'}</style>
      <div ref={wrapRef} className="mx-auto w-full max-w-[560px] px-2 py-1">
        <StarQuadrants
          levels={levels}
          color={currentLevel?.color ?? '#FBF6EC'}
          onStepAction={(step: JourneyStep) => postToApp({ type: 'step_action', action: step.action, stepId: step.id })}
          onStepToggle={handleStepToggle}
          onRequestSignoff={(stage: string) => postToApp({ type: 'request_signoff', stage })}
        />
      </div>
    </>
  )
}
