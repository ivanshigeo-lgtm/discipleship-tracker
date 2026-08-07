'use client'

// Zone 1 of the coach-home briefing: today + tomorrow as a two-slide snap
// carousel (same track/dots pattern as the My Journey NextMeetingCard). Each
// slide merges the coach's own pending 1:1s with occurrences of the groups
// they OWN (multi-day schedules, per-occurrence cancel/reschedule applied),
// time-ordered, with inline action chips. A day with nothing scheduled gets a
// quiet card instead of disappearing.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getWeekEngagementsForPerson,
  getVictoryGroups,
  getGroupMeetingStatuses,
  getPendingMeetingInvites,
  getPeopleNames,
  setMeetingInviteStatus,
} from '../../lib/supabaseQueries'
import { daysOf, occurrencesWithin } from '../../lib/meetingDays'
import { ZoneLabel, toLocalDateStr } from './coachModel'
import type { Engagement, VictoryGroup, GroupMeetingStatus } from '../../types/database'

type Item = {
  kind: 'group' | 'one-on-one'
  key: string
  title: string
  sub: string | null
  date: string
  time: string | null
  engagementId: string | null
  otherPersonId: string | null
  needsConfirm: boolean
}

const fmtTime = (t: string | null) => {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return { hm: `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`, ap: h >= 12 ? 'PM' : 'AM' }
}

const dayName = (dateStr: string) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

