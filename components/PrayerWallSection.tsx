'use client'

import { useEffect, useState, useMemo } from 'react'
import { getPrayerLifeForPerson, getConstellationPrayerRequests, getPeople, addPraise, addPrayerRequest, deletePrayerRequest, markPrayerAnswered } from '../lib/supabaseQueries'
import PersonSearchSelect from './PersonSearchSelect'
import type { PrayerRequest, Person, Stage } from '../types/database'

interface PrayerWallSectionProps {
  refreshKey?: number
  onPersonClick?: (person: Person) => void
  onChanged?: () => void
  viewerPersonId?: string
  isAdmin?: boolean
}

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

type GroupedRequests = {
  person: Person | undefined
  requests: PrayerRequest[]
}

function DeleteBtn({ id, onDelete }: { id: string; onDelete?: (id: string) => void }) {
  if (!onDelete) return null
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onDelete(id) }}
      title="Delete"
      aria-label="Delete prayer request"
      className="shrink-0 rounded p-0.5 text-[var(--fg-3)] opacity-0 transition-colors hover:bg-[rgba(240,114,159,.15)] hover:text-[var(--danger)] group-hover:opacity-100"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  )
}

function AnswerBtn({ id, onAnswer }: { id: string; onAnswer?: (id: string) => void }) {
  if (!onAnswer) return null
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onAnswer(id) }}
      title="Mark answered"
      aria-label="Mark prayer answered"
      className="shrink-0 rounded p-0.5 text-[var(--fg-3)] opacity-0 transition-colors hover:bg-[rgba(54,214,195,.15)] hover:text-[var(--establish)] group-hover:opacity-100"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
  )
}

