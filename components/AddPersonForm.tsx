'use client'

import { useState } from 'react'
import {
  addPerson,
  addDiscipleshipConnection,
  findPotentialDuplicatePeople,
  type DuplicatePersonCandidate,
} from '../lib/supabaseQueries'
import { useAuth } from '../contexts/AuthContext'
import { Stage } from '../types/database'
import { stageLabels, stageOrder } from '../lib/stageLabels'

const stages: Stage[] = stageOrder

const STAGE_COLORS: Record<Stage, string> = {
  Engage: 'var(--engage)',
  Establish: 'var(--establish)',
  Equip: 'var(--equip)',
  Empower: 'var(--empower)',
}

export default function AddPersonForm({ onPersonAdded, initialName = '' }: { onPersonAdded?: () => void; initialName?: string }) {
  const { profile } = useAuth()
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentStage, setCurrentStage] = useState<Stage>('Engage')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Populated when the dup check finds likely matches — the form pauses and
  // shows them so the coach can connect instead of creating a duplicate.
  const [dupCandidates, setDupCandidates] = useState<DuplicatePersonCandidate[] | null>(null)

  const resetForm = () => {
    setName('')
    setEmail('')
    setPhone('')
    setCurrentStage('Engage')
    setNotes('')
    setDupCandidates(null)
  }

  const createPerson = async () => {
    setLoading(true)
    setError('')

    // Whoever inputs a person is automatically connected as their coach —
    // otherwise a non-admin can't see the person they just added.
    const { error: supabaseError } = await addPerson({
      name,
      email: email || null,
      phone: phone || null,
      current_stage: currentStage,
      spiritual_birthday: null,
      baptism_date: null,
      notes: notes || null,
      status: 'Active',
      priority: false,
      victory_group_id: null,
    }, profile?.id)

    if (supabaseError) {
      setError(supabaseError.message)
      console.error('Supabase error:', supabaseError)
    } else {
      resetForm()
      onPersonAdded?.()
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    // Run the duplicate check first, once. If matches turn up we pause and
    // render them; a second submit (from "Create new person anyway") clears
    // dupCandidates back to [] and falls straight through to the insert.
    if (dupCandidates === null) {
      setLoading(true)
      setError('')
      const { data } = await findPotentialDuplicatePeople({ name, email })
      setLoading(false)
      if (data.length > 0) {
        setDupCandidates(data)
        return
      }
      setDupCandidates([])
    }

    await createPerson()
  }

  // "Connect to existing" — link this coach to the person that already exists
  // rather than minting a second row for them.
  const connectToExisting = async (candidate: DuplicatePersonCandidate) => {
    if (!profile?.id) {
      setError('You must be signed in to connect a person.')
      return
    }
    setLoading(true)
    setError('')
    const { error: connError } = await addDiscipleshipConnection({
      discipler_person_id: profile.id,
      disciple_person_id: candidate.id,
      disciple_name: candidate.name,
      relationship_notes: null,
      status: 'Identified',
    })
    if (connError) {
      setError(connError.message)
      console.error('Connect-to-existing failed:', connError)
    } else {
      resetForm()
      onPersonAdded?.()
    }
    setLoading(false)
  }

  const stageColor = STAGE_COLORS[currentStage]

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-xl bg-[rgba(240,114,159,.15)] p-3 text-sm text-[#F2728A]">
          Error: {error}
        </div>
      )}

      {dupCandidates && dupCandidates.length > 0 && (
        <div className="space-y-2 rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-3">
          <p className="text-sm font-medium text-[var(--fg-2)]">
            Someone like this may already exist. Connect to them instead of creating a duplicate?
          </p>
          {dupCandidates.map(c => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line-2)] p-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--fg-1)]">{c.name}</div>
                <div className="truncate text-xs text-[var(--fg-3)]">
                  {c.email || 'no email'} · {stageLabels[c.current_stage].name}
                  {c.auth_user_id ? ' · claimed' : ' · unclaimed'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => connectToExisting(c)}
                disabled={loading}
                className="shrink-0 rounded-lg border border-[var(--gbm-cobalt-bright)] px-3 py-1.5 text-xs font-semibold text-[var(--gbm-cobalt-bright)] transition-all hover:bg-[rgba(46,85,230,.12)] disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--fg-2)]">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setDupCandidates(null) }}
          className="w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-3 text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--fg-2)]">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setDupCandidates(null) }}
            className="w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-3 text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--fg-2)]">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-3 text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--fg-2)]">Current Stage</label>
        <select
          value={currentStage}
          onChange={(e) => setCurrentStage(e.target.value as Stage)}
          className="w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-3 text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
        >
          {stages.map(stage => (
            <option key={stage} value={stage}>{stageLabels[stage].display}</option>
          ))}
        </select>
        <div className="mt-2">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              background: `${stageColor}20`,
              border: `1px solid ${stageColor}40`,
            }}
          >
            <span
              className="text-xs font-bold"
              style={{ color: stageColor }}
            >
              ✦ {stageLabels[currentStage].name}
            </span>
            <span className="text-xs text-[var(--fg-3)]">
              {stageLabels[currentStage].shortDescription}
            </span>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--fg-2)]">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="h-24 w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-3 text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          placeholder="Initial observations or context..."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl py-3.5 font-semibold transition-all disabled:opacity-50"
        style={{
          background: 'var(--gbm-cobalt-bright)',
          color: 'var(--fg-1)',
          boxShadow: '0 0 20px rgba(46,85,230,.3)',
        }}
      >
        {loading ? 'Adding...' : dupCandidates && dupCandidates.length > 0 ? 'Create new person anyway' : 'Add Person'}
      </button>
    </form>
  )
}
