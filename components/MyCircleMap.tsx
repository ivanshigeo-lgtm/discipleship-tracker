'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getAllDiscipleshipConnections, getPeople, getVictoryGroups, getAllGroupMemberships } from '../lib/supabaseQueries'
import type { DiscipleshipConnection, Person, Stage, VictoryGroup } from '../types/database'
import { stageLabels } from '../lib/stageLabels'
import PersonProfileModal from './PersonProfileModal'

export type MapNode = Person & {
  x: number
  y: number
  radius: number
  angle: number
  degree: number
}

type GraphEdge = {
  from: string
  to: string
}

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

const STAGE_LABELS: Record<Stage, string> = {
  Engage: 'Reaching',
  Establish: 'Building',
  Equip: 'Training',
  Empower: 'Releasing',
}

const STAGE_ORDER: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']

const stageOrbit: Record<Stage, number> = {
  Empower: 12,
  Equip: 22,
  Establish: 32,
  Engage: 42,
}

const stageBand: Record<Stage, { min: number; max: number }> = {
  Empower: { min: 8, max: 18 },
  Equip: { min: 15, max: 28 },
  Establish: { min: 25, max: 38 },
  Engage: { min: 32, max: 46 },
}

const stageSortRank: Record<Stage, number> = {
  Engage: 0,
  Establish: 1,
  Equip: 2,
  Empower: 3,
}

const christLineStyle: Record<Stage, { stroke: string; strokeWidth: string; strokeDasharray?: string }> = {
  Empower: {
    stroke: 'rgba(255, 128, 176, 0.5)',
    strokeWidth: '1',
  },
  Equip: {
    stroke: 'rgba(96, 160, 255, 0.45)',
    strokeWidth: '1',
    strokeDasharray: '4 2',
  },
  Establish: {
    stroke: 'rgba(64, 216, 208, 0.4)',
    strokeWidth: '1',
    strokeDasharray: '3 2',
  },
  Engage: {
    stroke: 'rgba(255, 176, 64, 0.35)',
    strokeWidth: '1',
    strokeDasharray: '2 2',
  },
}

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const projectNodeIntoStageBand = <T extends { x: number; y: number; current_stage: Stage }>(node: T): T => {
  const band = stageBand[node.current_stage]
  const dx = node.x - 50
  const dy = (node.y - 50) / 0.72
  const distanceFromCenter = Math.sqrt(dx * dx + dy * dy) || 0.1
  const constrainedRadius = clamp(distanceFromCenter, band.min, band.max)

  return {
    ...node,
    x: 50 + (dx / distanceFromCenter) * constrainedRadius,
    y: 50 + (dy / distanceFromCenter) * constrainedRadius * 0.72,
  }
}

const relationshipLineStyleForDistance = (from: { x: number; y: number }, to: { x: number; y: number }) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const closeness = 1 - clamp((distance - 6) / 42, 0, 1)
  const opacity = 0.3 + closeness * 0.4
  const strokeWidth = 1

  if (closeness > 0.72) {
    return {
      stroke: `rgba(200,210,230,${opacity.toFixed(2)})`,
      strokeWidth: strokeWidth.toFixed(2),
      strokeDasharray: undefined,
    }
  }

  if (closeness > 0.42) {
    return {
      stroke: `rgba(200,210,230,${opacity.toFixed(2)})`,
      strokeWidth: strokeWidth.toFixed(2),
      strokeDasharray: '4 2',
    }
  }

  return {
    stroke: `rgba(200,210,230,${opacity.toFixed(2)})`,
    strokeWidth: strokeWidth.toFixed(2),
    strokeDasharray: '2 3',
  }
}

const applyElectronRepulsion = (nodesToSeparate: MapNode[], strength = 0.34) => {
  let nodes = nodesToSeparate

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]
      const b = nodes[j]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.1
      const comfortDistance = a.current_stage === b.current_stage ? 20 : 16.5

      if (distance >= comfortDistance) continue

      const repulsion = ((comfortDistance - distance) / comfortDistance) * strength * comfortDistance
      const nx = dx / distance
      const ny = dy / distance

      nodes[i] = projectNodeIntoStageBand({ ...a, x: a.x - nx * repulsion, y: a.y - ny * repulsion })
      nodes[j] = projectNodeIntoStageBand({ ...b, x: b.x + nx * repulsion, y: b.y + ny * repulsion })
    }
  }

  return nodes
}

const visibleGraphEdgesFor = (people: Person[], connections: DiscipleshipConnection[]): GraphEdge[] => {
  const personIds = new Set(people.map(person => person.id))
  const seenPairs = new Set<string>()

  return connections.reduce<GraphEdge[]>((edges, connection) => {
    if (!connection.disciple_person_id) return edges
    if (!personIds.has(connection.discipler_person_id) || !personIds.has(connection.disciple_person_id)) return edges

    const pairKey = `${connection.discipler_person_id}->${connection.disciple_person_id}`
    if (seenPairs.has(pairKey)) return edges

    seenPairs.add(pairKey)
    edges.push({ from: connection.discipler_person_id, to: connection.disciple_person_id })
    return edges
  }, [])
}

const segmentIntersects = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
) => {
  const ccw = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }) => {
    return (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x)
  }

  return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)
}

