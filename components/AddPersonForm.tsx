'use client'

import { useState } from 'react'
import { addPerson } from '../lib/supabaseQueries'
import { Stage } from '../types/database'
import { stageLabels, stageOrder } from '../lib/stageLabels'
import StageLevelBadge from './StageLevelBadge'

const stages: Stage[] = stageOrder

export default function AddPersonForm({ onPersonAdded }: { onPersonAdded?: () => void }) {
  const [name, setName] = useState('')
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm">
          Error: {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Stage</label>
        <select 
          value={currentStage} 
          onChange={(e) => setCurrentStage(e.target.value as Stage)}
          className="w-full border border-gray-300 p-3 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
        >
          {stages.map(stage => (
            <option key={stage} value={stage}>{stageLabels[stage].display}</option>
          ))}
        </select>
        <div className="mt-2">
          <StageLevelBadge stage={currentStage} size="sm" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-xl text-gray-900 placeholder:text-gray-400 h-24 focus:outline-none focus:ring-2 focus:ring-black"
          placeholder="Initial observations or context..."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-black text-white py-3.5 rounded-xl font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
      >
        {loading ? 'Adding...' : 'Add Person'}
      </button>
    </form>
  )
}
