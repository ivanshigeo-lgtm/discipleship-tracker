'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getAllDiscipleshipConnections, getPeople } from '../lib/supabaseQueries'
import type { DiscipleshipConnection, Person, Stage } from '../types/database'
import { stageLabels } from '../lib/stageLabels'
import PersonProfileModal from './PersonProfileModal'

type MapNode = Person & {
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

const stageOrbit: Record<Stage, number> = {
  // Six visible rings. Ring 1 surrounds Christ, then rings 2-6 move outward.
  // Empower: ring 1-2, Equip: ring 2-3, Establish: ring 3-4, Engage: ring 4-5.
  Empower: 17,
  Equip: 27,
  Establish: 35.5,
  Engage: 42.5,
}

const stageBand: Record<Stage, { min: number; max: number }> = {
  Empower: { min: 13, max: 21 },
  Equip: { min: 23, max: 31 },
  Establish: { min: 32, max: 39 },
  Engage: { min: 40, max: 46 },
}

const stageSortRank: Record<Stage, number> = {
  Engage: 0,
  Establish: 1,
  Equip: 2,
  Empower: 3,
}

const stageStyle: Record<Stage, { glow: string; ring: string; bg: string; label: string; symbol: string; outline: string; outlineSoft: string }> = {
  Engage: {
    glow: 'shadow-emerald-300/60',
    ring: 'border-emerald-300',
    bg: 'bg-emerald-400',
    label: 'Engaged',
    symbol: '🌱',
    outline: '#6ee7b7',
    outlineSoft: 'rgba(110,231,183,0.28)',
  },
  Establish: {
    glow: 'shadow-amber-900/50',
    ring: 'border-amber-900',
    bg: 'bg-amber-800',
    label: 'Established',
    symbol: '📖',
    outline: '#f59e0b',
    outlineSoft: 'rgba(245,158,11,0.24)',
  },
  Equip: {
    glow: 'shadow-amber-300/70',
    ring: 'border-amber-300',
    bg: 'bg-amber-400',
    label: 'Equipped',
    symbol: '🔥',
    outline: '#fde68a',
    outlineSoft: 'rgba(253,230,138,0.34)',
  },
  Empower: {
    glow: 'shadow-black/70',
    ring: 'border-gray-950',
    bg: 'bg-gray-950',
    label: 'Empowered',
    symbol: '✝',
    outline: '#facc15',
    outlineSoft: 'rgba(250,204,21,0.34)',
  },
}

const christLineStyle: Record<Stage, { stroke: string; strokeWidth: string; strokeDasharray?: string }> = {
  Empower: {
    stroke: 'rgba(250, 204, 21, 0.62)',
    strokeWidth: '0.42',
  },
  Equip: {
    stroke: 'rgba(250, 204, 21, 0.42)',
    strokeWidth: '0.32',
    strokeDasharray: '2 0.85',
  },
  Establish: {
    stroke: 'rgba(250, 204, 21, 0.28)',
    strokeWidth: '0.24',
    strokeDasharray: '1 1.25',
  },
  Engage: {
    stroke: 'rgba(250, 204, 21, 0.18)',
    strokeWidth: '0.18',
    strokeDasharray: '0.35 1.45',
  },
}

function RoyalCrownIcon() {
  return (
    <svg viewBox="0 0 120 92" className="h-20 w-24 drop-shadow-[0_0_18px_rgba(250,204,21,0.65)]" role="img" aria-label="Royal crown for Christ the King">
      <defs>
        <linearGradient id="royal-crown-gold" x1="15" x2="105" y1="12" y2="82" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff7ad" />
          <stop offset="0.22" stopColor="#facc15" />
          <stop offset="0.48" stopColor="#f59e0b" />
          <stop offset="0.72" stopColor="#fde68a" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="royal-crown-shadow" x1="18" x2="104" y1="48" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset="0.65" stopColor="#d97706" />
          <stop offset="1" stopColor="#78350f" />
        </linearGradient>
        <radialGradient id="ruby-glow" cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fecdd3" />
          <stop offset="0.38" stopColor="#ef4444" />
          <stop offset="1" stopColor="#7f1d1d" />
        </radialGradient>
        <radialGradient id="sapphire-glow" cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#dbeafe" />
          <stop offset="0.42" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e3a8a" />
        </radialGradient>
        <radialGradient id="emerald-glow" cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#bbf7d0" />
          <stop offset="0.42" stopColor="#22c55e" />
          <stop offset="1" stopColor="#14532d" />
        </radialGradient>
        <filter id="crown-soft-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#000" floodOpacity="0.45" />
          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#facc15" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter="url(#crown-soft-shadow)">
        <path
          d="M15 67 23 24l22 25 15-38 15 38 22-25 8 43H15Z"
          fill="url(#royal-crown-gold)"
          stroke="#fff7ad"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M20 66c11-8 69-8 80 0l-5 16H25l-5-16Z"
          fill="url(#royal-crown-shadow)"
          stroke="#fef3c7"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path d="M27 63 34 39l12 18M60 21v41M93 63 86 39 74 57" stroke="#fff8c7" strokeWidth="2" strokeLinecap="round" opacity="0.62" />
        <path d="M30 75c18-5 42-5 60 0" stroke="#fff7ad" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
        <path d="M27 80h66" stroke="#92400e" strokeWidth="2" strokeLinecap="round" opacity="0.45" />

        <circle cx="23" cy="24" r="6.5" fill="url(#sapphire-glow)" stroke="#bfdbfe" strokeWidth="1.6" />
        <circle cx="60" cy="12" r="7.5" fill="url(#ruby-glow)" stroke="#fecaca" strokeWidth="1.8" />
        <circle cx="97" cy="24" r="6.5" fill="url(#emerald-glow)" stroke="#bbf7d0" strokeWidth="1.6" />
        <ellipse cx="45" cy="70" rx="5.5" ry="7" fill="url(#sapphire-glow)" stroke="#dbeafe" strokeWidth="1.3" />
        <ellipse cx="60" cy="70" rx="6" ry="8" fill="url(#ruby-glow)" stroke="#fecaca" strokeWidth="1.4" />
        <ellipse cx="75" cy="70" rx="5.5" ry="7" fill="url(#emerald-glow)" stroke="#bbf7d0" strokeWidth="1.3" />

        <path d="M18 65c14-4 70-4 84 0" stroke="#fff7ad" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        <path d="M33 31 45 48M60 20 60 47M87 31 75 48" stroke="#78350f" strokeWidth="1.3" strokeLinecap="round" opacity="0.28" />
      </g>
    </svg>
  )
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
  const opacity = 0.16 + closeness * 0.62
  const strokeWidth = 0.18 + closeness * 0.28

  if (closeness > 0.72) {
    return {
      stroke: `rgba(255,255,255,${opacity.toFixed(2)})`,
      strokeWidth: strokeWidth.toFixed(2),
      strokeDasharray: undefined,
    }
  }

  if (closeness > 0.42) {
    return {
      stroke: `rgba(255,255,255,${opacity.toFixed(2)})`,
      strokeWidth: strokeWidth.toFixed(2),
      strokeDasharray: '2 1',
    }
  }

  return {
    stroke: `rgba(255,255,255,${opacity.toFixed(2)})`,
    strokeWidth: strokeWidth.toFixed(2),
    strokeDasharray: '0.55 1.45',
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

const buildGraphAwareLayout = (people: Person[], connections: DiscipleshipConnection[]): MapNode[] => {
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
    const isConnectedComponent = component.some(person => (degreeById.get(person.id) ?? 0) > 0)
    const componentAngle = isConnectedComponent
      ? (connectedComponentIndex++ / connectedComponentCount) * Math.PI * 2 - Math.PI / 2
      : (isolatedIndex++ / Math.max(1, isolatedCount)) * Math.PI * 2 + Math.PI / 2
    const spread = component.length <= 1 ? 0 : Math.min(0.95, 0.22 * component.length)

    component.forEach((person, localIndex) => {
      const degree = degreeById.get(person.id) ?? 0
      const hash = hashString(person.id)
      const localOffset = component.length <= 1
        ? 0
        : (localIndex - (component.length - 1) / 2) * (spread / Math.max(1, component.length - 1))
      const angle = componentAngle + localOffset + ((hash % 19) / 19 - 0.5) * 0.08
      const band = stageBand[person.current_stage]
      const connectionPull = Math.min(degree * 1.2, 5)
      const radius = clamp(stageOrbit[person.current_stage] - connectionPull + ((hash % 7) - 3) * 0.28, band.min, band.max)

      initialNodes.push({
        ...person,
        degree,
        radius,
        angle,
        x: 50 + Math.cos(angle) * radius,
        y: 50 + Math.sin(angle) * radius * 0.72,
      })
    })
  })

  let nodes = initialNodes
  const edgePairs = edges
    .map(edge => ({ edge, fromIndex: nodes.findIndex(node => node.id === edge.from), toIndex: nodes.findIndex(node => node.id === edge.to) }))
    .filter(edge => edge.fromIndex >= 0 && edge.toIndex >= 0)

  for (let iteration = 0; iteration < 260; iteration += 1) {
    const cooling = 1 - iteration / 260

    // Keep connected nodes close: relationship lines should be as short as practical.
    edgePairs.forEach(({ fromIndex, toIndex }) => {
      const from = nodes[fromIndex]
      const to = nodes[toIndex]
      const dx = to.x - from.x
      const dy = to.y - from.y
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.1
      const desiredDistance = 8.5 + Math.abs(stageSortRank[from.current_stage] - stageSortRank[to.current_stage]) * 1.3
      const pull = (distance - desiredDistance) * 0.045 * cooling
      const nx = dx / distance
      const ny = dy / distance

      nodes[fromIndex] = projectNodeIntoStageBand({ ...from, x: from.x + nx * pull, y: from.y + ny * pull })
      nodes[toIndex] = projectNodeIntoStageBand({ ...to, x: to.x - nx * pull, y: to.y - ny * pull })
    })

    // Electron-like repulsion: nodes naturally avoid crowding so names stay readable.
    nodes = applyElectronRepulsion(nodes, 0.78 * cooling)

    // Keep each 4E stage near its Christ-centered ring while still allowing graph clusters.
    nodes = nodes.map(node => {
      const dx = node.x - 50
      const dy = (node.y - 50) / 0.72
      const distanceFromCenter = Math.sqrt(dx * dx + dy * dy) || 0.1
      const band = stageBand[node.current_stage]
      const desiredRadius = clamp(stageOrbit[node.current_stage] - Math.min(node.degree * 0.8, 4), band.min, band.max)
      const radialPull = (desiredRadius - distanceFromCenter) * 0.018 * cooling

      return projectNodeIntoStageBand({
        ...node,
        x: node.x + (dx / distanceFromCenter) * radialPull,
        y: node.y + (dy / distanceFromCenter) * radialPull * 0.72,
      })
    })

    // Penalize crossing lines by nudging crossing edge groups apart.
    for (let i = 0; i < edgePairs.length; i += 1) {
      for (let j = i + 1; j < edgePairs.length; j += 1) {
        const first = edgePairs[i]
        const second = edgePairs[j]
        if (
          first.edge.from === second.edge.from ||
          first.edge.from === second.edge.to ||
          first.edge.to === second.edge.from ||
          first.edge.to === second.edge.to
        ) continue

        const a = nodes[first.fromIndex]
        const b = nodes[first.toIndex]
        const c = nodes[second.fromIndex]
        const d = nodes[second.toIndex]

        if (!segmentIntersects(a, b, c, d)) continue

        const firstMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const secondMid = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 }
        const dx = firstMid.x - secondMid.x || 0.1
        const dy = firstMid.y - secondMid.y || 0.1
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.1
        const push = 0.55 * cooling
        const nx = dx / distance
        const ny = dy / distance

        nodes[first.fromIndex] = projectNodeIntoStageBand({ ...a, x: a.x + nx * push, y: a.y + ny * push })
        nodes[first.toIndex] = projectNodeIntoStageBand({ ...b, x: b.x + nx * push, y: b.y + ny * push })
        nodes[second.fromIndex] = projectNodeIntoStageBand({ ...c, x: c.x - nx * push, y: c.y - ny * push })
        nodes[second.toIndex] = projectNodeIntoStageBand({ ...d, x: d.x - nx * push, y: d.y - ny * push })
      }
    }

    nodes = nodes.map(node => {
      const constrainedNode = projectNodeIntoStageBand(node)
      return {
        ...constrainedNode,
        x: clamp(constrainedNode.x, 5, 95),
        y: clamp(constrainedNode.y, 7, 93),
      }
    })
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

  // Connection springs: relationships pull nodes back toward each other so they do not drift away.
  // Projection keeps everyone inside their own stage band after each pull.
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

  // Electron-like repulsion keeps nodes far enough apart to read names.
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

    return {
      ...targetNode,
      x: currentNode.x + (targetNode.x - currentNode.x) * lerp,
      y: currentNode.y + (targetNode.y - currentNode.y) * lerp,
    }
  })
}

