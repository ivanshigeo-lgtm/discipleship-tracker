'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../../contexts/AuthContext'
import {
  getMyCoach,
  getMyGroups,
  getGroupsOwnedByPerson,
  getSoapJournalsLite,
  getSoapJournalTexts,
  getSoapStreak,
  getStageChecklistItems,
  getDiscipleshipConnections,
  getLevelSignoffs,
} from '../../../../lib/supabaseQueries'
import { supabase } from '../../../../lib/supabaseClient'
import type { SoapJournal, StageChecklistItem, Person, VictoryGroup, DiscipleshipConnection, LevelSignoff } from '../../../../types/database'
import { computeJourney, computeBadges } from '../../../../components/journey/journeyModel'
import Milestones from '../../../../components/journey/Milestones'
import SoapCalendarSection from '../../../../components/SoapCalendarSection'

const postToApp = (payload: Record<string, unknown>) => {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView
  rn?.postMessage(JSON.stringify(payload))
}

/*
 * Everything that lives UNDER the star on web /my-journey, for the WikiChurch
 * app: the milestone badges and the real SOAP calendar section. Loaded in a
 * WebView after /embed/boot, below the app's native CTA buttons. New-entry
 * taps bridge to the app's native SOAP modal ({type:'new_soap', date?});
 * viewing an existing date stays in-page (SoapDateReviewModal). Links out
 * (e.g. the Premium menu's Answered page) bridge as {type:'navigate', path}
 * so the app can open them full-screen. The app pushes {"type":"refresh"}
 * after its own SOAP save so the calendar and badges update without a reload.
 */
export default function EmbedUnderStar() {
  const { user, profile, loading, profileLoading, refreshProfile } = useAuth()
  const refreshProfileRef = useRef(refreshProfile)
  refreshProfileRef.current = refreshProfile
  const [coach, setCoach] = useState<Person | null>(null)
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [ownsGroup, setOwnsGroup] = useState(false)
  const [soapStreak, setSoapStreak] = useState(0)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [soapJournals, setSoapJournals] = useState<SoapJournal[]>([])
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [myDisciples, setMyDisciples] = useState<DiscipleshipConnection[]>([])
  const [signoffs, setSignoffs] = useState<LevelSignoff[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    if (!profile?.id) return
    const [coachRes, groupsRes, streakRes, checklistRes, disciplesRes, signoffsRes, ownedRes] = await Promise.all([
      getMyCoach(profile.id),
      getMyGroups(profile.id),
      getSoapStreak(profile.id),
      getStageChecklistItems(profile.id),
      getDiscipleshipConnections(profile.id),
      getLevelSignoffs(profile.id),
      getGroupsOwnedByPerson(profile.id),
    ])
    setOwnsGroup(((ownedRes.data as unknown[] | null)?.length ?? 0) > 0)
    setCoach((coachRes.data?.discipler as Person | undefined) ?? null)
    if (disciplesRes.data) setMyDisciples(disciplesRes.data as DiscipleshipConnection[])
    const groupRows = groupsRes.data as { victory_groups: VictoryGroup; status?: string }[] | null
    if (groupRows) setGroups(groupRows.filter(g => g.status !== 'pending').map(g => g.victory_groups).filter(Boolean))
    if (streakRes.streak !== undefined) setSoapStreak(streakRes.streak)
    if (streakRes.current !== undefined) setCurrentStreak(streakRes.current)
    if (checklistRes.data) setChecklistItems(checklistRes.data as StageChecklistItem[])
    if (signoffsRes.data) setSignoffs(signoffsRes.data as LevelSignoff[])
  }, [profile?.id])

  // Full SOAP history in two phases, same as the web page: rows first, then
  // the OCR text merges in so search/excerpts work.
  const loadSoaps = useCallback(async () => {
    if (!profile?.id) return
    const { data } = await getSoapJournalsLite(profile.id)
    if (!data) return
    setSoapJournals(data as SoapJournal[])
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

  const refreshSoaps = useCallback(async () => {
    await Promise.all([loadSoaps(), loadData()])
  }, [loadSoaps, loadData])

  // Live-sync checklist changes (badges light when the coach checks things),
  // and reload when the app says it saved something natively.
  useEffect(() => {
    if (!profile?.id) return
    const channel = supabase
      .channel(`journey-embed-under-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_checklist_items', filter: `person_id=eq.${profile.id}` },
        () => { loadData() }
      )
      .subscribe()
    const onAppMessage = (e: MessageEvent) => {
      try {
        if (JSON.parse(String(e.data))?.type === 'refresh') {
          refreshSoaps()
          refreshProfileRef.current()
        }
      } catch { /* not ours */ }
    }
    window.addEventListener('message', onAppMessage)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('message', onAppMessage)
    }
  }, [profile?.id, loadData, refreshSoaps])

  // Same-origin links (the Premium menu's Answered page) open full-screen in
  // the app instead of navigating this fitted-height WebView in place.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]')
      const href = a?.getAttribute('href')
      if (href?.startsWith('/')) {
        e.preventDefault()
        postToApp({ type: 'navigate', path: href })
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Tell the app how tall this section wants to be.
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
  const badges = useMemo(() => (journeyData ? computeBadges(journeyData, levels) : []), [journeyData, levels])

  if (loading || profileLoading || !user || !profile) {
    return <div style={{ minHeight: 320, background: 'transparent' }} />
  }

  return (
    <>
      {/* the app's own cosmic gradient shows through */}
      <style>{'html, body { background: transparent !important; }'}</style>
      <div ref={wrapRef} className="mx-auto w-full max-w-xl px-2 pb-4">
        <Milestones badges={badges} />
        <section className="mt-10">
          <SoapCalendarSection
            soaps={soapJournals}
            onNewEntry={() => postToApp({ type: 'new_soap' })}
            soapStreak={soapStreak}
            currentStreak={currentStreak}
            onRefresh={refreshSoaps}
            onNewEntryForDate={date => postToApp({ type: 'new_soap', date })}
            personId={profile.id}
          />
        </section>
      </div>
    </>
  )
}
