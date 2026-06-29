'use client'

import { useEffect, useState } from 'react'
import { getCoachSharedPrayers, getGroupSharedPrayers } from '../lib/supabaseQueries'

type SharedPrayer = {
  id: string
  person_id: string
  request: string
  is_praise: boolean
  status: string
  answer_notes: string | null
  created_at: string
  people?: { name: string } | null
}

/*
 * Prayers/praises shared to a scope:
 *  · scope="coach" — what the coach's disciples shared with their coach.
 *  · scope="group" — what fellow Grace Group members shared with the group.
 * (Constellation prayers live on the Prayer Wall; private ones never appear.)
 */
export default function SharedPrayerFeed({
  personId,
  scope,
  refreshKey,
}: {
  personId: string
  scope: 'coach' | 'group'
  refreshKey?: number
}) {
  const [items, setItems] = useState<SharedPrayer[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetcher = scope === 'coach' ? getCoachSharedPrayers : getGroupSharedPrayers
    fetcher(personId).then(({ data }) => {
      if (!cancelled) { setItems((data as unknown as SharedPrayer[]) ?? []); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [personId, scope, refreshKey])

  const title = scope === 'coach' ? 'Prayers shared with you' : 'Your Grace Group’s prayers'
  const subtitle =
    scope === 'coach'
      ? 'Requests and praises your disciples shared with you'
      : 'Requests and praises shared with your group'

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#9B80FF] border-t-transparent" />
      </div>
    )
  }
  if (items.length === 0) return null

  return (
    <section className="cn-card mb-6 p-4">
      <div className="flex items-center gap-3">
        <h2 className="cn-h3">{title}</h2>
        <span className="cn-chip !py-0.5 !text-xs">{items.length}</span>
        <button type="button" onClick={() => setCollapsed(c => !c)} className="ml-auto cn-chip">
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>
      {collapsed ? null : (
      <>
      <p className="mb-4 mt-1 text-sm text-[var(--fg-2)]">{subtitle}</p>
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className="rounded-xl px-3 py-2.5" style={{ background: p.is_praise ? 'rgba(242,200,121,.08)' : 'var(--indigo-2)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-[var(--fg-1)]">{p.people?.name ?? 'A disciple'}</span>
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider" style={{ color: p.is_praise ? 'var(--gold)' : '#9B80FF' }}>
                {p.is_praise ? '✦ Praise' : '✦ Prayer'}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg-2)]">{p.request}</p>
            {p.answer_notes && <p className="mt-1 text-xs text-[var(--establish)]">— {p.answer_notes}</p>}
          </div>
        ))}
      </div>
      </>
      )}
    </section>
  )
}
