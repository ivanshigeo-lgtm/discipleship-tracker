'use client'

import type { Badge } from './journeyModel'
import { MilestoneBadge } from './MilestoneArt'

/*
 * "My Milestones of Faith" — the trophy case, per the design system.
 * The four stage GEMS (always shown, lit as earned) and the gold milestone
 * MEDALLIONS the disciple has earned.
 */
export default function Milestones({ badges }: { badges: Badge[] }) {
  const gems = badges.filter(b => b.kind === 'gem')
  const medals = badges.filter(b => b.kind === 'badge' && b.earned)

  return (
    <section className="mt-10">
      <div className="cn-label mb-4">My Milestones of Faith</div>

      {/* The four E gems */}
      <div className="flex flex-wrap items-start gap-x-1 gap-y-4">
        {gems.map(b => (
          <MilestoneBadge key={b.id} badge={b} />
        ))}
      </div>

      {/* Earned medallions */}
      {medals.length > 0 && (
        <>
          <div className="my-5 h-px w-full" style={{ background: 'var(--line-1, rgba(246,241,231,.10))' }} />
          <div className="flex flex-wrap items-start gap-x-1 gap-y-4">
            {medals.map(b => (
              <MilestoneBadge key={b.id} badge={b} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
