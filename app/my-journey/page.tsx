'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import LoginPage from '../../components/LoginPage'
import {
  getMyCoach,
  getMyGroups,
  getSoapJournals,
  getSoapStreak,
  getStageChecklistItems,
  addSoapJournal,
} from '../../lib/supabaseQueries'
import { supabase } from '../../lib/supabaseClient'
import { stageChecklistTemplates } from '../../lib/stageChecklistTemplates'
import type { SoapJournal, StageChecklistItem, Person, VictoryGroup } from '../../types/database'
import GoogleCalendarConnect from '../../components/GoogleCalendarConnect'

type JourneyStep = {
  id: string
  title: string
  description: string
  unlocked: boolean
  completed: boolean
  progress?: number
}

type WeeklySummary = {
  summary: string
  journalCount: number
  period: string
} | null

export default function MyJourneyPage() {
  const { user, profile, loading, signOut } = useAuth()
  const [coach, setCoach] = useState<Person | null>(null)
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [soapJournals, setSoapJournals] = useState<SoapJournal[]>([])
  const [soapStreak, setSoapStreak] = useState(0)
  const [checklistItems, setChecklistItems] = useState<StageChecklistItem[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [showSoapForm, setShowSoapForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [processingOcr, setProcessingOcr] = useState(false)
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary>(null)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [selectedJournal, setSelectedJournal] = useState<SoapJournal | null>(null)
  const [entryMode, setEntryMode] = useState<'photo' | 'type'>('photo')
  const [typedScripture, setTypedScripture] = useState('')
  const [typedEntry, setTypedEntry] = useState('')
  const [submittingTyped, setSubmittingTyped] = useState(false)

  useEffect(() => {
    if (profile?.id) {
      loadData()
    }
  }, [profile?.id])

  const loadData = async () => {
    if (!profile?.id) return
    setDataLoading(true)

    const [coachRes, groupsRes, journalsRes, streakRes, checklistRes] = await Promise.all([
      getMyCoach(profile.id),
      getMyGroups(profile.id),
      getSoapJournals(profile.id, 30),
      getSoapStreak(profile.id),
      getStageChecklistItems(profile.id),
    ])

    if (coachRes.data?.discipler) {
      setCoach(coachRes.data.discipler as Person)
    }
    if (groupsRes.data) {
      setGroups(groupsRes.data.map((g: { victory_groups: VictoryGroup }) => g.victory_groups).filter(Boolean))
    }
    if (journalsRes.data) {
      setSoapJournals(journalsRes.data as SoapJournal[])
    }
    if (streakRes.streak !== undefined) {
      setSoapStreak(streakRes.streak)
    }
    if (checklistRes.data) {
      setChecklistItems(checklistRes.data as StageChecklistItem[])
    }

    setDataLoading(false)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile?.id) return

    setUploading(true)

    const fileExt = file.name.split('.').pop()
    const fileName = `${profile.id}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('soap-photos')
      .upload(fileName, file)

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('soap-photos')
      .getPublicUrl(fileName)

    const today = new Date().toISOString().split('T')[0]
    const { data: newJournal, error } = await addSoapJournal({
      person_id: profile.id,
      journal_date: today,
      photo_url: publicUrl,
      ocr_text: null,
      scripture_reference: null,
      summary: null,
    })

    setUploading(false)
    setShowSoapForm(false)

    if (!error) {
      await loadData()
    }
  }

  const handleTypedSubmit = async () => {
    if (!profile?.id || !typedEntry.trim()) return

    setSubmittingTyped(true)
    const today = new Date().toISOString().split('T')[0]

    const { error } = await addSoapJournal({
      person_id: profile.id,
      journal_date: today,
      photo_url: null,
      ocr_text: typedEntry.trim(),
      scripture_reference: typedScripture.trim() || null,
      summary: null,
    })

    setSubmittingTyped(false)

    if (!error) {
      setShowSoapForm(false)
      setTypedScripture('')
      setTypedEntry('')
      setEntryMode('photo')
      await loadData()
    }
  }

  const runOcrOnJournal = async (journalId: string) => {
    setProcessingOcr(true)
    try {
      const res = await fetch('/api/soap/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalId }),
      })
      const data = await res.json()
      if (data.ocr_text && selectedJournal) {
        setSelectedJournal({
          ...selectedJournal,
          ocr_text: data.ocr_text,
          scripture_reference: data.scripture_reference,
        })
        await loadData()
      }
    } catch (err) {
      console.error('OCR error:', err)
    }
    setProcessingOcr(false)
  }

  const fetchWeeklySummary = async () => {
    if (!profile?.id) return
    setLoadingSummary(true)
    try {
      const res = await fetch('/api/soap/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: profile.id, period: 'week' }),
      })
      const data = await res.json()
      if (data.summary) {
        setWeeklySummary(data)
      }
    } catch (err) {
      console.error('Summary error:', err)
    }
    setLoadingSummary(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--void)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--void)] p-4">
        <p className="text-[var(--fg-2)]">No profile linked to your account.</p>
        <p className="text-sm text-[var(--fg-3)]">Ask your coach for an invite link.</p>
      </div>
    )
  }

  const isConnected = coach !== null || groups.length > 0
  const establishChecklist = stageChecklistTemplates['Establish'] || []
  const completedEstablishItems = checklistItems.filter(
    (i) => i.stage === 'Establish' && i.completed
  ).length
  const establishProgress = establishChecklist.length > 0
    ? completedEstablishItems / establishChecklist.length
    : 0

  const hasSoapToday = soapJournals.some(
    (j) => j.journal_date === new Date().toISOString().split('T')[0]
  )

  const steps: JourneyStep[] = [
    {
      id: 'connect',
      title: 'Get Connected',
      description: coach
        ? `Coached by ${coach.name}`
        : groups.length > 0
        ? `In ${groups.map((g) => g.name).join(', ')}`
        : 'Connect with a coach or join a Grace Group',
      unlocked: true,
      completed: isConnected,
    },
    {
      id: 'word',
      title: 'Establish in the Word',
      description: `SOAP Journal streak: ${soapStreak} days`,
      unlocked: isConnected,
      completed: soapStreak >= 7,
      progress: Math.min(soapStreak / 7, 1),
    },
    {
      id: 'checklist',
      title: 'Complete Establish Stage',
      description: `${completedEstablishItems}/${establishChecklist.length} items completed`,
      unlocked: isConnected && soapStreak >= 7,
      completed: establishProgress >= 1,
      progress: establishProgress,
    },
  ]

  return (
    <div className="min-h-screen bg-[var(--void)]">
      {/* Desktop Header - matches Constellations */}
      <header className="-mb-2 hidden md:block">
        <div className="mx-auto max-w-6xl p-3 sm:p-6 lg:p-8">
          <div className="flex items-center">
            <img
              src="/gbm-horizontal-lockup-white.png"
              alt="Grace Bible Maui"
              className="h-[126px] w-auto shrink-0"
            />
            <div className="mx-6 h-14 w-px bg-[var(--line-2)]" />
            <div className="flex flex-1 items-baseline justify-center gap-2">
              <h1 className="text-3xl font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
                My Journey
              </h1>
            </div>
            <div className="mx-6 h-14 w-px bg-[var(--line-2)]" />
            <div className="flex shrink-0 items-center gap-3">
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[var(--fg-2)]">{profile.name}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await signOut()
                      window.location.href = '/'
                    }}
                    className="cn-chip !text-xs"
                  >
                    Sign Out
                  </button>
                </div>
                <GoogleCalendarConnect />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Header */}
      <header className="mb-4 flex items-center justify-between p-3 md:hidden">
        <img
          src="/gbm-horizontal-lockup-white.png"
          alt="Grace Bible Maui"
          className="h-12 w-auto"
        />
        <div className="flex items-center gap-2">
          <div className="text-right">
            <h1 className="text-lg font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              My Journey
            </h1>
            <span className="text-[10px] text-[var(--fg-3)]">{profile.name}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut()
              window.location.href = '/'
            }}
            className="rounded-full border border-[var(--line-2)] px-2 py-1 text-[10px] text-[var(--fg-3)]"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-lg p-3 sm:p-6 md:max-w-2xl lg:p-8">

        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`rounded-xl border p-4 transition-all ${
                step.unlocked
                  ? step.completed
                    ? 'border-[var(--establish)] bg-[rgba(54,214,195,0.1)]'
                    : 'border-[var(--line-2)] bg-[var(--indigo)]'
                  : 'border-[var(--line-1)] bg-[var(--indigo-2)] opacity-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    step.completed
                      ? 'bg-[var(--establish)] text-[var(--void)]'
                      : step.unlocked
                      ? 'bg-[var(--gbm-cobalt-bright)] text-white'
                      : 'bg-[var(--line-2)] text-[var(--fg-3)]'
                  }`}
                >
                  {step.completed ? '✓' : index + 1}
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-[var(--fg-1)]">{step.title}</h3>
                  <p className="text-sm text-[var(--fg-2)]">{step.description}</p>

                  {step.progress !== undefined && step.unlocked && !step.completed && (
                    <div className="mt-2">
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--line-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--establish)] transition-all"
                          style={{ width: `${step.progress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {step.id === 'word' && step.unlocked && !hasSoapToday && (
                    <button
                      type="button"
                      onClick={() => setShowSoapForm(true)}
                      className="mt-3 rounded-lg bg-[var(--gbm-cobalt-bright)] px-4 py-2 text-sm font-semibold text-white"
                    >
                      + Add Today's SOAP
                    </button>
                  )}

                  {step.id === 'word' && hasSoapToday && (
                    <p className="mt-2 text-xs text-[var(--establish)]">
                      ✓ SOAP completed today
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {showSoapForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-xl bg-[var(--indigo)] p-4">
              <h2 className="mb-4 text-lg font-semibold text-[var(--fg-1)]">
                Add SOAP Entry
              </h2>

              <div className="mb-4 flex rounded-lg bg-[var(--indigo-2)] p-1">
                <button
                  type="button"
                  onClick={() => setEntryMode('photo')}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    entryMode === 'photo'
                      ? 'bg-[var(--gbm-cobalt-bright)] text-white'
                      : 'text-[var(--fg-2)]'
                  }`}
                >
                  Photo
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('type')}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                    entryMode === 'type'
                      ? 'bg-[var(--gbm-cobalt-bright)] text-white'
                      : 'text-[var(--fg-2)]'
                  }`}
                >
                  Type
                </button>
              </div>

              {entryMode === 'photo' ? (
                <>
                  <p className="mb-4 text-sm text-[var(--fg-2)]">
                    Take a photo of your handwritten SOAP journal.
                  </p>
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                    <div className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--line-2)] p-8 text-center transition-colors hover:border-[var(--gbm-cobalt-bright)]">
                      {uploading ? (
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
                      ) : (
                        <span className="text-[var(--fg-2)]">Tap to take photo</span>
                      )}
                    </div>
                  </label>
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--fg-2)]">
                      Scripture Reference
                    </label>
                    <input
                      type="text"
                      value={typedScripture}
                      onChange={(e) => setTypedScripture(e.target.value)}
                      placeholder="e.g., John 3:16"
                      className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--fg-2)]">
                      SOAP Entry
                    </label>
                    <textarea
                      value={typedEntry}
                      onChange={(e) => setTypedEntry(e.target.value)}
                      placeholder="Scripture: What does it say?&#10;Observation: What does it mean?&#10;Application: How does it apply?&#10;Prayer: Your response to God"
                      rows={6}
                      className="w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleTypedSubmit}
                    disabled={submittingTyped || !typedEntry.trim()}
                    className="w-full rounded-lg bg-[var(--gbm-cobalt-bright)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {submittingTyped ? 'Saving...' : 'Save Entry'}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setShowSoapForm(false)
                  setEntryMode('photo')
                  setTypedScripture('')
                  setTypedEntry('')
                }}
                className="mt-4 w-full rounded-lg border border-[var(--line-2)] py-2 text-sm text-[var(--fg-2)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {soapJournals.length >= 3 && (
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[var(--fg-1)]">Weekly Insight</h2>
              {!weeklySummary && (
                <button
                  type="button"
                  onClick={fetchWeeklySummary}
                  disabled={loadingSummary}
                  className="text-sm text-[var(--gbm-cobalt-bright)]"
                >
                  {loadingSummary ? 'Loading...' : 'Get Summary'}
                </button>
              )}
            </div>
            {weeklySummary && (
              <div className="mt-3 rounded-xl border border-[var(--line-2)] bg-[var(--indigo)] p-4">
                <p className="text-sm leading-relaxed text-[var(--fg-2)]">{weeklySummary.summary}</p>
                <p className="mt-2 text-xs text-[var(--fg-3)]">
                  Based on {weeklySummary.journalCount} journal entries this week
                </p>
              </div>
            )}
          </div>
        )}

        {soapJournals.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-[var(--fg-1)]">
              Recent SOAP Entries
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {soapJournals.slice(0, 8).map((journal) => (
                <button
                  type="button"
                  key={journal.id}
                  onClick={() => setSelectedJournal(journal)}
                  className="aspect-square overflow-hidden rounded-lg bg-[var(--indigo)] transition-transform hover:scale-105"
                >
                  {journal.photo_url ? (
                    <img
                      src={journal.photo_url}
                      alt={journal.journal_date}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-[var(--fg-3)]">
                      {journal.journal_date}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedJournal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-[var(--indigo)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--fg-1)]">
                  {selectedJournal.journal_date}
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedJournal(null)}
                  className="text-[var(--fg-3)]"
                >
                  ✕
                </button>
              </div>
              {selectedJournal.scripture_reference && (
                <p className="mb-2 text-sm font-medium text-[var(--establish)]">
                  {selectedJournal.scripture_reference}
                </p>
              )}
              {selectedJournal.photo_url && (
                <img
                  src={selectedJournal.photo_url}
                  alt="Journal"
                  className="mb-3 w-full rounded-lg"
                />
              )}
              {selectedJournal.ocr_text ? (
                <div className="rounded-lg bg-[var(--indigo-2)] p-3">
                  <p className="whitespace-pre-wrap text-sm text-[var(--fg-2)]">
                    {selectedJournal.ocr_text}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => runOcrOnJournal(selectedJournal.id)}
                  disabled={processingOcr}
                  className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] py-3 text-sm text-[var(--fg-2)] transition-colors hover:border-[var(--gbm-cobalt-bright)]"
                >
                  {processingOcr ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
                      Reading...
                    </span>
                  ) : (
                    'Read this entry'
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-sm text-[var(--fg-3)] underline"
          >
            View Full Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
