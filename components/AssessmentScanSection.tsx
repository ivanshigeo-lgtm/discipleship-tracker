'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getLevelSignoffs } from '../lib/supabaseQueries'
import { useAuth } from '../contexts/AuthContext'
import { QUESTIONS as GIFT_QUESTIONS, SCALE as GIFT_SCALE } from '../lib/spiritualGifts'
import { QUESTIONS as BIG5_QUESTIONS, SCALE as BIG5_SCALE } from '../lib/bigFive'
import {
  ISSUES,
  PEOPLE_GROUPS,
  PEOPLE_RANK_COUNT,
  RANK_COUNT,
  REFLECTIONS,
  isPassionComplete,
  normalizePassionAnswers,
  type PassionAnswers,
} from '../lib/passion'

/*
 * Web upload path for the paper-assessment scan pipeline (step 5 — desktop
 * parity with the native coach flow in journey-app/src/components/
 * assessment-scan.tsx). A disciple fills the printed packet (sheets G1/G2/B1/P1
 * from /print/assessments); the coach uploads photos or scans of each sheet
 * here, /api/assessments/scan reads them, and the coach reviews every flagged
 * row before anything is committed — the same review-first contract as native.
 *
 * Coach-only (admin or approved Empower sign-off, mirroring the route's
 * authorizeScanCaller); renders nothing for anyone else.
 */

const MAX_PHOTOS = 6
const GIFT_VALUES = GIFT_SCALE.map(s => s.value)
const BIG5_VALUES = BIG5_SCALE.map(s => s.value)
const PAGE_CODES = ['G1', 'G2', 'B1', 'P1'] as const

// Client-side mirror of the route's draft types (lib/assessmentScan.ts is
// server-only — contracts mirror it, change them together).
type PageCode = (typeof PAGE_CODES)[number] | 'unknown'
type ItemFlag = 'ok' | 'blank' | 'multiple' | 'unclear'
type BubbleDraft = {
  responses: Record<number, number>
  flagged: { id: number; flag: ItemFlag }[]
  pagesSeen: PageCode[]
  complete: boolean
}
type ScanDraft = {
  name: string | null
  date: string | null
  gifts: BubbleDraft | null
  bigFive: BubbleDraft | null
  passion: { answers: PassionAnswers; unmatched: { section: string; label: string }[] } | null
  warnings: string[]
}
type ScanResult = {
  status: 'parsed'
  person: { id: string; name: string }
  pages: { code: PageCode; path: string }[]
  draft: ScanDraft
  model: string
}

type ScanHistoryRow = {
  id: string
  created_at: string
  pages: { code: PageCode; path: string }[] | null
  summary: string | null
  scanner: { name: string } | null
}

type Photo = { file: File; url: string }
type Phase = 'idle' | 'review' | 'done'
type RespMap = Record<number, number>
type FlagMap = Record<number, ItemFlag>

const numericMap = (raw: Record<number, number> | undefined | null): RespMap => {
  const out: RespMap = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === 'number') out[Number(k)] = v
  }
  return out
}

// Shrink an upload the way the native client does — the vision model reads a
// sheet fine at ~2400px wide, and a raw camera photo is several times that in
// bytes (each photo must also fit Vercel's ~4.5MB request cap). Unknown formats
// (HEIC) get re-encoded to JPEG when the browser can decode them; if decoding
// fails the original rides up unchanged and the scan route reports it.
async function uploadableBlob(file: File): Promise<Blob> {
  const known = file.type === 'image/jpeg' || file.type === 'image/png'
  try {
    const bmp = await createImageBitmap(file)
    try {
      if (bmp.width <= 2400 && known) return file
      const scale = bmp.width > 2400 ? 2400 / bmp.width : 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bmp.width * scale)
      canvas.height = Math.round(bmp.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      return blob ?? file
    } finally {
      bmp.close()
    }
  } catch {
    return file
  }
}

