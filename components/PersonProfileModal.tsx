'use client'

import { useEffect, useState } from 'react'
import { deletePerson, updatePerson } from '../lib/supabaseQueries'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import type { Person, Stage, Engagement } from '../types/database'
import { stageLabels, stageOrder } from '../lib/stageLabels'
import StageChecklist from './StageChecklist'
import NextStepsList from './NextStepsList'
import AddNextStepForm from './AddNextStepForm'
import DiscipleshipConnectionsSection from './DiscipleshipConnectionsSection'
import PersonGroupsSection from './PersonGroupsSection'
import PrayerRequestsList from './PrayerRequestsList'
import AddPrayerRequestForm from './AddPrayerRequestForm'
import DiscipleStarCard from './DiscipleStarCard'

const stages: Stage[] = stageOrder

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

type ModalSection = 'profile' | 'journey' | 'connections' | 'engagements' | 'groups' | 'prayer'

type PersonProfileModalProps = {
  person: Person
  initialTab?: ModalSection
  onClose: () => void
  onSaved?: (person: Person) => void
  onDeleted?: (personId: string) => void
  onPersonCreated?: () => void
  onOpenEngagement?: (engagement: Engagement, personName: string) => void
}

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
    <div className="overflow-hidden rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)]">
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-[var(--indigo-3)]"
      >
        <div>
          <div className="font-semibold text-[var(--fg-1)]">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-[var(--fg-3)]">{subtitle}</div>}
        </div>
        <div className="text-lg text-[var(--fg-3)]">{isOpen ? '−' : '+'}</div>
      </button>
      {isOpen && <div className="border-t border-[var(--line-1)] bg-[var(--indigo)] p-3">{children}</div>}
    </div>
  )
}

