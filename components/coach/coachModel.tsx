// Shared derivations for the coach-home briefing zones. Everything here is a
// cheap pure function over already-loaded rows — the heavy Empower forecast
// (booklets + engagements + memberships) deliberately stays out of the home
// screen; checklist percent-complete is the briefing's stand-in.

import { STEP_CHECKLIST } from '../journey/journeyModel'
import type { Person, Stage, StageChecklistItem, Engagement } from '../../types/database'

export const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650', Establish: '#36D6C3', Equip: '#5B8DF7', Empower: '#F0729F',
}

export const initials = (name: string) =>
  name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

const entriesForStage = (stage: Stage) =>
  Object.values(STEP_CHECKLIST).filter(e => e.stage === stage)

const itemDone = (items: StageChecklistItem[], personId: string, stage: Stage, label: string) =>
  items.some(i => i.person_id === personId && i.stage === stage && i.label === label && i.completed)

// Share of the person's current-stage journey steps they've checked off (0–100).
export function stagePercent(person: Person, items: StageChecklistItem[]): number {
  const entries = entriesForStage(person.current_stage)
  if (entries.length === 0) return 0
  const done = entries.filter(e => itemDone(items, person.id, e.stage, e.label)).length
  return Math.round((done / entries.length) * 100)
}

// The person's next journey step: first unchecked checklist entry for their
// current stage, with the label cleaned for display ("Completed One2One" →
// "One2One"). Falls back to a stage-level nudge when the stage has no entries
// (Engage) or everything is checked.
export function nextStepFor(person: Person, items: StageChecklistItem[]): string {
  const entries = entriesForStage(person.current_stage)
  const next = entries.find(e => !itemDone(items, person.id, e.stage, e.label))
  if (!next) return `Continue ${person.current_stage}`
  return next.label.replace(/^Completed /, '')
}

export type Riser = { person: Person; pct: number }

// Emerging leaders, best-first: Equip/Empower people ranked by how far through
// their current stage's steps they are.
export function topRisers(people: Person[], items: StageChecklistItem[], allow: Set<string> | null): Riser[] {
  return people
    .filter(p => p.status !== 'Inactive' && (!allow || allow.has(p.id)))
    .filter(p => p.current_stage === 'Equip' || p.current_stage === 'Empower')
    .map(p => ({ person: p, pct: stagePercent(p, items) }))
    .sort((a, b) => b.pct - a.pct)
}

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : '')).getTime()
  return Math.floor(diff / 86_400_000)
}

// Days since the last Completed engagement touching this person. Engagements
// carry no completed_at in practice — follow_up_date is the meeting date.
export function silenceDays(engs: Engagement[], fallbackFrom: string | null): number | null {
  const done = engs
    .filter(e => e.status === 'Completed' && e.follow_up_date)
    .sort((a, b) => b.follow_up_date!.localeCompare(a.follow_up_date!))
  if (done.length) return daysSince(done[0].follow_up_date)
  return daysSince(fallbackFrom)
}

export const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Small uppercase zone label used above every briefing zone.
export function ZoneLabel({ label, right, onRight }: { label: string; right?: string; onRight?: () => void }) {
  return (
    <div className="mb-2 flex items-baseline gap-2 px-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-[var(--fg-3)]">{label}</span>
      {right && (
        <button
          type="button"
          onClick={onRight}
          className="ml-auto text-[11px] font-semibold text-[var(--gbm-cobalt-soft)] hover:text-[var(--fg-1)]"
        >
          {right}
        </button>
      )}
    </div>
  )
}