export const buildGraphAwareLayout = (people: Person[], connections: DiscipleshipConnection[]): MapNode[] => {
  const edges = visibleGraphEdgesFor(people, connections)
  const peopleById = new Map(people.map(person => [person.id, person]))
  const adjacency = new Map<string, Set<string>>()
  const degreeById = new Map<string, number>()

  people.forEach(person => {
    adjacency.set(person.id, new Set())
    degreeById.set(person.id, 0)
  })

  edges.forEach(edge => {
    adjacency.get(edge.from)?.add(edge.to)
    adjacency.get(edge.to)?.add(edge.from)
    degreeById.set(edge.from, (degreeById.get(edge.from) ?? 0) + 1)
    degreeById.set(edge.to, (degreeById.get(edge.to) ?? 0) + 1)
  })

  const visited = new Set<string>()
  const components: Person[][] = []

  people.forEach(person => {
    if (visited.has(person.id)) return

    const stack = [person.id]
    const componentIds: string[] = []
    visited.add(person.id)

    while (stack.length > 0) {
      const currentId = stack.pop()
      if (!currentId) continue
      componentIds.push(currentId)
      adjacency.get(currentId)?.forEach(nextId => {
        if (!visited.has(nextId)) {
          visited.add(nextId)
          stack.push(nextId)
        }
      })
    }

    components.push(
      componentIds
        .map(id => peopleById.get(id))
        .filter((componentPerson): componentPerson is Person => Boolean(componentPerson))
        .sort((a, b) => stageSortRank[a.current_stage] - stageSortRank[b.current_stage] || a.name.localeCompare(b.name))
    )
  })

  components.sort((a, b) => {
    const aConnected = a.some(person => (degreeById.get(person.id) ?? 0) > 0)
    const bConnected = b.some(person => (degreeById.get(person.id) ?? 0) > 0)
    if (aConnected !== bConnected) return aConnected ? -1 : 1
    return (b.length - a.length) || (a[0]?.name ?? '').localeCompare(b[0]?.name ?? '')
  })

  const initialNodes: MapNode[] = []
  const connectedComponentCount = Math.max(1, components.filter(component => component.some(person => (degreeById.get(person.id) ?? 0) > 0)).length)
  let connectedComponentIndex = 0
  let isolatedIndex = 0
  const isolatedCount = components.filter(component => component.every(person => (degreeById.get(person.id) ?? 0) === 0)).length

  components.forEach(component => {
    component.forEach((person) => {
      const degree = degreeById.get(person.id) ?? 0
      const hash = hashString(person.id)
      const hash2 = hashString(person.id + 'xy')
      const hash3 = hashString(person.id + 'pos')

      // Spread stars across the full canvas
      // Avoid the center where Jesus is
      let x = 8 + ((hash % 1000) / 1000) * 84
      let y = 6 + ((hash2 % 1000) / 1000) * 88

      // If too close to center, push outward
      const dx = x - 50
      const dy = y - 50
      const distFromCenter = Math.sqrt(dx * dx + dy * dy)
      if (distFromCenter < 12) {
        const pushAngle = Math.atan2(dy, dx)
        const pushDist = 12 + ((hash3 % 100) / 100) * 8
        x = 50 + Math.cos(pushAngle) * pushDist
        y = 50 + Math.sin(pushAngle) * pushDist
      }

      initialNodes.push({
        ...person,
        degree,
        radius: distFromCenter,
        angle: Math.atan2(dy, dx),
        x: clamp(x, 5, 95),
        y: clamp(y, 4, 96),
      })
    })
  })

  // Light repulsion only for direct overlaps, preserve randomness
  let nodes = initialNodes
  for (let iteration = 0; iteration < 15; iteration += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]
        const b = nodes[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.1
        const minDist = 7 // Just enough to prevent label overlap

        if (distance < minDist) {
          // Push with some randomness to avoid grid patterns
          const hash = hashString(a.id + b.id)
          const jitter = ((hash % 100) / 100 - 0.5) * 0.3
          const push = (minDist - distance) / 2
          const nx = (dx / distance) + jitter
          const ny = (dy / distance) + jitter
          const len = Math.sqrt(nx * nx + ny * ny) || 1
          nodes[i] = { ...a, x: clamp(a.x - (nx / len) * push, 6, 94), y: clamp(a.y - (ny / len) * push, 5, 95) }
          nodes[j] = { ...b, x: clamp(b.x + (nx / len) * push, 6, 94), y: clamp(b.y + (ny / len) * push, 5, 95) }
        }
      }
    }
  }

  return nodes
}


const animateOrbitalNodes = (baseNodes: MapNode[], edges: GraphEdge[], seconds: number): MapNode[] => {
  let nodes = baseNodes.map(node => {
    const hash = hashString(node.id)
    const band = stageBand[node.current_stage]
    const connectionStability = Math.min(node.degree, 5)
    const speed = (node.degree === 0 ? 0.00875 : 0.006 / (1 + connectionStability * 0.2)) * (hash % 2 === 0 ? 1 : -1)
    const orbitalDrift = seconds * speed
    const freeWander = Math.sin(seconds * (0.014 + (hash % 11) * 0.001) + hash) * (node.degree === 0 ? 0.019 : 0.009)
    const radiusPulse = Math.sin(seconds * (0.023 + (hash % 7) * 0.001) + hash / 9) * (node.degree === 0 ? 0.16 : 0.08)
    const radius = clamp(node.radius + radiusPulse, band.min, band.max)
    const angle = node.angle + orbitalDrift + freeWander

    return projectNodeIntoStageBand({
      ...node,
      radius,
      angle,
      x: 50 + Math.cos(angle) * radius,
      y: 50 + Math.sin(angle) * radius * 0.72,
    })
  })

  const indexById = new Map(nodes.map((node, index) => [node.id, index]))
  const edgePairs = edges
    .map(edge => ({ fromIndex: indexById.get(edge.from), toIndex: indexById.get(edge.to) }))
    .filter((edge): edge is { fromIndex: number; toIndex: number } => edge.fromIndex !== undefined && edge.toIndex !== undefined)

  for (let pass = 0; pass < 3; pass += 1) {
    edgePairs.forEach(({ fromIndex, toIndex }) => {
      const from = nodes[fromIndex]
      const to = nodes[toIndex]
      const dx = to.x - from.x
      const dy = to.y - from.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.1
      const desiredDistance = 15 + Math.abs(stageSortRank[from.current_stage] - stageSortRank[to.current_stage]) * 1.6
      const pull = Math.max(0, distance - desiredDistance) * 0.012
      const nx = dx / distance
      const ny = dy / distance

      nodes[fromIndex] = projectNodeIntoStageBand({ ...from, x: from.x + nx * pull, y: from.y + ny * pull })
      nodes[toIndex] = projectNodeIntoStageBand({ ...to, x: to.x - nx * pull, y: to.y - ny * pull })
    })
  }

  for (let pass = 0; pass < 6; pass += 1) {
    nodes = applyElectronRepulsion(nodes, 0.16)
  }

  return nodes.map(node => {
    const constrainedNode = projectNodeIntoStageBand(node)
    return {
      ...constrainedNode,
      x: clamp(constrainedNode.x, 5, 95),
      y: clamp(constrainedNode.y, 7, 93),
    }
  })
}


