'use client'

import { useState } from 'react'
import { upsertStageChecklistItem, updatePerson, sendMessage } from '../../lib/supabaseQueries'
import type { Person, ChecklistCategory } from '../../types/database'

export type SelfConfirmKind = 'salvation' | 'baptism' | 'one2one'

/*
 * The disciple marks their own milestone. Writes the same checklist row
 * the coach's profile view uses (label-keyed upsert), stamps the date on
 * their profile where it applies, and quietly lets the coach know.
 */
const CONTENT: Record<
  SelfConfirmKind,
  {
    title: string
    question: string
    dateLabel: string | null
    checklistLabel: string
    category: ChecklistCategory
    personField: 'spiritual_birthday' | 'baptism_date' | null
    celebration: string
    coachNote: string
  }
> = {
  salvation: {
    title: 'I Accepted Jesus as Lord',
    question: 'Have you prayed and given your life to Jesus? This day becomes your spiritual birthday.',
    dateLabel: 'My spiritual birthday',
    checklistLabel: 'Confirm salvation / spiritual birthday',
    category: 'Action Step',
    personField: 'spiritual_birthday',
    celebration: 'Heaven rejoices over you.',
    coachNote: 'I accepted Jesus as Lord ✦',
  },
  baptism: {
    title: 'I got Baptized',
    question: 'Buried and raised with Christ — when did you go through the waters?',
    dateLabel: 'My baptism day',
    checklistLabel: 'Water baptism conversation',
    category: 'Action Step',
    personField: 'baptism_date',
    celebration: 'A new life, publicly begun.',
    coachNote: 'I got baptized ✦',
  },
  one2one: {
    title: 'I’m Going Through One2One',
    question: 'Have you finished walking through the One2One foundations with your coach?',
    dateLabel: null,
    checklistLabel: 'Completed One2One',
    category: 'Tool',
    personField: null,
    celebration: 'The foundations are laid.',
    coachNote: 'I completed One2One ✦',
  },
}

export default function SelfConfirmModal({
  kind,
  personId,
  coach,
  onClose,
  onSaved,
}: {
  kind: SelfConfirmKind
  personId: string
  coach: Person | null
  onClose: () => void
  onSaved: () => void
}) {
  const c = CONTENT[kind]
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    setBusy(true)
    setError('')
    const { error: err } = await upsertStageChecklistItem({
      person_id: personId,
      stage: 'Establish',
      category: c.category,
      label: c.checklistLabel,
      completed: true,
    })
    if (err) {
      setError(err.message || 'Could not save. Please try again.')
      setBusy(false)
      return
    }
    if (c.personField) {
      await updatePerson(personId, { [c.personField]: date })
    }
    if (coach) {
      await sendMessage(personId, coach.id, 'note', c.coachNote)
    }
    setBusy(false)
    setDone(true)
    onSaved()
    setTimeout(onClose, 2200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6" style={{ boxShadow: 'var(--elev-2)' }}>
        {done ? (
          <div className="jy-rise-in py-6 text-center">
            <p className="text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--establish)' }}>
              ✦ {c.title}
            </p>
            <p className="mt-2 text-sm italic text-[var(--fg-2)]" style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>
              {c.celebration}
            </p>
          </div>
        ) : (
          <>
            <div className="cn-label" style={{ color: 'var(--establish)' }}>Establish · milestone</div>
            <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
              {c.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">{c.question}</p>

            {c.dateLabel && (
              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-[var(--fg-3)]">{c.dateLabel}</label>
                <input
                  type="date"
                  value={date}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                />
              </div>
            )}

            {coach && (
              <p className="mt-3 text-[11px] text-[var(--fg-3)]">
                {coach.name.split(' ')[0]} will be told — milestones are meant to be celebrated together.
              </p>
            )}
            {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost flex-1">
                Not yet
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className="cn-btn cn-btn-primary flex-1 disabled:opacity-50"
              >
                {busy ? 'Marking…' : 'Yes — mark it'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
