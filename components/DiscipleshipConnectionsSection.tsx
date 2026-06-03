'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  addDiscipleshipConnection,
  deleteDiscipleshipConnection,
  getAllDiscipleshipConnections,
  getDiscipleshipConnections,
  getPeople,
} from '../lib/supabaseQueries'
import type { DiscipleshipConnection, Person } from '../types/database'

export default function DiscipleshipConnectionsSection({ personId }: { personId: string }) {
  const [shepherdingConnections, setShepherdingConnections] = useState<DiscipleshipConnection[]>([])
  const [allConnections, setAllConnections] = useState<DiscipleshipConnection[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [selectedDisciplerId, setSelectedDisciplerId] = useState('')
  const [selectedDiscipleId, setSelectedDiscipleId] = useState('')
  const [relationshipNotes, setRelationshipNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

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

    const [ownConnectionsResult, allConnectionsResult, peopleResult] = await Promise.all([
      getDiscipleshipConnections(personId),
      getAllDiscipleshipConnections(),
      getPeople(),
    ])

    if (ownConnectionsResult.error) {
      setError(ownConnectionsResult.error.message)
      setLoading(false)
      return
    }

    if (allConnectionsResult.error) {
      setError(allConnectionsResult.error.message)
      setLoading(false)
      return
    }

    if (peopleResult.error) {
      setError(peopleResult.error.message)
      setLoading(false)
      return
    }

    setShepherdingConnections((ownConnectionsResult.data ?? []) as DiscipleshipConnection[])
    setAllConnections((allConnectionsResult.data ?? []) as DiscipleshipConnection[])
    setPeople((peopleResult.data ?? []) as Person[])
    setSelectedDisciplerId('')
    setLoading(false)
  }

  useEffect(() => {
    loadConnections()
  }, [personId])

  const displayNameForPerson = (personIdToDisplay: string | null | undefined, fallbackName?: string) => {
    if (!personIdToDisplay) return fallbackName ?? 'Unknown person'
    return peopleById.get(personIdToDisplay)?.name ?? fallbackName ?? 'Unknown person'
  }

  const handleAddDisciplerConnection = async () => {
    setMessage('')
    setError('')

    const discipler = peopleById.get(selectedDisciplerId)

    if (!currentPerson) {
      setError('Could not find this person in Our Journey yet.')
      return
    }

    if (!discipler) {
      setError('Choose a coach from Our Journey first.')
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
    setMessage(`${discipler.name} was added as a coach.`)
    setSaving(false)
  }

  const handleAddShepherdingConnection = async () => {
    setMessage('')
    setError('')

    const disciple = peopleById.get(selectedDiscipleId)

    if (!disciple) {
      setError('Choose someone to coach from Our Journey first.')
      return
    }

    setSaving(true)

    const { error } = await addDiscipleshipConnection({
      discipler_person_id: personId,
      disciple_person_id: disciple.id,
      disciple_name: disciple.name,
      relationship_notes: relationshipNotes.trim() || null,
      status: 'Identified',
    })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setSelectedDiscipleId('')
    setRelationshipNotes('')
    await loadConnections()
    setMessage(`${disciple.name} was added.`)
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

  return (
    <div
      className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3"
      onClick={event => event.stopPropagation()}
    >
      <div>
        <div className="font-semibold text-gray-900">Discipleship Connections</div>
        <p className="mt-1 text-xs leading-5 text-gray-700">
          Everyone stays in Our Journey. A person can be coached by multiple people and can also be called to coach multiple people.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          <p>{error}</p>
          <p className="mt-1 text-xs">
            If this mentions a unique constraint or <span className="font-semibold">disciple_person_id</span>, run the multiple-disciplers SQL migration in Supabase first.
          </p>
        </div>
      )}

      {message && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p>
      )}

      {loading && !error && <p className="text-sm text-gray-700">Loading connections...</p>}

      {!loading && !error && (
        <div className="space-y-3">
          <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-2.5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Being Coached By</div>
              {incomingConnections.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {incomingConnections.map(connection => (
                    <div key={connection.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-semibold text-gray-900">
                            {displayNameForPerson(connection.discipler_person_id)}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-600">Coach</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDelete(connection.id)}
                          className="self-start rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
                  No coach connected yet.
                </p>
              )}
            </div>

            <div className="border-t border-violet-100 pt-3">
              <label className="mb-1 block text-xs font-semibold text-gray-700">Add another Coach</label>
              <select
                value={selectedDisciplerId}
                onChange={event => {
                  setSelectedDisciplerId(event.target.value)
                  setError('')
                  setMessage('')
                }}
                disabled={saving || possibleDisciplers.length === 0}
                className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 disabled:opacity-60"
              >
                <option value="">Choose a Coach from Our Journey</option>
                {possibleDisciplers.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name} — {person.current_stage}
                  </option>
                ))}
              </select>
              {possibleDisciplers.length === 0 && (
                <p className="mt-1 text-xs text-gray-600">Everyone else is already connected as a coach for this person.</p>
              )}
              <button
                type="button"
                onClick={handleAddDisciplerConnection}
                disabled={!canAddDisciplerConnection}
                className="mt-2 w-full rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : selectedDisciplerId ? 'Add Coach' : 'Choose a Coach First'}
              </button>
            </div>

          </div>

          <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-2.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Called to Coach</div>

            {shepherdingConnections.length > 0 ? (
              <div className="space-y-2">
                {shepherdingConnections.map(connection => (
                  <div key={connection.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="break-words text-sm font-semibold text-gray-900">
                          {displayNameForPerson(connection.disciple_person_id, connection.disciple_name)}
                        </div>
                        {connection.relationship_notes && (
                          <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-gray-700">{connection.relationship_notes}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(connection.id)}
                        className="self-start rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
                No one identified to coach yet.
              </p>
            )}

            <div className="border-t border-violet-100 pt-3">
              <label className="mb-1 block text-xs font-semibold text-gray-700">Someone called to Coach</label>
              <select
                value={selectedDiscipleId}
                onChange={event => {
                  setSelectedDiscipleId(event.target.value)
                  setError('')
                  setMessage('')
                }}
                disabled={saving || availablePeopleToShepherd.length === 0}
                className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 disabled:opacity-60"
              >
                <option value="">Choose Someone to Coach</option>
                {availablePeopleToShepherd.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name} — {person.current_stage}
                  </option>
                ))}
              </select>
              {availablePeopleToShepherd.length === 0 && (
                <p className="mt-1 text-xs text-gray-600">Everyone in Our Journey is already connected to be coached by this person or this person is the only one listed.</p>
              )}
              <button
                type="button"
                onClick={handleAddShepherdingConnection}
                disabled={!canAddShepherdingConnection}
                className="mt-2 w-full rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Saving...' : selectedDiscipleId ? 'Called to Coach' : 'Choose Someone to Coach First'}
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-2.5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Notes</div>
              <p className="mt-1 text-xs leading-5 text-gray-600">Context for this coaching connection or next conversation.</p>
            </div>
            <textarea
              value={relationshipNotes}
              onChange={event => setRelationshipNotes(event.target.value)}
              placeholder="Context, relationship, or next conversation..."
              className="h-24 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 placeholder:text-gray-400"
            />

          </div>
        </div>
      )}
    </div>
  )
}