const smoothNodesToward = (currentNodes: MapNode[], targetNodes: MapNode[]) => {
  if (currentNodes.length !== targetNodes.length) return targetNodes

  const currentById = new Map(currentNodes.map(node => [node.id, node]))
  const lerp = 0.022

  return targetNodes.map(targetNode => {
    const currentNode = currentById.get(targetNode.id)
    if (!currentNode) return targetNode

    const interpolated = {
      ...targetNode,
      x: currentNode.x + (targetNode.x - currentNode.x) * lerp,
      y: currentNode.y + (targetNode.y - currentNode.y) * lerp,
    }
    return projectNodeIntoStageBand(interpolated)
  })
}

const starKeyframes = `
@keyframes starTwinkle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}
@keyframes starTwinkleSlow {
  0%, 100% { opacity: 1; }
  40% { opacity: 0.3; }
  60% { opacity: 0.35; }
}
@keyframes starTwinkleFast {
  0%, 100% { opacity: 1; }
  30% { opacity: 0.4; }
  70% { opacity: 0.2; }
}
@keyframes searchPulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
  50% { transform: translate(-50%, -50%) scale(1.25); opacity: 0.4; }
}
`

const STAR_COLORS: Record<Stage, { core: string; glow: string }> = {
  Engage: { core: '#FFFFFF', glow: '#FFB040' },
  Establish: { core: '#FFFFFF', glow: '#40D8D0' },
  Equip: { core: '#FFFFFF', glow: '#60A0FF' },
  Empower: { core: '#FFFFFF', glow: '#FF80B0' },
}

// A person's map neighborhood: themselves, their direct connections in both
// directions (their coach + their disciples), and their entire downline —
// disciple edges followed recursively.
function neighborhoodOf(rootIds: Set<string>, connections: DiscipleshipConnection[]): Set<string> {
  const included = new Set(rootIds)
  connections.forEach(c => {
    if (c.disciple_person_id && rootIds.has(c.disciple_person_id)) included.add(c.discipler_person_id)
  })
  const queue = Array.from(rootIds)
  while (queue.length) {
    const id = queue.pop()!
    for (const c of connections) {
      if (c.discipler_person_id === id && c.disciple_person_id && !included.has(c.disciple_person_id)) {
        included.add(c.disciple_person_id)
        queue.push(c.disciple_person_id)
      }
    }
  }
  return included
}

