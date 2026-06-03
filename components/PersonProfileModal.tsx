'use client'

import { useEffect, useState } from 'react'
import { deletePerson, updatePerson } from '../lib/supabaseQueries'
import type { Person, Stage } from '../types/database'
import { stageLabels, stageOrder } from '../lib/stageLabels'
import StageChecklist from './StageChecklist'
import NextStepsList from './NextStepsList'
import AddNextStepForm from './AddNextStepForm'
import DiscipleshipConnectionsSection from './DiscipleshipConnectionsSection'
import PersonGroupsSection from './PersonGroupsSection'
import PrayerRequestsList from './PrayerRequestsList'
import AddPrayerRequestForm from './AddPrayerRequestForm'
import StageLevelBadge from './StageLevelBadge'
import DiscipleStarCard from './DiscipleStarCard'

const stages: Stage[] = stageOrder

type PersonProfileModalProps = {
  person: Person
  onClose: () => void
  onSaved?: (person: Person) => void
  onDeleted?: (personId: string) => void
}

type ModalSection = 'profile' | 'journey' | 'connections' | 'engagements' | 'groups' | 'prayer'

function ModalSectionCard({
  title,
  subtitle,
  children,
  defaultOpen = true,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-gray-50"
      >
        <div>
          <div className="font-semibold text-gray-900">{title}</div>
          {subtitle && <div className="mt-0.5 text-sm text-gray-600">{subtitle}</div>}
        </div>
        <div className="text-2xl font-light text-gray-700">{isOpen ? '−' : '+'}</div>
      </button>
      {isOpen && <div className="border-t border-gray-200 bg-gray-50 p-4">{children}</div>}
    </div>
  )
}

