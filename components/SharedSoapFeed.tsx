'use client'

import { useEffect, useState } from 'react'
import { getCoachSharedSoaps, getGroupSharedSoaps } from '../lib/supabaseQueries'

type SharedSoap = {
  id: string
  person_id: string
  journal_date: string | null
  scripture_reference: string | null
  ocr_text: string | null
  summary: string | null
  created_at: string
  people?: { name: string } | null
}

/*
 * A feed of SOAP journals shared to a scope:
 *  · scope="coach" — entries the coach's disciples shared with their coach.
 *  · scope="group" — entries fellow Grace Group members shared with the group.
 */
export default function SharedSoapFeed({
  personId,
  scope,
  refreshKey,
}: {
  personId: string
  scope: 'coach' | 'group'
  refreshKey?: number
}) {
  const [items, setItems] = useState<SharedSoap[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetcher = scope === 'coach' ? getCoachSharedSoaps : getGroupSharedSoaps
    fetcher(personId).then(({ data }) => {
      if (!cancelled) { setItems((data as unknown as SharedSoap[]) ?? []); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [personId, scope, refreshKey])

  const title = scope === 'coach' ? 'Shared with you' : 'From your Grace Group'
  const subtitle =
    scope === 'coach'
      ? 'SOAP reflections your disciples chose to share with you'
      : 'SOAP reflections your group has shared'

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--establish)] border-t-transparent" />
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
        {items.map(s => {
          const body = (s.summary || s.ocr_text || '').trim()
          return (
            <div key={s.id} className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--fg-1)]">{s.people?.name ?? 'A disciple'}</span>
                <span className="shrink-0 text-[11px] text-[var(--fg-3)]">
                  {s.journal_date
                    ? new Date(s.journal_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    : ''}
                </span>
              </div>
              {s.scripture_reference && (
                <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--establish)' }}>{s.scripture_reference}</p>
              )}
              {body && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg-2)]">{body}</p>}
            </div>
          )
        })}
      </div>
      </>
      )}
    </section>
  )
}