export default function AssessmentScanSection({
  personId,
  personName,
  onCommitted,
}: {
  personId: string
  personName: string
  onCommitted?: () => void
}) {
  const { profile } = useAuth()
  const first = personName.trim().split(/\s+/)[0] || 'them'

  // Coach gate — same "empowered" definition the coach dashboard and the scan
  // route use (admins always allowed). null = still checking, render nothing.
  const [isCoach, setIsCoach] = useState<boolean | null>(null)
  useEffect(() => {
    if (!profile?.id) return
    if (profile.is_admin) { setIsCoach(true); return }
    getLevelSignoffs(profile.id).then(({ data }) => {
      setIsCoach(Boolean(data?.some(s => s.stage === 'Empower' && s.status === 'approved')))
    })
  }, [profile?.id, profile?.is_admin])

  const [isOpen, setIsOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [parsing, setParsing] = useState(false)
  const [progress, setProgress] = useState('')
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Review state, seeded from the scan draft. Edits live here — the commit
  // sends these maps, not the raw draft.
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [giftsResp, setGiftsResp] = useState<RespMap>({})
  const [giftsFlags, setGiftsFlags] = useState<FlagMap>({})
  const [b5Resp, setB5Resp] = useState<RespMap>({})
  const [b5Flags, setB5Flags] = useState<FlagMap>({})
  const [passion, setPassion] = useState<PassionAnswers>({ reflections: {}, peopleGroups: [], issues: [] })
  const [passionSeen, setPassionSeen] = useState(false)
  const [showAllGifts, setShowAllGifts] = useState(false)
  const [showAllB5, setShowAllB5] = useState(false)

  const [saved, setSaved] = useState<{ gifts: boolean; bigFive: boolean; passion: boolean } | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  // Set when the commit is what made this coach the person's coach.
  const [coachConnected, setCoachConnected] = useState(false)

  // Past scans for this person (assessment_scans is select-readable to
  // authenticated users; both FKs point at people, so name the column).
  const [history, setHistory] = useState<ScanHistoryRow[]>([])
  const [historyRefresh, setHistoryRefresh] = useState(0)
  useEffect(() => {
    if (!isCoach) return
    let cancelled = false
    supabase
      .from('assessment_scans')
      .select('id, created_at, pages, summary, scanner:people!scanned_by(name)')
      .eq('person_id', personId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (!cancelled && data) setHistory(data as unknown as ScanHistoryRow[])
      })
    return () => { cancelled = true }
  }, [isCoach, personId, historyRefresh])

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    setError('')
    // Snapshot now — the caller clears input.value right after, which empties the live FileList
    const files = Array.from(list)
    setPhotos(current => {
      const room = MAX_PHOTOS - current.length
      const added = files.slice(0, room).map(file => ({ file, url: URL.createObjectURL(file) }))
      if (files.length > room) setError(`Six pages max — kept the first ${room}.`)
      return [...current, ...added]
    })
  }

  const removePhoto = (index: number) => {
    setPhotos(current => {
      URL.revokeObjectURL(current[index]?.url ?? '')
      return current.filter((_, i) => i !== index)
    })
  }

  // Two-phase, same as native: each photo rides in its own request (Vercel
  // rejects bodies over ~4.5MB), then a small JSON call parses the stored batch.
  const readSheets = async () => {
    if (!photos.length || parsing) return
    setParsing(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not signed in — please refresh and sign in again.')

      const paths: string[] = []
      for (let i = 0; i < photos.length; i++) {
        setProgress(`Uploading sheet ${i + 1} of ${photos.length}…`)
        const blob = await uploadableBlob(photos[i].file)
        const form = new FormData()
        form.append('accessToken', token)
        form.append('personId', personId)
        form.append('store', '1')
        form.append('photos', blob, `sheet-${i + 1}.jpg`)
        const res = await fetch('/api/assessments/scan', { method: 'POST', body: form })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok || typeof payload.path !== 'string') {
          throw new Error(payload.error ?? `Photo ${i + 1} upload failed (${res.status}).`)
        }
        paths.push(payload.path)
      }

      setProgress('Reading every bubble and line — about a minute for a full packet. Keep this tab open.')
      const res = await fetch('/api/assessments/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, personId, paths }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? `Scan failed (${res.status}).`)

      const result = payload as ScanResult
      const d = result.draft
      setScan(result)
      setGiftsResp(numericMap(d.gifts?.responses))
      setGiftsFlags(Object.fromEntries((d.gifts?.flagged ?? []).map(f => [f.id, f.flag])))
      setB5Resp(numericMap(d.bigFive?.responses))
      setB5Flags(Object.fromEntries((d.bigFive?.flagged ?? []).map(f => [f.id, f.flag])))
      setPassion(normalizePassionAnswers(d.passion?.answers))
      setPassionSeen(!!d.passion)
      setShowAllGifts(false)
      setShowAllB5(false)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the sheets — please try again.')
    } finally {
      setParsing(false)
      setProgress('')
    }
  }

  // ---- readiness ----
  const giftsCount = GIFT_QUESTIONS.filter(q => giftsResp[q.id] !== undefined).length
  const b5Count = BIG5_QUESTIONS.filter(q => b5Resp[q.id] !== undefined).length
  const giftsReady = giftsCount === GIFT_QUESTIONS.length
  const b5Ready = b5Count === BIG5_QUESTIONS.length
  const passionReady = passionSeen && isPassionComplete(passion)
  const anyReady = giftsReady || b5Ready || passionReady

  const giftsPages = scan?.draft.gifts?.pagesSeen ?? []
  const missingGiftSheets = (['G1', 'G2'] as const).filter(p => !giftsPages.includes(p))

  const commit = async () => {
    if (!anyReady || committing) return
    setCommitting(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not signed in — please refresh and sign in again.')
      const res = await fetch('/api/assessments/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          personId,
          ...(giftsReady ? { gifts: { responses: giftsResp } } : {}),
          ...(b5Ready ? { bigFive: { responses: b5Resp } } : {}),
          ...(passionReady ? { passion: { answers: passion } } : {}),
          pages: scan?.pages,
          model: scan?.model,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? `Save failed (${res.status}).`)
      setSaved(payload.saved)
      setSummary(payload.summary)
      setCoachConnected(Boolean(payload.coachConnectionCreated))
      setPhase('done')
      setHistoryRefresh(k => k + 1)
      onCommitted?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — please try again.')
    } finally {
      setCommitting(false)
    }
  }

  const resetToIdle = () => {
    photos.forEach(p => URL.revokeObjectURL(p.url))
    setPhotos([])
    setScan(null)
    setSaved(null)
    setSummary(null)
    setCoachConnected(false)
    setError('')
    setPhase('idle')
  }

  const toggleRank = (key: 'peopleGroups' | 'issues', label: string) => {
    setPassion(p => {
      const list = p[key]
      const next = list.includes(label)
        ? list.filter(x => x !== label)
        : list.length < RANK_COUNT
          ? [...list, label]
          : list
      return { ...p, [key]: next }
    })
  }

  if (!isCoach) return null

  const draft = scan?.draft

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)]">
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-[var(--indigo-3)]"
      >
        <div>
          <div className="font-semibold text-[var(--fg-1)]">Paper Assessments</div>
          <div className="mt-0.5 text-xs text-[var(--fg-3)]">
            Scan {first}&apos;s filled packet — you review everything before it saves
          </div>
        </div>
        <div className="text-lg text-[var(--fg-3)]">{isOpen ? '−' : '+'}</div>
      </button>

      {isOpen && (
        <div className="border-t border-[var(--line-1)] bg-[var(--indigo)] p-3">
          {error && (
            <div className="mb-3 rounded-lg bg-[rgba(240,114,159,.15)] p-2.5 text-sm text-[#F2728A]">{error}</div>
          )}

          {/* ------------------------------------------------------------ idle */}
          {phase === 'idle' && (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-[var(--fg-2)]">
                One photo or scan per sheet — G1, G2, B1, P1 from the{' '}
                <a href="/print/assessments" target="_blank" className="text-[var(--equip)] underline">printed packet</a>.
                Flat, well lit, all four corner squares visible.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={event => {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />

              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2.5">
                  {photos.map((p, i) => (
                    <div key={p.url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`Sheet ${i + 1}`} className="h-20 w-16 rounded-lg border border-[var(--line-2)] object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        disabled={parsing}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--line-2)] bg-[var(--void)] text-[10px] text-[var(--fg-2)] hover:text-[var(--fg-1)]"
                        aria-label={`Remove sheet ${i + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {parsing ? (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
                  <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--fg-3)] border-t-[var(--fg-1)]" />
                  <div className="text-xs leading-relaxed text-[var(--fg-2)]">{progress}</div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photos.length >= MAX_PHOTOS}
                    className="cn-btn cn-btn-ghost !py-2 !text-sm disabled:opacity-60"
                  >
                    {photos.length ? 'Add another sheet' : 'Add sheet photos'}
                  </button>
                  {photos.length > 0 && (
                    <button type="button" onClick={readSheets} className="cn-btn cn-btn-primary !py-2 !text-sm">
                      Read {photos.length} sheet{photos.length > 1 ? 's' : ''} →
                    </button>
                  )}
                  {photos.length > 0 && (
                    <span className="text-[11px] text-[var(--fg-3)]">
                      {photos.length <= 4 ? `${photos.length} of 4 sheets` : `${photos.length} sheets`}
                    </span>
                  )}
                </div>
              )}

              {/* scan history */}
              {history.length > 0 && (
                <div className="border-t border-[var(--line-1)] pt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">Scan history</div>
                  <div className="mt-2 space-y-1.5">
                    {history.map(row => (
                      <div key={row.id} className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-2)]">
                        <span>
                          {new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {row.scanner?.name && <span className="text-[var(--fg-3)]">by {row.scanner.name}</span>}
                        <span className="flex gap-1">
                          {(row.pages ?? []).map((p, i) => (
                            <span key={i} className="rounded bg-[rgba(255,255,255,.07)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--fg-3)]">
                              {p.code}
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------------------------------------------------- review */}
          {phase === 'review' && (
            <div className="space-y-3">
              {(draft?.name || draft?.date) && (
                <p className="text-xs text-[var(--fg-2)]">
                  On the sheets: {draft?.name ?? '—'}{draft?.date ? ` · ${draft.date}` : ''}
                </p>
              )}
              <div className="flex gap-2">
                {PAGE_CODES.map(code => {
                  const seen = scan?.pages.some(p => p.code === code)
                  return (
                    <span
                      key={code}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                        seen
                          ? 'border-[rgba(54,214,195,.4)] bg-[rgba(54,214,195,.08)] text-[var(--establish)]'
                          : 'border-[var(--line-2)] text-[var(--fg-3)]'
                      }`}
                    >
                      {seen ? '✓ ' : ''}{code}
                    </span>
                  )
                })}
              </div>
              {(draft?.warnings ?? []).map((w, i) => (
                <p key={i} className="text-xs text-[#F4B650]">⚠ {w}</p>
              ))}

              <ReviewSection
                title="Spiritual Gifts"
                status={
                  missingGiftSheets.length
                    ? `sheet${missingGiftSheets.length > 1 ? 's' : ''} ${missingGiftSheets.join(' + ')} not captured`
                    : giftsReady
                      ? 'all 100 read ✓'
                      : `${giftsCount}/100 — fill the rows below`
                }
                ok={giftsReady}
                legend={GIFT_SCALE.map(s => `${s.value} ${s.label}`).join(' · ')}
              >
                <FlaggedRows
                  questions={GIFT_QUESTIONS}
                  resp={giftsResp}
                  flags={giftsFlags}
                  values={GIFT_VALUES}
                  showAll={showAllGifts}
                  onChange={(id, v) => setGiftsResp(r => ({ ...r, [id]: v }))}
                />
                {!missingGiftSheets.length && (
                  <button type="button" onClick={() => setShowAllGifts(s => !s)} className="mt-2 text-xs font-semibold text-[var(--equip)] hover:underline">
                    {showAllGifts ? 'Show flagged only' : 'Review all 100 rows'}
                  </button>
                )}
              </ReviewSection>

              <ReviewSection
                title="Personality (Big Five)"
                status={
                  !scan?.pages.some(p => p.code === 'B1')
                    ? 'sheet B1 not captured'
                    : b5Ready
                      ? 'all 50 read ✓'
                      : `${b5Count}/50 — fill the rows below`
                }
                ok={b5Ready}
                legend={BIG5_SCALE.map(s => `${s.value} ${s.label}`).join(' · ')}
              >
                <FlaggedRows
                  questions={BIG5_QUESTIONS}
                  resp={b5Resp}
                  flags={b5Flags}
                  values={BIG5_VALUES}
                  showAll={showAllB5}
                  onChange={(id, v) => setB5Resp(r => ({ ...r, [id]: v }))}
                />
                {scan?.pages.some(p => p.code === 'B1') && (
                  <button type="button" onClick={() => setShowAllB5(s => !s)} className="mt-2 text-xs font-semibold text-[var(--equip)] hover:underline">
                    {showAllB5 ? 'Show flagged only' : 'Review all 50 rows'}
                  </button>
                )}
              </ReviewSection>

              <ReviewSection
                title="Passion"
                status={!passionSeen ? 'sheet P1 not captured' : passionReady ? 'complete ✓' : 'needs answers below'}
                ok={passionReady}
              >
                {passionSeen && (
                  <div className="space-y-3">
                    {REFLECTIONS.map(r => (
                      <div key={r.id}>
                        <label className="mb-1 block text-xs font-semibold text-[var(--fg-1)]">{r.id}. {r.text}</label>
                        <textarea
                          value={passion.reflections[r.id] ?? ''}
                          onChange={event => {
                            const t = event.target.value
                            setPassion(p => ({ ...p, reflections: { ...p.reflections, [r.id]: t } }))
                          }}
                          placeholder="As written on the sheet…"
                          className="h-16 w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] p-2.5 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                        />
                      </div>
                    ))}
                    <RankPicker
                      title={`PEOPLE THEY'RE DRAWN TO SERVE (pick ${PEOPLE_RANK_COUNT}–${RANK_COUNT})`}
                      options={PEOPLE_GROUPS}
                      selected={passion.peopleGroups}
                      onToggle={l => toggleRank('peopleGroups', l)}
                    />
                    <RankPicker
                      title={`ISSUES THAT STIR THEIR HEART (pick ${RANK_COUNT})`}
                      options={ISSUES.filter(o => o !== 'Other')}
                      selected={passion.issues}
                      onToggle={l => toggleRank('issues', l)}
                    />
                  </div>
                )}
              </ReviewSection>

              <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
                {([
                  ['Spiritual Gifts', giftsReady],
                  ['Big Five', b5Ready],
                  ['Passion', passionReady],
                ] as const).map(([label, ok]) => (
                  <div key={label} className={`text-sm font-semibold ${ok ? 'text-[var(--establish)]' : 'text-[var(--fg-3)]'}`}>
                    {ok ? '✓' : '·'} {label} {ok ? 'ready' : '— will not save'}
                  </div>
                ))}
                <div className="mt-3 flex items-center gap-2">
                  <button type="button" onClick={() => setPhase('idle')} disabled={committing} className="cn-btn cn-btn-ghost !py-2 !text-sm">
                    ← Sheets
                  </button>
                  <button
                    type="button"
                    onClick={commit}
                    disabled={!anyReady || committing}
                    className="cn-btn cn-btn-primary !py-2 !text-sm disabled:opacity-50"
                  >
                    {committing ? 'Saving & preparing Ministry Fit…' : `Save to ${first}'s profile`}
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--fg-3)]">
                  Only complete assessments save. Their journey milestones check off automatically.
                </p>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------ done */}
          {phase === 'done' && (
            <div className="space-y-3">
              <div className="text-base font-bold text-[var(--fg-1)]">Saved to {first}&apos;s journey</div>
              {coachConnected && (
                <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3 text-sm text-[var(--fg-2)]">
                  <span className="font-semibold text-[var(--fg-1)]">You&apos;re now {first}&apos;s coach.</span>{' '}
                  Scanning their packet added them to your constellation, so you can keep
                  tracking their journey from here.
                </div>
              )}
              <div className="space-y-1">
                {([
                  ['gifts', 'Spiritual Gifts'],
                  ['bigFive', 'Personality (Big Five)'],
                  ['passion', 'Passion'],
                ] as const).map(([k, label]) => (
                  <div key={k} className={`text-sm font-semibold ${saved?.[k] ? 'text-[var(--establish)]' : 'text-[var(--fg-3)]'}`}>
                    {saved?.[k] ? '✓' : '○'} {label}{saved?.[k] ? '' : ' — not saved'}
                  </div>
                ))}
              </div>
              {summary ? (
                <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
                  <div className="text-sm font-semibold text-[#F4B650]">✦ Ministry Fit</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-2)]">{summary}</p>
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-[var(--fg-3)]">
                  Ministry Fit appears on {first}&apos;s profile once all three assessments are in.
                </p>
              )}
              <button type="button" onClick={resetToIdle} className="cn-btn cn-btn-primary !py-2 !text-sm">
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// A titled block for one assessment's review rows.
function ReviewSection({
  title, status, ok, legend, children,
}: {
  title: string
  status: string
  ok: boolean
  legend?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-[var(--fg-1)]">{title}</div>
        <div className={`shrink text-right text-xs font-semibold ${ok ? 'text-[var(--establish)]' : 'text-[#F4B650]'}`}>{status}</div>
      </div>
      {legend && <div className="mt-0.5 text-[11px] text-[var(--fg-3)]">{legend}</div>}
      {children}
    </div>
  )
}

// Bubble-grid repair rows. By default only flagged/unread rows show (the model
// flags blanks and double-marks rather than guessing); "show all" lets a coach
// audit even confident reads, since an adjacent-column misread is silent.
function FlaggedRows({
  questions, resp, flags, values, showAll, onChange,
}: {
  questions: { id: number; text: string }[]
  resp: RespMap
  flags: FlagMap
  values: readonly number[]
  showAll: boolean
  onChange: (id: number, v: number) => void
}) {
  const rows = showAll ? questions : questions.filter(q => flags[q.id] !== undefined || resp[q.id] === undefined)
  if (!rows.length) return null
  return (
    <div className="mt-2 divide-y divide-[rgba(255,255,255,.06)]">
      {rows.map(q => {
        const flag = flags[q.id]
        const cur = resp[q.id]
        return (
          <div key={q.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs leading-snug text-[var(--fg-2)]">
                <span className="text-[var(--fg-3)]">{q.id}. </span>{q.text}
              </div>
              {flag && flag !== 'ok' && cur === undefined && (
                <div className="mt-0.5 text-[10px] font-semibold text-[#F4B650]">
                  {flag === 'blank' ? 'left blank on the sheet' : flag === 'multiple' ? 'two marks — pick the right one' : 'hard to read'}
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              {values.map(v => {
                const on = cur === v
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onChange(q.id, v)}
                    className={`h-7 w-7 rounded-full border text-xs font-semibold transition-colors ${
                      on
                        ? 'border-[var(--fg-1)] bg-[var(--fg-1)] text-[var(--void)]'
                        : 'border-[var(--line-2)] text-[var(--fg-2)] hover:border-[var(--fg-2)]'
                    }`}
                  >
                    {v}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Ranked multi-pick — order of selection is the rank (1, 2, 3), mirroring the
// numbers the disciple wrote in the boxes on paper. Write-ins from the scan
// appear as extra options so they stay selectable.
function RankPicker({
  title, options, selected, onToggle,
}: {
  title: string
  options: string[]
  selected: string[]
  onToggle: (label: string) => void
}) {
  const writeIns = selected.filter(s => !options.includes(s))
  const all = [...options, ...writeIns]
  return (
    <div>
      <div className="text-[11px] font-semibold tracking-wide text-[var(--fg-2)]">{title}</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {all.map(o => {
          const idx = selected.indexOf(o)
          const on = idx >= 0
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? 'border-[var(--gbm-cobalt-bright)] bg-[var(--gbm-cobalt-bright)] text-[var(--fg-1)]'
                  : 'border-[var(--line-2)] text-[var(--fg-2)] hover:border-[var(--fg-3)]'
              }`}
            >
              {on && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--fg-1)] text-[10px] font-bold text-[var(--gbm-cobalt-bright)]">
                  {idx + 1}
                </span>
              )}
              <span className="truncate">{o}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
