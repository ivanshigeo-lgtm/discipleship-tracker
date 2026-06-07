'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDiscipleshipConnection,
  addPerson,
  deleteDiscipleshipConnection,
  getAllDiscipleshipConnections,
  getDiscipleshipConnections,
  getPeople,
} from '../lib/supabaseQueries'
import type { DiscipleshipConnection, Person, Stage } from '../types/database'

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

interface DiscipleshipConnectionsSectionProps {
  personId: string
  onPersonCreated?: () => void
}

type CreateMode = 'coach' | 'disciple' | null

export default function DiscipleshipConnectionsSection({ personId, onPersonCreated }: DiscipleshipConnectionsSectionProps) {
  const [shepherdingConnections, setShepherdingConnections] = useState<DiscipleshipConnection[]>([])
  const [allConnections, setAllConnections] = useState<DiscipleshipConnection[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [selectedDisciplerId, setSelectedDisciplerId] = useState('')
  const [selectedDiscipleId, setSelectedDiscipleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // Inline create person form state
  const [createMode, setCreateMode] = useState<CreateMode>(null)
  const [newPersonName, setNewPersonName] = useState('')
  const [creatingPerson, setCreatingPerson] = useState(false)

  const peopleById = useMemo(() => {
    return new Map(people.map(person => [person.id, person]))
  }, [people])

  const currentPerson = peopleById.get(personId)

  const incomingConnections = useMemo(() => {
    return allConnections.filter(connection => connection.disciple_person_id === personId)
  }, [allConnections, personId])

  const currentDisciplerIds = useMemo(() => {
    return new Set(incomingConnections.map(connection => connection.discipler_person_id))
  }, [incomingConnections])

  const currentShepherdedIds = useMemo(() => {
    return new Set(
      shepherdingConnections
        .map(connection => connection.disciple_person_id)
        .filter((id): id is string => Boolean(id))
    )
  }, [shepherdingConnections])

  const possibleDisciplers = useMemo(() => {
    return people
      .filter(person => person.id !== personId)
      .filter(person => !currentDisciplerIds.has(person.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [people, personId, currentDisciplerIds])

  const availablePeopleToShepherd = useMemo(() => {
    return people
      .filter(person => person.id !== personId)
      .filter(person => !currentShepherdedIds.has(person.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [people, personId, currentShepherdedIds])

  const canAddDisciplerConnection = Boolean(selectedDisciplerId) && !saving && possibleDisciplers.length > 0
  const canAddShepherdingConnection = Boolean(selectedDiscipleId) && !saving && availablePeopleToShepherd.length > 0

  const loadConnections = async () => {
    setLoading(true)
    setError('')

    try {
      const [ownConnectionsResult, allConnectionsResult, peopleResult] = await Promise.race([
        Promise.all([
          getDiscipleshipConnections(personId),
          getAllDiscipleshipConnections(),
          getPeople(),
        ]),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])

      if (ownConnectionsResult.error) {
        setError(ownConnectionsResult.error.message)
        return
      }

      if (allConnectionsResult.error) {
        setError(allConnectionsResult.error.message)
        return
      }

      if (peopleResult.error) {
        setError(peopleResult.error.message)
        return
      }

      setShepherdingConnections((ownConnectionsResult.data ?? []) as DiscipleshipConnection[])
      setAllConnections((allConnectionsResult.data ?? []) as DiscipleshipConnection[])
      setPeople((peopleResult.data ?? []) as Person[])
      setSelectedDisciplerId('')
    } catch (err) {
      console.error('DiscipleshipConnectionsSection load error:', err)
      setError('Failed to load connections')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConnections()
  }, [personId])

  const displayNameForPerson = (personIdToDisplay: string | null | undefined, fallbackName?: string) => {
    if (!personIdToDisplay) return fallbackName ?? 'Unknown'
    return peopleById.get(personIdToDisplay)?.name ?? fallbackName ?? 'Unknown'
  }

  const getPersonStage = (personIdToGet: string | null | undefined): Stage => {
    if (!personIdToGet) return 'Engage'
    return peopleById.get(personIdToGet)?.current_stage ?? 'Engage'
  }

  const handleAddDisciplerConnection = async () => {
    setMessage('')
    setError('')

    const discipler = peopleById.get(selectedDisciplerId)

    if (!currentPerson) {
      setError('Could not find this person.')
      return
    }

    if (!discipler) {
      setError('Choose a coach first.')
      return
    }

    setSaving(true)

    const { error } = await addDiscipleshipConnection({
      discipler_person_id: discipler.id,
      disciple_person_id: personId,
      disciple_name: currentPerson.name,
      relationship_notes: null,
      status: 'Identified',
    })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSelectedDisciplerId('')
    await loadConnections()
    setMessage(`${discipler.name} added as coach.`)
    setSaving(false)
  }

  const handleAddShepherdingConnection = async () => {
    setMessage('')
    setError('')

    const disciple = peopleById.get(selectedDiscipleId)

    if (!disciple) {
      setError('Choose someone first.')
      return
    }

    setSaving(true)

    const { error } = await addDiscipleshipConnection({
      discipler_person_id: personId,
      disciple_person_id: disciple.id,
      disciple_name: disciple.name,
      relationship_notes: null,
      status: 'Identified',
    })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSelectedDiscipleId('')
    await loadConnections()
    setMessage(`${disciple.name} added.`)
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this connection?')) return
    setMessage('')
    setError('')
    const { error } = await deleteDiscipleshipConnection(id)
    if (error) {
      setError(error.message)
      return
    }
    await loadConnections()
  }

  const handleCreateAndConnect = async () => {
    if (!newPersonName.trim()) {
      setError('Please enter a name.')
      return
    }

    setCreatingPerson(true)
    setError('')
    setMessage('')

    // Create the new person
    const { data: newPerson, error: createError } = await addPerson({
      name: newPersonName.trim(),
      current_stage: 'Engage',
      email: null,
      phone: null,
      spiritual_birthday: null,
      baptism_date: null,
      notes: null,
      status: 'Active',
      priority: false,
      victory_group_id: null,
    })

    if (createError || !newPerson) {
      setError(createError?.message ?? 'Failed to create person.')
      setCreatingPerson(false)
      return
    }

    // Now create the connection
    if (createMode === 'disciple') {
      // Current person is coaching the new person
      const { error: connError } = await addDiscipleshipConnection({
        discipler_person_id: personId,
        disciple_person_id: newPerson.id,
        disciple_name: newPerson.name,
        relationship_notes: null,
        status: 'Identified',
      })

      if (connError) {
        setError(connError.message)
        setCreatingPerson(false)
        return
      }

      setMessage(`${newPerson.name} created and added to Called to Coach.`)
    } else if (createMode === 'coach') {
      // New person is coaching the current person
      const { error: connError } = await addDiscipleshipConnection({
        discipler_person_id: newPerson.id,
        disciple_person_id: personId,
        disciple_name: currentPerson?.name ?? '',
        relationship_notes: null,
        status: 'Identified',
      })

      if (connError) {
        setError(connError.message)
        setCreatingPerson(false)
        return
      }

      setMessage(`${newPerson.name} created and added as coach.`)
    }

    // Reset form and reload
    setNewPersonName('')
    setCreateMode(null)
    setCreatingPerson(false)
    await loadConnections()
    onPersonCreated?.()
  }

  const inputClass = "w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none disabled:opacity-60"

  return (
    <div className="space-y-3" onClick={event => event.stopPropagation()}>
      {error && (
        <p className="rounded-lg bg-[rgba(240,114,159,.15)] p-2 text-xs text-[#F2728A]">{error}</p>
      )}

      {message && (
        <p className="rounded-lg bg-[rgba(54,214,195,.15)] p-2 text-xs text-[var(--establish)]">{message}</p>
      )}

      {loading && !error && <p className="text-sm text-[var(--fg-2)]">Loading...</p>}

      {!loading && !error && (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Being Coached By */}
          <div className="rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-2.5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Being Coached By</div>
            {incomingConnections.length > 0 ? (
              <div className="space-y-1.5">
                {incomingConnections.map(connection => {
                  const stage = getPersonStage(connection.discipler_person_id)
                  const stageColor = STAGE_COLORS[stage]
                  const initials = displayNameForPerson(connection.discipler_person_id)
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()

                  return (
                    <div key={connection.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{ border: `2px solid ${stageColor}`, color: stageColor }}
                        >
                          {initials}
                        </div>
                        <span className="text-xs font-semibold text-[var(--fg-1)]">
                          {displayNameForPerson(connection.discipler_person_id)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(connection.id)}
                        className="text-[10px] text-[#F2728A] hover:underline"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-lg bg-[var(--indigo)] p-2 text-xs text-[var(--fg-3)]">No coach yet.</p>
            )}

            <div className="mt-2 flex gap-1.5">
              <select
                value={selectedDisciplerId}
                onChange={event => {
                  if (event.target.value === '__NEW__') {
                    setCreateMode('coach')
                    setSelectedDisciplerId('')
                  } else {
                    setSelectedDisciplerId(event.target.value)
                  }
                }}
                disabled={saving}
                className={`${inputClass} flex-1`}
              >
                <option value="">+ Add coach...</option>
                <option value="__NEW__">＋ Create new person...</option>
                {possibleDisciplers.map(person => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddDisciplerConnection}
                disabled={!canAddDisciplerConnection}
                className="cn-btn cn-btn-primary shrink-0 !px-2.5 !py-1.5 !text-xs"
              >
                Add
              </button>
            </div>
          </div>

          {/* Called to Coach */}
          <div className="rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-2.5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Called to Coach</div>
            {shepherdingConnections.length > 0 ? (
              <div className="space-y-1.5">
                {shepherdingConnections.map(connection => {
                  const stage = getPersonStage(connection.disciple_person_id)
                  const stageColor = STAGE_COLORS[stage]
                  const name = displayNameForPerson(connection.disciple_person_id, connection.disciple_name)
                  const initials = name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()

                  return (
                    <div key={connection.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] p-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{ border: `2px solid ${stageColor}`, color: stageColor }}
                        >
                          {initials}
                        </div>
                        <span className="text-xs font-semibold text-[var(--fg-1)]">{name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(connection.id)}
                        className="text-[10px] text-[#F2728A] hover:underline"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-lg bg-[var(--indigo)] p-2 text-xs text-[var(--fg-3)]">No one yet.</p>
            )}

            <div className="mt-2 flex gap-1.5">
              <select
                value={selectedDiscipleId}
                onChange={event => {
                  if (event.target.value === '__NEW__') {
                    setCreateMode('disciple')
                    setSelectedDiscipleId('')
                  } else {
                    setSelectedDiscipleId(event.target.value)
                  }
                }}
                disabled={saving}
                className={`${inputClass} flex-1`}
              >
                <option value="">+ Add person...</option>
                <option value="__NEW__">＋ Create new person...</option>
                {availablePeopleToShepherd.map(person => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddShepherdingConnection}
                disabled={!canAddShepherdingConnection}
                className="cn-btn cn-btn-primary shrink-0 !px-2.5 !py-1.5 !text-xs"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Create Person Form */}
      {createMode && (
        <div className="rounded-lg border border-[var(--gbm-cobalt-bright)] bg-[var(--indigo-2)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--fg-1)]">
              Create New Person {createMode === 'coach' ? '(as Coach)' : '(to Coach)'}
            </span>
            <button
              type="button"
              onClick={() => {
                setCreateMode(null)
                setNewPersonName('')
                setError('')
              }}
              className="text-xs text-[var(--fg-3)] hover:text-[var(--fg-2)]"
            >
              Cancel
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newPersonName}
              onChange={e => setNewPersonName(e.target.value)}
              placeholder="Enter name..."
              disabled={creatingPerson}
              className={`${inputClass} flex-1`}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && newPersonName.trim()) {
                  handleCreateAndConnect()
                }
              }}
            />
            <button
              type="button"
              onClick={handleCreateAndConnect}
              disabled={creatingPerson || !newPersonName.trim()}
              className="cn-btn cn-btn-primary shrink-0 !px-3 !py-1.5 !text-xs"
            >
              {creatingPerson ? 'Creating...' : 'Create & Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
