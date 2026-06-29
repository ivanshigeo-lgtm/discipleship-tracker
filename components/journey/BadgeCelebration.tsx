'use client'

import { useEffect, useState } from 'react'
import type { Badge } from './journeyModel'
import { BethlehemStar } from './StarPrimitives'

const SEEN_KEY = 'journey_badges_seen'

export function getSeenBadges(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function markBadgesSeen(ids: string[]) {
  const seen = getSeenBadges()
  ids.forEach(id => seen.add(id))
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
}

/*
 * Shows one gentle celebration at a time for newly earned badges.
 * Awe, not confetti: a star brightens, a word is spoken, it settles.
 */
export default function BadgeCelebration({ badges, ready }: { badges: Badge[]; ready: boolean }) {
  const [queue, setQueue] = useState<Badge[]>([])
  const [current, setCurrent] = useState<Badge | null>(null)

  useEffect(() => {
    if (!ready) return
    // First ever visit: treat already-earned badges as history, not news —
    // the journey celebrates from here forward.
    if (localStorage.getItem(SEEN_KEY) === null) {
      markBadgesSeen(badges.filter(b => b.earned).map(b => b.id))
      return
    }
    const seen = getSeenBadges()
    const fresh = badges.filter(b => b.earned && !seen.has(b.id))
    if (fresh.length > 0) setQueue(fresh)
  }, [badges, ready])

  useEffect(() => {
    if (!current && queue.length > 0) {
      const [next, ...rest] = queue
      setCurrent(next)
      setQueue(rest)
      markBadgesSeen([next.id])
    }
  }, [queue, current])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(6,8,20,.82)] p-6 backdrop-blur-sm"
      onClick={() => setCurrent(null)}
    >
      <div
        className="jy-rise-in w-full max-w-sm rounded-[var(--r-xl)] border border-[var(--line-2)] p-8 text-center"
        style={{
          background: 'var(--indigo)',
          boxShadow: `0 8px 40px -8px rgba(0,0,0,.7), 0 0 48px -12px ${current.color}66, inset 0 1px 0 rgba(246,241,231,.06)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="relative mx-auto mb-2 flex justify-center">
          <BethlehemStar size={110} color={current.color} className="jy-breathe" />
          <span aria-hidden className="absolute inset-0 flex items-center justify-center text-3xl">
            {current.icon}
          </span>
        </div>
        <p className="cn-label" style={{ color: current.color }}>
          A new light
        </p>
        <h2
          className="mt-2 text-3xl"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
        >
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">{current.line}</p>
        <button
          type="button"
          onClick={() => setCurrent(null)}
          className="cn-btn cn-btn-ghost mt-6"
        >
          Continue the journey
        </button>
      </div>
    </div>
  )
}
