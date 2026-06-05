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
      answer_notes: null,
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
    <form onSubmit={handleSubmit} className="space-y-1.5">
      {error && <p className="text-xs text-[#F2728A]">{error}</p>}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="What are you praying for?"
          className="flex-1 rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="cn-btn cn-btn-primary shrink-0 !px-3 !py-1.5 !text-xs"
        >
          {loading ? '...' : 'Add'}
        </button>
      </div>
    </form>
  )
}
