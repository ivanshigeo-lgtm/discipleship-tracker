'use client'

import { useEffect, useState } from 'react'
import { getPrayerRequestsByPerson, markPrayerAnswered, deletePrayerRequest } from '../lib/supabaseQueries'
import type { PrayerRequest } from '../types/database'

export default function PrayerRequestsList({
  personId,
  refreshKey = 0,
  onUpdate,
}: {
  personId: string
  refreshKey?: number
  onUpdate?: () => void
}) {
  const [requests, setRequests] = useState<PrayerRequest[]>([])
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadRequests = async () => {
    const { data, error } = await getPrayerRequestsByPerson(personId)
    if (error) {
      setError(error.message)
      return
    }
    if (data) setRequests(data)
  }

  useEffect(() => {
    loadRequests()
  }, [personId, refreshKey])

  const handleMarkAnswered = async (id: string) => {
    setAnsweringId(id)
    setError('')

    const { error } = await markPrayerAnswered(id)
    if (error) {
      setError(error.message)
    } else {
      await loadRequests()
      onUpdate?.()
    }

    setAnsweringId(null)
  }

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('Delete this prayer request?')
    if (!confirmed) return

    setDeletingId(id)
    setError('')

    const { error } = await deletePrayerRequest(id)
    if (error) {
      setError(error.message)
    } else {
      setRequests(currentRequests => currentRequests.filter(request => request.id !== id))
      onUpdate?.()
    }

    setDeletingId(null)
  }

  const prayingRequests = requests.filter(request => request.status === 'Active')
  const answeredRequests = requests.filter(request => request.status === 'Answered')

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Current Prayer List */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">Current Prayer Requests</div>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
            Praying
          </span>
        </div>

        {prayingRequests.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
            No current prayer requests.
          </p>
        ) : (
          <div className="space-y-2">
            {prayingRequests.map(request => (
              <div key={request.id} className="rounded-lg border border-blue-100 bg-white p-3">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">
                      Status: Praying
                    </div>
                    <div className="text-sm font-medium text-gray-900">
                      {request.request}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleMarkAnswered(request.id)}
                    disabled={answeringId === request.id || deletingId === request.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {answeringId === request.id ? 'Moving...' : 'Move to Answered'}
                  </button>
                  <button
                    onClick={() => handleDelete(request.id)}
                    disabled={deletingId === request.id || answeringId === request.id}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {deletingId === request.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Answered Prayer / Praise Reports */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">Answered Prayers / Praise Reports</div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            Answered
          </span>
        </div>

        {answeredRequests.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
            No answered prayers yet.
          </p>
        ) : (
          <div className="space-y-2">
            {answeredRequests.map(request => (
              <div key={request.id} className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="mb-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                  Status: Answered
                </div>
                <div className="text-sm font-medium text-gray-900">{request.request}</div>
                <div className="mt-1 text-xs font-medium text-emerald-800">
                  Answered on {request.answered_date ? new Date(request.answered_date).toLocaleDateString() : 'date not recorded'}
                </div>
                <button
                  onClick={() => handleDelete(request.id)}
                  disabled={deletingId === request.id}
                  className="mt-3 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {deletingId === request.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
