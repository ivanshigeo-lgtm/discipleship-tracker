'use client'

import { useEffect, useMemo, useState } from 'react'
import { getPeople } from '../lib/supabaseQueries'
import type { Person } from '../types/database'
import MergePeopleModal from './MergePeopleModal'

// Church-wide duplicate scan for admins and approved-Empower coaches. Catches
// the two ways dups keep appearing in prod: two coaches each adding the same
// person, and self-signup minting a fresh profile instead of claiming an
// existing one. Detection mirrors the Aug 3 mass-merge scan: exact email,
// exact normalized name, same first+last name token, and a claimed
// single-token name matching another profile's first name.

type DupPair = {
  older: Person
  newer: Person
  reason: string
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

function findDuplicatePairs(people: Person[]): DupPair[] {
  const pairs = new Map<string, DupPair>()
  const add = (a: Person, b: Person, reason: string) => {
    const [older, newer] = new Date(a.created_at) <= new Date(b.created_at) ? [a, b] : [b, a]
    const key = [older.id, newer.id].join('|')
    if (!pairs.has(key)) pairs.set(key, { older, newer, reason })
  }

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i]
      const b = people[j]
      const emailA = normalize(a.email ?? '')
      const emailB = normalize(b.email ?? '')
      const nameA = normalize(a.name)
      const nameB = normalize(b.name)
      const tokensA = nameA.split(' ')
      const tokensB = nameB.split(' ')
      if (emailA && emailA === emailB) {
        add(a, b, 'Same email')
      } else if (nameA && nameA === nameB) {
        add(a, b, 'Same name')
      } else if (
        tokensA.length > 1 && tokensB.length > 1 &&
        tokensA[0] === tokensB[0] && tokensA[tokensA.length - 1] === tokensB[tokensB.length - 1]
      ) {
        add(a, b, 'Similar name')
      } else if (
        // The Faith pattern: someone signs up with just their first name while
        // their full profile already exists. Only flag when the short row is
        // claimed — a lone first-name row with no login is usually just sparse.
        (tokensA.length === 1 && tokensB.length > 1 && tokensA[0] === tokensB[0] && a.auth_user_id) ||
        (tokensB.length === 1 && tokensA.length > 1 && tokensB[0] === tokensA[0] && b.auth_user_id)
      ) {
        add(a, b, 'First name matches')
      }
    }
  }
  return Array.from(pairs.values())
}

export default function PossibleDuplicatesPanel({
  refreshKey = 0,
  onMerged,
}: {
  refreshKey?: number
  onMerged?: () => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [expanded, setExpanded] = useState(false)
  const [reviewPair, setReviewPair] = useState<DupPair | null>(null)

  useEffect(() => {
    getPeople().then(({ data }) => setPeople((data as Person[]) ?? []))
  }, [refreshKey])

  const pairs = useMemo(() => findDuplicatePairs(people), [people])

  if (pairs.length === 0) return null

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-[rgba(244,182,80,.35)] bg-[rgba(244,182,80,.08)]">
      <button
        type="button"
        onClick={() => setExpanded(current => !current)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden>⚠️</span>
          <span className="text-sm font-semibold text-[var(--engage)]">
            {pairs.length} possible duplicate {pairs.length === 1 ? 'profile' : 'profiles'}
          </span>
          <span className="text-xs text-[var(--fg-3)]">— the same person may be listed twice</span>
        </div>
        <span className="text-lg text-[var(--fg-3)]">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-[rgba(244,182,80,.25)] p-3">
          {pairs.map(pair => (
            <div
              key={`${pair.older.id}|${pair.newer.id}`}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--indigo)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--fg-1)]">
                  {pair.older.name} <span className="text-[var(--fg-3)]">+</span> {pair.newer.name}
                </div>
                <div className="truncate text-xs text-[var(--fg-3)]">
                  {pair.reason}
                  {pair.older.email ? ` · ${pair.older.email}` : ''}
                  {pair.newer.email && pair.newer.email !== pair.older.email ? ` · ${pair.newer.email}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewPair(pair)}
                className="shrink-0 rounded-full bg-[var(--gbm-cobalt-bright)] px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                Review &amp; merge
              </button>
            </div>
          ))}
        </div>
      )}
      {reviewPair && (
        <MergePeopleModal
          personA={reviewPair.older}
          personB={reviewPair.newer}
          onClose={() => setReviewPair(null)}
          onMerged={() => {
            setReviewPair(null)
            getPeople().then(({ data }) => setPeople((data as Person[]) ?? []))
            onMerged?.()
          }}
        />
      )}
    </div>
  )
}
