'use client'

import { useEffect, useState } from 'react'
import { getSharedSoaps, getSharedPraises } from '../../lib/supabaseQueries'

type RailItem = {
  id: string
  kind: 'soap' | 'praise' | 'prayer'
  name: string
  text: string
  reference?: string | null
}

function firstWords(s: string, n = 22): string {
  const words = s.trim().split(/\s+/)
  return words.length <= n ? s.trim() : words.slice(0, n).join(' ') + '…'
}

export function useConstellationFeed() {
  const [items, setItems] = useState<RailItem[]>([])

  useEffect(() => {
    let alive = true
    Promise.all([getSharedSoaps(10), getSharedPraises(10)]).then(([soaps, praises]) => {
      if (!alive) return
      const list: RailItem[] = []
      for (const j of (soaps.data as unknown as Array<Record<string, unknown>>) || []) {
        const people = j.people as { name?: string } | null
        const body = (j.summary as string) || (j.ocr_text as string) || ''
        if (!body) continue
        list.push({
          id: `soap-${j.id}`,
          kind: 'soap',
          name: people?.name || 'A star',
          text: firstWords(body),
          reference: (j.scripture_reference as string) || null,
        })
      }
      for (const p of (praises.data as unknown as Array<Record<string, unknown>>) || []) {
        const people = p.people as { name?: string } | null
        list.push({
          id: `pr-${p.id}`,
          kind: p.is_praise ? 'praise' : 'prayer',
          name: people?.name || 'A star',
          text: firstWords(p.request as string),
        })
      }
      // interleave soaps and prayers/praises
      list.sort(() => 0) // stable; already newest-first per source
      setItems(list)
    })
    return () => {
      alive = false
    }
  }, [])

  return items
}

function RailCard({ item }: { item: RailItem }) {
  const accent = item.kind === 'soap' ? 'var(--establish)' : item.kind === 'praise' ? 'var(--gold)' : 'var(--equip)'
  const label = item.kind === 'soap' ? 'SOAP' : item.kind === 'praise' ? 'PRAISE' : 'PRAYER'
  return (
    <div
      className="rounded-2xl border border-[var(--line-1)] p-3"
      style={{ background: 'rgba(20,27,61,.55)', backdropFilter: 'blur(6px)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold tracking-[.14em]" style={{ color: accent }}>
          ✦ {label}
        </span>
        <span className="truncate text-[10px] text-[var(--fg-3)]">{item.name}</span>
      </div>
      {item.reference && (
        <p className="mt-1 text-[11px] font-semibold" style={{ color: accent }}>
          {item.reference}
        </p>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--fg-2)]">{item.text}</p>
    </div>
  )
}

/*
 * On wide screens: two slim side rails where shared SOAPs and praises drift
 * slowly upward like distant lights. On smaller screens, render nothing —
 * the page shows the inline "From the constellation" section instead.
 */
export default function ConstellationRail({ items }: { items: RailItem[] }) {
  if (items.length === 0) return null
  const left = items.filter((_, i) => i % 2 === 0)
  const right = items.filter((_, i) => i % 2 === 1)

  const Column = ({ list, duration }: { list: RailItem[]; duration: number }) => (
    <div className="jy-rail-mask relative h-full overflow-hidden">
      <div className="jy-rail-drift space-y-3 pr-1" style={{ ['--drift-d' as string]: `${duration}s` }}>
        {[...list, ...list].map((item, i) => (
          <RailCard key={`${item.id}-${i}`} item={item} />
        ))}
      </div>
    </div>
  )

  return (
    <>
      <aside className="pointer-events-none fixed left-4 top-28 bottom-8 hidden w-56 2xl:block">
        <Column list={left} duration={90} />
      </aside>
      <aside className="pointer-events-none fixed right-4 top-28 bottom-8 hidden w-56 2xl:block">
        <Column list={right} duration={110} />
      </aside>
    </>
  )
}

export function ConstellationFeedInline({ items }: { items: RailItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="2xl:hidden">
      <div className="cn-label mb-3">From the constellation</div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {items.map(item => (
          <div key={item.id} className="w-64 shrink-0 snap-start">
            <RailCard item={item} />
          </div>
        ))}
      </div>
    </div>
  )
}