export default function MyCircleMap({
  refreshKey = 0,
  filterStages,
  sortMode = '4e',
  onChanged,
}: {
  refreshKey?: number
  filterStages?: Stage[]
  sortMode?: 'az' | '4e'
  onChanged?: () => void
}) {
  const [people, setPeople] = useState<Person[]>([])
  const [connections, setConnections] = useState<DiscipleshipConnection[]>([])
  const [animatedNodes, setAnimatedNodes] = useState<MapNode[]>([])
  const frameRef = useRef<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [mapRefreshKey, setMapRefreshKey] = useState(0)
  const [error, setError] = useState('')

  const filterKey = filterStages?.join('|') ?? 'All'

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const loadMap = async () => {
      setError('')
      const [peopleResult, connectionResult] = await Promise.all([
        getPeople(),
        getAllDiscipleshipConnections(),
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
    }

    loadMap()
  }, [refreshKey, mapRefreshKey, filterKey, sortMode])

  const visiblePeopleForMap = useMemo(() => {
    if (focusedPersonId) {
      const connectedPersonIds = new Set<string>([focusedPersonId])

      connections.forEach(connection => {
        if (!connection.disciple_person_id) return

        if (connection.discipler_person_id === focusedPersonId) {
          connectedPersonIds.add(connection.disciple_person_id)
        }

        if (connection.disciple_person_id === focusedPersonId) {
          connectedPersonIds.add(connection.discipler_person_id)
        }
      })

      return people.filter(person => connectedPersonIds.has(person.id))
    }

    if (filterStages && filterStages.length > 0) {
      return people.filter(person => filterStages.includes(person.current_stage))
    }

    return people
  }, [people, connections, focusedPersonId, filterStages])

  const focusedPerson = focusedPersonId ? people.find(person => person.id === focusedPersonId) : undefined

  const visibleConnectionsForMap = useMemo(() => {
    if (!focusedPersonId) return connections

    return connections.filter(connection => (
      connection.disciple_person_id &&
      (connection.discipler_person_id === focusedPersonId || connection.disciple_person_id === focusedPersonId)
    ))
  }, [connections, focusedPersonId])

  const baseNodes = useMemo(() => {
    return buildGraphAwareLayout(visiblePeopleForMap, visibleConnectionsForMap)
  }, [visiblePeopleForMap, visibleConnectionsForMap])

  const graphEdges = useMemo(() => visibleGraphEdgesFor(visiblePeopleForMap, visibleConnectionsForMap), [visiblePeopleForMap, visibleConnectionsForMap])

  useEffect(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)

    const start = performance.now()
    setAnimatedNodes(baseNodes)

    const tick = (now: number) => {
      const seconds = (now - start) / 1000
      const targetNodes = animateOrbitalNodes(baseNodes, graphEdges, seconds)
      setAnimatedNodes(currentNodes => smoothNodesToward(currentNodes, targetNodes))
      frameRef.current = requestAnimationFrame(tick)
    }

    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [baseNodes, graphEdges])

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

  if (visiblePeopleForMap.length === 0) {
    return (
      <div className="rounded-3xl border border-gray-200 bg-gray-950 p-6 text-center text-white shadow-sm">
        <p>No people found in this view yet.</p>
      </div>
    )
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-sm">
      <div className="border-b border-white/10 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold">Connection Map</h3>
            <p className="text-sm text-slate-300">Christ is the center; closer relationships draw darker, steadier lines while distant relationships appear lighter and more dotted.</p>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Sorted by {sortMode === 'az' ? 'A-Z' : '4E'} · {visibleConnections.length} visible connection {visibleConnections.length === 1 ? 'line' : 'lines'}
          </div>
        </div>
        {error && (
          <p className="mt-3 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-2 text-sm text-yellow-100">
            Some connection lines could not load yet: {error}
          </p>
        )}
        {focusedPerson && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Showing direct connections for <span className="font-semibold text-white">{focusedPerson.name}</span>
              <span className="text-slate-400"> · {visibleConnections.length} connection {visibleConnections.length === 1 ? 'line' : 'lines'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setFocusedPersonId(null)
                setSelectedId(null)
              }}
              className="self-start rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-slate-100 sm:self-center"
            >
              Show Everyone
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="relative min-h-[980px] overflow-hidden bg-[radial-gradient(circle_at_center,_rgba(99,102,241,0.18),_rgba(15,23,42,0)_48%),linear-gradient(180deg,_#020617,_#0f172a)] sm:min-h-[1100px] lg:min-h-[1240px]">
          <div className="absolute left-1/2 top-1/2 h-[98%] w-[98%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
          <div className="absolute left-1/2 top-1/2 h-[92%] w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
          <div className="absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
          <div className="absolute left-1/2 top-1/2 h-[62%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
          <div className="absolute left-1/2 top-1/2 h-[42%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
          <div className="absolute left-1/2 top-1/2 h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-yellow-200/20" />

          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {nodes.map(node => {
              const christLine = christLineStyle[node.current_stage]

              return (
                <line
                  key={`christ-${node.id}`}
                  x1={50}
                  y1={50}
                  x2={node.x}
                  y2={node.y}
                  stroke={christLine.stroke}
                  strokeWidth={christLine.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={christLine.strokeDasharray}
                />
              )
            })}

            {visibleConnections.map(connection => {
              const from = nodeById.get(connection.discipler_person_id)
              const to = connection.disciple_person_id ? nodeById.get(connection.disciple_person_id) : undefined
              if (!from || !to) return null

              const relationshipLine = relationshipLineStyleForDistance(from, to)

              return (
                <line
                  key={connection.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={relationshipLine.stroke}
                  strokeWidth={relationshipLine.strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={relationshipLine.strokeDasharray}
                />
              )
            })}
          </svg>

          <div className="absolute left-4 top-4 max-w-[250px] rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 backdrop-blur">
            <div>Click a person to focus their connections</div>
            <div className="mt-1 text-slate-400">Double-click a person to edit their full profile</div>
          </div>

          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-yellow-200/80 bg-slate-950/50 p-1 shadow-[0_0_56px_rgba(250,204,21,0.36)] backdrop-blur">
              <div className="relative h-full w-full overflow-hidden rounded-full border border-yellow-100/60 shadow-inner">
                <img
                  src="/christ-icon.jpg"
                  alt="King Jesus icon"
                  className="h-full w-full object-cover object-center"
                />
                <div className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.08),rgba(15,23,42,0)_58%,rgba(15,23,42,0.32))]" />
              </div>
            </div>
            <div className="mt-2 rounded-full border border-yellow-200/50 bg-slate-950/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-100 shadow-[0_0_24px_rgba(250,204,21,0.22)] backdrop-blur">
              King Jesus
            </div>
          </div>

          {nodes.map(node => {
            const style = stageStyle[node.current_stage]
            const isSelected = selectedNode?.id === node.id
            const movementLabel = node.degree === 0 ? 'slowly orbiting' : `${node.degree} connection${node.degree === 1 ? '' : 's'} / drawn closer more often`

            return (
              <button
                key={node.id}
                type="button"
                onClick={(event) => {
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
                }}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
                  setSelectedId(node.id)
                  setEditingPerson(node)
                }}
                title={`Single-click to focus this person's direct connections. Double-click to edit full journey profile. ${movementLabel}.`}
                className={`group absolute -translate-x-1/2 -translate-y-1/2 text-left transition-transform hover:scale-110 ${isSelected ? 'z-20 scale-110' : 'z-10'}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
              >
                <div className="relative mx-auto h-16 w-16">
                  <svg
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible transition-transform duration-200 group-hover:scale-105"
                    viewBox="0 0 64 64"
                    aria-hidden="true"
                    style={{ filter: `drop-shadow(0 0 10px ${style.outlineSoft})` }}
                  >
                    <polygon
                      points="32 2 36.5 20.5 52 8.5 43.5 25.2 62 32 43.5 38.8 52 55.5 36.5 43.5 32 62 27.5 43.5 12 55.5 20.5 38.8 2 32 20.5 25.2 12 8.5 27.5 20.5"
                      fill="rgba(255,255,255,0.055)"
                      stroke={style.outline}
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                    />
                    <polygon
                      points="32 10 35 23.5 45.8 15.8 39.8 28 53 32 39.8 36 45.8 48.2 35 40.5 32 54 29 40.5 18.2 48.2 24.2 36 11 32 24.2 28 18.2 15.8 29 23.5"
                      fill="none"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="0.8"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className={`absolute inset-2 flex items-center justify-center overflow-hidden rounded-full border-2 ${style.ring} ${style.bg} text-lg shadow-lg ${style.glow} ${isSelected ? 'ring-4 ring-white/40' : ''}`}>
                    {node.current_stage === 'Empower' || node.current_stage === 'Equip' || node.current_stage === 'Establish' || node.current_stage === 'Engage' ? (
                      <img
                        src={node.current_stage === 'Empower' ? '/empower-status-icon.jpg' : node.current_stage === 'Equip' ? '/equip-status-icon.jpg' : node.current_stage === 'Establish' ? '/establish-status-icon.jpg' : '/engage-status-icon.jpg'}
                        alt={node.current_stage === 'Empower' ? 'Empower status disciple profile' : node.current_stage === 'Equip' ? 'Equip status disciple profile' : node.current_stage === 'Establish' ? 'Establish status disciple profile' : 'Engage status disciple profile'}
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      style.symbol
                    )}
                  </div>
                </div>
                <div className="mt-1 max-w-[150px] truncate rounded-full bg-slate-950/90 px-2.5 py-0.5 text-center text-[10px] font-semibold text-white shadow-sm backdrop-blur">
                  {node.name}
                </div>
                {node.degree > 0 && (
                  <div className="mx-auto mt-1 w-fit rounded-full border border-white/10 bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-200">
                    {node.degree} link{node.degree === 1 ? '' : 's'}
                  </div>
                )}
              </button>
            )
          })}
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

      <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3 text-xs sm:grid-cols-4">
        {(['Engage', 'Establish', 'Equip', 'Empower'] as Stage[]).map(stage => {
          const style = stageStyle[stage]
          const ringText = stage === 'Engage'
            ? 'outer ring'
            : stage === 'Establish'
              ? 'building faith'
              : stage === 'Equip'
                ? 'learning to carry others'
                : 'released, still following Christ'
          return (
            <div key={stage} className="flex items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5 text-slate-200">
              <span className={`h-2.5 w-2.5 rounded-full ${style.bg}`} />
              <span>{stageLabels[stage].display}</span>
              <span className="hidden text-slate-500 sm:inline">· {ringText}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