export default function PersonProfileModal({ person, initialTab = 'profile', onClose, onSaved, onDeleted, onPersonCreated, onOpenEngagement }: PersonProfileModalProps) {
  const { canEdit: checkCanEdit, profile } = useAuth()
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
  const [activeSection, setActiveSection] = useState<ModalSection>(initialTab)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const [accessState, setAccessState] = useState<'idle' | 'loading' | 'copied'>('idle')

  const stageColor = STAGE_COLORS[currentStage]
  const canEdit = checkCanEdit(person.id)
  const canInvite = !person.auth_user_id

  const copyInviteLink = () => {
    const link = `${window.location.origin}/invite/${person.id}`
    navigator.clipboard.writeText(link)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  // Magic sign-in link for someone who already has an account — copy & send it
  // to them to re-access their account.
  const copyAccessLink = async () => {
    setAccessState('loading')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/auth/access-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ personId: person.id }),
      })
      const data = await res.json()
      if (res.ok && data.link) {
        await navigator.clipboard.writeText(data.link)
        setAccessState('copied')
        setTimeout(() => setAccessState('idle'), 3000)
      } else {
        setAccessState('idle')
        alert(data.error || 'Could not generate an access link.')
      }
    } catch {
      setAccessState('idle')
      alert('Could not generate an access link.')
    }
  }

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
    setActiveSection(initialTab)
    setRefreshKey(key => key + 1)
    setStarRefreshKey(key => key + 1)
  }, [person, initialTab])

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
    `shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-all sm:px-3 sm:text-xs ${
      activeSection === section
        ? 'bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]'
        : 'bg-[var(--indigo)] text-[var(--fg-2)] hover:bg-[var(--indigo-2)] hover:text-[var(--fg-1)]'
    }`
  )

  const inputClass = "w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2.5 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-0 sm:p-6">
      <div className="min-h-screen w-full shadow-2xl sm:my-6 sm:min-h-0 sm:max-w-5xl sm:rounded-2xl" style={{ background: 'var(--space)' }}>
        <div className="sticky top-0 z-10 border-b border-[var(--line-1)] p-4 sm:rounded-t-2xl" style={{ background: 'var(--space)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Disciple Profile</div>
              <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
                <h2 className="min-w-0 text-xl font-bold text-[var(--fg-1)] sm:truncate">{savedPerson.name}</h2>
                <select
                  value={currentStage}
                  onChange={event => handleQuickStageChange(event.target.value as Stage)}
                  disabled={loading || !canEdit}
                  className="shrink-0 rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-3 py-1.5 text-sm font-semibold focus:border-[var(--gbm-cobalt-bright)] focus:outline-none disabled:opacity-60"
                  style={{ color: stageColor }}
                >
                  {stages.map(stage => (
                    <option key={stage} value={stage}>{stageLabels[stage].display}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="cn-chip shrink-0"
            >
              Close
            </button>
          </div>

          {(error || message) && (
            <div
              className={`mt-3 rounded-lg p-2.5 text-sm ${
                error ? 'bg-[rgba(240,114,159,.15)] text-[#F2728A]' : 'bg-[rgba(54,214,195,.15)] text-[var(--establish)]'
              }`}
            >
              {error || message}
            </div>
          )}

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            <button type="button" onClick={() => setActiveSection('profile')} className={sectionButtonClass('profile')}>Profile</button>
            <button type="button" onClick={() => setActiveSection('journey')} className={sectionButtonClass('journey')}>4E Checklists</button>
            <button type="button" onClick={() => setActiveSection('connections')} className={sectionButtonClass('connections')}>Connections</button>
            <button type="button" onClick={() => setActiveSection('engagements')} className={sectionButtonClass('engagements')}>Engagements</button>
            <button type="button" onClick={() => setActiveSection('groups')} className={sectionButtonClass('groups')}>Groups</button>
            <button type="button" onClick={() => setActiveSection('prayer')} className={sectionButtonClass('prayer')}>Prayer</button>
          </div>

          {!canEdit && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--indigo)] px-3 py-2 text-xs text-[var(--fg-3)]">
              <span>View only — not in your downline</span>
            </div>
          )}

          {canEdit && canInvite && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-[rgba(91,141,247,.1)] px-3 py-2">
              <span className="text-xs text-[var(--fg-2)]">Invite to track their journey:</span>
              <button
                type="button"
                onClick={copyInviteLink}
                className="rounded-full bg-[var(--equip)] px-2.5 py-1 text-[10px] font-semibold text-[var(--void)] transition-opacity hover:opacity-90"
              >
                {inviteCopied ? 'Copied!' : 'Copy Invite Link'}
              </button>
            </div>
          )}
          {person.auth_user_id && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[rgba(54,214,195,.1)] px-3 py-2">
              <span className="text-xs text-[var(--establish)]">✓ Has account — tracking their own journey</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={copyAccessLink}
                  disabled={accessState === 'loading'}
                  title="Generate a one-click sign-in link to send them (valid ~1 hour)"
                  className="ml-auto rounded-full bg-[var(--establish)] px-2.5 py-1 text-[10px] font-semibold text-[var(--void)] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {accessState === 'loading' ? 'Generating…' : accessState === 'copied' ? 'Copied — valid ~1 hr' : 'Copy access link'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 p-4">
          <DiscipleStarCard person={savedPerson} currentStage={currentStage} refreshKey={starRefreshKey} />

          {activeSection === 'profile' && (savedPerson.testimony_text || savedPerson.testimony_video_url) && (
            <ModalSectionCard title="Their Story" subtitle="Testimony shared with the constellation" defaultOpen>
              {savedPerson.testimony_video_url ? (
                <video src={savedPerson.testimony_video_url} controls className="w-full rounded-lg" />
              ) : null}
              {savedPerson.testimony_text ? (
                <p className="mt-2 text-sm italic leading-relaxed text-[var(--fg-2)]">
                  &ldquo;{savedPerson.testimony_text}&rdquo;
                </p>
              ) : null}
            </ModalSectionCard>
          )}

          {activeSection === 'profile' && (
            <ModalSectionCard
              title="Profile Details"
              subtitle="Contact details, dates, and pastoral notes"
            >
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={event => setName(event.target.value)}
                      className={inputClass}
                      disabled={!canEdit}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={event => setEmail(event.target.value)}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">Phone</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={event => setPhone(event.target.value)}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">Stage</label>
                    <select
                      value={currentStage}
                      onChange={event => setCurrentStage(event.target.value as Stage)}
                      className={inputClass}
                      disabled={!canEdit}
                    >
                      {stages.map(stage => (
                        <option key={stage} value={stage}>{stageLabels[stage].name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">Status</label>
                    <select
                      value={status}
                      onChange={event => setStatus(event.target.value as Person['status'])}
                      className={inputClass}
                      disabled={!canEdit}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">Spiritual Birthday</label>
                    <input
                      type="date"
                      value={spiritualBirthday}
                      onChange={event => setSpiritualBirthday(event.target.value)}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">Baptism Date</label>
                    <input
                      type="date"
                      value={baptismDate}
                      onChange={event => setBaptismDate(event.target.value)}
                      className={inputClass}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">Notes</label>
                  <textarea
                    value={notes}
                    onChange={event => setNotes(event.target.value)}
                    className={`${inputClass} h-20`}
                    placeholder="Pastoral notes, context, prayer needs..."
                    disabled={!canEdit}
                  />
                </div>

                {canEdit && (
                  <div className="flex items-center justify-between gap-2 border-t border-[var(--line-1)] pt-3">
                    <div>
                      {!showDeleteConfirm ? (
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeleteConfirm(true)
                            setError('')
                            setMessage('')
                          }}
                          disabled={loading}
                          className="text-xs text-[#F2728A] hover:underline disabled:opacity-60"
                        >
                          Delete Profile
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#F2728A]">Delete {savedPerson.name}?</span>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={loading}
                            className="text-xs text-[var(--fg-3)] hover:underline disabled:opacity-60"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleDeletePerson}
                            disabled={loading}
                            className="rounded-lg px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-60"
                            style={{ background: '#F2728A', color: 'var(--void)' }}
                          >
                            {loading ? '...' : 'Confirm'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="cn-btn cn-btn-ghost !py-2 !text-sm"
                      >
                        Close
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="cn-btn cn-btn-primary !py-2 !text-sm"
                      >
                        {loading ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </ModalSectionCard>
          )}

          {activeSection === 'journey' && (
            <ModalSectionCard
              title="4E Tools & Action Steps"
              subtitle="Check off milestones under each stage"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                      style={{ border: `2px solid ${stageColor}`, color: stageColor }}
                    >
                      ✦
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[var(--fg-1)]">{stageLabels[currentStage].name}</div>
                      <div className="text-xs text-[var(--fg-3)]">{stageLabels[currentStage].shortDescription}</div>
                    </div>
                  </div>
                  <select
                    value={status}
                    onChange={event => handleQuickStatusChange(event.target.value as Person['status'])}
                    disabled={loading}
                    className="rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none disabled:opacity-60"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
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
              subtitle="Being coached by and called to coach"
            >
              <DiscipleshipConnectionsSection personId={savedPerson.id} onPersonCreated={onPersonCreated} />
            </ModalSectionCard>
          )}

          {activeSection === 'engagements' && (
            <ModalSectionCard
              title="Next Engagements"
              subtitle="Follow-up conversations and next steps"
            >
              <div className="space-y-3">
                <NextStepsList
                  personId={savedPerson.id}
                  personName={savedPerson.name}
                  coachPersonId={profile?.id}
                  refreshKey={refreshKey}
                  onUpdate={() => setRefreshKey(key => key + 1)}
                  onOpenEngagement={onOpenEngagement}
                />
                <AddNextStepForm
                  personId={savedPerson.id}
                  personName={savedPerson.name}
                  onAdded={() => setRefreshKey(key => key + 1)}
                />
              </div>
            </ModalSectionCard>
          )}

          {activeSection === 'groups' && (
            <ModalSectionCard
              title="Grace Groups"
              subtitle="Group membership and recurring connection"
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
              subtitle="Current prayers and praise reports"
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

        </div>
      </div>
    </div>
  )
}
