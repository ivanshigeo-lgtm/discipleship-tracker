'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Person, Stage, DiscipleshipConnection } from '../../types/database'
import { getPeople, getAllDiscipleshipConnections } from '../../lib/supabaseQueries'
import { buildGraphAwareLayout, type MapNode } from '../MyCircleMap'
import { Starfield, SpikedStar } from './StarPrimitives'
import { E_COLORS } from './journeyModel'

/*
 * The opening story, in three movements:
 *  1. promise — Abraham under the stars, Genesis 15:5
 *  2. constellation — the photo gives way to THIS church's real constellation
 *     (same layout & stars as the coach map, Jesus blazing at the center)
 *  3. yours — the camera flies into the disciple's own star
 */
type Phase = 'promise' | 'constellation' | 'yours' | 'done'

const PHASE_MS: Record<Exclude<Phase, 'done'>, number> = {
  promise: 8200,
  constellation: 7800,
  yours: 6000,
}

const STAGE_GLOW: Record<Stage, string> = {
  Engage: '#FFB040',
  Establish: '#40D8D0',
  Equip: '#60A0FF',
  Empower: '#FF80B0',
}

function JesusStar({ size = 170 }: { size?: number }) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <SpikedStar size={size} color="#FFC860" maturity={1} pulse />
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-semibold"
        style={{ top: size * 0.68, background: 'rgba(6,8,20,.75)', color: '#FFD080' }}
      >
        Jesus
      </div>
    </div>
  )
}