export default function TodayStrip({
  personId,
  refreshKey,
  onOpenMessages,
  onGoToEngagements,
}: {
  personId: string
  refreshKey: number
  onOpenMessages: (targetPersonId?: string) => void
  onGoToEngagements: () => void
}) {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [statuses, setStatuses] = useState<GroupMeetingStatus[]>([])
  const [pendingInviteIds, setPendingInviteIds] = useState<Set<string>>(new Set())
  const [names, setNames] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)
  const [idx, setIdx] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)

  const today = toLocalDateStr(new Date())
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return toLocalDateStr(d) })()

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [engRes, grpRes, stRes, invRes] = await Promise.all([
        getWeekEngagementsForPerson(personId, today, tomorrow),
        getVictoryGroups(),
        getGroupMeetingStatuses(),
        getPendingMeetingInvites(personId),
      ])
      if (!alive) return
      const engs = (engRes.data as Engagement[] | null) ?? []
      setEngagements(engs)
      setGroups(((grpRes.data as VictoryGroup[] | null) ?? []).filter(g => g.owner_person_id === personId))
      setStatuses((stRes.data as GroupMeetingStatus[] | null) ?? [])
      setPendingInviteIds(new Set(((invRes.data as Engagement[] | null) ?? []).map(e => e.id)))
      // The other head of each 1:1 (bounded — a 2-day window is a handful of rows).
      const otherIds = Array.from(new Set(
        engs.map(e => (e.person_id === personId ? e.created_by_person_id : e.person_id)).filter((v): v is string => Boolean(v))
      ))
      if (otherIds.length) {
        const { data } = await getPeopleNames(otherIds)
        if (alive && data) setNames(Object.fromEntries(data.map(p => [p.id, p.name])))
      }
      if (alive) setReady(true)
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, refreshKey])

  const byDay = useMemo(() => {
    const items: Item[] = []
    for (const g of groups) {
      for (const occ of occurrencesWithin(daysOf(g), 1)) {
        const st = statuses.find(s => s.victory_group_id === g.id && s.meeting_date === occ) ?? null
        if (st?.status === 'cancelled') continue
        const rescheduled = st?.status === 'rescheduled'
        const date = rescheduled && st?.rescheduled_to ? st.rescheduled_to : occ
        if (date !== today && date !== tomorrow) continue
        items.push({
          kind: 'group',
          key: `g:${g.id}:${occ}`,
          title: g.name,
          sub: rescheduled ? 'Grace Group · rescheduled' : 'Grace Group',
          date,
          time: rescheduled ? st?.rescheduled_time ?? null : g.meeting_time,
          engagementId: null,
          otherPersonId: null,
          needsConfirm: false,
        })
      }
    }
    for (const e of engagements) {
      if (!e.follow_up_date || e.status !== 'Pending') continue
      const otherId = e.person_id === personId ? e.created_by_person_id : e.person_id
      items.push({
        kind: 'one-on-one',
        key: `e:${e.id}`,
        title: `1:1 · ${otherId ? names[otherId] ?? '…' : e.description}`,
        sub: [e.description, e.location].filter(Boolean).join(' · ') || null,
        date: e.follow_up_date,
        time: e.follow_up_time,
        engagementId: e.id,
        otherPersonId: otherId,
        needsConfirm: pendingInviteIds.has(e.id) && !confirmed.has(e.id),
      })
    }
    items.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'))
    return {
      [today]: items.filter(i => i.date === today),
      [tomorrow]: items.filter(i => i.date === tomorrow),
    }
  }, [groups, statuses, engagements, names, pendingInviteIds, confirmed, personId, today, tomorrow])

  if (!ready) return null

  const confirm = async (engagementId: string) => {
    setConfirmed(prev => new Set(prev).add(engagementId))
    const { error } = await setMeetingInviteStatus(engagementId, personId, 'confirmed')
    if (error) setConfirmed(prev => { const n = new Set(prev); n.delete(engagementId); return n })
  }

  const days = [
    { date: today, label: `Today · ${dayName(today)}` },
    { date: tomorrow, label: `Tomorrow · ${dayName(tomorrow)}` },
  ]

  const chip = 'rounded-full border border-[var(--line-2)] bg-[var(--indigo-3)] px-3 py-1 text-[11.5px] font-semibold text-[var(--fg-1)] transition-colors hover:bg-[#2a3565]'
  const chipGlow = 'rounded-full border border-[rgba(91,141,247,.5)] px-3 py-1 text-[11.5px] font-semibold text-white transition-all hover:brightness-110'

  return (
    <section className="mb-5">
      <ZoneLabel label={days[idx]?.label ?? 'Today'} />
      <div
        ref={trackRef}
        onScroll={e => {
          const el = e.currentTarget
          const i = Math.round(el.scrollLeft / el.clientWidth)
          if (i !== idx && i >= 0 && i < days.length) setIdx(i)
        }}
        className="flex snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {days.map(day => {
          const items = byDay[day.date] ?? []
          return (
            <div key={day.date} className="flex w-full shrink-0 snap-center flex-col gap-2">
              {items.length === 0 && (
                <div className="cn-card p-5 text-center">
                  <p className="text-base italic text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                    {day.date === today ? 'Today is open.' : 'Tomorrow is open.'}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[var(--fg-3)]">A good day for a walk with someone below.</p>
                </div>
              )}
              {items.map(item => {
                const t = fmtTime(item.time)
                return (
                  <div key={item.key} className="cn-card flex flex-col gap-2.5 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-[52px] text-right text-xs font-bold tabular-nums leading-tight text-[var(--fg-1)]">
                        {t ? <>{t.hm}<span className="block text-[9.5px] font-semibold tracking-[.08em] text-[var(--fg-3)]">{t.ap}</span></> : <span className="text-[var(--fg-3)]">—</span>}
                      </div>
                      <span
                        className="h-[9px] w-[9px] shrink-0 rounded-full"
                        style={item.kind === 'group'
                          ? { background: 'var(--engage)', boxShadow: '0 0 10px 1px rgba(244,182,80,.7)' }
                          : { background: 'var(--equip)', boxShadow: '0 0 10px 1px rgba(91,141,247,.75)' }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[14.5px] font-semibold leading-snug text-[var(--fg-1)]">{item.title}</p>
                        {item.sub && <p className="truncate text-[11.5px] text-[var(--fg-3)]">{item.sub}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-[63px]">
                      {item.kind === 'group' ? (
                        <>
                          <button type="button" onClick={onGoToEngagements} className={chipGlow} style={{ background: 'linear-gradient(180deg,#2E55E6,#1c3fd0)', boxShadow: '0 0 18px -4px rgba(46,85,230,.8)' }}>
                            Take attendance
                          </button>
                          <button type="button" onClick={() => onOpenMessages()} className={chip}>Message group</button>
                        </>
                      ) : (
                        <>
                          {item.needsConfirm && item.engagementId && (
                            <button type="button" onClick={() => confirm(item.engagementId!)} className={chipGlow} style={{ background: 'linear-gradient(180deg,#2E55E6,#1c3fd0)', boxShadow: '0 0 18px -4px rgba(46,85,230,.8)' }}>
                              Confirm
                            </button>
                          )}
                          {item.engagementId && confirmed.has(item.engagementId) && (
                            <span className="px-1 py-1 text-[11.5px] font-semibold text-[var(--success)]">Confirmed ✓</span>
                          )}
                          {item.otherPersonId && (
                            <button type="button" onClick={() => onOpenMessages(item.otherPersonId!)} className={chip}>Message</button>
                          )}
                          <button type="button" onClick={onGoToEngagements} className={chip}>Move</button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {days.map((day, i) => (
          <button
            key={day.date}
            type="button"
            aria-label={day.label}
            onClick={() => {
              const el = trackRef.current
              if (el) el.scrollTo({ left: el.clientWidth * i, behavior: 'smooth' })
            }}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === idx ? 16 : 6, background: i === idx ? 'var(--fg-1)' : 'var(--line-2)' }}
          />
        ))}
      </div>
    </section>
  )
}