function PrayerCard({
  group,
  onClick,
  onDelete,
  onAnswer,
}: {
  group: GroupedRequests
  onClick?: () => void
  onDelete?: (id: string) => void
  onAnswer?: (id: string) => void
}) {
  const { person, requests } = group
  const stageColor = person ? STAGE_COLORS[person.current_stage] : 'var(--fg-3)'
  const initials = person
    ? person.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  return (
    <div
      onClick={onClick}
      className={`group rounded-xl border border-[var(--line-1)] p-3 transition-all ${onClick ? 'cursor-pointer hover:border-[var(--line-2)]' : ''}`}
      style={{ background: 'var(--indigo-2)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            background: 'var(--indigo)',
            border: `2px solid ${stageColor}`,
            color: stageColor,
          }}
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-[var(--fg-1)]">
              {person?.name ?? 'Unknown'}
            </span>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: 'rgba(244,182,80,.15)', color: 'var(--engage)' }}
            >
              {requests.length}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {requests.map(req => (
              <li key={req.id} className="group flex items-start gap-1.5 text-xs text-[var(--fg-2)]">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--engage)]" />
                <span className="line-clamp-2 flex-1">{req.media_url && <span title="Has a video">🎥 </span>}{req.request}</span>
                <AnswerBtn id={req.id} onAnswer={onAnswer} />
                <DeleteBtn id={req.id} onDelete={onDelete} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

function PraiseCard({
  group,
  onClick,
  onDelete,
}: {
  group: GroupedRequests
  onClick?: () => void
  onDelete?: (id: string) => void
}) {
  const { person, requests } = group
  const stageColor = person ? STAGE_COLORS[person.current_stage] : 'var(--fg-3)'
  const initials = person
    ? person.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '?'

  return (
    <div
      onClick={onClick}
      className={`group rounded-xl border border-[var(--line-1)] p-3 transition-all ${onClick ? 'cursor-pointer hover:border-[var(--line-2)]' : ''}`}
      style={{
        background: 'linear-gradient(135deg, rgba(54,214,195,.08) 0%, var(--indigo-2) 100%)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
          style={{
            background: 'var(--indigo)',
            border: `2px solid ${stageColor}`,
            color: stageColor,
          }}
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-[var(--fg-1)]">
              {person?.name ?? 'Unknown'}
            </span>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
            >
              ✓ {requests.length}
            </span>
          </div>
          <ul className="mt-1.5 space-y-1">
            {requests.map(req => (
              <li key={req.id} className="group flex items-start gap-1.5 text-xs">
                <span className="flex-1">
                  <span className={req.is_praise ? 'text-[var(--fg-2)]' : 'text-[var(--fg-3)] line-through'}>{req.media_url && <span title="Has a video">🎥 </span>}{req.request}</span>
                  {req.answer_notes && (
                    <span className="ml-1 text-[var(--establish)]">— {req.answer_notes}</span>
                  )}
                </span>
                <DeleteBtn id={req.id} onDelete={onDelete} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function PrayerWallSection({
  refreshKey = 0,
  onPersonClick,
  onChanged,
  viewerPersonId,
  isAdmin = false,
}: PrayerWallSectionProps) {
  const [requests, setRequests] = useState<PrayerRequest[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [isExpanded, setIsExpanded] = useState(true)
  const [showPraiseForm, setShowPraiseForm] = useState(false)
  const [praisePersonId, setPraisePersonId] = useState('')
  const [praiseText, setPraiseText] = useState('')
  const [savingPraise, setSavingPraise] = useState(false)
  const [showPrayerForm, setShowPrayerForm] = useState(false)
  const [prayerPersonId, setPrayerPersonId] = useState('')
  const [prayerText, setPrayerText] = useState('')
  const [savingPrayer, setSavingPrayer] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [requestsResult, peopleResult] = await Promise.race([
        Promise.all([
          viewerPersonId ? getPrayerLifeForPerson(viewerPersonId, isAdmin) : getConstellationPrayerRequests(),
          getPeople(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])

      if (requestsResult.data) setRequests(requestsResult.data as PrayerRequest[])
      if (peopleResult.data) setPeople(peopleResult.data as Person[])
    } catch (err) {
      console.error('PrayerWallSection load error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, viewerPersonId, isAdmin])

  const peopleById = useMemo(() => {
    return new Map(people.map(p => [p.id, p]))
  }, [people])

  const activeRequests = useMemo(() => {
    return requests.filter(r => r.status === 'Active')
  }, [requests])

  const answeredRequests = useMemo(() => {
    return requests.filter(r => r.status === 'Answered')
  }, [requests])

  const groupedActive = useMemo(() => {
    const groups = new Map<string, PrayerRequest[]>()
    activeRequests.forEach(req => {
      const list = groups.get(req.person_id) || []
      list.push(req)
      groups.set(req.person_id, list)
    })
    return Array.from(groups.entries())
      .map(([personId, reqs]) => ({
        person: peopleById.get(personId),
        requests: reqs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      }))
      .sort((a, b) => b.requests.length - a.requests.length)
  }, [activeRequests, peopleById])

  const groupedAnswered = useMemo(() => {
    const groups = new Map<string, PrayerRequest[]>()
    answeredRequests.forEach(req => {
      const list = groups.get(req.person_id) || []
      list.push(req)
      groups.set(req.person_id, list)
    })
    return Array.from(groups.entries())
      .map(([personId, reqs]) => ({
        person: peopleById.get(personId),
        requests: reqs.sort((a, b) => {
          const dateA = a.answered_date ? new Date(a.answered_date).getTime() : 0
          const dateB = b.answered_date ? new Date(b.answered_date).getTime() : 0
          return dateB - dateA
        }),
      }))
      .sort((a, b) => b.requests.length - a.requests.length)
  }, [answeredRequests, peopleById])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prayer request? This cannot be undone.')) return
    const prev = requests
    setRequests(rs => rs.filter(r => r.id !== id)) // optimistic
    const { error } = await deletePrayerRequest(id)
    if (error) { setRequests(prev); alert('Could not delete. Please try again.'); return }
    onChanged?.()
  }

  const handleAnswer = async (id: string) => {
    const prev = requests
    const today = new Date().toISOString().split('T')[0]
    // optimistic — moves it from the Prayer Wall to the Praise Wall
    setRequests(rs => rs.map(r => (r.id === id ? { ...r, status: 'Answered' as const, answered_date: today } : r)))
    const { error } = await markPrayerAnswered(id)
    if (error) { setRequests(prev); alert('Could not mark answered. Please try again.'); return }
    onChanged?.()
  }

  const handleAddPraise = async () => {
    if (!praisePersonId || !praiseText.trim()) return
    setSavingPraise(true)
    const { error } = await addPraise(praisePersonId, praiseText.trim(), null, 'private')
    if (!error) {
      setPraisePersonId('')
      setPraiseText('')
      setShowPraiseForm(false)
      await loadData()
      onChanged?.()
    }
    setSavingPraise(false)
  }

  const handleAddPrayer = async () => {
    if (!prayerPersonId || !prayerText.trim()) return
    setSavingPrayer(true)
    const { error } = await addPrayerRequest({
      person_id: prayerPersonId,
      request: prayerText.trim(),
      status: 'Active',
      answered_date: null,
      answer_notes: null,
      visibility: 'private',
    })
    if (!error) {
      setPrayerPersonId('')
      setPrayerText('')
      setShowPrayerForm(false)
      await loadData()
      onChanged?.()
    }
    setSavingPrayer(false)
  }

  if (loading) {
    return null
  }

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="cn-h3">Prayer Wall</h2>
          <span className="cn-chip !py-0.5 !text-xs">{requests.length}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { setShowPrayerForm(!showPrayerForm); setShowPraiseForm(false) }}
            className="rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{ background: 'rgba(155,128,255,.15)', color: '#9B80FF' }}
          >
            + Add Prayer
          </button>
          <button
            type="button"
            onClick={() => { setShowPraiseForm(!showPraiseForm); setShowPrayerForm(false) }}
            className="rounded-full px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
          >
            + Add Praise
          </button>
          {activeRequests.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'rgba(244,182,80,.15)', color: 'var(--engage)' }}
            >
              {activeRequests.length} active
            </span>
          )}
          {answeredRequests.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
            >
              {answeredRequests.length} answered
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="cn-chip"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      <p className="mt-1 text-sm text-[var(--fg-2)]">
        Prayer requests and answered prayers across all people
      </p>

      {showPrayerForm && (
        <div className="mt-3 rounded-lg border bg-[var(--indigo)] p-3" style={{ borderColor: '#9B80FF' }}>
          <div className="mb-2 text-xs font-semibold" style={{ color: '#9B80FF' }}>Add Prayer Request</div>
          <div className="space-y-2">
            <PersonSearchSelect people={people} value={prayerPersonId} onChange={setPrayerPersonId} />
            <textarea
              value={prayerText}
              onChange={(e) => setPrayerText(e.target.value)}
              placeholder="What are you praying for?"
              rows={2}
              className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddPrayer}
                disabled={savingPrayer || !prayerPersonId || !prayerText.trim()}
                className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: '#9B80FF', color: 'var(--void)' }}
              >
                {savingPrayer ? 'Adding...' : 'Add Prayer'}
              </button>
              <button
                type="button"
                onClick={() => { setShowPrayerForm(false); setPrayerPersonId(''); setPrayerText('') }}
                className="rounded-lg border border-[var(--line-2)] px-3 py-2 text-xs text-[var(--fg-2)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showPraiseForm && (
        <div className="mt-3 rounded-lg border border-[var(--establish)] bg-[var(--indigo)] p-3">
          <div className="mb-2 text-xs font-semibold text-[var(--establish)]">Add Testimony / Praise</div>
          <div className="space-y-2">
            <PersonSearchSelect people={people} value={praisePersonId} onChange={setPraisePersonId} />
            <textarea
              value={praiseText}
              onChange={(e) => setPraiseText(e.target.value)}
              placeholder="What's the testimony or praise?"
              rows={2}
              className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--establish)] focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddPraise}
                disabled={savingPraise || !praisePersonId || !praiseText.trim()}
                className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: 'var(--establish)', color: 'var(--void)' }}
              >
                {savingPraise ? 'Adding...' : 'Add Praise'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPraiseForm(false)
                  setPraisePersonId('')
                  setPraiseText('')
                }}
                className="rounded-lg border border-[var(--line-2)] px-3 py-2 text-xs text-[var(--fg-2)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Prayer Wall */}
          {groupedActive.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--engage)]">✦ Prayer Wall</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'rgba(244,182,80,.15)', color: 'var(--engage)' }}
                >
                  {activeRequests.length}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groupedActive.map(group => (
                  <PrayerCard
                    key={group.person?.id ?? 'unknown'}
                    group={group}
                    onClick={
                      onPersonClick && group.person
                        ? () => onPersonClick(group.person!)
                        : undefined
                    }
                    onDelete={handleDelete}
                    onAnswer={handleAnswer}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Praise Wall */}
          {groupedAnswered.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--establish)]">✦ Praise Wall</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: 'rgba(54,214,195,.15)', color: 'var(--establish)' }}
                >
                  {answeredRequests.length}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {groupedAnswered.map(group => (
                  <PraiseCard
                    key={group.person?.id ?? 'unknown'}
                    group={group}
                    onClick={
                      onPersonClick && group.person
                        ? () => onPersonClick(group.person!)
                        : undefined
                    }
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
