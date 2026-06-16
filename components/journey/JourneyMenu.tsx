'use client'

import { useEffect, useState } from 'react'
import {
  getStageChecklistItems,
  getPrayerRequestsByPerson,
  getEngagementsByPerson,
  addPrayerRequest,
} from '../../lib/supabaseQueries'
import { stageChecklistTemplates } from '../../lib/stageChecklistTemplates'
import type { Engagement, PrayerRequest, Stage, StageChecklistItem } from '../../types/database'

// ─── colour tokens ────────────────────────────────────────────────────────────
const STAGE_GLOW: Record<string, string> = {
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

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

// ─── Stage checklist panel ────────────────────────────────────────────────────
function StagePanel({ stage, personId, onClose }: { stage: Stage; personId: string; onClose: () => void }) {
  const [items, setItems] = useState<StageChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const glow = STAGE_GLOW[stage] ?? '#FBF6EC'

  useEffect(() => {
    getStageChecklistItems(personId).then(({ data }) => {
      if (data) setItems(data as StageChecklistItem[])
      setLoading(false)
    })
  }, [personId])

  const template = stageChecklistTemplates[stage] ?? []
  const completedKeys = new Set(
    items.filter(i => i.completed && i.stage === stage).map(i => i.label)
  )
  const done = template.filter(t => completedKeys.has(t.label)).length

  return (
    <Panel title={stage} color={glow} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-8">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: glow }} />
        </div>
      ) : (
        <>
          <div className="mb-1 h-1 overflow-hidden rounded-full bg-[var(--indigo-2)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: template.length ? `${Math.round((done / template.length) * 100)}%` : '0%', background: glow }}
            />
          </div>
          <p className="mb-4 text-xs text-[var(--fg-3)]">{done} of {template.length} completed</p>
          <div className="space-y-2">
            {template.map(t => {
              const checked = completedKeys.has(t.label)
              return (
                <div
                  key={t.label}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: checked ? `${glow}10` : 'var(--indigo-2)' }}
                >
                  <span
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold"
                    style={{
                      borderColor: checked ? glow : 'var(--line-2)',
                      background: checked ? glow : 'transparent',
                      color: checked ? 'var(--void)' : 'transparent',
                    }}
                  >
                    ✓
                  </span>
                  <div>
                    <p className="text-sm leading-snug" style={{ color: checked ? 'var(--fg-1)' : 'var(--fg-2)' }}>
                      {t.label}
                    </p>
                    {'description' in t && (t as { description?: string }).description && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--fg-3)]">{(t as { description?: string }).description}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Panel>
  )
}

// ─── Prayer panel ─────────────────────────────────────────────────────────────
function PrayerPanel({ personId, onClose }: { personId: string; onClose: () => void }) {
  const [requests, setRequests] = useState<PrayerRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () =>
    getPrayerRequestsByPerson(personId).then(({ data }) => {
      if (data) setRequests(data as PrayerRequest[])
      setLoading(false)
    })

  useEffect(() => { load() }, [personId])

  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    await addPrayerRequest({ person_id: personId, request: text.trim(), status: 'Active', answered_date: null, answer_notes: null })
    setText('')
    await load()
    setSaving(false)
  }

  return (
    <Panel title="Prayer" color="#9B80FF" onClose={onClose}>
      <div className="mb-5 flex gap-2">
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

  useEffect(() => {
    getEngagementsByPerson(personId).then(({ data }) => {
      if (data) setEngagements(data as Engagement[])
      setLoading(false)
    })
  }, [personId])

  const upcoming = engagements.filter(e => e.status !== 'Completed')
  const past = engagements.filter(e => e.status === 'Completed')

  return (
    <Panel title="Engagements" color="#F4B650" onClose={onClose}>
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

// ─── Nav config ───────────────────────────────────────────────────────────────
type PanelKind = 'Establish' | 'Equip' | 'Empower' | 'engagements' | 'message' | 'prayer' | 'soaps'

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
    ],
  },
]

// ─── Main export ──────────────────────────────────────────────────────────────
export default function JourneyMenu({
  personId,
  onSoaps,
  onMessage,
}: {
  personId: string
  onSoaps: () => void
  onMessage: () => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<PanelKind | null>(null)
  const [panel, setPanel] = useState<PanelKind | null>(null)

  const handleItem = (id: PanelKind) => {
    setActive(id)
    setOpen(false)
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
                    <span className={isActive ? 'font-medium' : ''}>{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </nav>

        {/* footer ornament */}
        <div className="absolute bottom-5 left-0 right-0 text-center">
          <span className="text-base" style={{ color: 'rgba(91,141,247,.2)' }}>✦</span>
        </div>
      </div>

      {/* ── Content panels ── */}
      {panel === 'Establish'   && <StagePanel stage="Establish" personId={personId} onClose={() => setPanel(null)} />}
      {panel === 'Equip'       && <StagePanel stage="Equip"     personId={personId} onClose={() => setPanel(null)} />}
      {panel === 'Empower'     && <StagePanel stage="Empower"   personId={personId} onClose={() => setPanel(null)} />}
      {panel === 'prayer'      && <PrayerPanel       personId={personId} onClose={() => setPanel(null)} />}
      {panel === 'engagements' && <EngagementsPanel  personId={personId} onClose={() => setPanel(null)} />}
    </>
  )
}
