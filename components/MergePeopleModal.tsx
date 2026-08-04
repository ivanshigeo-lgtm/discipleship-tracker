'use client'

import { useEffect, useMemo, useState } from 'react'
import { getMergeCompareInfo, getPeople, mergePeople, type MergeCompareInfo } from '../lib/supabaseQueries'
import type { Person, Stage } from '../types/database'
import StageLevelBadge from './StageLevelBadge'

// Review-and-confirm flow for folding a duplicate person into a keeper. The
// server (merge_people via /api/people/merge) is the source of truth for the
// merge rules; the preview here mirrors them: fullest name, higher stage,
// keeper's contact back-filled from the duplicate, connections/groups/history
// combined, and a second differing phone preserved as a note. Merging two
// claimed profiles is refused — that needs both owners involved.

const stageRank: Record<Stage, number> = {
  Engage: 0,
  Establish: 1,
  Equip: 2,
  Empower: 3,
}

type MergePeopleModalProps = {
  personA: Person
  // Omit to let the user pick the other profile (entry from a person's page);
  // pass both when arriving from a detected duplicate pair.
  personB?: Person | null
  onClose: () => void
  onMerged: (keptId: string, removedId: string) => void
}

function CompareRow({ label, a, b }: { label: string; a: React.ReactNode; b: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr_1fr] items-start gap-2 border-t border-[var(--line-1)] py-2 text-xs sm:grid-cols-[7rem_1fr_1fr]">
      <div className="font-semibold text-[var(--fg-3)]">{label}</div>
      <div className="min-w-0 text-[var(--fg-1)]">{a || <span className="text-[var(--fg-3)]">—</span>}</div>
      <div className="min-w-0 text-[var(--fg-1)]">{b || <span className="text-[var(--fg-3)]">—</span>}</div>
    </div>
  )
}