function StarNode({ node, isSelected, isHighlighted, onClick, onMouseEnter, onMouseLeave }: { node: MapNode; isSelected: boolean; isHighlighted?: boolean; onClick: (e: React.MouseEvent) => void; onMouseEnter?: () => void; onMouseLeave?: () => void }) {
  const starColor = STAR_COLORS[node.current_stage]
  const stageIndex = STAGE_ORDER.indexOf(node.current_stage)

  const coreSize = 5 + stageIndex * 1.5 + Math.min(node.degree, 4) * 0.5
  const mainSpike = 14 + stageIndex * 5 + Math.min(node.degree, 4) * 2
  const diagSpike = mainSpike * 0.55
  const hash = hashString(node.id)
  const hash2 = hashString(node.id + 'twinkle')
  const twinkleDuration = 4 + (hash % 60) / 10  // 4 to 10 seconds
  const twinkleDelay = (hash2 % 300) / 30  // 0 to 10 seconds delay
  const animations = ['starTwinkle', 'starTwinkleSlow', 'starTwinkleFast']
  const twinkleAnim = animations[hash % 3]
  const totalSize = mainSpike * 2 + 16
  const cx = totalSize / 2
  const cy = totalSize / 2

  return (
    <button
      type="button"
      onClick={(e) => onClick(e)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group absolute -translate-x-1/2 -translate-y-1/2 text-left transition-opacity hover:!opacity-100 ${isSelected ? 'z-20' : 'z-10'}`}
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        // Matched search results stay at full brightness so the pulse ring reads clearly
        animation: isHighlighted ? 'none' : `${twinkleAnim} ${twinkleDuration}s ease-in-out ${twinkleDelay}s infinite`,
      }}
    >
      <style>{starKeyframes}</style>
      <div className="relative" style={{ width: totalSize, height: totalSize }}>
        {/* Gold pulse ring on search-matched stars */}
        {isHighlighted && (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: Math.max(coreSize * 6, 34),
              height: Math.max(coreSize * 6, 34),
              transform: 'translate(-50%, -50%)',
              border: '1.5px solid #F2C879',
              boxShadow: '0 0 12px 2px rgba(242,200,121,0.5), inset 0 0 8px rgba(242,200,121,0.3)',
              animation: 'searchPulse 1.8s ease-in-out infinite',
            }}
          />
        )}
        {/* Subtle glow halo */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2"
          style={{
            width: coreSize * 5,
            height: coreSize * 5,
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${starColor.glow}50 0%, ${starColor.glow}20 40%, transparent 70%)`,
          }}
        />

        {/* 8-point tapered spikes */}
        <svg
          className="pointer-events-none absolute left-1/2 top-1/2"
          width={totalSize}
          height={totalSize}
          style={{ transform: 'translate(-50%, -50%)' }}
        >
          <defs>
            {/* Vertical gradient (up spike) */}
            <linearGradient id={`up-${node.id}`} x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor={starColor.glow} stopOpacity="0.1" />
              <stop offset="70%" stopColor={starColor.glow} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
            </linearGradient>
            {/* Down spike */}
            <linearGradient id={`down-${node.id}`} x1="50%" y1="100%" x2="50%" y2="0%">
              <stop offset="0%" stopColor={starColor.glow} stopOpacity="0.1" />
              <stop offset="70%" stopColor={starColor.glow} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
            </linearGradient>
            {/* Left spike */}
            <linearGradient id={`left-${node.id}`} x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor={starColor.glow} stopOpacity="0.1" />
              <stop offset="70%" stopColor={starColor.glow} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
            </linearGradient>
            {/* Right spike */}
            <linearGradient id={`right-${node.id}`} x1="100%" y1="50%" x2="0%" y2="50%">
              <stop offset="0%" stopColor={starColor.glow} stopOpacity="0.1" />
              <stop offset="70%" stopColor={starColor.glow} stopOpacity="0.8" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Main 4 spikes - tapered triangles */}
          {/* Up */}
          <polygon
            points={`${cx},${cy - mainSpike} ${cx - 1.5},${cy} ${cx + 1.5},${cy}`}
            fill={`url(#up-${node.id})`}
          />
          {/* Down */}
          <polygon
            points={`${cx},${cy + mainSpike} ${cx - 1.5},${cy} ${cx + 1.5},${cy}`}
            fill={`url(#down-${node.id})`}
          />
          {/* Left */}
          <polygon
            points={`${cx - mainSpike},${cy} ${cx},${cy - 1.5} ${cx},${cy + 1.5}`}
            fill={`url(#left-${node.id})`}
          />
          {/* Right */}
          <polygon
            points={`${cx + mainSpike},${cy} ${cx},${cy - 1.5} ${cx},${cy + 1.5}`}
            fill={`url(#right-${node.id})`}
          />

          {/* Diagonal 4 spikes - thinner, shorter */}
          <polygon
            points={`${cx - diagSpike * 0.707},${cy - diagSpike * 0.707} ${cx - 0.8},${cy + 0.8} ${cx + 0.8},${cy - 0.8}`}
            fill={starColor.glow}
            fillOpacity="0.6"
          />
          <polygon
            points={`${cx + diagSpike * 0.707},${cy - diagSpike * 0.707} ${cx - 0.8},${cy - 0.8} ${cx + 0.8},${cy + 0.8}`}
            fill={starColor.glow}
            fillOpacity="0.6"
          />
          <polygon
            points={`${cx - diagSpike * 0.707},${cy + diagSpike * 0.707} ${cx + 0.8},${cy + 0.8} ${cx - 0.8},${cy - 0.8}`}
            fill={starColor.glow}
            fillOpacity="0.6"
          />
          <polygon
            points={`${cx + diagSpike * 0.707},${cy + diagSpike * 0.707} ${cx + 0.8},${cy - 0.8} ${cx - 0.8},${cy + 0.8}`}
            fill={starColor.glow}
            fillOpacity="0.6"
          />
        </svg>

        {/* Bright core orb */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: coreSize,
            height: coreSize,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: `radial-gradient(circle at 40% 40%, #FFFFFF 0%, #FFFFFF 30%, ${starColor.glow} 100%)`,
            boxShadow: `
              0 0 ${coreSize * 0.8}px #FFFFFF,
              0 0 ${coreSize * 1.5}px ${starColor.glow},
              0 0 ${coreSize * 2.5}px ${starColor.glow}80
            `,
          }}
        />
      </div>

      {/* Name label */}
      <div
        className="max-w-[90px] truncate rounded-full px-1.5 py-0.5 text-center text-[9px] font-medium"
        style={{
          marginTop: -mainSpike * 0.4,
          background: 'rgba(6,8,20,.7)',
          color: starColor.glow,
        }}
      >
        {node.name.split(' ')[0]}
        {node.degree > 0 && <span style={{ opacity: 0.7 }}> · {node.degree}</span>}
      </div>
    </button>
  )
}

