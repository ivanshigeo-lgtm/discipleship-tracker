'use client'

import { useEffect, useState } from 'react'
import { getPrayerLifeForPerson, addPrayerRequest, deletePrayerRequest } from '../../lib/supabaseQueries'
import type { PrayerRequest, ShareVisibility } from '../../types/database'

/*
 * PrayerLifeSection — the disciple's whole prayer life as a first-class
 * destination (native's Prayer tab), lifted out of the old menu overlay so it
 * lives inline in the page. Add a request/praise, choose who sees it, and see
 * the running list. Coaches get the church-wide wall elsewhere.
 */
type PrayerRow = PrayerRequest & { people?: { name: string } | null }

const PRAYER_SCOPES: { value: ShareVisibility; label: string }[] = [
  { value: 'private', label: 'Just me' },
  { value: 'coach', label: 'My coach' },
  { value: 'group', label: 'My group' },
  { value: 'constellation', label: 'Everyone' },
]

export default function PrayerLifeSection({ personId, isAdmin = false }: { personId: string; isAdmin?: boolean }) {
  const [requests, setRequests] = useState<PrayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [visibility, setVisibility] = useState<ShareVisibility>('private')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
    setDeletingId(id)
    const prev = requests
    setRequests(rs => rs.filter(r => r.id !== id)) // optimistic
    const { error } = await deletePrayerRequest(id)
    if (error) { setRequests(prev); alert('Could not delete. Please try again.') }
    setDeletingId(null)
  }

  const active = requests.filter(r => r.status !== 'Answered')
  const answered = requests.filter(r => r.status === 'Answered')

  const renderCard = (r: PrayerRow) => (
    <div
      key={r.id}
      className="rounded-xl px-3 py-2.5"
      style={{ background: r.is_praise ? 'rgba(242,200,121,.08)' : 'var(--indigo-2)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: r.is_praise ? 'var(--gold)' : '#9B80FF' }}>
            {r.is_praise ? '✦ Praise' : '✦ Prayer'}
          </span>
          {r.person_id !== personId && r.people?.name && (
            <span className="ml-2 text-[10px] font-semibold text-[var(--fg-2)]">{r.people.name}</span>
          )}
          {r.status === 'Answered' && (
            <span className="ml-2 rounded-full bg-[rgba(54,214,195,.15)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--establish)]">Answered</span>
          )}
        </div>
        {r.person_id === personId && (
          <button
            type="button"
            onClick={() => remove(r.id)}
            disabled={deletingId === r.id}
            title="Delete"
            aria-label="Delete prayer request"
            className="shrink-0 rounded-md p-1 text-[var(--fg-3)] transition-colors hover:bg-[rgba(240,114,159,.12)] hover:text-[var(--danger)] disabled:opacity-40"
          >
            {deletingId === r.id ? (
              <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            )}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-[var(--fg-2)]">{r.request}</p>
      {r.media_url && <video src={r.media_url} controls playsInline className="mt-2 w-full rounded-lg" style={{ maxHeight: 240, background: '#000' }} />}
    </div>
  )

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
          {active.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--fg-3)]">Praying now</h3>
              <div className="space-y-2">{active.map(renderCard)}</div>
            </div>
          )}
          {answered.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--establish)]">Answered</h3>
              <div className="space-y-2">{answered.map(renderCard)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
