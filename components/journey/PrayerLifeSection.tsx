'use client'

import { useEffect, useMemo, useState } from 'react'
import { getPrayerLifeForPerson, addPrayerRequest, deletePrayerRequest, markPrayerAnswered } from '../../lib/supabaseQueries'
import type { PrayerRequest, ShareVisibility, Stage } from '../../types/database'

/*
 * PrayerLifeSection — the disciple's whole prayer life as a first-class
 * destination (native's Prayer tab). Add a request/praise, choose who sees it,
 * and see the running list grouped by person into cards. Each request can be
 * individually marked answered or deleted (own entries always; any entry if you
 * are an admin/coach). Answered ones drop into their own section.
 */
type PrayerRow = PrayerRequest & { people?: { name: string; current_stage?: Stage | null } | null }

type PersonGroup = {
  personId: string
  name: string
  isOwn: boolean
  stage: Stage | null
  requests: PrayerRow[]
}

// The person's avatar circle is tinted by their journey stage (falls back to the
// house purple when the stage is unknown), matching the constellation stage hues.
const STAGE_COLORS: Record<Stage, string> = {
  Engage: 'var(--engage)',
  Establish: 'var(--establish)',
  Equip: 'var(--equip)',
  Empower: 'var(--empower)',
}
const stageColorOf = (stage: Stage | null) => (stage ? STAGE_COLORS[stage] : '#9B80FF')

const PRAYER_SCOPES: { value: ShareVisibility; label: string }[] = [
  { value: 'private', label: 'Just me' },
  { value: 'coach', label: 'My coach' },
  { value: 'group', label: 'My group' },
  { value: 'constellation', label: 'Everyone' },
]

const initialsOf = (name: string) =>
  name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'

export default function PrayerLifeSection({ personId, isAdmin = false }: { personId: string; isAdmin?: boolean }) {
  const [requests, setRequests] = useState<PrayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>('private')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () =>
    getPrayerLifeForPerson(personId, isAdmin).then(({ data }) => {
      if (data) setRequests(data as PrayerRow[])
      setLoading(false)
    })

  useEffect(() => { load() }, [personId]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    await addPrayerRequest({ person_id: personId, request: text.trim(), status: 'Active', answered_date: null, answer_notes: null, visibility })
    setText('')
    await load()
    setSaving(false)
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this prayer request? This cannot be undone.')) return
    setBusyId(id)
    const prev = requests
    setRequests(rs => rs.filter(r => r.id !== id)) // optimistic
    const { error } = await deletePrayerRequest(id)
    if (error) { setRequests(prev); alert('Could not delete. Please try again.') }
    setBusyId(null)
  }

  const answer = async (id: string) => {
    setBusyId(id)
    const prev = requests
    const today = new Date().toISOString().split('T')[0]
    // optimistic — moves the request into the Answered section
    setRequests(rs => rs.map(r => (r.id === id ? { ...r, status: 'Answered' as const, answered_date: today } : r)))
    const { error } = await markPrayerAnswered(id)
    if (error) { setRequests(prev); alert('Could not mark answered. Please try again.') }
    setBusyId(null)
  }

  const groupByPerson = (rows: PrayerRow[]): PersonGroup[] => {
    const m = new Map<string, PersonGroup>()
    for (const r of rows) {
      let g = m.get(r.person_id)
      if (!g) {
        g = { personId: r.person_id, name: r.people?.name ?? (r.person_id === personId ? 'You' : 'A disciple'), isOwn: r.person_id === personId, stage: r.people?.current_stage ?? null, requests: [] }
        m.set(r.person_id, g)
      }
      g.requests.push(r)
    }
    // your own card first, then most requests first
    return Array.from(m.values()).sort((a, b) =>
      a.isOwn === b.isOwn ? b.requests.length - a.requests.length : a.isOwn ? -1 : 1
    )
  }

  const activeGroups = useMemo(() => groupByPerson(requests.filter(r => r.status !== 'Answered')), [requests]) // eslint-disable-line react-hooks/exhaustive-deps
  const answeredGroups = useMemo(() => groupByPerson(requests.filter(r => r.status === 'Answered')), [requests]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderCard = (g: PersonGroup, answered: boolean) => {
    const canManage = g.isOwn || isAdmin
    const stageColor = stageColorOf(g.stage)
    return (
      <div key={g.personId} className="group/card rounded-xl border border-[var(--line-1)] p-3" style={{ background: 'var(--indigo-2)' }}>
        <div className="flex items-start gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: 'var(--indigo)', border: `2px solid ${stageColor}`, color: stageColor }}
          >
            {initialsOf(g.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-[var(--fg-1)]">{g.name}</span>
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(155,128,255,.15)', color: '#9B80FF' }}>
                {g.requests.length}
              </span>
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {g.requests.map(r => (
                <li key={r.id} className="group/row flex items-start gap-1.5 text-xs">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: r.is_praise ? 'var(--gold)' : '#9B80FF' }} />
                  <span className="flex-1 leading-relaxed text-[var(--fg-2)]">
                    {r.media_url && <span title="Has a video">🎥 </span>}{r.request}
                    {answered && r.answer_notes && <span className="ml-1 text-[var(--establish)]">— {r.answer_notes}</span>}
                  </span>
                  {canManage && busyId === r.id ? (
                    <span className="mt-0.5 block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-[var(--fg-3)]" />
                  ) : canManage ? (
                    <>
                      {!answered && (
                        <button
                          type="button"
                          onClick={() => answer(r.id)}
                          title="Mark answered"
                          aria-label="Mark prayer answered"
                          className="shrink-0 rounded p-0.5 text-[var(--fg-3)] opacity-70 transition-colors hover:bg-[rgba(54,214,195,.15)] hover:text-[var(--establish)] hover:opacity-100"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        title="Delete"
                        aria-label="Delete prayer request"
                        className="shrink-0 rounded p-0.5 text-[var(--fg-3)] opacity-70 transition-colors hover:bg-[rgba(240,114,159,.15)] hover:text-[var(--danger)] hover:opacity-100"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
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
        <div className="space-y-6">
          {activeGroups.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--fg-3)]">Praying now</h3>
              <div className="space-y-2">{activeGroups.map(g => renderCard(g, false))}</div>
            </div>
          )}
          {answeredGroups.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--establish)]">Answered</h3>
              <div className="space-y-2">{answeredGroups.map(g => renderCard(g, true))}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
