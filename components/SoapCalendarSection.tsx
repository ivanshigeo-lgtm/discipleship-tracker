'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { SoapJournal } from '../types/database'
import { cleanInsight } from './journey/WeeklyInsightCard'
import SoapImportModal from './journey/SoapImportModal'
import SoapDateReviewModal from './journey/SoapDateReviewModal'

interface Props {
  soaps: SoapJournal[]
  onNewEntry: () => void
  soapStreak: number        // longest run
  currentStreak?: number    // current run
  onRefresh?: () => void
  onNewEntryForDate?: (date: string) => void
  belowSearch?: ReactNode   // rendered right under the search bar
  personId?: string         // whose journals — needed for the weekly summary
}

const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function visibilityLabel(v: SoapJournal['visibility']): string {
  switch (v) {
    case 'private':       return 'Just me'
    case 'coach':         return 'My coach'
    case 'group':         return 'My Grace Group'
    case 'constellation': return 'The constellation'
    default:              return v
  }
}

function formatNiceDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

/** Extract a ~150-char window centred on the first match, with the match highlighted. */
function highlightExcerpt(text: string, query: string): ReactNode {
  const q = query.toLowerCase()
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) {
    const clip = text.slice(0, 150)
    return clip.length < text.length ? clip + '…' : clip
  }
  const WINDOW = 150
  const half = Math.floor((WINDOW - query.length) / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(text.length, idx + query.length + half)
  const before = text.slice(start, idx)
  const match = text.slice(idx, idx + query.length)
  const after = text.slice(idx + query.length, end)
  return (
    <>
      {start > 0 && '…'}
      {before}
      <span style={{
        backgroundColor: 'rgba(54,214,195,.35)',
        color: '#fff',
        borderRadius: '3px',
        padding: '1px 3px',
        fontWeight: 700,
      }}>
        {match}
      </span>
      {after}
      {end < text.length && '…'}
    </>
  )
}

/** Highlight every occurrence of query in the full text (for the modal view). */
function highlightAll(text: string, query: string): ReactNode {
  if (!query) return text
  const q = query.toLowerCase()
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  let idx = text.toLowerCase().indexOf(q, 0)
  if (idx === -1) return text
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx))
    parts.push(
      <span key={key++} style={{
        backgroundColor: 'rgba(54,214,195,.40)',
        color: '#fff',
        borderRadius: '3px',
        padding: '1px 3px',
        fontWeight: 700,
      }}>
        {text.slice(idx, idx + query.length)}
      </span>
    )
    last = idx + query.length
    idx = text.toLowerCase().indexOf(q, last)
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function toLocalIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Returns the calendar grid days for a given year/month (0-indexed month). */
function buildMonthDays(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevMonthDays = new Date(year, month, 0).getDate()

  const days: Array<{ dateIso: string; dayNum: number; inMonth: boolean }> = []

  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    days.push({ dateIso: toLocalIso(new Date(year, month - 1, d)), dayNum: d, inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ dateIso: toLocalIso(new Date(year, month, d)), dayNum: d, inMonth: true })
  }
  const remaining = (7 - (days.length % 7)) % 7
  for (let d = 1; d <= remaining; d++) {
    days.push({ dateIso: toLocalIso(new Date(year, month + 1, d)), dayNum: d, inMonth: false })
  }

  return days
}

/** Advance a {year, month} by delta months. */
function shiftMonth(year: number, month: number, delta: number) {
  const total = month + delta
  const y = year + Math.floor(total / 12)
  const m = ((total % 12) + 12) % 12
  return { year: y, month: m }
}

