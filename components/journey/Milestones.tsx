'use client'

import type { Badge } from './journeyModel'
import { JOURNEY_ORDER, E_COLORS } from './journeyModel'
import { MilestoneBadge } from './MilestoneArt'
import type { Stage } from '../../types/database'

/*
 * "My Milestones of Faith" — four sections, one per stage. Each section shows
 * its milestone medallions and ends with the stage's capstone GEM, which lights
 * when the coach signs off that stage.
 */
const STAGE_BLURB: Record<Stage, string> = {
  Establish: 'Get rooted',
  Equip: 'Learn to minister',
  Empower: 'Be entrusted to lead',
  Engage: 'Go and make disciples',
}

export default function Milestones({ badges }: { badges: Badge[] }) {
  return (
    <section className="mt-10">
      <div className="cn-label mb-5">My Milestones of Faith</div>

      <div className="space-y-7">
        {JOURNEY_ORDER.map(stage => {
          const group = badges.filter(b => b.stage === stage)
          if (group.length === 0) return null
          const color = E_COLORS[stage]
          return (
            <div key={stage}>
              {/* stage header */}
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                <span className="text-xs font-bold uppercase tracking-[.14em]" style={{ color }}>{stage}</span>
                <span className="text-[12px] text-[var(--fg-3)]">· {STAGE_BLURB[stage]}</span>
                <span className="ml-auto h-px flex-1 self-center" style={{ background: 'var(--line-1, rgba(246,241,231,.10))' }} />
              </div>
              {/* badges, gem last — fixed 5-up grid so a row is always five, any width */}
              <div className="grid grid-cols-5 items-start gap-x-1.5 gap-y-3">
                {group.map(b => (
                  <MilestoneBadge key={b.id} badge={b} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
