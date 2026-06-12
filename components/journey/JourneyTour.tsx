'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { TOUR, E_COLORS, E_ORDER } from './journeyModel'
import { StarBadge } from './StarPrimitives'

/*
 * The star tells the whole story before the first step is taken.
 * Continuing seamlessly from the intro's zoom, the disciple's star sits
 * center-screen while every step of the four E's is briefly named and
 * checked: the quadrant arc fills, the star grows, brightens, and shifts
 * color stage by stage — beginning to Empower. Then it settles into its
 * true, current state and hands the page back.
 *
 * Beats: per stage, an intro line; then each step (title + purpose) checks
 * off and nudges that quadrant's arc forward.
 */

type Beat =
  | { kind: 'stage'; stageIdx: number }
  | { kind: 'step'; stageIdx: number; stepIdx: number }
  | { kind: 'finale' }

const BEAT_MS = { stage: 2600, step: 1900, finale: 3400 }

function buildBeats(): Beat[] {
  const beats: Beat[] = []
  TOUR.forEach((t, stageIdx) => {
    beats.push({ kind: 'stage', stageIdx })
    t.steps.forEach((_, stepIdx) => beats.push({ kind: 'step', stageIdx, stepIdx }))
  })
  beats.push({ kind: 'finale' })
  return beats
}

export default function JourneyTour({
  realProgress,
  realColor,
  onDone,
}: {
  realProgress: number[]
  realColor: string
  onDone: () => void
}) {
  const beats = useMemo(buildBeats, [])
  const [beatIdx, setBeatIdx] = useState(0)
  const [settling, setSettling] = useState(false)
  const doneRef = useRef(false)

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setSettling(true)
    // let the star fade back to its true state before handing off
    setTimeout(onDone, 1400)
  }

  useEffect(() => {
    const beat = beats[beatIdx]
    if (!beat) return
    const t = setTimeout(() => {
      if (beatIdx + 1 < beats.length) setBeatIdx(beatIdx + 1)
      else finish()
    }, BEAT_MS[beat.kind])
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatIdx, beats])

  const beat = beats[beatIdx]

  // simulated progress: every step up to the current beat is "complete".
  // TOUR is journey-ordered (Establish→Equip→Empower→Engage); the ring's
  // quadrants are fixed (E_ORDER), so map by stage name.
  const simProgress = useMemo(() => {
    const byStage: Record<string, number> = {}
    for (let i = 0; i <= beatIdx && i < beats.length; i++) {
      const b = beats[i]
      if (b.kind === 'step') byStage[TOUR[b.stageIdx].stage] = (b.stepIdx + 1) / TOUR[b.stageIdx].steps.length
      if (b.kind === 'finale') TOUR.forEach(t => (byStage[t.stage] = 1))
    }
    return E_ORDER.map(stage => byStage[stage] ?? 0)
  }, [beatIdx, beats])

  const activeStageIdx = beat?.kind === 'finale' ? TOUR.length - 1 : beat?.stageIdx ?? 0
  const tourStage = TOUR[activeStageIdx]
  const stage = tourStage.stage
  const stageColor = E_COLORS[stage]
  const ringEmphasis = E_ORDER.indexOf(stage)

  const caption =
    beat?.kind === 'stage'
      ? { eyebrow: stage, title: '', line: tourStage.intro }
      : beat?.kind === 'step'
      ? { eyebrow: stage, title: tourStage.steps[beat.stepIdx].title, line: tourStage.steps[beat.stepIdx].line }
      : { eyebrow: 'The journey', title: '', line: 'Rooted, sharpened, entrusted — until you engage someone new and a star is born. It starts today, one step at a time.' }

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[var(--void)]">
      {/* quiet sky */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 45% at 50% 38%, ${settling ? realColor : stageColor}14 0%, rgba(6,8,20,0) 65%)`,
          transition: 'background 1.2s ease',
        }}
      />

      {/* the same star, center stage */}
      <div className="absolute inset-x-0 top-[12%] flex justify-center">
        <div className="transition-transform duration-1000" style={{ transform: settling ? 'scale(0.92)' : 'scale(1)' }}>
          <StarBadge
            size={300}
            progress={settling ? realProgress : simProgress}
            color={settling ? realColor : stageColor}
            emphasis={settling ? null : ringEmphasis}
          />
        </div>
      </div>

      {/* the narration */}
      {!settling && (
        <div key={beatIdx} className="jy-rise-in absolute inset-x-0 top-[56%] flex flex-col items-center px-6 text-center">
          {caption.title ? (
            <>
              {/* step beat: small stage eyebrow, prominent step title */}
              <span className="cn-label" style={{ color: stageColor }}>
                {caption.eyebrow}
              </span>
              <div className="mt-2.5 flex items-center gap-3">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: stageColor, color: 'var(--void)', boxShadow: `0 0 14px -1px ${stageColor}` }}
                >
                  ✓
                </span>
                <h2 className="text-2xl font-semibold text-[var(--fg-1)]">{caption.title}</h2>
              </div>
            </>
          ) : (
            /* stage beat: the level's name IS the title — let it command the screen */
            <h2
              className="text-5xl font-semibold sm:text-6xl"
              style={{
                fontFamily: 'var(--font-display)',
                color: stageColor,
                textShadow: `0 0 32px ${stageColor}66, 0 2px 18px rgba(6,8,20,.9)`,
              }}
            >
              {caption.eyebrow}
            </h2>
          )}
          <p
            className="mt-3 max-w-md text-lg italic leading-relaxed text-[var(--fg-2)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {caption.line}
          </p>
        </div>
      )}

      {settling && (
        <div className="jy-rise-in absolute inset-x-0 top-[58%] flex flex-col items-center px-6 text-center">
          <p className="max-w-md text-lg italic leading-relaxed text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            And this is where your story is today.
          </p>
        </div>
      )}

      {/* progress dots across the beats */}
      {!settling && (
        <div className="absolute inset-x-0 bottom-8 flex justify-center gap-1.5">
          {TOUR.map((t, i) => (
            <span
              key={t.stage}
              className="h-1 rounded-full transition-all duration-500"
              style={{
                width: activeStageIdx === i ? 22 : 8,
                background: activeStageIdx >= i ? E_COLORS[t.stage] : 'rgba(246,241,231,.15)',
              }}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={finish}
        className="absolute right-5 top-5 z-10 rounded-full border border-[var(--line-2)] bg-[rgba(11,16,39,.6)] px-4 py-1.5 text-xs font-semibold text-[var(--fg-2)] backdrop-blur-md transition-colors hover:text-[var(--fg-1)]"
      >
        Skip
      </button>
    </div>
  )
}
