'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getAllDiscipleshipConnections, getPeople, getVictoryGroups, getAllGroupMemberships } from '../lib/supabaseQueries'
import type { DiscipleshipConnection, Person, Stage, VictoryGroup } from '../types/database'
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
  Empower: 8,
  Equip: 16,
  Establish: 26,
  Engage: 35,
}

const stageBand: Record<Stage, { min: number; max: number }> = {
  Empower: { min: 5, max: 11 },
  Equip: { min: 13, max: 20 },
  Establish: { min: 22, max: 30 },
  Engage: { min: 32, max: 38 },
}

const stageSortRank: Record<Stage, number> = {
  Engage: 0,
  Establish: 1,
  Equip: 2,
  Empower: 3,
}

const christLineStyle: Record<Stage, { stroke: string; strokeWidth: string; strokeDasharray?: string }> = {
  Empower: {
    stroke: 'rgba(240, 114, 159, 0.5)',
    strokeWidth: '0.42',
  },
  Equip: {
    stroke: 'rgba(91, 141, 247, 0.4)',
    strokeWidth: '0.32',
    strokeDasharray: '2 0.85',
  },
  Establish: {
    stroke: 'rgba(54, 214, 195, 0.3)',
    strokeWidth: '0.24',
    strokeDasharray: '1 1.25',
  },
  Engage: {
    stroke: 'rgba(244, 182, 80, 0.25)',
    strokeWidth: '0.18',
    strokeDasharray: '0.35 1.45',
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
  const opacity = 0.16 + closeness * 0.62
  const strokeWidth = 0.18 + closeness * 0.28

  if (closeness > 0.72) {
    return {
      stroke: `rgba(251,246,236,${opacity.toFixed(2)})`,
      strokeWidth: strokeWidth.toFixed(2),
      strokeDasharray: undefined,
    }
  }

  if (closeness > 0.42) {
    return {
      stroke: `rgba(251,246,236,${opacity.toFixed(2)})`,
      strokeWidth: strokeWidth.toFixed(2),
      strokeDasharray: '2 1',
    }
  }

  return {
    stroke: `rgba(251,246,236,${opacity.toFixed(2)})`,
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

    nodes = applyElectronRepulsion(nodes, 0.78 * cooling)

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

function StarNode({ node, isSelected, onClick }: { node: MapNode; isSelected: boolean; onClick: (e: React.MouseEvent) => void }) {
  const stageColor = STAGE_COLORS[node.current_stage]
  const stageIndex = STAGE_ORDER.indexOf(node.current_stage)

  const initials = node.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const size = 56
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2 - 8
  const circumference = 2 * Math.PI * radius
  const gapAngle = 8
  const segmentAngle = (360 - gapAngle * 4) / 4
  const segmentLength = (segmentAngle / 360) * circumference

  return (
    <button
      type="button"
      onClick={(e) => onClick(e)}
      className={`group absolute -translate-x-1/2 -translate-y-1/2 text-left transition-transform hover:scale-110 ${isSelected ? 'z-20 scale-110' : 'z-10'}`}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {/* SVG Progress Ring */}
        <svg
          width={size}
          height={size}
          className="absolute inset-0"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background segments */}
          {STAGE_ORDER.map((stage, idx) => {
            const startAngle = idx * (segmentAngle + gapAngle)
            const dashOffset = (startAngle / 360) * circumference
            return (
              <circle
                key={`bg-${stage}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(246,241,231,.08)"
                strokeWidth={strokeWidth}
                strokeDasharray={`${segmentLength} ${circumference}`}
                strokeDashoffset={-dashOffset}
                strokeLinecap="round"
              />
            )
          })}
          {/* Filled segments up to current stage */}
          {STAGE_ORDER.slice(0, stageIndex + 1).map((stage, idx) => {
            const startAngle = idx * (segmentAngle + gapAngle)
            const dashOffset = (startAngle / 360) * circumference
            const color = STAGE_COLORS[stage]
            return (
              <circle
                key={`fill-${stage}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${segmentLength} ${circumference}`}
                strokeDashoffset={-dashOffset}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
              />
            )
          })}
        </svg>

        {/* Center with initials */}
        <div
          className="absolute inset-0 flex items-center justify-center"
        >
          <div
            className="flex items-center justify-center rounded-full text-xs font-bold"
            style={{
              width: size - 20,
              height: size - 20,
              background: `radial-gradient(circle at 40% 35%, rgba(251,246,236,.15) 0%, var(--indigo) 100%)`,
              border: `2px solid ${stageColor}50`,
              boxShadow: isSelected
                ? `0 0 20px ${stageColor}, 0 0 40px ${stageColor}50`
                : `0 0 12px ${stageColor}40`,
              color: stageColor,
            }}
          >
            {initials}
          </div>
        </div>
      </div>

      {/* Name label */}
      <div
        className="mt-1 max-w-[100px] truncate rounded-full px-2 py-0.5 text-center text-[10px] font-semibold"
        style={{
          background: 'rgba(6,8,20,.9)',
          color: 'var(--fg-1)',
          backdropFilter: 'blur(4px)',
        }}
      >
        {node.name.split(' ')[0]}
      </div>

      {/* Connection count badge */}
      {node.degree > 0 && (
        <div
          className="mx-auto mt-1 w-fit rounded-full px-1.5 py-0.5 text-[9px] font-bold"
          style={{
            background: `${stageColor}20`,
            border: `1px solid ${stageColor}40`,
            color: stageColor,
          }}
        >
          {node.degree} link{node.degree === 1 ? '' : 's'}
        </div>
      )}
    </button>
  )
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
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [groupMemberships, setGroupMemberships] = useState<{ person_id: string; victory_group_id: string }[]>([])
  const [animatedNodes, setAnimatedNodes] = useState<MapNode[]>([])
  const frameRef = useRef<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  const visiblePeopleForMap = useMemo(() => {
    let filtered = people

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

    // If focused on a person, show only their connections
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

      return filtered.filter(person => connectedPersonIds.has(person.id))
    }

    // Legacy external filter (from parent component)
    if (filterStages && filterStages.length > 0) {
      return filtered.filter(person => filterStages.includes(person.current_stage))
    }

    return filtered
  }, [people, connections, focusedPersonId, filterStages, activeStages, selectedGroupIds, groupMemberships])

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
              Showing direct connections for <span className="font-semibold text-[var(--fg-1)]">{focusedPerson.name}</span>
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
          className="relative min-h-[980px] overflow-hidden sm:min-h-[1100px] lg:min-h-[1240px]"
          style={{
            background: 'radial-gradient(circle at center, rgba(27,35,71,0.6) 0%, var(--void) 60%)',
          }}
        >
          {/* Orbital rings */}
          {STAGE_ORDER.slice().reverse().map((stage, idx) => {
            const sizes = [24, 42, 62, 78]
            const color = STAGE_COLORS[stage]
            return (
              <div
                key={stage}
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  width: `${sizes[idx]}%`,
                  height: `${sizes[idx]}%`,
                  border: `1px solid ${color}15`,
                  boxShadow: `0 0 30px -10px ${color}30`,
                }}
              />
            )
          })}

          {/* Connection lines SVG */}
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

          {/* Instructions */}
          <div
            className="absolute left-4 top-4 max-w-[250px] rounded-xl border border-[var(--line-1)] px-3 py-2 text-xs"
            style={{ background: 'rgba(6,8,20,.8)', backdropFilter: 'blur(8px)' }}
          >
            <div className="font-semibold text-[var(--fg-1)]">Click a person to focus their connections</div>
            <div className="mt-1 text-[var(--fg-3)]">Double-click a person to edit their full profile</div>
          </div>

          {/* Center - Jesus */}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-full"
              style={{
                background: 'radial-gradient(circle at 50% 40%, #FFF7E4, #F2C879 55%, #E0A94A 100%)',
                boxShadow: '0 0 60px 12px rgba(242,200,121,.4), 0 0 100px 30px rgba(242,200,121,.2)',
              }}
            >
              <img
                src="/gbm-flame-white.png"
                alt="Jesus at the center"
                className="h-10 w-10"
                style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.3))' }}
              />
            </div>
            <div
              className="mt-2 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em]"
              style={{
                background: 'rgba(6,8,20,.9)',
                color: 'var(--gold)',
                boxShadow: '0 0 20px rgba(242,200,121,.2)',
              }}
            >
              King Jesus
            </div>
          </div>

          {/* Star nodes */}
          {nodes.map(node => (
            <StarNode
              key={node.id}
              node={node}
              isSelected={selectedNode?.id === node.id}
              onClick={(e) => handleNodeClick(node, e)}
            />
          ))}
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
      <div className="grid grid-cols-2 gap-2 border-t border-[var(--line-1)] p-3 text-xs sm:grid-cols-4">
        {STAGE_ORDER.map(stage => {
          const color = STAGE_COLORS[stage]
          return (
            <div
              key={stage}
              className="flex items-center gap-2 rounded-xl p-2"
              style={{ background: `${color}10` }}
            >
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: color, boxShadow: `0 0 8px ${color}` }}
              />
              <span style={{ color }}>{stageLabels[stage].display}</span>
              <span className="hidden text-[var(--fg-3)] sm:inline">· {STAGE_LABELS[stage]}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
