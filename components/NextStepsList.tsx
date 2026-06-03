'use client'

import { useEffect, useState } from 'react'
import { getEngagementsByPerson } from '../lib/supabaseQueries'
import type { Engagement } from '../types/database'

export default function NextStepsList({ 
  personId, 
  refreshKey 
}: { 
  personId: string
  refreshKey: number 
}) {
  const [engagements, setEngagements] = useState<Engagement[]>([])

  const loadEngagements = async () => {
    const { data } = await getEngagementsByPerson(personId)
    if (data) setEngagements(data)
  }

  useEffect(() => {
    loadEngagements()
  }, [personId, refreshKey])

  if (engagements.length === 0) {
    return <p className="text-sm text-gray-600 italic">No next steps yet.</p>
  }

  return (
    <div className="space-y-2">
      {engagements.map((eng) => (
        <div key={eng.id} className="flex justify-between items-start bg-white p-3 rounded-lg border">
          <div>
            <div className="text-sm text-gray-900">{eng.description}</div>
            {eng.follow_up_date && (
              <div className="text-xs text-gray-500 mt-1">
                Follow up: {new Date(eng.follow_up_date).toLocaleDateString()}
              </div>
            )}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${eng.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {eng.status}
          </span>
        </div>
      ))}
    </div>
  )
}
