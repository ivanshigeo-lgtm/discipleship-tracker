'use client'

import { useEffect } from 'react'
import { projectedLabel, type EmpowerForecast } from '../lib/empowerForecast'
import type { Booklet, Stage } from '../types/database'

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

// The focused, tap-to-open per-leader chapter tracker (design screen 6b).
// Big progress ring, three stat boxes, large per-booklet steppers, and the
// glowing "Empower — start a group" call to action once every chapter is covered.
function ProgressRing({ percentage, size = 64 }: { percentage: number; size?: number }) {
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const filled = (percentage / 100) * circumference
  const equipColor = STAGE_COLORS.Equip
  return (
    <svg width={size} height={size} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(246,241,231,.1)" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={equipColor}
        strokeWidth={strokeWidth}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 5px ${equipColor})` }}
      />
    </svg>
  )
}

function StatBox({
  value,
  label,
  sub,
  accent,
}: {
  value: string
  label: string
  sub?: string
  accent?: string
}) {
  return (
    <div
      className="flex flex-1 flex-col rounded-xl border border-[var(--line-1)] p-3"
      style={{
        background: accent
          ? `linear-gradient(155deg, ${accent}28 0%, var(--indigo) 100%)`
          : 'var(--indigo)',
      }}
    >
      <span
        className="text-xl font-extrabold tabular-nums"
        style={{ color: accent ?? 'var(--fg-1)' }}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[11px] leading-tight text-[var(--fg-3)]">{label}</span>
      {sub && <span className="text-[11px] leading-tight text-[var(--fg-3)]">{sub}</span>}
    </div>
  )
}

export default function ChapterTrackerModal({
  forecast,
  onClose,
  onSetChapter,
  onEmpower,
  empowering,
  saving,
  canEdit = true,
}: {
  forecast: EmpowerForecast
  onClose: () => void
  onSetChapter: (booklet: Booklet, chapter: number) => void
  onEmpower: () => void
  empowering: boolean
  saving: boolean
  // can_edit_person — booklet_progress (steppers) and people.current_stage
  // (Empower) are both gated by it. Read-only viewers still see the forecast.
  canEdit?: boolean
}) {
  const {
    person,
    booklets,
    percentComplete,
    chaptersDone,
    chaptersTotal,
    chaptersLeft,
    etaWeeks,
    projectedDate,
    cadenceFromData,
    isReady,
    unmetMilestones,
  } = forecast

  const equipColor = STAGE_COLORS.Equip
  const empowerColor = STAGE_COLORS.Empower
  const establishColor = STAGE_COLORS.Establish
  const initials = person.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const firstName = person.name.split(' ')[0]

  // Lock body scroll + close on Escape, matching the profile modal.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-0 sm:p-6">
      <div
        className="min-h-screen w-full shadow-2xl sm:my-6 sm:min-h-0 sm:max-w-lg sm:rounded-2xl"
        style={{ background: 'var(--space)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold"
            style={{ color: equipColor }}
          >
            ‹ Emerging Team
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-xs font-semibold text-[var(--fg-2)]"
            style={{ background: 'var(--indigo-2)', border: '1px solid var(--line-1)' }}
          >
            Done
          </button>
        </div>

        {/* Person header */}
        <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
          <div className="relative">
            <ProgressRing percentage={percentComplete} size={64} />
            <div
              className="absolute inset-0 flex items-center justify-center text-sm font-bold"
              style={{ color: equipColor }}
            >
              {initials}
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="cn-h2 truncate">{person.name}</h2>
            <span
              className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ color: establishColor, background: `${establishColor}18`, border: `1px solid ${establishColor}52` }}
            >
              Equip → Empower
            </span>
          </div>
        </div>

        {/* Stat boxes */}
        <div className="flex gap-2 px-4 pt-4 sm:px-5">
          <StatBox value={`${percentComplete}%`} label="journey" sub={`${chaptersDone}/${chaptersTotal} ch`} />
          <StatBox value={`${chaptersLeft}`} label="chapters left" />
          <StatBox
            value={isReady ? 'ready' : projectedLabel(projectedDate)}
            label="empower"
            sub={isReady ? undefined : `~${etaWeeks}w`}
            accent={empowerColor}
          />
        </div>

        {/* Chapters */}
        <div className="flex items-baseline justify-between px-4 pt-6 sm:px-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fg-3)]">Chapters</span>
          <span className="text-[11px] text-[var(--fg-3)]">
            {cadenceFromData ? 'pace from meeting history' : 'pace est. 1 ch / week'}
          </span>
        </div>

        <div className="space-y-2 px-4 pt-3 sm:px-5">
          {booklets.map(b => {
            const pct = b.chapters > 0 ? Math.round((b.current / b.chapters) * 100) : 0
            const barColor = b.done ? establishColor : equipColor
            return (
              <div
                key={b.key}
                className="rounded-2xl border border-[var(--line-1)] p-3.5"
                style={{ background: 'var(--indigo-2)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--fg-1)]">{b.label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={saving || !canEdit || b.current <= 0}
                      onClick={() => onSetChapter(b.key, b.current - 1)}
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--line-2)] text-lg text-[var(--fg-2)] transition-colors hover:bg-[var(--indigo)] disabled:opacity-30"
                      aria-label={`Decrease ${b.label} chapter`}
                    >
                      −
                    </button>
                    <span
                      className="w-14 text-center text-[15px] font-extrabold tabular-nums"
                      style={{ color: b.done ? establishColor : 'var(--fg-1)' }}
                    >
                      {b.current}/{b.chapters}
                    </span>
                    <button
                      type="button"
                      disabled={saving || !canEdit || b.current >= b.chapters}
                      onClick={() => onSetChapter(b.key, b.current + 1)}
                      className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-[var(--line-2)] text-lg text-[var(--fg-2)] transition-colors hover:bg-[var(--indigo)] disabled:opacity-30"
                      aria-label={`Increase ${b.label} chapter`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[var(--indigo)]">
                  <div
                    className="h-full"
                    style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 6px ${barColor}70`, transition: 'width .25s ease' }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Ready state + CTA, or projected footer */}
        <div className="px-4 pb-8 pt-5 sm:px-5">
          {isReady ? (
            <>
              <div
                className="rounded-2xl border p-4"
                style={{
                  background: `linear-gradient(155deg, ${empowerColor}2e 0%, rgba(20,27,61,.6) 100%)`,
                  borderColor: `${empowerColor}66`,
                  boxShadow: `0 0 30px -12px ${empowerColor}99`,
                }}
              >
                <p className="cn-h3">Every chapter is covered</p>
                <p className="mt-1 text-xs" style={{ color: '#F0B3C6' }}>
                  {firstName} is ready to be empowered and start a group.
                </p>
              </div>
              <button
                type="button"
                onClick={onEmpower}
                disabled={empowering || !canEdit}
                className="mt-3 flex min-h-[50px] w-full items-center justify-center rounded-2xl text-[15px] font-bold transition-all disabled:opacity-50"
                style={{
                  background: `linear-gradient(160deg, ${empowerColor}, #C9457A)`,
                  color: '#FBF6EC',
                  boxShadow: `0 0 24px -8px ${empowerColor}b3`,
                }}
              >
                {empowering ? 'Moving…' : `Empower ${firstName} — start a group`}
              </button>
            </>
          ) : (
            <>
              <p className="text-center text-xs text-[var(--fg-2)]">
                Projected empower · <span className="font-semibold" style={{ color: empowerColor }}>{projectedLabel(projectedDate)}</span> · {chaptersLeft} chapters left
              </p>
              {unmetMilestones.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] text-[var(--fg-3)]">Milestones still needed to be ready:</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {unmetMilestones.map((m, i) => (
                      <span
                        key={i}
                        className="rounded-full px-2 py-0.5 text-[11px]"
                        style={{ background: 'var(--indigo-3)', color: 'var(--fg-2)' }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