export default function PersonProfileModal({ person, onClose, onSaved, onDeleted }: PersonProfileModalProps) {
  const [savedPerson, setSavedPerson] = useState(person)
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email ?? '')
  const [phone, setPhone] = useState(person.phone ?? '')
  const [currentStage, setCurrentStage] = useState<Stage>(person.current_stage)
  const [spiritualBirthday, setSpiritualBirthday] = useState(person.spiritual_birthday ?? '')
  const [baptismDate, setBaptismDate] = useState(person.baptism_date ?? '')
  const [status, setStatus] = useState<Person['status']>(person.status)
  const [notes, setNotes] = useState(person.notes ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [starRefreshKey, setStarRefreshKey] = useState(0)
  const [activeSection, setActiveSection] = useState<ModalSection>('profile')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    setSavedPerson(person)
    setName(person.name)
    setEmail(person.email ?? '')
    setPhone(person.phone ?? '')
    setCurrentStage(person.current_stage)
    setSpiritualBirthday(person.spiritual_birthday ?? '')
    setBaptismDate(person.baptism_date ?? '')
    setStatus(person.status)
    setNotes(person.notes ?? '')
    setError('')
    setMessage('')
    setShowDeleteConfirm(false)
    setRefreshKey(key => key + 1)
    setStarRefreshKey(key => key + 1)
  }, [person])

  const applySavedPerson = (nextPerson: Person, successMessage: string, syncFormFields = true) => {
    setSavedPerson(nextPerson)
    if (syncFormFields) {
      setName(nextPerson.name)
      setEmail(nextPerson.email ?? '')
      setPhone(nextPerson.phone ?? '')
      setSpiritualBirthday(nextPerson.spiritual_birthday ?? '')
      setBaptismDate(nextPerson.baptism_date ?? '')
      setNotes(nextPerson.notes ?? '')
    }
    setCurrentStage(nextPerson.current_stage)
    setStatus(nextPerson.status)
    setMessage(successMessage)
    setRefreshKey(key => key + 1)
    onSaved?.(nextPerson)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError('')
    setMessage('')

    const { data, error: updateError } = await updatePerson(person.id, {
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      current_stage: currentStage,
      spiritual_birthday: spiritualBirthday || null,
      baptism_date: baptismDate || null,
      notes: notes.trim() || null,
      status,
      victory_group_id: savedPerson.victory_group_id,
    })

    if (updateError) {
      setError(updateError.message)
    } else if (data) {
      applySavedPerson(data as Person, 'Profile saved.')
    }

    setLoading(false)
  }

  const handleQuickStageChange = async (nextStage: Stage) => {
    if (nextStage === currentStage || loading) return

    const previousStage = currentStage
    setCurrentStage(nextStage)
    setLoading(true)
    setError('')
    setMessage('')

    const { data, error: updateError } = await updatePerson(person.id, { current_stage: nextStage })

    if (updateError) {
      setCurrentStage(previousStage)
      setError(updateError.message)
    } else if (data) {
      applySavedPerson(data as Person, '4E level updated.', false)
    }

    setLoading(false)
  }

  const handleQuickStatusChange = async (nextStatus: Person['status']) => {
    if (nextStatus === status || loading) return

    const previousStatus = status
    setStatus(nextStatus)
    setLoading(true)
    setError('')
    setMessage('')

    const { data, error: updateError } = await updatePerson(person.id, { status: nextStatus })

    if (updateError) {
      setStatus(previousStatus)
      setError(updateError.message)
    } else if (data) {
      applySavedPerson(data as Person, 'Status updated.', false)
    }

    setLoading(false)
  }

  const handleDeletePerson = async () => {
    setLoading(true)
    setError('')
    setMessage('')

    const { error: deleteError } = await deletePerson(savedPerson.id)

    if (deleteError) {
      setError(deleteError.message)
      setLoading(false)
      return
    }

    onDeleted?.(savedPerson.id)
    onClose()
  }

  const sectionButtonClass = (section: ModalSection) => (
    `rounded-full px-3 py-1.5 text-xs font-semibold ${
      activeSection === section ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6">
      <div className="my-6 w-full max-w-5xl rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 rounded-t-3xl border-b border-gray-200 bg-white p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Disciple Profile</div>
              <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
                <h2 className="min-w-0 text-2xl font-bold text-gray-900 sm:truncate">{savedPerson.name}</h2>
                <div className="flex shrink-0 flex-col gap-1 sm:w-64">
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">4E Level</label>
                  <select
                    value={currentStage}
                    onChange={event => handleQuickStageChange(event.target.value as Stage)}
                    disabled={loading}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-60"
                  >
                    {stages.map(stage => (
                      <option key={stage} value={stage}>{stageLabels[stage].display}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                Gamify the journey of making a disciple: light up tools, grow the star, and release multipliers into new orbits.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
            >
              Close
            </button>
          </div>

          {(error || message) && (
            <div
              className={`mt-3 rounded-xl border p-3 text-sm ${
                error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              {error || message}
            </div>
          )}

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setActiveSection('profile')} className={sectionButtonClass('profile')}>Profile</button>
            <button type="button" onClick={() => setActiveSection('journey')} className={sectionButtonClass('journey')}>4E Checklists</button>
            <button type="button" onClick={() => setActiveSection('connections')} className={sectionButtonClass('connections')}>Connections</button>
            <button type="button" onClick={() => setActiveSection('engagements')} className={sectionButtonClass('engagements')}>Next Engagements</button>
            <button type="button" onClick={() => setActiveSection('groups')} className={sectionButtonClass('groups')}>Groups</button>
            <button type="button" onClick={() => setActiveSection('prayer')} className={sectionButtonClass('prayer')}>Prayer</button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <DiscipleStarCard person={savedPerson} currentStage={currentStage} refreshKey={starRefreshKey} />

          {activeSection === 'profile' && (
            <ModalSectionCard
              title="Profile Details"
              subtitle="Contact details, dates, current stage, status, and pastoral notes"
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={event => setPhone(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Current Stage</label>
                    <select
                      value={currentStage}
                      onChange={event => setCurrentStage(event.target.value as Stage)}
                      className="w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      {stages.map(stage => (
                        <option key={stage} value={stage}>{stageLabels[stage].display}</option>
                      ))}
                    </select>
                    <div className="mt-2">
                      <StageLevelBadge stage={currentStage} size="sm" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Status</label>
                    <select
                      value={status}
                      onChange={event => setStatus(event.target.value as Person['status'])}
                      className="w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Spiritual Birthday</label>
                    <input
                      type="date"
                      value={spiritualBirthday}
                      onChange={event => setSpiritualBirthday(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Baptism Date</label>
                    <input
                      type="date"
                      value={baptismDate}
                      onChange={event => setBaptismDate(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Notes</label>
                  <textarea
                    value={notes}
                    onChange={event => setNotes(event.target.value)}
                    className="h-32 w-full rounded-xl border border-gray-300 p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Pastoral notes, context, prayer needs, or next relational observations..."
                  />
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                  >
                    {loading ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </ModalSectionCard>
          )}

          {activeSection === 'journey' && (
            <ModalSectionCard
              title="4E Tools & Action Steps"
              subtitle="Check off boxes under Engage, Establish, Equip, and Empower"
            >
              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px] sm:items-end">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Journey Status</div>
                      <p className="mt-1 text-sm text-gray-600">
                        Keep this person&apos;s active/inactive status close to the 4E checklist work.
                      </p>
                      <div className="mt-3">
                        <StageLevelBadge stage={currentStage} size="sm" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-gray-700">Status</label>
                      <select
                        value={status}
                        onChange={event => handleQuickStatusChange(event.target.value as Person['status'])}
                        disabled={loading}
                        className="w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black disabled:opacity-60"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                </div>
                <StageChecklist
                  personId={savedPerson.id}
                  currentStage={currentStage}
                  onChanged={() => setStarRefreshKey(key => key + 1)}
                />
              </div>
            </ModalSectionCard>
          )}

          {activeSection === 'connections' && (
            <ModalSectionCard
              title="Discipleship Connections"
              subtitle="Being coached by, called to coach, and notes"
            >
              <DiscipleshipConnectionsSection personId={savedPerson.id} />
            </ModalSectionCard>
          )}

          {activeSection === 'engagements' && (
            <ModalSectionCard
              title="Next Engagements"
              subtitle="Follow-up conversations, next steps, and relational touchpoints"
            >
              <div className="space-y-3">
                <NextStepsList personId={savedPerson.id} refreshKey={refreshKey} />
                <AddNextStepForm
                  personId={savedPerson.id}
                  onAdded={() => setRefreshKey(key => key + 1)}
                />
              </div>
            </ModalSectionCard>
          )}

          {activeSection === 'groups' && (
            <ModalSectionCard
              title="Grace Groups"
              subtitle="Grace Group membership and recurring group connection"
            >
              <PersonGroupsSection
                personId={savedPerson.id}
                onChanged={() => {
                  setRefreshKey(key => key + 1)
                  onSaved?.(savedPerson)
                }}
              />
            </ModalSectionCard>
          )}

          {activeSection === 'prayer' && (
            <ModalSectionCard
              title="Prayer Requests"
              subtitle="Current prayer needs and answered prayers / praise reports"
            >
              <div className="space-y-3">
                <PrayerRequestsList
                  personId={savedPerson.id}
                  refreshKey={refreshKey}
                  onUpdate={() => setRefreshKey(key => key + 1)}
                />
                <AddPrayerRequestForm
                  personId={savedPerson.id}
                  onAdded={() => setRefreshKey(key => key + 1)}
                />
              </div>
            </ModalSectionCard>
          )}

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-semibold text-red-900">Danger Zone</div>
                <p className="mt-1 text-sm text-red-800">
                  Delete this profile only if it was added by mistake. This permanently removes the profile and its related journey records.
                </p>
              </div>
              {!showDeleteConfirm && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(true)
                    setError('')
                    setMessage('')
                  }}
                  disabled={loading}
                  className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  Delete Profile
                </button>
              )}
            </div>

            {showDeleteConfirm && (
              <div className="mt-4 rounded-xl border border-red-300 bg-white p-4">
                <div className="text-sm font-semibold text-red-900">Permanently delete {savedPerson.name}?</div>
                <p className="mt-1 text-sm text-red-800">
                  This cannot be undone. Prayer requests, Next Engagements, 4E checklist progress, group membership, and discipleship connections tied to this profile may also be removed.
                </p>
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={loading}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeletePerson}
                    disabled={loading}
                    className="rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
                  >
                    {loading ? 'Deleting...' : 'Yes, Permanently Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
