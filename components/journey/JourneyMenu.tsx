'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getEngagementsForPerson,
  getAllEngagements,
  getConfirmedEngagementIds,
  getPrayerLifeForPerson,
  addPrayerRequest,
  getPendingLevelSignoffs,
} from '../../lib/supabaseQueries'
import MeetingInvites from '../MeetingInvites'
import NewMeetingModal from '../NewMeetingModal'
import SharedSoapFeed from '../SharedSoapFeed'
import SharedPrayerFeed from '../SharedPrayerFeed'
import { ConstellationFeedInline, useConstellationFeed } from './ConstellationRail'
import type { Engagement, PrayerRequest, Stage, ShareVisibility } from '../../types/database'
import type { JourneyLevel, JourneyStep } from './journeyModel'
import { StageStepList } from './StageStepList'


// ─── Content panel (bottom sheet / center modal) ─────────────────────────────
function Panel({ title, color, onClose, children }: {
  title: string; color: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(6,8,20,.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="jy-rise-in w-full max-w-xl overflow-hidden rounded-t-[var(--r-xl)] border border-b-0 border-[var(--line-2)] sm:rounded-[var(--r-xl)] sm:border-b"
        style={{ background: 'var(--space)', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-4">
          <span className="text-base font-semibold" style={{ color, fontFamily: 'var(--font-display)' }}>{title}</span>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-xs text-[var(--fg-3)] hover:text-[var(--fg-1)]">
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  )
}

// ─── Stage panel — the same content as the star's hover pop-out ───────────────
function StagePanel({
  level,
  onClose,
  onStepAction,
  onStepToggle,
  onRequestSignoff,
}: {
  level: JourneyLevel
  onClose: () => void
  onStepAction?: (step: JourneyStep) => void
  onStepToggle?: (step: JourneyStep) => void
  onRequestSignoff?: (stage: string) => void
}) {
  const glow = level.color
  const pct = Math.round(level.progress * 100)
  return (
    <Panel title={level.stage} color={glow} onClose={onClose}>
      <div className="mb-1 h-1 overflow-hidden rounded-full bg-[var(--indigo-2)]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: glow }} />
      </div>
      <p className="mb-3 text-xs text-[var(--fg-3)]">{pct}% complete</p>
      <p className="mb-3 text-left text-sm italic leading-snug text-[var(--fg-2)]" style={{ fontFamily: 'var(--font-display)' }}>
        {level.tagline}
      </p>
      {level.unlocked ? (
        <StageStepList level={level} onStepAction={onStepAction} onStepToggle={onStepToggle} onRequestSignoff={onRequestSignoff} />
      ) : (
        <p className="text-xs text-[var(--fg-3)]">Opens when your coach signs off the previous stage.</p>
      )}
    </Panel>
  )
}

// ─── Prayer panel ─────────────────────────────────────────────────────────────
const PRAYER_SCOPES: { value: ShareVisibility; label: string }[] = [
  { value: 'private', label: 'Just me' },
  { value: 'coach', label: 'My coach' },
  { value: 'group', label: 'My group' },
  { value: 'constellation', label: 'Everyone' },
]

function PrayerPanel({ personId, isAdmin, onClose }: { personId: string; isAdmin: boolean; onClose: () => void }) {
  const [requests, setRequests] = useState<PrayerRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>('private')
  const [saving, setSaving] = useState(false)

  const load = () =>
    getPrayerLifeForPerson(personId, isAdmin).then(({ data }) => {
      if (data) setRequests(data as PrayerRequest[])
      setLoading(false)
    })

  useEffect(() => { load() }, [personId])

  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    await addPrayerRequest({ person_id: personId, request: text.trim(), status: 'Active', answered_date: null, answer_notes: null, visibility })
    setText('')
    await load()
    setSaving(false)
  }

  return (
    <Panel title="Prayer" color="#9B80FF" onClose={onClose}>
      <div className="mb-2 flex gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Share a request or praise…"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={saving || !text.trim()}
          className="self-end rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50"
          style={{ background: '#9B80FF', color: 'var(--void)' }}
        >
          {saving ? '…' : 'Add'}
        </button>
      </div>
      {/* Who sees this prayer */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">Share with</span>
        {PRAYER_SCOPES.map(s => (
          <button
            key={s.value}
            type="button"
            onClick={() => setVisibility(s.value)}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
            style={visibility === s.value
              ? { background: '#9B80FF', color: 'var(--void)' }
              : { background: 'var(--indigo-2)', color: 'var(--fg-2)' }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#9B80FF] border-t-transparent" />
        </div>
      ) : requests.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--fg-3)]">No prayer requests yet.</p>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div
              key={r.id}
              className="rounded-xl px-3 py-2.5"
              style={{ background: r.is_praise ? 'rgba(242,200,121,.08)' : 'var(--indigo-2)' }}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: r.is_praise ? 'var(--gold)' : '#9B80FF' }}>
                {r.is_praise ? '✦ Praise' : '✦ Prayer'}
              </span>
              {r.status === 'Answered' && (
                <span className="ml-2 rounded-full bg-[rgba(54,214,195,.15)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--establish)]">Answered</span>
              )}
              <p className="mt-1 text-sm leading-relaxed text-[var(--fg-2)]">{r.request}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ─── Engagements panel ────────────────────────────────────────────────────────
function EngagementsPanel({ personId, onClose }: { personId: string; onClose: () => void }) {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [showNewMeeting, setShowNewMeeting] = useState(false)

  useEffect(() => {
    getEngagementsForPerson(personId).then(({ data }) => {
      if (data) setEngagements(data as Engagement[])
      setLoading(false)
    })
  }, [personId, reloadKey])

  const upcoming = engagements.filter(e => e.status !== 'Completed')
  const past = engagements.filter(e => e.status === 'Completed')

  return (
    <Panel title="Engagements" color="#F4B650" onClose={onClose}>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setShowNewMeeting(true)}
          className="rounded-full border border-[var(--line-2)] px-3 py-1 text-xs font-semibold text-[var(--fg-1)] hover:border-[var(--gbm-cobalt-bright)]"
        >
          + New meeting
        </button>
      </div>
      {showNewMeeting && (
        <NewMeetingModal onClose={() => setShowNewMeeting(false)} onCreated={() => setReloadKey(k => k + 1)} />
      )}
      <MeetingInvites personId={personId} refreshKey={reloadKey} onChanged={() => setReloadKey(k => k + 1)} />
      {loading ? (
        <div className="flex justify-center py-6">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#F4B650] border-t-transparent" />
        </div>
      ) : engagements.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--fg-3)]">No engagements yet.</p>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Upcoming</p>
              <div className="space-y-2">
                {upcoming.map(e => (
                  <div key={e.id} className="rounded-xl bg-[var(--indigo-2)] px-3 py-2.5">
                    <p className="text-sm font-medium text-[var(--fg-1)]">{e.description}</p>
                    {e.follow_up_date && (
                      <p className="mt-0.5 text-xs" style={{ color: '#F4B650' }}>
                        {new Date(e.follow_up_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {e.follow_up_time ? ` · ${e.follow_up_time.slice(0, 5)}` : ''}
                      </p>
                    )}
                    {e.notes && <p className="mt-1 text-xs text-[var(--fg-3)]">{e.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Past</p>
              <div className="space-y-2 opacity-60">
                {past.slice(0, 5).map(e => (
                  <div key={e.id} className="rounded-xl bg-[var(--indigo-2)] px-3 py-2.5">
                    <p className="text-sm text-[var(--fg-2)]">{e.description}</p>
                    {e.follow_up_date && (
                      <p className="mt-0.5 text-xs text-[var(--fg-3)]">
                        {new Date(e.follow_up_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}

// ─── Supplemental materials ───────────────────────────────────────────────────
type Supplemental = { label: string; description: string }

const SUPPLEMENTAL: Supplemental[] = [
  { label: 'Leadership 113', description: 'Leadership development — first-year track.' },
  { label: 'Leadership 215', description: 'Leadership development — second-year track.' },
  { label: 'Next Steps', description: 'A guide to your next steps in following Jesus.' },
  { label: 'Biblical Foundation', description: 'The Purple Book — a twelve-part Bible study to help you stand firm and grow strong in the Christian life.' },
  { label: 'Cleansing Stream', description: 'A discipleship course on walking in spiritual freedom.' },
  { label: 'Victory Weekend', description: 'A retreat to understand and walk in the freedom Christ won for us at the cross.' },
]

function SupplementalPanel({ material, onClose }: { material: Supplemental; onClose: () => void }) {
  return (
    <Panel title={material.label} color="#9AA7C7" onClose={onClose}>
      <p className="text-sm leading-relaxed text-[var(--fg-2)]">{material.description}</p>
      <p className="mt-4 text-xs text-[var(--fg-3)]">Ask your coach about going through this material.</p>
    </Panel>
  )
}

// ─── Nav config ───────────────────────────────────────────────────────────────
type PanelKind = 'Establish' | 'Equip' | 'Empower' | 'Engage' | 'engagements' | 'message' | 'prayer' | 'soaps' | 'shared'
const STAGE_KINDS: PanelKind[] = ['Establish', 'Equip', 'Empower', 'Engage']

type NavSection = {
  heading: string
  items: Array<{ id: PanelKind; label: string; dot: string }>
}

const NAV: NavSection[] = [
  {
    heading: 'Stages',
    items: [
      { id: 'Establish', label: 'Establish', dot: '#36D6C3' },
      { id: 'Equip',     label: 'Equip',     dot: '#5B8DF7' },
      { id: 'Empower',   label: 'Empower',   dot: '#F0729F' },
      { id: 'Engage',    label: 'Engage',    dot: '#F4B650' },
    ],
  },
  {
    heading: 'Connect',
    items: [
      { id: 'engagements', label: 'Engagements', dot: '#F4B650' },
      { id: 'message',     label: 'Message',     dot: '#7EB3FF' },
    ],
  },
  {
    heading: 'Spirit',
    items: [
      { id: 'prayer', label: 'Prayer', dot: '#9B80FF' },
      { id: 'soaps',  label: 'SOAPs',  dot: '#36D6C3' },
      { id: 'shared', label: 'Shared With Me', dot: '#36D6C3' },
    ],
  },
]

// ─── Shared With Me — SOAPs/prayers others have shared (constellation + group) ─
function SharedWithMePanel({ personId, onClose }: { personId: string; onClose: () => void }) {
  const feedItems = useConstellationFeed()
  return (
    <Panel title="Shared With Me" color="#36D6C3" onClose={onClose}>
      <p className="mb-3 text-xs text-[var(--fg-3)]">SOAPs and prayers others have shared with you.</p>
      <ConstellationFeedInline items={feedItems} />
      <SharedPrayerFeed personId={personId} scope="group" />
      <SharedSoapFeed personId={personId} scope="group" />
    </Panel>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function JourneyMenu({
  personId,
  levels,
  onSoaps,
  onMessage,
  onStepAction,
  onStepToggle,
  onRequestSignoff,
  soapStreak = 0,
  currentStreak = 0,
  unreadCount = 0,
  isAdmin = false,
  empowered = false,
}: {
  personId: string
  levels: JourneyLevel[]
  onSoaps: () => void
  onMessage: () => void
  onStepAction?: (step: JourneyStep) => void
  onStepToggle?: (step: JourneyStep) => void
  onRequestSignoff?: (stage: string) => void
  soapStreak?: number
  currentStreak?: number
  unreadCount?: number
  isAdmin?: boolean
  empowered?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<PanelKind | null>(null)
  const [panel, setPanel] = useState<PanelKind | null>(null)
  const [supplemental, setSupplemental] = useState<Supplemental | null>(null)
  // Instant hover tooltip for the count badges (custom, not the slow native one).
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)

  // Counts for the menu badges (fetched when the drawer first opens).
  const [counts, setCounts] = useState<{ eng7: number; prayerTotal: number; prayerAnswered: number; signoffs: number } | null>(null)
  useEffect(() => {
    if (!open || counts || !personId) return
    let cancelled = false
    ;(async () => {
      // Badges always reflect "Mine" — never the church-wide GBC view, even for
      // admins (getPrayerLifeForPerson with isAdmin=false stays scoped to you).
      const [engRes, prayerRes, signoffRes, confirmedRes] = await Promise.all([
        getAllEngagements(),
        getPrayerLifeForPerson(personId, false),
        getPendingLevelSignoffs(personId),
        getConfirmedEngagementIds(personId),
      ])
      if (cancelled) return
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const in7 = new Date(today); in7.setDate(today.getDate() + 7)
      const iso = (d: Date) => d.toISOString().split('T')[0]
      const next7Str = iso(in7)
      // "Mine": Pending, due on/before +7 (incl. overdue), that I own (created)
      // or have confirmed being part of.
      const confirmed = new Set((confirmedRes.data as string[]) ?? [])
      const eng7 = ((engRes.data as { id: string; follow_up_date: string | null; status: string; created_by_person_id: string | null }[]) ?? [])
        .filter(e => e.status === 'Pending' && e.follow_up_date && e.follow_up_date <= next7Str
          && (e.created_by_person_id === personId || confirmed.has(e.id))).length
      const prayers = (prayerRes.data as { status: string }[]) ?? []
      const prayerTotal = prayers.length
      const prayerAnswered = prayers.filter(p => p.status === 'Answered').length
      const signoffs = (signoffRes.data as unknown[] | null)?.length ?? 0
      setCounts({ eng7, prayerTotal, prayerAnswered, signoffs })
    })()
    return () => { cancelled = true }
  }, [open, counts, personId, isAdmin])

  // Badge text + hover tooltip per menu item.
  const badgeFor = (id: PanelKind): { text: string; title: string } | null => {
    if (id === 'Establish' || id === 'Equip' || id === 'Empower' || id === 'Engage') {
      const lvl = levels.find(l => l.stage === id)
      if (!lvl) return null
      const done = lvl.steps.filter(s => s.completed).length
      return { text: `${done}/${lvl.steps.length}`, title: `${id}: steps completed of total` }
    }
    if (id === 'engagements') return { text: `${counts?.eng7 ?? 0}`, title: 'Meetings in the next 7 days' }
    if (id === 'message') {
      const so = counts?.signoffs ?? 0
      return { text: so > 0 ? `${unreadCount}+${so}` : `${unreadCount}`, title: 'New messages + sign-off requests' }
    }
    if (id === 'prayer') return { text: `${counts?.prayerTotal ?? 0}/${counts?.prayerAnswered ?? 0}`, title: 'Prayers / answered' }
    if (id === 'soaps') return { text: `${currentStreak}/${soapStreak}`, title: 'Current streak / longest streak (days)' }
    return null
  }

  const handleItem = (id: PanelKind) => {
    setActive(id)
    setOpen(false)
    // Empowered people are coaches too — send these straight to the real
    // My Constellations pages rather than a My Journey overlay.
    if (empowered && (id === 'engagements' || id === 'prayer' || id === 'soaps')) {
      router.push(`/my-constellations?section=${id}`)
      return
    }
    if (id === 'soaps') { onSoaps(); return }
    if (id === 'message') { onMessage(); return }
    setPanel(id)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      {/* ── Hamburger trigger ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="fixed left-4 top-4 z-40 flex h-9 w-9 flex-col items-center justify-center gap-[5px] rounded-lg border border-[var(--line-2)] bg-[rgba(8,12,30,.75)] backdrop-blur-md transition-colors hover:border-[rgba(91,141,247,.5)]"
      >
        <span className="h-px w-4 rounded-full bg-[var(--fg-2)]" />
        <span className="h-px w-4 rounded-full bg-[var(--fg-2)]" />
        <span className="h-px w-4 rounded-full bg-[var(--fg-2)]" />
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(6,8,20,.45)', backdropFilter: 'blur(2px)' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Left drawer ── */}
      <div
        className="fixed left-0 top-0 z-50 h-full w-56 border-r border-[var(--line-2)] transition-transform duration-300 ease-in-out"
        style={{
          background: 'rgba(9,12,26,.98)',
          backdropFilter: 'blur(20px)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          boxShadow: open ? '12px 0 48px -8px rgba(0,0,0,.7)' : 'none',
        }}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-[var(--line-2)] px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--fg-3)]">My Journey</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded text-[10px] text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* nav */}
        <nav className="overflow-y-auto py-3">
          {NAV.map(section => (
            <div key={section.heading} className="mb-1">
              {/* section heading */}
              <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--fg-3)]">
                {section.heading}
              </p>
              {section.items.map(item => {
                const isActive = active === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItem(item.id)}
                    className="group flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-sm transition-colors"
                    style={{
                      color: isActive ? 'var(--fg-1)' : 'var(--fg-2)',
                      background: isActive ? 'rgba(91,141,247,.10)' : 'transparent',
                      borderLeft: isActive ? `2px solid ${item.dot}` : '2px solid transparent',
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full transition-opacity"
                      style={{
                        background: item.dot,
                        opacity: isActive ? 1 : 0.5,
                        boxShadow: isActive ? `0 0 6px 1px ${item.dot}` : 'none',
                      }}
                    />
                    <span className={`flex-1 ${isActive ? 'font-medium' : ''}`}>{item.label}</span>
                    {(() => {
                      const b = badgeFor(item.id)
                      if (!b) return null
                      return (
                        <span
                          onMouseEnter={(e) => {
                            const r = e.currentTarget.getBoundingClientRect()
                            setTip({ text: b.title, x: r.right + 10, y: r.top + r.height / 2 })
                          }}
                          onMouseLeave={() => setTip(null)}
                          className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                          style={{ background: `${item.dot}22`, color: item.dot, border: `1px solid ${item.dot}55` }}
                        >
                          {b.text}
                        </span>
                      )
                    })()}
                  </button>
                )
              })}
            </div>
          ))}

          {/* Supplemental materials — reference resources, not journey steps */}
          <div className="mb-1">
            <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--fg-3)]">
              Supplemental Materials
            </p>
            {SUPPLEMENTAL.map(m => (
              <button
                key={m.label}
                type="button"
                onClick={() => { setOpen(false); setSupplemental(m) }}
                className="group flex w-full items-center gap-2.5 px-3 py-[7px] text-left text-sm text-[var(--fg-2)] transition-colors hover:text-[var(--fg-1)]"
                style={{ borderLeft: '2px solid transparent' }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: '#9AA7C7', opacity: 0.5 }} />
                <span className="flex-1">{m.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* footer ornament */}
        <div className="absolute bottom-5 left-0 right-0 text-center">
          <span className="text-base" style={{ color: 'rgba(91,141,247,.2)' }}>✦</span>
        </div>
      </div>

      {/* ── Content panels ── */}
      {panel && STAGE_KINDS.includes(panel) && levels.find(l => l.stage === panel) && (
        <StagePanel
          level={levels.find(l => l.stage === panel)!}
          onClose={() => setPanel(null)}
          onStepAction={(s) => { setPanel(null); onStepAction?.(s) }}
          onStepToggle={onStepToggle}
          onRequestSignoff={onRequestSignoff}
        />
      )}
      {/* Non-empowered disciples get the simple personal panels here; empowered
          people are routed to the full My Constellations pages instead. */}
      {panel === 'prayer'      && <PrayerPanel       personId={personId} isAdmin={isAdmin} onClose={() => setPanel(null)} />}
      {panel === 'engagements' && <EngagementsPanel  personId={personId} onClose={() => setPanel(null)} />}
      {panel === 'shared'      && <SharedWithMePanel personId={personId} onClose={() => setPanel(null)} />}
      {supplemental && <SupplementalPanel material={supplemental} onClose={() => setSupplemental(null)} />}

      {/* Instant badge tooltip — rendered outside the (transformed) drawer so
          fixed positioning uses real viewport coordinates. */}
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
