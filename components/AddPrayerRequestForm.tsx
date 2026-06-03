'use client'

import { useState } from 'react'
import { addPrayerRequest } from '../lib/supabaseQueries'

export default function AddPrayerRequestForm({
  personId,
  onAdded,
}: {
  personId: string
  onAdded: () => void
}) {
  const [request, setRequest] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!request.trim()) return

    setLoading(true)
    setError('')

    const { error } = await addPrayerRequest({
      person_id: personId,
      request: request.trim(),
      status: 'Active',
      answered_date: null,
    })

    if (error) {
      setError(error.message)
    } else {
      setRequest('')
      onAdded()
    }

    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="What are you praying for?"
          className="flex-1 rounded-lg border border-gray-300 p-2 text-sm text-gray-900 placeholder:text-gray-500"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add Prayer'}
        </button>
      </div>
      <p className="text-xs text-gray-700">
        New requests are saved as <span className="font-semibold">Praying</span> until you move them to Answered.
      </p>
    </form>
  )
}
