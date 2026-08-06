'use client'

import { useEffect, useMemo, useState } from 'react'
import { addEngagement, addMeetingParticipants, getPeople } from '../lib/supabaseQueries'
import { useAuth } from '../contexts/AuthContext'
import type { MeetingType, Person } from '../types/database'
import { type Recurrence, RECURRENCE_OPTIONS, recurrenceDatesMultiDay, recurrenceLabel } from '../lib/recurrence'
import { WEEKDAY_NAMES } from '../lib/meetingDays'

const MEETING_TYPES: MeetingType[] = ['One2One', 'Making Disciples', 'Coffee', 'Church Community', 'Empowering Leaders']

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// A standalone "new meeting" — not anchored to anyone's profile. You search and
// add everyone from scratch. You (the creator) own it; everyone you add is
// invited and confirms before it lands on their page.
export default function NewMeetingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth()
  const [description, setDescription] = useState('')
  const [meetingType, setMeetingType] = useState<MeetingType | ''>('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [location, setLocation] = useState('')
  const [recurrence, setRecurrence] = useState<Recurrence>('none')
  const [repeatUntil, setRepeatUntil] = useState('')
  // Extra weekdays for weekly cadences — a recurring 1:1 can meet on several
  // days a week. The start date's own weekday is always included.
  const [repeatDays, setRepeatDays] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [people, setPeople] = useState<Person[]>([])
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  useEffect(() => {
    getPeople().then(({ data }) => { if (data) setPeople(data as Person[]) })
  }, [])
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return people
      .filter(p => p.id !== profile?.id && !participantIds.includes(p.id))
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [search, people, profile?.id, participantIds])
  const nameOf = (id: string) => people.find(p => p.id === id)?.name ?? 'Someone'

  const isWeeklyCadence = recurrence === 'weekly' || recurrence === 'biweekly' || recurrence === 'triweekly'
  const startWeekday = date ? new Date(date + 'T00:00:00').getDay() : null
  const allRepeatDays = startWeekday === null ? repeatDays : [...new Set([startWeekday, ...repeatDays])]
  const plannedDates = useMemo(() => {
    if (recurrence === 'none' || !date || !repeatUntil) return [date || '']
    return recurrenceDatesMultiDay(date, repeatUntil, recurrence, isWeeklyCadence ? allRepeatDays : [])
  }, [recurrence, date, repeatUntil, isWeeklyCadence, allRepeatDays.join(',')])
  const repeatCount = recurrence !== 'none' && date && repeatUntil ? plannedDates.length : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) { setError('Add a description.'); return }
    if (participantIds.length === 0) { setError('Add at least one person.'); return }
    if (!profile) return
    setLoading(true)
    setError('')

    for (const d of plannedDates) {
      const { data: eng, error: insErr } = await addEngagement({
        person_id: participantIds[0],
        created_by_person_id: profile.id,
        description: description.trim(),
        follow_up_date: d || null,
        follow_up_time: time || null,
        location: location.trim() || null,
        meeting_type: meetingType || null,
        status: 'Pending',
      })
      if (insErr) { setError(insErr.message || 'Could not create the meeting.'); setLoading(false); return }
      if (eng) await addMeetingParticipants(eng.id, participantIds, 'invited')
    }
    setLoading(false)
    onCreated()
    onClose()
  }

  const inputClass = 'rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none'

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" style={{ background: 'rgba(6,8,20,.65)', backdropFilter: 'blur(4px)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <form
        onSubmit={handleSubmit}
        className="jy-rise-in w-full max-w-lg space-y-3 overflow-y-auto rounded-t-[var(--r-xl)] border border-b-0 border-[var(--line-2)] p-5 sm:rounded-[var(--r-xl)] sm:border-b"
        style={{ background: 'var(--indigo)', maxHeight: '88vh' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>New meeting</h2>
          <button type="button" onClick={onClose} className="text-lg leading-none text-[var(--fg-3)] hover:text-[var(--fg-1)]">×</button>
        </div>

        {error && <p className="text-xs text-[#F2728A]">{error}</p>}

        {/* Participants — search and add from scratch */}
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">With</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {participantIds.map(id => (
              <span key={id} className="flex items-center gap-1 rounded-full bg-[rgba(91,141,247,.15)] px-2 py-0.5 text-xs font-medium text-[var(--fg-1)]">
                {nameOf(id)}
                <button type="button" onClick={() => setParticipantIds(prev => prev.filter(x => x !== id))} className="text-[var(--fg-3)] hover:text-[var(--fg-1)]">×</button>
              </span>
            ))}
            <div className="relative flex-1 min-w-[140px]">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={participantIds.length ? 'add another…' : 'Search people…'}
                className={`${inputClass} w-full`}
              />
              {matches.length > 0 && (
                <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] shadow-lg">
                  {matches.map(p => (
                    <button key={p.id} type="button" onClick={() => { setParticipantIds(prev => [...prev, p.id]); setSearch('') }} className="block w-full px-2.5 py-1.5 text-left text-sm text-[var(--fg-1)] hover:bg-[var(--indigo-2)]">
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What's the meeting?" className={`${inputClass} w-full`} />

        <div className="flex flex-wrap gap-1.5">
          <select value={meetingType} onChange={e => setMeetingType(e.target.value as MeetingType | '')} className={`${inputClass} w-40`}>
            <option value="">Meeting type…</option>
            {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${inputClass} w-32`} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} className={`${inputClass} w-24`} />
          <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Location…" className={`${inputClass} flex-1 min-w-[100px]`} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--fg-3)]">Repeats</span>
          <select value={recurrence} disabled={!date} onChange={e => { const v = e.target.value as Recurrence; setRecurrence(v); if (v === 'none') setRepeatUntil('') }} className={`${inputClass} w-44 ${date ? '' : 'cursor-not-allowed opacity-40'}`}>
            {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {recurrence !== 'none' && date && (
            <>
              <span className="text-xs text-[var(--fg-3)]">until</span>
              <input type="date" value={repeatUntil} min={addDaysStr(date, 1)} onChange={e => setRepeatUntil(e.target.value)} className={`${inputClass} w-32`} required />
              {repeatCount > 1 && <span className="text-[10px] text-[var(--fg-3)]">{recurrenceLabel(recurrence, date)}{allRepeatDays.length > 1 ? ` on ${allRepeatDays.length} days` : ''} · {repeatCount} meetings</span>}
            </>
          )}
        </div>

        {/* Which days of the week — a recurring 1:1 can meet several days a week.
            The start date's weekday is always part of the series. */}
        {isWeeklyCadence && date && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-xs text-[var(--fg-3)]">on</span>
            {WEEKDAY_NAMES.map((day, i) => {
              const isStart = i === startWeekday
              const on = isStart || repeatDays.includes(i)
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isStart}
                  title={isStart ? 'Start date — always included' : undefined}
                  onClick={() => setRepeatDays(prev => on ? prev.filter(d => d !== i) : [...prev, i])}
                  className={`rounded-full border px-2 py-1 text-[11px] font-semibold transition-all ${on ? 'border-[var(--gbm-cobalt-bright)] bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]' : 'border-[var(--line-2)] bg-[var(--indigo-2)] text-[var(--fg-2)] hover:border-[var(--line-3)]'} ${isStart ? 'opacity-90' : ''}`}
                >
                  {day.slice(0, 3)}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="cn-chip">Cancel</button>
          <button type="submit" disabled={loading} className="cn-btn cn-btn-primary !px-4 !py-1.5 !text-xs disabled:opacity-50">
            {loading ? 'Creating…' : repeatCount > 1 ? `Create ${repeatCount} meetings` : 'Create meeting'}
          </button>
        </div>
      </form>
    </div>
  )
}