export default function MyCircleMap({
  refreshKey = 0,
  filterStages,
  sortMode = '4e',
  searchQuery = '',
  allowedPersonIds,
  onChanged,
}: {
  refreshKey?: number
  filterStages?: Stage[]
  sortMode?: 'az' | '4e'
  searchQuery?: string
  allowedPersonIds?: string[]
  onChanged?: () => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [connections, setConnections] = useState<DiscipleshipConnection[]>([])
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [groupMemberships, setGroupMemberships] = useState<{ person_id: string; victory_group_id: string }[]>([])
  const [animatedNodes, setAnimatedNodes] = useState<MapNode[]>([])
  const frameRef = useRef<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null)
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null)
  const [showAllConnections, setShowAllConnections] = useState(false)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Testimony card is click-to-dismiss: hovering a star that has a testimony
  // opens a single container-level card pinned over that star, and it stays
  // open until the user clicks its X — moving the mouse away no longer closes
  // it. Hovering a different testimony star switches the card to that person.
  // hoveredPersonId still drives the connection-line highlight on hover.
  const [openTestimonyId, setOpenTestimonyId] = useState<string | null>(null)
  const enterNode = (id: string) => {
    setHoveredPersonId(id)
    const n = nodeById.get(id)
    if (n && (n.testimony_text || n.testimony_video_url)) setOpenTestimonyId(id)
  }
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [mapRefreshKey, setMapRefreshKey] = useState(0)
  const [error, setError] = useState('')
  const [activeStages, setActiveStages] = useState<Set<Stage>>(new Set(['Engage', 'Establish', 'Equip', 'Empower']))
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set())
  const [showGroupsDropdown, setShowGroupsDropdown] = useState(false)

  const filterKey = filterStages?.join('|') ?? 'All'

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const loadMap = async () => {
      setError('')
      const [peopleResult, connectionResult, groupsResult, membershipsResult] = await Promise.all([
        getPeople(),
        getAllDiscipleshipConnections(),
        getVictoryGroups(),
        getAllGroupMemberships(),
      ])

      if (peopleResult.error) {
        setError(peopleResult.error.message)
        return
      }

      const sortedPeople = [...((peopleResult.data ?? []) as Person[])].sort((a, b) => {
        if (sortMode === 'az') return a.name.localeCompare(b.name)
        return stageSortRank[a.current_stage] - stageSortRank[b.current_stage] || a.name.localeCompare(b.name)
      })

      if (connectionResult.error) {
        setError(connectionResult.error.message)
        setPeople(sortedPeople)
        return
      }

      setPeople(sortedPeople)
      setConnections((connectionResult.data ?? []) as DiscipleshipConnection[])
      setGroups((groupsResult.data ?? []) as VictoryGroup[])
      setGroupMemberships((membershipsResult.data ?? []) as { person_id: string; victory_group_id: string }[])
    }

    loadMap()
  }, [refreshKey, mapRefreshKey, filterKey, sortMode])

  // Stars whose name matches the search text — they get the gold pulse ring,
  // and the map keeps them plus their connections + downline visible.
  const searchMatchedIds = useMemo(() => {
    if (!searchQuery) return null
    const q = searchQuery.toLowerCase()
    let pool = people
    if (allowedPersonIds) {
      const allow = new Set(allowedPersonIds)
      pool = pool.filter(person => allow.has(person.id))
    }
    return new Set(pool.filter(person => person.name.toLowerCase().includes(q)).map(person => person.id))
  }, [people, searchQuery, allowedPersonIds])

  const visiblePeopleForMap = useMemo(() => {
    let filtered = people

    // Scope to "My Constellation" when an allowlist is provided
    if (allowedPersonIds) {
      const allow = new Set(allowedPersonIds)
      filtered = filtered.filter(person => allow.has(person.id))
    }

    // Filter by search query: keep matches plus their connections + downline
    if (searchMatchedIds) {
      const included = neighborhoodOf(searchMatchedIds, connections)
      filtered = filtered.filter(person => included.has(person.id))
    }

    // Filter by active stages
    if (activeStages.size < 4) {
      filtered = filtered.filter(person => activeStages.has(person.current_stage))
    }

    // Filter by selected groups (using join table)
    if (selectedGroupIds.size > 0) {
      const personIdsInSelectedGroups = new Set(
        groupMemberships
          .filter(m => selectedGroupIds.has(m.victory_group_id))
          .map(m => m.person_id)
      )
      filtered = filtered.filter(person => personIdsInSelectedGroups.has(person.id))
    }

    // If focused on a person, show their connections + full downline
    if (focusedPersonId) {
      const included = neighborhoodOf(new Set([focusedPersonId]), connections)
      return filtered.filter(person => included.has(person.id))
    }

    // Legacy external filter (from parent component)
    if (filterStages && filterStages.length > 0) {
      return filtered.filter(person => filterStages.includes(person.current_stage))
    }

    return filtered
  }, [people, connections, focusedPersonId, filterStages, activeStages, selectedGroupIds, groupMemberships, searchMatchedIds, allowedPersonIds])

  const focusedPerson = focusedPersonId ? people.find(person => person.id === focusedPersonId) : undefined

  const visibleConnectionsForMap = useMemo(() => {
    if (!focusedPersonId) return connections

    const included = neighborhoodOf(new Set([focusedPersonId]), connections)
    return connections.filter(connection => (
      connection.disciple_person_id &&
      included.has(connection.discipler_person_id) &&
      included.has(connection.disciple_person_id)
    ))
  }, [connections, focusedPersonId])

  const baseNodes = useMemo(() => {
    return buildGraphAwareLayout(visiblePeopleForMap, visibleConnectionsForMap)
  }, [visiblePeopleForMap, visibleConnectionsForMap])

  const graphEdges = useMemo(() => visibleGraphEdgesFor(visiblePeopleForMap, visibleConnectionsForMap), [visiblePeopleForMap, visibleConnectionsForMap])

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    setAnimatedNodes(baseNodes)
  }, [baseNodes])

  const nodes = animatedNodes.length > 0 ? animatedNodes : baseNodes

  const nodeById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])
  const selectedNode = selectedId ? nodeById.get(selectedId) : nodes[0]

  const visibleConnections = useMemo(() => {
    return visibleConnectionsForMap.filter(connection => {
      return Boolean(
        nodeById.get(connection.discipler_person_id) &&
        connection.disciple_person_id &&
        nodeById.get(connection.disciple_person_id)
      )
    })
  }, [visibleConnectionsForMap, nodeById])

  const handleNodeClick = (node: MapNode, event: React.MouseEvent) => {
    if (event.detail >= 2) {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
      setSelectedId(node.id)
      setEditingPerson(node)
      return
    }

    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    clickTimerRef.current = setTimeout(() => {
      setSelectedId(node.id)
      setFocusedPersonId(current => current === node.id ? null : node.id)
    }, 220)
  }

  if (visiblePeopleForMap.length === 0) {
    return (
      <div className="cn-card p-6 text-center">
        <p className="text-[var(--fg-2)]">No people found in this view yet.</p>
      </div>
    )
  }

  return (
    <section className="cn-card overflow-hidden">
      <div className="border-b border-[var(--line-1)] p-4">
        <div className="flex flex-col gap-3">
          <div>
            <h3 className="cn-h3">Connection Map</h3>
            <p className="text-sm text-[var(--fg-2)]">Christ is the center; closer relationships draw darker, steadier lines while distant relationships appear lighter and more dotted.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['Engage', 'Establish', 'Equip', 'Empower'] as Stage[]).map(stage => {
              const isActive = activeStages.has(stage)
              const color = STAGE_COLORS[stage]
              return (
                <button
                  key={stage}
                  type="button"
                  onClick={() => {
                    setActiveStages(prev => {
                      const next = new Set(prev)
                      if (next.has(stage)) {
                        next.delete(stage)
                      } else {
                        next.add(stage)
                      }
                      return next
                    })
                  }}
                  className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
                  style={{
                    background: isActive ? `${color}25` : 'var(--indigo)',
                    border: `1.5px solid ${isActive ? color : 'var(--line-2)'}`,
                    color: isActive ? color : 'var(--fg-3)',
                    opacity: isActive ? 1 : 0.6,
                  }}
                >
                  {stageLabels[stage].name}
                </button>
              )
            })}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowGroupsDropdown(prev => !prev)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all"
                style={{
                  background: selectedGroupIds.size > 0 ? 'rgba(91,141,247,.2)' : 'var(--indigo)',
                  border: `1.5px solid ${selectedGroupIds.size > 0 ? 'var(--equip)' : 'var(--line-2)'}`,
                  color: selectedGroupIds.size > 0 ? 'var(--equip)' : 'var(--fg-3)',
                }}
              >
                Grace Groups {selectedGroupIds.size > 0 && `(${selectedGroupIds.size})`}
                <span className="text-[10px]">▼</span>
              </button>
              {showGroupsDropdown && (
                <div
                  className="absolute right-0 top-full z-30 mt-1 min-w-[180px] rounded-xl border border-[var(--line-1)] bg-[var(--space)] p-2 shadow-xl"
                >
                  {groups.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-[var(--fg-3)]">No groups yet</p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setSelectedGroupIds(new Set())}
                        className="mb-1 w-full rounded-lg px-2 py-1 text-left text-xs text-[var(--fg-2)] hover:bg-[var(--indigo-2)]"
                      >
                        Show All
                      </button>
                      {groups.map(group => {
                        const isSelected = selectedGroupIds.has(group.id)
                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => {
                              setSelectedGroupIds(prev => {
                                const next = new Set(prev)
                                if (next.has(group.id)) {
                                  next.delete(group.id)
                                } else {
                                  next.add(group.id)
                                }
                                return next
                              })
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--indigo-2)]"
                          >
                            <span
                              className="flex h-4 w-4 items-center justify-center rounded border text-[10px]"
                              style={{
                                borderColor: isSelected ? 'var(--equip)' : 'var(--line-2)',
                                background: isSelected ? 'var(--equip)' : 'transparent',
                                color: isSelected ? 'var(--void)' : 'transparent',
                              }}
                            >
                              {isSelected && '✓'}
                            </span>
                            <span className="text-[var(--fg-1)]">{group.name}</span>
                          </button>
                        )
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Connection lines toggle */}
            <button
              type="button"
              onClick={() => setShowAllConnections(prev => !prev)}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-all"
              style={{
                background: showAllConnections ? 'rgba(251,246,236,.15)' : 'var(--indigo)',
                border: `1.5px solid ${showAllConnections ? 'var(--fg-2)' : 'var(--line-2)'}`,
                color: showAllConnections ? 'var(--fg-1)' : 'var(--fg-3)',
              }}
            >
              {showAllConnections ? '✦ Connections On' : '○ Connections Off'}
            </button>
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 p-2 text-sm text-[var(--warning)]">
            Some connection lines could not load yet: {error}
          </p>
        )}
        {focusedPerson && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[var(--line-1)] bg-[var(--indigo)] p-3 text-sm text-[var(--fg-2)] sm:flex-row sm:items-center sm:justify-between">
            <div>
              Showing connections + downline for <span className="font-semibold text-[var(--fg-1)]">{focusedPerson.name}</span>
              <span className="text-[var(--fg-3)]"> · {visibleConnections.length} connection {visibleConnections.length === 1 ? 'line' : 'lines'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFocusedPersonId(null)
                setSelectedId(null)
              }}
              className="cn-btn cn-btn-primary self-start !px-3 !py-1.5 !text-xs sm:self-center"
            >
              Show Everyone
            </button>
          </div>
        )}
      </div>

      <div>
        <div
          className="relative min-h-[600px] overflow-hidden sm:min-h-[700px] lg:min-h-[800px]"
          style={{
            background: 'linear-gradient(180deg, #030510 0%, #0a0d1a 50%, #050814 100%)',
          }}
        >
          {/* Starfield background */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="nebula1" cx="30%" cy="40%" r="40%">
                <stop offset="0%" stopColor="#5B8DF7" stopOpacity="0.08" />
                <stop offset="50%" stopColor="#36D6C3" stopOpacity="0.04" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <radialGradient id="nebula2" cx="70%" cy="60%" r="35%">
                <stop offset="0%" stopColor="#F0729F" stopOpacity="0.06" />
                <stop offset="60%" stopColor="#F4B650" stopOpacity="0.03" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
              <radialGradient id="centerGlow" cx="50%" cy="50%" r="25%">
                <stop offset="0%" stopColor="#F2C879" stopOpacity="0.15" />
                <stop offset="40%" stopColor="#F2C879" stopOpacity="0.08" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>
            {/* Nebula clouds */}
            <rect width="100%" height="100%" fill="url(#nebula1)" />
            <rect width="100%" height="100%" fill="url(#nebula2)" />
            <rect width="100%" height="100%" fill="url(#centerGlow)" />
            {/* Random background stars */}
            {Array.from({ length: 200 }).map((_, i) => {
              const seed = i * 7919
              const x = ((seed * 13) % 1000) / 10
              const y = ((seed * 17) % 1000) / 10
              const size = 0.3 + ((seed * 23) % 100) / 100
              const opacity = 0.3 + ((seed * 31) % 100) / 150
              const delay = ((seed * 41) % 300) / 25
              const duration = 3 + ((seed * 53) % 80) / 10
              const anims = ['starTwinkle', 'starTwinkleSlow', 'starTwinkleFast']
              const anim = anims[seed % 3]
              return (
                <circle
                  key={i}
                  cx={`${x}%`}
                  cy={`${y}%`}
                  r={size}
                  fill="white"
                  opacity={opacity}
                  style={{
                    animation: `${anim} ${duration}s ease-in-out infinite`,
                    animationDelay: `${delay}s`,
                  }}
                />
              )
            })}
          </svg>


          {/* Connection lines SVG */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ width: '100%', height: '100%' }}>
            {/* Christ lines - only show for hovered node or when toggle is on;
                always on while a search or focus narrows the map to a neighborhood */}
            {nodes.map(node => {
              const showLine = showAllConnections || Boolean(searchMatchedIds) || Boolean(focusedPersonId) ||
                hoveredPersonId === node.id
              if (!showLine) return null

              const christLine = christLineStyle[node.current_stage]
              return (
                <line
                  key={`christ-${node.id}`}
                  x1="50%"
                  y1="50%"
                  x2={`${node.x}%`}
                  y2={`${node.y}%`}
                  stroke={christLine.stroke}
                  strokeWidth={christLine.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={christLine.strokeDasharray}
                />
              )
            })}

            {/* Relationship lines - only show when connected to hovered/focused node or toggle is on */}
            {visibleConnections.map(connection => {
              const from = nodeById.get(connection.discipler_person_id)
              const to = connection.disciple_person_id ? nodeById.get(connection.disciple_person_id) : undefined
              if (!from || !to) return null

              const showLine = showAllConnections || Boolean(searchMatchedIds) || Boolean(focusedPersonId) ||
                hoveredPersonId === from.id || hoveredPersonId === to.id
              if (!showLine) return null

              const relationshipLine = relationshipLineStyleForDistance(from, to)

              return (
                <line
                  key={connection.id}
                  x1={`${from.x}%`}
                  y1={`${from.y}%`}
                  x2={`${to.x}%`}
                  y2={`${to.y}%`}
                  stroke={relationshipLine.stroke}
                  strokeWidth={relationshipLine.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={relationshipLine.strokeDasharray}
                />
              )
            })}
          </svg>

          {/* Instructions */}
          <div
            className="absolute left-4 top-4 max-w-[250px] rounded-xl border border-[var(--line-1)] px-3 py-2 text-xs"
            style={{ background: 'rgba(6,8,20,.8)', backdropFilter: 'blur(8px)' }}
          >
            <div className="font-semibold text-[var(--fg-1)]">Hover to see connections</div>
            <div className="mt-1 text-[var(--fg-3)]">Click to focus · Double-click to edit</div>
          </div>

          {/* Center - Jesus (Golden Star) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative" style={{ width: 200, height: 200 }}>
              {/* Warm glow halo */}
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{
                  width: 140,
                  height: 140,
                  background: 'radial-gradient(circle, rgba(255,180,60,0.4) 0%, rgba(255,140,40,0.15) 50%, transparent 70%)',
                }}
              />

              {/* 8-point star spikes - tapered polygons */}
              <svg
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                width="200"
                height="200"
              >
                <defs>
                  {/* Up spike */}
                  <linearGradient id="jesusUp" x1="50%" y1="0%" x2="50%" y2="100%">
                    <stop offset="0%" stopColor="#FFB040" stopOpacity="0.1" />
                    <stop offset="70%" stopColor="#FFD080" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
                  </linearGradient>
                  {/* Down spike */}
                  <linearGradient id="jesusDown" x1="50%" y1="100%" x2="50%" y2="0%">
                    <stop offset="0%" stopColor="#FFB040" stopOpacity="0.1" />
                    <stop offset="70%" stopColor="#FFD080" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
                  </linearGradient>
                  {/* Left spike */}
                  <linearGradient id="jesusLeft" x1="0%" y1="50%" x2="100%" y2="50%">
                    <stop offset="0%" stopColor="#FFB040" stopOpacity="0.1" />
                    <stop offset="70%" stopColor="#FFD080" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
                  </linearGradient>
                  {/* Right spike */}
                  <linearGradient id="jesusRight" x1="100%" y1="50%" x2="0%" y2="50%">
                    <stop offset="0%" stopColor="#FFB040" stopOpacity="0.1" />
                    <stop offset="70%" stopColor="#FFD080" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="1" />
                  </linearGradient>
                </defs>

                {/* Main 4 spikes - tapered triangles */}
                <polygon points="100,10 97,100 103,100" fill="url(#jesusUp)" />
                <polygon points="100,190 97,100 103,100" fill="url(#jesusDown)" />
                <polygon points="10,100 100,97 100,103" fill="url(#jesusLeft)" />
                <polygon points="190,100 100,97 100,103" fill="url(#jesusRight)" />

                {/* Diagonal 4 spikes - shorter, thinner */}
                <polygon points="50,50 98,101 101,98" fill="#FFD080" fillOpacity="0.5" />
                <polygon points="150,50 99,98 102,101" fill="#FFD080" fillOpacity="0.5" />
                <polygon points="50,150 101,102 98,99" fill="#FFD080" fillOpacity="0.5" />
                <polygon points="150,150 102,99 99,102" fill="#FFD080" fillOpacity="0.5" />
              </svg>

              {/* Bright warm core */}
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: 22,
                  height: 22,
                  background: 'radial-gradient(circle at 40% 40%, #FFFFFF 0%, #FFFFFF 30%, #FFD060 70%, #FFB030 100%)',
                  boxShadow: `
                    0 0 12px 4px rgba(255,255,255,0.9),
                    0 0 25px 8px rgba(255,200,80,0.5),
                    0 0 45px 12px rgba(255,160,40,0.3)
                  `,
                }}
              />
            </div>

            {/* Label */}
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-semibold"
              style={{
                top: 130,
                background: 'rgba(6,8,20,.75)',
                color: '#FFD080',
              }}
            >
              Jesus
            </div>
          </div>

          {/* Star nodes */}
          {nodes.map(node => (
            <StarNode
              key={node.id}
              node={node}
              isSelected={selectedNode?.id === node.id}
              isHighlighted={Boolean(searchMatchedIds?.has(node.id))}
              onClick={(e) => handleNodeClick(node, e)}
              onMouseEnter={() => enterNode(node.id)}
              onMouseLeave={() => setHoveredPersonId(null)}
            />
          ))}

          {/* Testimony card — single container-level element pinned over the
              star that was hovered. Stays open until the X is clicked. */}
          {(() => {
            if (!openTestimonyId) return null
            const node = nodeById.get(openTestimonyId)
            if (!node || (!node.testimony_text && !node.testimony_video_url)) return null
            const starColor = STAR_COLORS[node.current_stage]
            // Flip below the star when it sits near the top edge (the map
            // container clips overflow, so an above-popup would be cut off).
            const below = node.y < 26
            return (
              <div
                className="absolute z-50 w-52"
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  // Bottom/top edge sits 6px shy of the star center so the
                  // card overlaps the star's upper (or lower) spikes for a
                  // connected look without burying the star itself.
                  transform: below
                    ? 'translate(-50%, 0%) translateY(6px)'
                    : 'translate(-50%, -100%) translateY(-6px)',
                  background: 'rgba(6,8,20,.94)',
                  backdropFilter: 'blur(14px)',
                  border: `1px solid ${starColor.glow}40`,
                  borderRadius: 14,
                  padding: '10px 12px',
                  boxShadow: `0 0 24px -4px ${starColor.glow}50`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: starColor.glow }} />
                  <span className="text-[10px] font-semibold" style={{ color: starColor.glow }}>
                    {node.name.split(' ')[0]}&rsquo;s story
                  </span>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={(e) => { e.stopPropagation(); setOpenTestimonyId(null) }}
                    className="ml-auto flex h-5 w-5 items-center justify-center rounded-full text-[12px] leading-none text-[var(--fg-2)] transition-colors hover:bg-[var(--indigo-2)] hover:text-[var(--fg-1)]"
                  >
                    ✕
                  </button>
                </div>
                {node.testimony_video_url ? (
                  <video
                    src={node.testimony_video_url}
                    className="w-full rounded-lg"
                    style={{ maxHeight: 140 }}
                    playsInline
                    controls
                    preload="metadata"
                  />
                ) : (
                  <p className="text-[11px] italic leading-relaxed text-[var(--fg-2)]">
                    &ldquo;{(node.testimony_text ?? '').slice(0, 180)}{(node.testimony_text ?? '').length > 180 ? '…' : ''}&rdquo;
                  </p>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {editingPerson && (
        <PersonProfileModal
          person={editingPerson}
          onClose={() => setEditingPerson(null)}
          onSaved={() => {
            setMapRefreshKey(key => key + 1)
            onChanged?.()
          }}
          onDeleted={() => {
            setEditingPerson(null)
            setFocusedPersonId(null)
            setSelectedId(null)
            setMapRefreshKey(key => key + 1)
            onChanged?.()
          }}
        />
      )}

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 border-t border-[var(--line-1)] bg-[var(--void)] p-3 text-xs sm:grid-cols-4">
        {STAGE_ORDER.map((stage, idx) => {
          const color = STAGE_COLORS[stage]
          const starSize = 8 + idx * 2
          return (
            <div
              key={stage}
              className="flex items-center gap-2 rounded-xl p-2"
              style={{ background: `${color}08` }}
            >
              <div
                className="relative flex shrink-0 items-center justify-center"
                style={{ width: 20, height: 20 }}
              >
                {/* Mini star glow */}
                <div
                  className="absolute rounded-full"
                  style={{
                    width: starSize * 2,
                    height: starSize * 2,
                    background: `radial-gradient(circle, ${color}40 0%, transparent 70%)`,
                  }}
                />
                {/* Mini star core */}
                <div
                  className="rounded-full"
                  style={{
                    width: starSize,
                    height: starSize,
                    background: `radial-gradient(circle at 35% 35%, white 0%, ${color} 60%)`,
                    boxShadow: `0 0 ${starSize / 2}px ${color}`,
                  }}
                />
              </div>
              <span style={{ color }}>{stageLabels[stage].display}</span>
              <span className="hidden text-[var(--fg-3)] sm:inline">· {STAGE_LABELS[stage]}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