export default function MergePeopleModal({ personA, personB = null, onClose, onMerged }: MergePeopleModalProps) {
  const [other, setOther] = useState<Person | null>(personB)
  const [allPeople, setAllPeople] = useState<Person[]>([])
  const [pickerQuery, setPickerQuery] = useState('')
  const [infoA, setInfoA] = useState<MergeCompareInfo | null>(null)
  const [infoB, setInfoB] = useState<MergeCompareInfo | null>(null)
  const [keeperId, setKeeperId] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Person picker (only when opened without a pre-selected pair)
  useEffect(() => {
    if (other) return
    getPeople().then(({ data }) => setAllPeople((data as Person[]) ?? []))
  }, [other])

  // Load compare context and default the keeper to the OLDER row — in every
  // dup so far the original profile carries the ministry history and the
  // recent one is the accidental re-add.
  useEffect(() => {
    if (!other) return
    setKeeperId(new Date(personA.created_at) <= new Date(other.created_at) ? personA.id : other.id)
    getMergeCompareInfo(personA.id).then(setInfoA)
    getMergeCompareInfo(other.id).then(setInfoB)
  }, [personA, other])

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    if (!q) return []
    return allPeople
      .filter(p => p.id !== personA.id)
      .filter(p => p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [pickerQuery, allPeople, personA.id])

  const keeper = other && keeperId === other.id ? other : personA
  const dup = keeper.id === personA.id ? other : personA
  const keeperInfo = keeper.id === personA.id ? infoA : infoB
  const dupInfo = keeper.id === personA.id ? infoB : infoA
  const bothClaimed = Boolean(personA.auth_user_id && other?.auth_user_id)

  const preview = useMemo(() => {
    if (!other || !dup) return null
    const name = dup.name.trim().length > keeper.name.trim().length ? dup.name : keeper.name
    const stage = stageRank[dup.current_stage] > stageRank[keeper.current_stage]
      ? dup.current_stage
      : keeper.current_stage
    const email = keeper.email || dup.email || null
    const phone = keeper.phone || dup.phone || null
    const altPhone = Boolean(keeper.phone && dup.phone && keeper.phone !== dup.phone)
    const coaches = new Map<string, boolean>()
    for (const c of [...(keeperInfo?.coaches ?? []), ...(dupInfo?.coaches ?? [])]) {
      if (!coaches.has(c.name)) coaches.set(c.name, c.isPrimary)
    }
    const groups = Array.from(new Set([...(keeperInfo?.groups ?? []), ...(dupInfo?.groups ?? [])]))
    return { name, stage, email, phone, altPhone, coaches: Array.from(coaches.keys()), groups }
  }, [keeper, dup, other, keeperInfo, dupInfo])

  const handleMerge = async () => {
    if (!dup) return
    setLoading(true)
    setError('')
    const { error: mergeError } = await mergePeople(keeper.id, dup.id)
    setLoading(false)
    if (mergeError) {
      setError(mergeError.message)
      setConfirming(false)
      return
    }
    onMerged(keeper.id, dup.id)
    onClose()
  }

  const renderCoaches = (info: MergeCompareInfo | null) =>
    info === null
      ? '…'
      : info.coaches.length
        ? info.coaches.map(c => `${c.name}${c.isPrimary ? ' ★' : ''}`).join(', ')
        : ''

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-0 sm:p-6">
      <div className="min-h-screen w-full shadow-2xl sm:my-6 sm:min-h-0 sm:max-w-3xl sm:rounded-2xl" style={{ background: 'var(--space)' }}>
        <div className="sticky top-0 z-10 border-b border-[var(--line-1)] p-4 sm:rounded-t-2xl" style={{ background: 'var(--space)' }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Merge duplicate profiles</div>
              <h2 className="mt-1 text-xl font-bold text-[var(--fg-1)]">
                {other ? `${keeper.name} + ${dup?.name}` : `Merge into ${personA.name}…`}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="cn-chip shrink-0">Close</button>
          </div>
          {error && (
            <div className="mt-3 rounded-lg bg-[rgba(240,114,159,.15)] p-2.5 text-sm text-[#F2728A]">{error}</div>
          )}
        </div>

        <div className="space-y-3 p-4">
          {!other && (
            <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
              <label className="mb-1 block text-xs font-semibold text-[var(--fg-2)]">
                Which profile is a duplicate of {personA.name}?
              </label>
              <input
                type="text"
                value={pickerQuery}
                onChange={event => setPickerQuery(event.target.value)}
                placeholder="Search by name or email..."
                autoFocus
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo)] p-2.5 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
              />
              {pickerMatches.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-lg border border-[var(--line-2)]">
                  {pickerMatches.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setOther(p)}
                      className="flex w-full items-center gap-2 border-b border-[var(--line-1)] bg-[var(--indigo)] px-3 py-2 text-left text-sm text-[var(--fg-1)] transition-colors last:border-b-0 hover:bg-[var(--indigo-2)]"
                    >
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      <span className="min-w-0 truncate text-xs text-[var(--fg-3)]">{p.email || p.phone || ''}</span>
                      <span className="ml-auto shrink-0"><StageLevelBadge stage={p.current_stage} size="sm" /></span>
                    </button>
                  ))}
                </div>
              )}
              {pickerQuery.trim() !== '' && pickerMatches.length === 0 && (
                <p className="mt-2 text-xs text-[var(--fg-3)]">No one else matches that search.</p>
              )}
            </div>
          )}

          {other && dup && (
            <>
              <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
                <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2 sm:grid-cols-[7rem_1fr_1fr]">
                  <div />
                  {[keeper, dup].map(p => (
                    <div key={p.id}>
                      <div className="truncate text-sm font-bold text-[var(--fg-1)]">{p.name}</div>
                      <button
                        type="button"
                        onClick={() => setKeeperId(p.id)}
                        className={`mt-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
                          keeperId === p.id
                            ? 'bg-[var(--establish)] text-[var(--void)]'
                            : 'bg-[var(--indigo)] text-[var(--fg-3)] hover:text-[var(--fg-1)]'
                        }`}
                      >
                        {keeperId === p.id ? '✓ Keep this profile' : 'Keep this instead'}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <CompareRow
                    label="Stage"
                    a={<StageLevelBadge stage={keeper.current_stage} size="sm" />}
                    b={<StageLevelBadge stage={dup.current_stage} size="sm" />}
                  />
                  <CompareRow label="Email" a={keeper.email} b={dup.email} />
                  <CompareRow label="Phone" a={keeper.phone} b={dup.phone} />
                  <CompareRow
                    label="Added"
                    a={new Date(keeper.created_at).toLocaleDateString()}
                    b={new Date(dup.created_at).toLocaleDateString()}
                  />
                  <CompareRow
                    label="Account"
                    a={keeper.auth_user_id ? '✓ Has sign-in' : ''}
                    b={dup.auth_user_id ? '✓ Has sign-in' : ''}
                  />
                  <CompareRow label="Coaches" a={renderCoaches(keeperInfo)} b={renderCoaches(dupInfo)} />
                  <CompareRow
                    label="Groups"
                    a={keeperInfo ? keeperInfo.groups.join(', ') : '…'}
                    b={dupInfo ? dupInfo.groups.join(', ') : '…'}
                  />
                  <CompareRow
                    label="Checklist"
                    a={keeperInfo ? `${keeperInfo.checklistCount} item${keeperInfo.checklistCount === 1 ? '' : 's'}` : '…'}
                    b={dupInfo ? `${dupInfo.checklistCount} item${dupInfo.checklistCount === 1 ? '' : 's'}` : '…'}
                  />
                  <CompareRow label="Notes" a={keeper.notes} b={dup.notes} />
                </div>
              </div>

              {bothClaimed ? (
                <div className="rounded-xl border border-[rgba(240,114,159,.35)] bg-[rgba(240,114,159,.1)] p-3 text-sm text-[#F2728A]">
                  Both of these profiles have their own sign-in account, so they can&apos;t be merged
                  automatically — one of them would lose their login. Reach out to Jonavan to sort
                  out which account is real first.
                </div>
              ) : preview && (
                <div className="rounded-xl border border-[rgba(54,214,195,.35)] bg-[rgba(54,214,195,.08)] p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--establish)]">After the merge</div>
                  <div className="mt-2 space-y-1 text-sm text-[var(--fg-1)]">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{preview.name}</span>
                      <StageLevelBadge stage={preview.stage} size="sm" />
                    </div>
                    <div className="text-xs text-[var(--fg-2)]">
                      {[preview.email, preview.phone].filter(Boolean).join(' · ') || 'No contact info'}
                      {preview.altPhone && ' · second phone saved to notes'}
                    </div>
                    {preview.coaches.length > 0 && (
                      <div className="text-xs text-[var(--fg-2)]">Coaches: {preview.coaches.join(', ')}</div>
                    )}
                    {preview.groups.length > 0 && (
                      <div className="text-xs text-[var(--fg-2)]">Groups: {preview.groups.join(', ')}</div>
                    )}
                    <div className="text-xs text-[var(--fg-3)]">
                      All of {dup.name}&apos;s history — checklists, prayers, engagements, SOAPs, and
                      messages — moves onto this profile, and the duplicate is removed.
                      {dup.auth_user_id ? ' Their sign-in moves over too.' : ''}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-[var(--line-1)] pt-3">
                {!confirming ? (
                  <>
                    <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost !py-2 !text-sm">Cancel</button>
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      disabled={bothClaimed || !keeperInfo || !dupInfo}
                      className="cn-btn cn-btn-primary !py-2 !text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Merge profiles
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-[#F2728A]">
                      Remove &ldquo;{dup.name}&rdquo; and fold everything into &ldquo;{keeper.name}&rdquo;? This can&apos;t be undone.
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={loading}
                      className="text-xs text-[var(--fg-3)] hover:underline disabled:opacity-60"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleMerge}
                      disabled={loading}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60"
                      style={{ background: '#F2728A', color: 'var(--void)' }}
                    >
                      {loading ? 'Merging…' : 'Yes, merge'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