export default function SoapCalendarSection({ soaps, onNewEntry, soapStreak, currentStreak = 0, onRefresh, onNewEntryForDate, belowSearch, personId }: Props) {
  const today = new Date()
  const todayIso = toLocalIso(today)

  // baseYear/baseMonth is the FIRST of the three visible months
  const [baseYear, setBaseYear] = useState(() => {
    // Start 2 months back so today's month is always rightmost
    const { year, month } = shiftMonth(today.getFullYear(), today.getMonth(), -2)
    return year
  })
  const [baseMonth, setBaseMonth] = useState(() => {
    const { year: _y, month } = shiftMonth(today.getFullYear(), today.getMonth(), -2)
    return month
  })

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEntryIdx, setSelectedEntryIdx] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState<string | null>(null)
  const [modalEntry, setModalEntry] = useState<SoapJournal | null>(null)
  const [modalOcrLoading, setModalOcrLoading] = useState(false)
  const [modalOcrText, setModalOcrText] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showDateReview, setShowDateReview] = useState(false)

  // OCR'd imported pages that still have no real date and haven't been ignored →
  // "needs a date" review.
  const undatedImports = useMemo(
    () => soaps.filter(s => s.date_precision === 'year' && s.source === 'imported' && s.ocr_text && !s.date_reviewed),
    [soaps]
  )
  // Imported pages not yet processed by the server (e.g. the app closed mid-import).
  const pendingImports = useMemo(
    () => soaps.filter(s => s.source === 'imported' && !s.ocr_text),
    [soaps]
  )
  const [resuming, setResuming] = useState(false)

  const resumeImport = async () => {
    if (resuming) return
    setResuming(true)
    // Finish each unfinished batch by looping the resumable processor.
    const batches = Array.from(new Set(pendingImports.map(s => s.import_batch_id).filter(Boolean))) as string[]
    for (const batchId of batches) {
      const year = Number((pendingImports.find(s => s.import_batch_id === batchId)?.journal_date ?? '').slice(0, 4)) || new Date().getFullYear()
      for (let guard = 0; guard < 200; guard++) {
        try {
          const res = await fetch('/api/soap/import/process', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId, year }),
          })
          const j = await res.json()
          if (!res.ok || (j.remaining ?? 0) <= 0) break
        } catch { break }
      }
    }
    setResuming(false)
    onRefresh?.()
  }

  // AI Insights — opens via the button, then two modes: this-week (one tap) and
  // custom range (pick dates + ask / general summary).
  const [insightMode, setInsightMode] = useState(false)
  const [aiMode, setAiMode] = useState<'week' | 'range'>('week')
  const rangeSelecting = insightMode && aiMode === 'range'
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [insightQuestion, setInsightQuestion] = useState('')
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightResponse, setInsightResponse] = useState<string | null>(null)
  const [insightError, setInsightError] = useState('')
  // This-week summary
  const [weekSummary, setWeekSummary] = useState<{ text: string; count: number } | null>(null)
  const [weekLoading, setWeekLoading] = useState(false)
  const [weekError, setWeekError] = useState('')

  const fetchWeekSummary = async () => {
    if (!personId) return
    setWeekLoading(true); setWeekError('')
    try {
      const res = await fetch('/api/soap/summary', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, period: 'week' }),
      })
      const data = await res.json()
      if (data.summary) setWeekSummary({ text: data.summary, count: data.journalCount ?? 0 })
      else setWeekError(data.message || data.error || 'No SOAP entries in the last 7 days yet.')
    } catch {
      setWeekError('Could not gather your week right now. Please try again.')
    }
    setWeekLoading(false)
  }

  // A day can hold MULTIPLE entries (e.g. two SOAP passages that day), so group
  // them per date. Undated imports (date_precision='year') stay off the calendar
  // day-dots; they surface in search and the "needs a date" review instead.
  const soapMap = useMemo(() => {
    const map = new Map<string, SoapJournal[]>()
    for (const s of soaps) {
      if (s.date_precision === 'year') continue
      const arr = map.get(s.journal_date)
      if (arr) arr.push(s)
      else map.set(s.journal_date, [s])
    }
    return map
  }, [soaps])

  // Three calendar months: base, base+1, base+2
  const calendarMonths = useMemo(() => {
    return [0, 1, 2].map(offset => {
      const { year, month } = shiftMonth(baseYear, baseMonth, offset)
      return { year, month, days: buildMonthDays(year, month) }
    })
  }, [baseYear, baseMonth])

  // The visual range to highlight (follows hover before range is committed)
  const previewRange = useMemo(() => {
    if (!rangeStart) return null
    const end = rangeEnd ?? hoverDate ?? rangeStart
    const lo = rangeStart <= end ? rangeStart : end
    const hi = rangeStart <= end ? end : rangeStart
    return { lo, hi }
  }, [rangeStart, rangeEnd, hoverDate])

  // SOAP entries actually selected (only when both endpoints are committed)
  const selectedInsightDates = useMemo(() => {
    if (!rangeStart || !rangeEnd) return new Set<string>()
    const lo = rangeStart <= rangeEnd ? rangeStart : rangeEnd
    const hi = rangeStart <= rangeEnd ? rangeEnd : rangeStart
    const set = new Set<string>()
    for (const [date] of soapMap) {
      if (date >= lo && date <= hi) set.add(date)
    }
    return set
  }, [rangeStart, rangeEnd, soapMap])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return soaps
      .filter(s =>
        (s.ocr_text?.toLowerCase().includes(q)) ||
        (s.scripture_reference?.toLowerCase().includes(q)) ||
        (s.summary?.toLowerCase().includes(q))
      )
      .sort((a, b) => b.journal_date.localeCompare(a.journal_date))
  }, [soaps, searchQuery])

  function prevWindow() {
    const { year, month } = shiftMonth(baseYear, baseMonth, -1)
    setBaseYear(year)
    setBaseMonth(month)
  }

  function nextWindow() {
    const { year, month } = shiftMonth(baseYear, baseMonth, 1)
    setBaseYear(year)
    setBaseMonth(month)
  }

  function handleDayClick(dateIso: string, hasSoap: boolean, inMonth: boolean) {
    if (!inMonth) return
    if (dateIso > todayIso) return
    if (rangeSelecting) {
      // Range selection: first click = start, second click = end, third = new start
      if (!rangeStart || rangeEnd) {
        setRangeStart(dateIso)
        setRangeEnd(null)
        setHoverDate(null)
      } else {
        setRangeEnd(dateIso)
        setHoverDate(null)
      }
      setInsightResponse(null)
      setInsightError('')
      return
    }
    if (hasSoap) {
      setSelectedDate(prev => prev === dateIso ? null : dateIso)
      setSelectedEntryIdx(0)
      setOcrResult(null)
    } else {
      onNewEntryForDate?.(dateIso)
    }
  }

  function exitInsightMode() {
    setInsightMode(false)
    setRangeStart(null)
    setRangeEnd(null)
    setHoverDate(null)
    setInsightResponse(null)
    setInsightError('')
    setInsightQuestion('')
  }

  async function runInsight(question?: string) {
    const ids = Array.from(selectedInsightDates)
      .flatMap(d => (soapMap.get(d) ?? []).map(e => e.id))
    if (!ids.length) return
    setInsightLoading(true)
    setInsightResponse(null)
    setInsightError('')
    try {
      const res = await fetch('/api/soap/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalIds: ids, question: question?.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) setInsightError(json.error || 'Something went wrong.')
      else setInsightResponse(json.response)
    } catch {
      setInsightError('Network error. Please try again.')
    }
    setInsightLoading(false)
  }

  const selectedDayEntries = selectedDate ? soapMap.get(selectedDate) ?? [] : []
  const selectedEntry = selectedDayEntries[selectedEntryIdx] ?? selectedDayEntries[0] ?? null
  const displayOcrText = ocrResult ?? selectedEntry?.ocr_text ?? null
  const isSearching = searchQuery.trim().length > 0

  // Header label: "Apr – Jun 2026" or across year boundary "Dec 2025 – Feb 2026"
  const lastMonth = shiftMonth(baseYear, baseMonth, 2)
  const rangeLabel =
    baseYear === lastMonth.year
      ? `${MONTH_SHORT[baseMonth]} – ${MONTH_SHORT[lastMonth.month]} ${baseYear}`
      : `${MONTH_SHORT[baseMonth]} ${baseYear} – ${MONTH_SHORT[lastMonth.month]} ${lastMonth.year}`

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ margin: 0, color: 'var(--fg-1)', fontSize: '19px', fontWeight: 600, letterSpacing: '-0.01em' }}>
            My SOAPs
          </h2>
          {currentStreak > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', borderRadius: '999px',
              background: 'rgba(244,182,80,.15)', border: '1px solid rgba(244,182,80,.30)',
              color: '#F4B650', fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em',
            }}>
              ✦ {currentStreak}d current
            </span>
          )}
          {soapStreak > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', borderRadius: '999px',
              background: 'rgba(54,214,195,.12)', border: '1px solid rgba(54,214,195,.30)',
              color: 'var(--establish)', fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em',
            }}>
              ✦ {soapStreak}d longest
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => {
              if (insightMode) { exitInsightMode(); return }
              setInsightMode(true)
              setSelectedDate(null)
              setSearchQuery('')
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '7px 13px', borderRadius: '10px',
              border: `1px solid ${insightMode ? 'rgba(54,214,195,.50)' : 'var(--line-2)'}`,
              background: insightMode ? 'rgba(54,214,195,.12)' : 'transparent',
              color: insightMode ? 'var(--establish, #36D6C3)' : 'var(--fg-2)',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              letterSpacing: '0.01em', flexShrink: 0, transition: 'all 150ms ease',
            }}
          >
            ✦ {insightMode ? 'Exit AI' : 'AI Insights'}
          </button>
          {!insightMode && (
            <>
              {pendingImports.length > 0 && (
                <button
                  onClick={resumeImport}
                  disabled={resuming}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', borderRadius: '10px',
                    border: '1px solid var(--gbm-cobalt-bright)', background: 'rgba(91,141,247,.12)',
                    color: 'var(--gbm-cobalt-bright)', fontSize: '13px', fontWeight: 600,
                    cursor: resuming ? 'default' : 'pointer', flexShrink: 0, opacity: resuming ? 0.6 : 1,
                  }}
                  title="Finish reading pages from an interrupted import"
                >
                  {resuming ? '⟳ Finishing…' : `⟳ Finish import (${pendingImports.length})`}
                </button>
              )}
              {undatedImports.length > 0 && (
                <button
                  onClick={() => setShowDateReview(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', borderRadius: '10px',
                    border: '1px solid rgba(244,182,80,.5)', background: 'rgba(244,182,80,.12)',
                    color: 'var(--gold, #F4B650)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  title="Assign dates to imported pages that had none"
                >
                  🗓 {undatedImports.length} need a date
                </button>
              )}
              <button
                onClick={() => setShowImport(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', borderRadius: '10px',
                  border: '1px solid var(--line-2)', background: 'transparent',
                  color: 'var(--fg-2)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  flexShrink: 0, transition: 'opacity 150ms ease',
                }}
                onMouseOver={e => (e.currentTarget.style.opacity = '0.75')}
                onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                title="Upload past handwritten journals for a year"
              >
                ⬆ Import
              </button>
              <button
                onClick={onNewEntry}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 16px', borderRadius: '10px', border: 'none',
                  background: 'var(--establish, #36D6C3)', color: '#0B1027',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  letterSpacing: '0.01em', flexShrink: 0, transition: 'opacity 150ms ease',
                }}
                onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseOut={e => (e.currentTarget.style.opacity = '1')}
              >
                + New entry
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Search bar ── */}
      <input
        type="text"
        placeholder="Search entries…"
        value={searchQuery}
        onChange={e => { setSearchQuery(e.target.value); setSelectedDate(null); setOcrResult(null) }}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '10px 14px', borderRadius: '10px',
          border: '1px solid var(--line-2)', background: 'var(--indigo, #141B3D)',
          color: 'var(--fg-1)', fontSize: '14px', outline: 'none',
          transition: 'border-color 150ms ease',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--establish, #36D6C3)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
      />

      {belowSearch && <div style={{ marginTop: '12px' }}>{belowSearch}</div>}

      {/* ── AI Insights panel ── */}
      {insightMode && (
        <div style={{
          borderRadius: '16px',
          border: '1px solid rgba(54,214,195,.30)',
          background: 'linear-gradient(145deg, rgba(54,214,195,.06) 0%, var(--indigo, #141B3D) 100%)',
          overflow: 'hidden',
          boxShadow: '0 0 32px rgba(54,214,195,.07)',
        }}>
          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '10px', flexWrap: 'wrap',
            padding: '14px 16px', borderBottom: '1px solid rgba(54,214,195,.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px' }}>✦</span>
                <span style={{ color: 'var(--fg-1)', fontWeight: 700, fontSize: '14px' }}>AI Insights</span>
              </div>
              {/* mode toggle */}
              <div style={{ display: 'flex', borderRadius: '999px', border: '1px solid var(--line-2)', background: 'var(--indigo, #141B3D)', padding: '2px' }}>
                {([['week', 'This week'], ['range', 'Custom range']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAiMode(val)}
                    style={{
                      padding: '4px 11px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                      fontSize: '11px', fontWeight: 600, transition: 'all 150ms ease',
                      background: aiMode === val ? 'rgba(54,214,195,.18)' : 'transparent',
                      color: aiMode === val ? 'var(--establish, #36D6C3)' : 'var(--fg-3)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {aiMode === 'range' && rangeStart && rangeEnd && selectedInsightDates.size > 0 && (
                <span style={{
                  padding: '2px 8px', borderRadius: '999px',
                  background: 'rgba(54,214,195,.18)', border: '1px solid rgba(54,214,195,.35)',
                  color: 'var(--establish, #36D6C3)', fontSize: '11px', fontWeight: 600,
                }}>
                  {selectedInsightDates.size} {selectedInsightDates.size === 1 ? 'entry' : 'entries'}
                </span>
              )}
              {aiMode === 'range' && rangeStart && rangeEnd && (
                <span style={{ color: 'var(--fg-3)', fontSize: '11px' }}>{rangeStart} → {rangeEnd}</span>
              )}
              {aiMode === 'range' && (rangeStart || rangeEnd) && (
                <button
                  onClick={() => { setRangeStart(null); setRangeEnd(null); setHoverDate(null); setInsightResponse(null); setInsightError('') }}
                  style={{ fontSize: '11px', color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {aiMode === 'week' ? (
              weekSummary ? (
                <div style={{ borderRadius: '12px', border: '1px solid rgba(54,214,195,.15)', background: 'rgba(54,214,195,.04)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <pre style={{ margin: 0, color: 'var(--fg-1)', fontSize: '14px', lineHeight: 1.70, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
                    {cleanInsight(weekSummary.text)}
                  </pre>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--fg-3)', fontSize: '12px' }}>From {weekSummary.count} {weekSummary.count === 1 ? 'entry' : 'entries'} in the last 7 days</span>
                    <button onClick={() => { setWeekSummary(null); setWeekError('') }} style={{ fontSize: '12px', color: 'var(--fg-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear</button>
                  </div>
                </div>
              ) : weekLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
                  <span style={{ display: 'inline-block', width: '16px', height: '16px', borderRadius: '50%', border: '2px solid rgba(54,214,195,.30)', borderTopColor: 'var(--establish, #36D6C3)', animation: 'spin 0.7s linear infinite' }} />
                  <span style={{ color: 'var(--fg-3)', fontSize: '13px' }}>Gathering your week…</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', textAlign: 'center', padding: '4px 0' }}>
                  <p style={{ margin: 0, color: 'var(--fg-3)', fontSize: '13px' }}>A gentle reflection on your last 7 days in the Word — one tap.</p>
                  <button
                    onClick={fetchWeekSummary}
                    style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'var(--establish, #36D6C3)', color: '#0B1027', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Gather this week
                  </button>
                  {weekError && <p style={{ margin: 0, color: 'var(--fg-3)', fontSize: '12px' }}>{weekError}</p>}
                </div>
              )
            ) : !rangeStart ? (
              <p style={{ margin: 0, color: 'var(--fg-3)', fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
                Click a start date on the calendar below, then an end date.
              </p>
            ) : !rangeEnd ? (
              <p style={{ margin: 0, color: 'var(--establish, #36D6C3)', fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
                Start: {rangeStart} — now click an end date on the calendar below.
              </p>
            ) : selectedInsightDates.size === 0 ? (
              <p style={{ margin: 0, color: 'var(--fg-3)', fontSize: '13px', textAlign: 'center', padding: '8px 0' }}>
                No SOAP entries found in that date range.
              </p>
            ) : (
              <>
                {/* Action buttons */}
                {!insightLoading && !insightResponse && (
                  <button
                    onClick={() => runInsight()}
                    style={{
                      padding: '11px 16px', borderRadius: '10px', border: 'none',
                      background: 'var(--establish, #36D6C3)', color: '#0B1027',
                      fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                      width: '100%', transition: 'opacity 150ms ease',
                    }}
                    onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseOut={e => (e.currentTarget.style.opacity = '1')}
                  >
                    Generate Summary
                  </button>
                )}

                {/* Question input */}
                {!insightLoading && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="Ask a question about these entries…"
                      value={insightQuestion}
                      onChange={e => setInsightQuestion(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && insightQuestion.trim()) runInsight(insightQuestion)
                      }}
                      style={{
                        flex: 1, padding: '10px 12px', borderRadius: '10px',
                        border: '1px solid var(--line-2)', background: 'var(--indigo, #141B3D)',
                        color: 'var(--fg-1)', fontSize: '13px', outline: 'none',
                        transition: 'border-color 150ms ease',
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'rgba(54,214,195,.60)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
                    />
                    <button
                      onClick={() => { if (insightQuestion.trim()) runInsight(insightQuestion) }}
                      disabled={!insightQuestion.trim()}
                      style={{
                        padding: '10px 14px', borderRadius: '10px',
                        border: '1px solid rgba(54,214,195,.40)',
                        background: insightQuestion.trim() ? 'rgba(54,214,195,.15)' : 'transparent',
                        color: 'var(--establish, #36D6C3)', fontSize: '13px',
                        fontWeight: 600, cursor: insightQuestion.trim() ? 'pointer' : 'default',
                        opacity: insightQuestion.trim() ? 1 : 0.40, transition: 'all 150ms ease',
                        flexShrink: 0,
                      }}
                    >
                      Ask
                    </button>
                  </div>
                )}

                {/* Loading */}
                {insightLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
                    <span style={{
                      display: 'inline-block', width: '16px', height: '16px',
                      borderRadius: '50%', border: '2px solid rgba(54,214,195,.30)',
                      borderTopColor: 'var(--establish, #36D6C3)',
                      animation: 'spin 0.7s linear infinite',
                    }} />
                    <span style={{ color: 'var(--fg-3)', fontSize: '13px' }}>Thinking…</span>
                  </div>
                )}

                {/* Error */}
                {insightError && (
                  <p style={{ margin: 0, color: 'var(--danger, #E05252)', fontSize: '13px' }}>
                    {insightError}
                  </p>
                )}

                {/* Response */}
                {insightResponse && (
                  <div style={{
                    borderRadius: '12px', border: '1px solid rgba(54,214,195,.15)',
                    background: 'rgba(54,214,195,.04)', padding: '16px',
                    display: 'flex', flexDirection: 'column', gap: '10px',
                  }}>
                    <pre style={{
                      margin: 0, color: 'var(--fg-1)', fontSize: '14px', lineHeight: 1.70,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
                    }}>
                      {cleanInsight(insightResponse)}
                    </pre>
                    <button
                      onClick={() => { setInsightResponse(null); setInsightQuestion('') }}
                      style={{
                        alignSelf: 'flex-start', fontSize: '12px', color: 'var(--fg-3)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0', textDecoration: 'underline',
                      }}
                    >
                      Ask another question
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 3-month calendar (only when not searching) ── */}
      {!isSearching && (
        <div style={{
          borderRadius: '16px', border: '1px solid var(--line-2)',
          background: 'var(--indigo, #141B3D)', overflow: 'hidden',
        }}>
          {/* Nav header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid var(--line-2)',
          }}>
            <button
              onClick={prevWindow}
              aria-label="Previous months"
              style={{
                width: '30px', height: '30px', borderRadius: '7px',
                border: '1px solid var(--line-2)', background: 'transparent',
                color: 'var(--fg-2)', cursor: 'pointer', fontSize: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(246,241,231,.06)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >‹</button>
            <span style={{ color: 'var(--fg-1)', fontWeight: 600, fontSize: '14px' }}>
              {rangeLabel}
            </span>
            <button
              onClick={nextWindow}
              aria-label="Next months"
              style={{
                width: '30px', height: '30px', borderRadius: '7px',
                border: '1px solid var(--line-2)', background: 'transparent',
                color: 'var(--fg-2)', cursor: 'pointer', fontSize: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(246,241,231,.06)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >›</button>
          </div>

          {/* Three months: side by side on desktop, stacked on mobile */}
          <div
            className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-5"
            style={{ padding: '14px 12px 12px' }}
          >
            {calendarMonths.map(({ year, month, days }) => (
              <div key={`${year}-${month}`}>
                {/* Month label */}
                <div style={{
                  textAlign: 'center', fontSize: '13px', fontWeight: 700,
                  color: 'var(--fg-2)', letterSpacing: '0.06em',
                  textTransform: 'uppercase', marginBottom: '8px',
                }}>
                  {MONTH_NAMES[month]}
                </div>

                {/* Day-of-week header */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginBottom: '4px' }}>
                  {DAY_HEADERS.map((d, i) => (
                    <div key={i} style={{
                      textAlign: 'center', fontSize: '11px', fontWeight: 700,
                      color: 'var(--fg-3)', letterSpacing: '0.08em',
                      textTransform: 'uppercase', paddingBottom: '4px',
                    }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' }}>
                  {days.map(({ dateIso, dayNum, inMonth }) => {
                    const soapCount = soapMap.get(dateIso)?.length ?? 0
                    const hasSoap = soapCount > 0
                    const isSelected = selectedDate === dateIso
                    const isToday = dateIso === todayIso
                    const isFuture = dateIso > todayIso
                    const isClickable = inMonth && !isFuture

                    // Range visual state
                    const inPreview = rangeSelecting && previewRange && dateIso >= previewRange.lo && dateIso <= previewRange.hi
                    const isEndpoint = rangeSelecting && (dateIso === rangeStart || dateIso === rangeEnd)
                    const isInsightSelected = rangeSelecting && selectedInsightDates.has(dateIso)

                    const bg = rangeSelecting
                      ? isEndpoint ? 'rgba(54,214,195,.30)'
                        : inPreview ? 'rgba(54,214,195,.12)'
                        : hasSoap && inMonth ? 'rgba(54,214,195,.05)'
                        : 'transparent'
                      : isSelected ? 'rgba(54,214,195,.18)'
                        : hasSoap && inMonth ? 'rgba(54,214,195,.06)'
                        : 'transparent'

                    return (
                      <button
                        key={dateIso}
                        onClick={() => handleDayClick(dateIso, hasSoap, inMonth)}
                        onMouseEnter={() => {
                          if (rangeSelecting && rangeStart && !rangeEnd && inMonth && !isFuture)
                            setHoverDate(dateIso)
                        }}
                        onMouseLeave={() => {
                          if (rangeSelecting) setHoverDate(null)
                        }}
                        title={
                          !inMonth || isFuture ? undefined
                          : rangeSelecting
                            ? !rangeStart ? 'Click to set range start'
                            : !rangeEnd ? 'Click to set range end'
                            : 'Click to start new range'
                          : hasSoap ? 'View entry'
                          : 'Add entry for this day'
                        }
                        style={{
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          gap: '2px', padding: '3px 1px',
                          borderRadius: '6px',
                          border: isEndpoint
                            ? '1.5px solid rgba(54,214,195,.70)'
                            : isToday
                              ? '1.5px solid rgba(246,241,231,.30)'
                              : '1.5px solid transparent',
                          background: bg,
                          color: inMonth ? (isFuture ? 'var(--fg-3)' : 'var(--fg-1)') : 'var(--fg-3)',
                          opacity: inMonth ? 1 : 0.20,
                          cursor: isClickable ? 'pointer' : 'default',
                          fontSize: '14px',
                          fontWeight: isEndpoint ? 700 : isToday ? 700 : 400,
                          minHeight: '46px',
                          transition: 'background 80ms ease',
                          outline: 'none',
                        }}
                        onMouseOver={e => {
                          if (isClickable && (!rangeSelecting || !rangeStart || rangeEnd))
                            e.currentTarget.style.background = 'rgba(54,214,195,.14)'
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = bg
                        }}
                      >
                        <span>{dayNum}</span>
                        {hasSoap && inMonth && !isInsightSelected && !isEndpoint && (
                          soapCount > 1 ? (
                            <span style={{ fontSize: '8px', lineHeight: 1, fontWeight: 700, color: 'var(--establish, #36D6C3)' }}>●{soapCount}</span>
                          ) : (
                            <span style={{
                              width: '4px', height: '4px', borderRadius: '50%',
                              background: 'var(--establish, #36D6C3)',
                              boxShadow: '0 0 4px var(--establish, #36D6C3)',
                              flexShrink: 0,
                            }} />
                          )
                        )}
                        {(isInsightSelected || isEndpoint) && (
                          <span style={{ fontSize: '9px', color: 'var(--establish, #36D6C3)', lineHeight: 1, fontWeight: 700 }}>✓</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <p style={{
            margin: '0 8px 10px', fontSize: '11px', color: 'var(--fg-3)',
            textAlign: 'center',
          }}>
            {rangeSelecting
              ? !rangeStart ? 'Click any date to set range start'
              : !rangeEnd ? 'Now click another date to set range end'
              : `${selectedInsightDates.size} ${selectedInsightDates.size === 1 ? 'entry' : 'entries'} selected — click a date to start a new range`
              : 'Tap a past date to view or add an entry'}
          </p>
        </div>
      )}

      {/* ── Search results list ── */}
      {isSearching && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {searchResults.length === 0 ? (
            <p style={{ color: 'var(--fg-3)', fontSize: '14px', textAlign: 'center', margin: '16px 0' }}>
              No entries match your search.
            </p>
          ) : (
            searchResults.map(entry => (
              <button
                key={entry.id}
                onClick={() => {
                  setModalEntry(entry)
                  setModalOcrText(null)
                }}
                style={{
                  display: 'flex', flexDirection: 'row', alignItems: 'flex-start',
                  gap: '12px', padding: '12px', borderRadius: '14px',
                  border: '1px solid var(--line-2)',
                  background: 'var(--indigo, #141B3D)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'background 150ms ease, border-color 150ms ease',
                  outline: 'none', width: '100%', boxSizing: 'border-box',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.background = 'rgba(246,241,231,.04)'
                  e.currentTarget.style.borderColor = 'rgba(54,214,195,.30)'
                }}
                onMouseOut={e => {
                  e.currentTarget.style.background = 'var(--indigo, #141B3D)'
                  e.currentTarget.style.borderColor = 'var(--line-2)'
                }}
              >
                {entry.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.photo_url}
                    alt="Journal page"
                    style={{
                      width: '72px', height: '72px', flexShrink: 0,
                      borderRadius: '10px', objectFit: 'cover',
                      border: '1px solid var(--line-2)',
                    }}
                  />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--fg-1)', fontSize: '13px', fontWeight: 600 }}>
                      {formatNiceDate(entry.journal_date)}
                    </span>
                    {entry.scripture_reference && (
                      <span style={{ color: 'var(--establish, #36D6C3)', fontSize: '12px' }}>
                        {entry.scripture_reference}
                      </span>
                    )}
                  </div>
                  {entry.ocr_text ? (
                    <span style={{ color: 'var(--fg-3)', fontSize: '13px', lineHeight: 1.55 }}>
                      {highlightExcerpt(entry.ocr_text, searchQuery.trim())}
                    </span>
                  ) : entry.photo_url ? (
                    <span style={{ color: 'var(--fg-3)', fontSize: '12px', fontStyle: 'italic' }}>
                      Photo entry — tap to read
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Selected entry viewer ── */}
      {selectedEntry && (
        <div style={{
          borderRadius: '16px', border: '1px solid rgba(54,214,195,.25)',
          background: 'var(--indigo, #141B3D)', overflow: 'hidden',
          boxShadow: '0 0 24px rgba(54,214,195,.08)',
        }}>
          {/* Switcher when this day holds more than one entry */}
          {selectedDayEntries.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px 0' }}>
              <span style={{ fontSize: '11px', color: 'var(--fg-3)' }}>{selectedDayEntries.length} entries this day:</span>
              {selectedDayEntries.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setSelectedEntryIdx(i); setOcrResult(null) }}
                  style={{
                    padding: '3px 11px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${i === selectedEntryIdx ? 'var(--establish, #36D6C3)' : 'var(--line-2)'}`,
                    background: i === selectedEntryIdx ? 'rgba(54,214,195,.15)' : 'transparent',
                    color: i === selectedEntryIdx ? 'var(--establish, #36D6C3)' : 'var(--fg-2)',
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: '12px', padding: '16px 16px 12px', borderBottom: '1px solid var(--line-2)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ color: 'var(--fg-1)', fontSize: '15px', fontWeight: 700 }}>
                {formatNiceDate(selectedEntry.journal_date)}
              </span>
              {selectedEntry.scripture_reference && (
                <span style={{ color: 'var(--establish, #36D6C3)', fontSize: '13px', fontWeight: 500 }}>
                  {selectedEntry.scripture_reference}
                </span>
              )}
              <span style={{
                display: 'inline-flex', alignItems: 'center', marginTop: '2px',
                padding: '2px 8px', borderRadius: '999px',
                background: 'rgba(246,241,231,.06)', border: '1px solid var(--line-2)',
                color: 'var(--fg-3)', fontSize: '11px', letterSpacing: '0.08em', width: 'fit-content',
              }}>
                {visibilityLabel(selectedEntry.visibility)}
              </span>
            </div>
            <button
              onClick={() => setSelectedDate(null)}
              aria-label="Close entry"
              style={{
                flexShrink: 0, width: '28px', height: '28px', borderRadius: '8px',
                border: '1px solid var(--line-2)', background: 'transparent',
                color: 'var(--fg-3)', cursor: 'pointer', fontSize: '14px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'rgba(246,241,231,.08)'
                e.currentTarget.style.color = 'var(--fg-1)'
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--fg-3)'
              }}
            >✕</button>
          </div>

          <div style={{ padding: '16px' }}>
            {selectedEntry.photo_url ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedEntry.photo_url}
                  alt="SOAP journal entry"
                  style={{ width: '100%', borderRadius: '10px', display: 'block', objectFit: 'cover' }}
                />
                {!displayOcrText && (
                  <button
                    onClick={async () => {
                      if (!selectedEntry) return
                      setOcrLoading(true)
                      try {
                        const res = await fetch('/api/soap/ocr', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ journalId: selectedEntry.id }),
                        })
                        const json = await res.json()
                        if (json.ocr_text) { setOcrResult(json.ocr_text); onRefresh?.() }
                      } catch {}
                      setOcrLoading(false)
                    }}
                    disabled={ocrLoading}
                    style={{
                      padding: '10px 16px', borderRadius: '10px',
                      border: '1px solid var(--line-2)', background: 'var(--indigo-2)',
                      color: 'var(--fg-2)', fontSize: '13px',
                      cursor: ocrLoading ? 'default' : 'pointer',
                      opacity: ocrLoading ? 0.6 : 1, width: '100%',
                    }}
                  >
                    {ocrLoading ? 'Reading…' : 'Read this entry'}
                  </button>
                )}
                {displayOcrText && (
                  <pre style={{
                    margin: 0, color: 'var(--fg-2)', fontSize: '14px', lineHeight: 1.65,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
                  }}>
                    {displayOcrText}
                  </pre>
                )}
              </div>
            ) : selectedEntry.ocr_text ? (
              <pre style={{
                margin: 0, color: 'var(--fg-2)', fontSize: '14px', lineHeight: 1.65,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
              }}>
                {selectedEntry.ocr_text}
              </pre>
            ) : (
              <p style={{ margin: 0, color: 'var(--fg-3)', fontSize: '14px', fontStyle: 'italic' }}>
                No content yet
              </p>
            )}
          </div>
        </div>
      )}
    </div>

      {/* ── Search result entry modal ── */}
      {modalEntry && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(6,8,20,.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setModalEntry(null); setModalOcrText(null) } }}
        >
          <div style={{
            width: '100%', maxWidth: '540px', maxHeight: '88vh',
            overflowY: 'auto',
            borderRadius: '20px',
            border: '1px solid rgba(54,214,195,.25)',
            background: 'var(--indigo, #141B3D)',
            boxShadow: '0 0 60px rgba(54,214,195,.10)',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              gap: '12px', padding: '18px 18px 14px',
              borderBottom: '1px solid var(--line-2)',
              position: 'sticky', top: 0,
              background: 'var(--indigo, #141B3D)',
              zIndex: 1,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ color: 'var(--fg-1)', fontSize: '16px', fontWeight: 700 }}>
                  {formatNiceDate(modalEntry.journal_date)}
                </span>
                {modalEntry.scripture_reference && (
                  <span style={{ color: 'var(--establish, #36D6C3)', fontSize: '13px', fontWeight: 500 }}>
                    {modalEntry.scripture_reference}
                  </span>
                )}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', marginTop: '2px',
                  padding: '2px 8px', borderRadius: '999px',
                  background: 'rgba(246,241,231,.06)', border: '1px solid var(--line-2)',
                  color: 'var(--fg-3)', fontSize: '11px', letterSpacing: '0.08em',
                  width: 'fit-content',
                }}>
                  {visibilityLabel(modalEntry.visibility)}
                </span>
              </div>
              <button
                onClick={() => { setModalEntry(null); setModalOcrText(null) }}
                aria-label="Close"
                style={{
                  flexShrink: 0, width: '32px', height: '32px', borderRadius: '10px',
                  border: '1px solid var(--line-2)', background: 'transparent',
                  color: 'var(--fg-3)', cursor: 'pointer', fontSize: '16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseOver={e => { e.currentTarget.style.background = 'rgba(246,241,231,.08)'; e.currentTarget.style.color = 'var(--fg-1)' }}
                onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)' }}
              >✕</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {modalEntry.photo_url && (
                <>
                  {/* All pages for a multi-page (continuation) entry */}
                  {(modalEntry.photo_urls?.length ? modalEntry.photo_urls : [modalEntry.photo_url]).map((u, i, arr) => (
                    <div key={i}>
                      {arr.length > 1 && (
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg-3)', marginBottom: '4px' }}>Page {i + 1} of {arr.length}</div>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={u}
                        alt={`SOAP journal page ${i + 1}`}
                        style={{ width: '100%', borderRadius: '12px', display: 'block' }}
                      />
                    </div>
                  ))}
                  {!(modalOcrText ?? modalEntry.ocr_text) && (
                    <button
                      onClick={async () => {
                        setModalOcrLoading(true)
                        try {
                          const res = await fetch('/api/soap/ocr', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ journalId: modalEntry.id }),
                          })
                          const json = await res.json()
                          if (json.ocr_text) { setModalOcrText(json.ocr_text); onRefresh?.() }
                        } catch {}
                        setModalOcrLoading(false)
                      }}
                      disabled={modalOcrLoading}
                      style={{
                        padding: '11px 16px', borderRadius: '10px',
                        border: '1px solid var(--line-2)', background: 'rgba(54,214,195,.06)',
                        color: 'var(--fg-2)', fontSize: '13px', cursor: modalOcrLoading ? 'default' : 'pointer',
                        opacity: modalOcrLoading ? 0.6 : 1, width: '100%',
                      }}
                    >
                      {modalOcrLoading ? 'Reading…' : 'Read this entry'}
                    </button>
                  )}
                </>
              )}
              {(modalOcrText ?? modalEntry.ocr_text) ? (
                <div style={{
                  margin: 0, color: 'var(--fg-1)', fontSize: '15px', lineHeight: 1.75,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
                }}>
                  {highlightAll(modalOcrText ?? modalEntry.ocr_text ?? '', searchQuery.trim())}
                </div>
              ) : !modalEntry.photo_url ? (
                <p style={{ margin: 0, color: 'var(--fg-3)', fontSize: '14px', fontStyle: 'italic' }}>
                  No content recorded
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {showImport && personId && (
        <SoapImportModal
          personId={personId}
          onClose={() => setShowImport(false)}
          onImported={() => onRefresh?.()}
        />
      )}

      {showDateReview && undatedImports.length > 0 && (
        <SoapDateReviewModal
          entries={undatedImports}
          onClose={() => setShowDateReview(false)}
          onUpdated={() => onRefresh?.()}
        />
      )}
    </>
  )
}
