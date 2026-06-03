'use client'

import { useState } from 'react'
import { addEngagement } from '../lib/supabaseQueries'

export default function AddNextStepForm({ 
  personId, 
  onAdded 
}: { 
  personId: string
  onAdded: () => void 
}) {
  const [description, setDescription] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!description) return

    setLoading(true)
    
    await addEngagement({
      person_id: personId,
      description,
      follow_up_date: followUpDate || null,
      status: 'Pending',
    })

    setDescription('')
    setFollowUpDate('')
    onAdded()
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Next step..."
        className="flex-1 border border-gray-300 p-2 rounded-lg text-sm text-gray-900 placeholder:text-gray-400"
        required
      />
      <input
        type="date"
        value={followUpDate}
        onChange={(e) => setFollowUpDate(e.target.value)}
        className="border border-gray-300 p-2 rounded-lg text-sm text-gray-900"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-black text-white px-4 rounded-lg text-sm disabled:opacity-50"
      >
        Add
      </button>
    </form>
  )
}
