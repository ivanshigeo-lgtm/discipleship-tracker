'use client'

import { useState } from 'react'
import { addPerson } from '../lib/supabaseQueries'
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
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentStage, setCurrentStage] = useState<Stage>('Engage')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    setLoading(true)
    setError('')

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
    })

    if (supabaseError) {
      setError(supabaseError.message)
      console.error('Supabase error:', supabaseError)
    } else {
      setName('')
      setEmail('')
      setPhone('')
      setCurrentStage('Engage')
      setNotes('')
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

      <div>
        <label className="mb-1.5 block text-sm font-medium text-[var(--fg-2)]">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
            onChange={(e) => setEmail(e.target.value)}
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
        {loading ? 'Adding...' : 'Add Person'}
      </button>
    </form>
  )
}
