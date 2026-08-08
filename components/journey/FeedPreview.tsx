'use client'

// Feed preview on My Journey home: the 2–3 NEWEST shares across every scope
// the viewer can see (disciples' shares, their Grace Group, church-wide) —
// the same share-time order as the Feed tab, so the card always mirrors what
// "See all" opens. (Group-first went stale: the freshest share often reaches
// the viewer under the coach scope and never surfaced here.) Plus one open
// prayer with a one-tap Pray pill.

import { useEffect, useState } from 'react'
import { getCoachSharedSoaps, getGroupSharedSoaps, getSharedSoaps, getGroupPrayerPreview } from '../../lib/supabaseQueries'

type SoapItem = {
  id: string
  journal_date: string | null
  scripture_reference: string | null
  ocr_text: string | null
  summary: string | null
  // Typed iSOAP entries keep their words in `body` (no OCR pass), so the
  // excerpt must fall through to it.
  body?: string | null
  // iSOAP rows stamp when the SHARE happened; local rows only have created_at.
  shared_at?: string | null
  created_at?: string | null
  people?: { name: string } | null
}

type PrayerItem = {
  id: string
  request: string
  is_praise: boolean
  people?: { name: string } | null
}

export default function FeedPreview({
  personId,
  onSeeAll,
  onPray,
}: {
  personId: string
  onSeeAll: () => void
  onPray: () => void
}) {
  const [soaps, setSoaps] = useState<SoapItem[]>([])
  const [prayer, setPrayer] = useState<PrayerItem | null>(null)
  const [churchWide, setChurchWide] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      getCoachSharedSoaps(personId, 3),
      getGroupSharedSoaps(personId, 3),
      getSharedSoaps(3),
      getGroupPrayerPreview(personId, 1),
    ]).then(([coachRes, groupRes, churchRes, prayerRes]) => {
      if (!alive) return
      // Merge the three scopes the Feed tab shows, newest share first, so the
      // top of this card always matches the top of the feed. Dedupe keeps the
      // closest scope's copy (coach > group > constellation).
      const near = [...((coachRes.data as SoapItem[] | null) ?? []), ...((groupRes.data as SoapItem[] | null) ?? [])]
      const nearIds = new Set(near.map(r => r.id))
      const church = (((churchRes.data as SoapItem[] | null) ?? [])).filter(r => !nearIds.has(r.id))
      const byId = new Map<string, SoapItem>()
      for (const r of [...near, ...church]) if (!byId.has(r.id)) byId.set(r.id, r)
      const rows = Array.from(byId.values()).sort((a, b) => {
        const da = a.shared_at ?? a.created_at ?? a.journal_date ?? ''
        const db = b.shared_at ?? b.created_at ?? b.journal_date ?? ''
        return db.localeCompare(da)
      }).slice(0, 3)
      setSoaps(rows)
      setChurchWide(rows.length > 0 && rows.every(r => !nearIds.has(r.id)))
      setPrayer(((prayerRes.data as PrayerItem[] | null) ?? [])[0] ?? null)
      setReady(true)
    })
    return () => { alive = false }
  }, [personId])

  const soapItems = soaps.slice(0, prayer ? 2 : 3)
  if (!ready || (soapItems.length === 0 && !prayer)) return null

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="cn-label" style={{ color: 'var(--fg-3)' }}>
          {churchWide ? 'From the constellation' : 'Shared with you'}
        </p>
        <button
          type="button"
          onClick={onSeeAll}
          className="text-xs font-semibold text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
        >
          See all →
        </button>
      </div>
      <div className="space-y-2">
        {soapItems.map(s => {
          const excerpt = (s.summary || s.ocr_text || s.body || '').trim()
          return (
            <div key={s.id} className="rounded-xl border border-[var(--line-2)] bg-[rgba(9,12,26,.55)] px-4 py-3">
              <div className="flex items-baseline gap-2">
                {/* `||` not `??` — iSOAP rows can carry an empty-string name */}
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--fg-1)]">{s.people?.name || 'A disciple'}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--establish)' }}>
                  SOAP
                </span>
              </div>
              {s.scripture_reference && (
                <p className="mt-0.5 truncate text-xs font-medium" style={{ color: 'var(--establish)' }}>
                  {s.scripture_reference}
                </p>
              )}
              {excerpt && (
                <p
                  className="mt-1 overflow-hidden text-sm italic leading-relaxed text-[var(--fg-2)]"
                  style={{ fontFamily: 'var(--font-display)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                >
                  {excerpt}
                </p>
              )}
            </div>
          )
        })}
        {prayer && (
          <div className="flex items-center gap-3 rounded-xl border border-[var(--line-2)] bg-[rgba(9,12,26,.55)] px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--fg-1)]">{prayer.people?.name || 'A disciple'}</span>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--empower)' }}>
                  {prayer.is_praise ? 'Praise' : 'Prayer'}
                </span>
              </div>
              <p
                className="mt-1 overflow-hidden text-sm italic leading-relaxed text-[var(--fg-2)]"
                style={{ fontFamily: 'var(--font-display)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
              >
                {prayer.request.trim()}
              </p>
            </div>
            <button
              type="button"
              onClick={onPray}
              className="shrink-0 rounded-full border border-[rgba(240,114,159,.4)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[rgba(240,114,159,.12)]"
              style={{ color: 'var(--empower)' }}
            >
              🙏 Pray
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