export default function JourneyIntro({
  personId,
  name,
  onDone,
}: {
  personId: string
  name: string
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>('promise')
  const [nodes, setNodes] = useState<MapNode[]>([])
  const [photoOk, setPhotoOk] = useState(true)

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  )

  // Load the real constellation while the promise movement plays
  useEffect(() => {
    if (reducedMotion) return
    Promise.all([getPeople(), getAllDiscipleshipConnections()]).then(([peopleRes, connRes]) => {
      const people = (peopleRes.data ?? []) as Person[]
      const connections = (connRes.data ?? []) as DiscipleshipConnection[]
      if (people.length > 0) setNodes(buildGraphAwareLayout(people, connections))
    })
  }, [reducedMotion])

  useEffect(() => {
    if (reducedMotion) {
      onDone()
      return
    }
    const order: Exclude<Phase, 'done'>[] = ['promise', 'constellation', 'yours']
    const idx = order.indexOf(phase as Exclude<Phase, 'done'>)
    if (idx === -1) return
    const t = setTimeout(() => {
      const next = order[idx + 1]
      if (next) setPhase(next)
      else {
        setPhase('done')
        onDone()
      }
    }, PHASE_MS[order[idx] as Exclude<Phase, 'done'>])
    return () => clearTimeout(t)
  }, [phase, onDone, reducedMotion])

  const myNode = nodes.find(n => n.id === personId)
  const firstName = name.split(' ')[0]

  if (phase === 'done' || reducedMotion) return null

  // Camera flight: keep the disciple's star fixed under the scale (transform-origin
  // at the star), then slide the whole sky so that point lands where the tour's
  // star takes over (upper-center) — the handoff stays on the same star.
  const ZOOM = 5
  const mapTransform =
    phase === 'yours' && myNode
      ? {
          transformOrigin: `${myNode.x}% ${myNode.y}%`,
          transform: `translate(${50 - myNode.x}%, ${34 - myNode.y}%) scale(${ZOOM})`,
        }
      : { transformOrigin: '50% 50%', transform: 'translate(0%, 0%) scale(1)' }

  const showMap = phase === 'constellation' || phase === 'yours'

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-[var(--void)]">
      {/* ---------- movement 1: the promise ---------- */}
      <div
        className="absolute inset-0 transition-opacity duration-[1600ms]"
        style={{ opacity: phase === 'promise' ? 1 : 0, pointerEvents: 'none' }}
      >
        {photoOk ? (
          <img
            src="/journey/abraham-stars.jpg"
            alt=""
            onError={() => setPhotoOk(false)}
            className="jy-kenburns h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0">
            <Starfield count={120} seed={42} />
          </div>
        )}
        {/* darken for legibility */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(6,8,20,.25) 0%, rgba(6,8,20,.15) 55%, rgba(6,8,20,.88) 100%)' }}
        />
        <div className="absolute inset-x-0 bottom-[12%] flex flex-col items-center px-8 text-center">
          <p
            className="max-w-xl text-2xl leading-relaxed italic sm:text-3xl"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)', textShadow: '0 2px 24px rgba(6,8,20,.9)' }}
          >
            &ldquo;Look up at the sky and count the stars&thinsp;—&thinsp;if indeed you can count them&hellip;
            so shall your offspring be.&rdquo;
          </p>
          <p className="cn-label mt-5" style={{ textShadow: '0 2px 12px rgba(6,8,20,.9)' }}>Genesis 15:5</p>
        </div>
      </div>

      {/* ---------- movements 2 & 3: the church constellation ---------- */}
      <div
        className="absolute inset-0 transition-opacity duration-[1800ms]"
        style={{ opacity: showMap ? 1 : 0, pointerEvents: 'none' }}
      >
        {/* the sky that flies */}
        <div
          className="absolute inset-0 transition-transform duration-[4600ms]"
          style={{ ...mapTransform, transitionTimingFunction: 'cubic-bezier(.45,.05,.25,1)' }}
        >
          {/* deep space + nebulas, as on the coach map */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(40% 40% at 30% 40%, rgba(91,141,247,.08), transparent 70%), radial-gradient(35% 35% at 70% 60%, rgba(240,114,159,.06), transparent 70%), radial-gradient(25% 25% at 50% 50%, rgba(242,200,121,.13), transparent 100%), linear-gradient(180deg, #030510 0%, #0a0d1a 50%, #050814 100%)',
            }}
          />
          <Starfield count={140} seed={77} />

          {/* connection shimmer toward the center */}
          <svg className="absolute inset-0 h-full w-full">
            {nodes.map((n, i) => (
              <line
                key={n.id}
                x1="50%" y1="50%" x2={`${n.x}%`} y2={`${n.y}%`}
                stroke={STAGE_GLOW[n.current_stage]}
                strokeOpacity={0.12}
                strokeWidth={0.7}
                strokeDasharray="2 3"
                className={showMap ? 'jy-line-draw' : undefined}
                style={{ animationDelay: `${0.8 + (i % 12) * 0.12}s` }}
              />
            ))}
          </svg>

          <JesusStar size={150} />

          {/* the real stars */}
          {nodes.map((n, i) => {
            const isMe = n.id === personId
            const stageIdx = ['Engage', 'Establish', 'Equip', 'Empower'].indexOf(n.current_stage)
            const sz = (28 + stageIdx * 10 + Math.min(n.degree, 4) * 4) * (isMe ? 1.3 : 1)
            return (
              <div
                key={n.id}
                className="absolute"
                style={{
                  left: `${n.x}%`,
                  top: `${n.y}%`,
                  transform: 'translate(-50%, -50%)',
                  opacity: phase === 'yours' && !isMe ? 0.12 : 1,
                  transition: 'opacity 1.6s ease',
                  animationDelay: `${(i % 10) * 0.2}s`,
                }}
              >
                <SpikedStar size={sz} color={STAGE_GLOW[n.current_stage]} maturity={0.4 + stageIdx * 0.2} pulse={!isMe} />
                <div
                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-center text-[9px] font-medium"
                  style={{
                    top: '78%',
                    background: 'rgba(6,8,20,.7)',
                    color: STAGE_GLOW[n.current_stage],
                    opacity: phase === 'yours' ? 0 : 1,
                    transition: 'opacity 1s ease',
                  }}
                >
                  {n.name.split(' ')[0]}
                </div>
              </div>
            )
          })}
        </div>

        {/* captions (don't fly with the sky) */}
        <div
          className="absolute inset-x-0 bottom-[10%] flex flex-col items-center px-8 text-center transition-opacity duration-1000"
          style={{ opacity: phase === 'constellation' ? 1 : 0 }}
        >
          <p
            className="max-w-xl text-xl leading-relaxed italic sm:text-2xl"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)', textShadow: '0 2px 24px rgba(6,8,20,.95)' }}
          >
            &ldquo;He determines the number of the stars and calls them each by name.&rdquo;
          </p>
          <p className="cn-label mt-4">Psalm 147:4 · This is your church&rsquo;s constellation</p>
        </div>

        <div
          className="absolute inset-x-0 bottom-[12%] flex flex-col items-center px-8 text-center transition-opacity duration-1000"
          style={{ opacity: phase === 'yours' ? 1 : 0, transitionDelay: phase === 'yours' ? '1.6s' : '0s' }}
        >
          <p
            className="text-2xl italic sm:text-3xl"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)', textShadow: '0 2px 24px rgba(6,8,20,.95)' }}
          >
            And this one, {firstName}, is yours.
          </p>
        </div>
      </div>

      {/* fallback if the disciple isn't on the map yet: a lone star appears */}
      {phase === 'yours' && !myNode && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="jy-star-arrive">
            <SpikedStar size={180} color={E_COLORS.Establish} maturity={0.5} pulse />
          </div>
          <p className="mt-4 text-2xl italic sm:text-3xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            And this one, {firstName}, is yours.
          </p>
        </div>
      )}

      {/* skip */}
      <button
        type="button"
        onClick={() => {
          setPhase('done')
          onDone()
        }}
        className="absolute right-5 top-5 z-10 rounded-full border border-[var(--line-2)] bg-[rgba(11,16,39,.6)] px-4 py-1.5 text-xs font-semibold text-[var(--fg-2)] backdrop-blur-md transition-colors hover:text-[var(--fg-1)]"
      >
        Skip
      </button>
    </div>
  )
}
