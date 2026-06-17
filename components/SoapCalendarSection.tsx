'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { SoapJournal } from '../types/database'

interface Props {
  soaps: SoapJournal[]
  onNewEntry: () => void
  soapStreak: number
  onRefresh?: () => void
  onNewEntryForDate?: (date: string) => void
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
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
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
      <mark style={{
        background: 'rgba(54,214,195,.28)',
        color: 'var(--establish, #36D6C3)',
        borderRadius: '3px',
        padding: '0 2px',
        fontWeight: 600,
      }}>
        {match}
      </mark>
      {after}
      {end < text.length && '…'}
    </>
  )
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

export default function SoapCalendarSection({ soaps, onNewEntry, soapStreak, onRefresh, onNewEntryForDate }: Props) {
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
  const [searchQuery, setSearchQuery] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState<string | null>(null)

  const soapMap = useMemo(() => {
    const map = new Map<string, SoapJournal>()
    for (const s of soaps) map.set(s.journal_date, s)
    return map
  }, [soaps])

  // Three calendar months: base, base+1, base+2
  const calendarMonths = useMemo(() => {
    return [0, 1, 2].map(offset => {
      const { year, month } = shiftMonth(baseYear, baseMonth, offset)
      return { year, month, days: buildMonthDays(year, month) }
    })
  }, [baseYear, baseMonth])

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
    if (dateIso > todayIso) return // future — ignore
    if (hasSoap) {
      setSelectedDate(prev => prev === dateIso ? null : dateIso)
      setOcrResult(null)
    } else {
      // Empty past/today day — open entry modal with date prefilled
      onNewEntryForDate?.(dateIso)
    }
  }

  const selectedEntry = selectedDate ? soapMap.get(selectedDate) ?? null : null
  const displayOcrText = ocrResult ?? selectedEntry?.ocr_text ?? null
  const isSearching = searchQuery.trim().length > 0

  // Header label: "Apr – Jun 2026" or across year boundary "Dec 2025 – Feb 2026"
  const lastMonth = shiftMonth(baseYear, baseMonth, 2)
  const rangeLabel =
    baseYear === lastMonth.year
      ? `${MONTH_SHORT[baseMonth]} – ${MONTH_SHORT[lastMonth.month]} ${baseYear}`
      : `${MONTH_SHORT[baseMonth]} ${baseYear} – ${MONTH_SHORT[lastMonth.month]} ${lastMonth.year}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ margin: 0, color: 'var(--fg-1)', fontSize: '19px', fontWeight: 600, letterSpacing: '-0.01em' }}>
            My SOAPs
          </h2>
          {soapStreak > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', borderRadius: '999px',
              background: 'rgba(244,182,80,.15)', border: '1px solid rgba(244,182,80,.30)',
              color: '#F4B650', fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em',
            }}>
              ⚡ {soapStreak} {soapStreak === 1 ? 'day' : 'days'}
            </span>
          )}
        </div>
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

          {/* Three month grids side by side */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0',
            padding: '12px 8px 10px',
          }}>
            {calendarMonths.map(({ year, month, days }, colIdx) => (
              <div
                key={`${year}-${month}`}
                style={{
                  borderRight: colIdx < 2 ? '1px solid var(--line-2)' : 'none',
                  paddingLeft: colIdx === 0 ? '0' : '6px',
                  paddingRight: colIdx === 2 ? '0' : '6px',
                }}
              >
                {/* Month label */}
                <div style={{
                  textAlign: 'center', fontSize: '11px', fontWeight: 700,
                  color: 'var(--fg-2)', letterSpacing: '0.06em',
                  textTransform: 'uppercase', marginBottom: '6px',
                }}>
                  {MONTH_NAMES[month]}
                </div>

                {/* Day-of-week header */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: '2px' }}>
                  {DAY_HEADERS.map((d, i) => (
                    <div key={i} style={{
                      textAlign: 'center', fontSize: '9px', fontWeight: 700,
                      color: 'var(--fg-3)', letterSpacing: '0.08em',
                      textTransform: 'uppercase', paddingBottom: '4px',
                    }}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
                  {days.map(({ dateIso, dayNum, inMonth }) => {
                    const hasSoap = soapMap.has(dateIso)
                    const isSelected = selectedDate === dateIso
                    const isToday = dateIso === todayIso
                    const isFuture = dateIso > todayIso
                    const isClickable = inMonth && !isFuture

                    return (
                      <button
                        key={dateIso}
                        onClick={() => handleDayClick(dateIso, hasSoap, inMonth)}
                        title={
                          !inMonth || isFuture ? undefined
                          : hasSoap ? 'View entry'
                          : 'Add entry for this day'
                        }
                        style={{
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          gap: '2px', padding: '3px 1px',
                          borderRadius: '6px',
                          border: isToday
                            ? '1.5px solid rgba(246,241,231,.30)'
                            : '1.5px solid transparent',
                          background: isSelected
                            ? 'rgba(54,214,195,.18)'
                            : hasSoap && inMonth
                              ? 'rgba(54,214,195,.06)'
                              : 'transparent',
                          color: inMonth ? (isFuture ? 'var(--fg-3)' : 'var(--fg-1)') : 'var(--fg-3)',
                          opacity: inMonth ? 1 : 0.20,
                          cursor: isClickable ? 'pointer' : 'default',
                          fontSize: '11px',
                          fontWeight: isToday ? 700 : 400,
                          minHeight: '34px',
                          transition: 'background 120ms ease',
                          outline: 'none',
                        }}
                        onMouseOver={e => {
                          if (isClickable && hasSoap)
                            e.currentTarget.style.background = 'rgba(54,214,195,.14)'
                          else if (isClickable && !hasSoap)
                            e.currentTarget.style.background = 'rgba(246,241,231,.06)'
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = isSelected
                            ? 'rgba(54,214,195,.18)'
                            : hasSoap && inMonth ? 'rgba(54,214,195,.06)' : 'transparent'
                        }}
                      >
                        <span>{dayNum}</span>
                        {hasSoap && inMonth && (
                          <span style={{
                            width: '4px', height: '4px', borderRadius: '50%',
                            background: 'var(--establish, #36D6C3)',
                            boxShadow: '0 0 4px var(--establish, #36D6C3)',
                            flexShrink: 0,
                          }} />
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
            Tap a past date to view or add an entry
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
            searchResults.map(entry => {
              const isSelected = selectedDate === entry.journal_date
              return (
                <button
                  key={entry.id}
                  onClick={() => {
                    setSelectedDate(isSelected ? null : entry.journal_date)
                    setOcrResult(null)
                  }}
                  style={{
                    display: 'flex', flexDirection: 'row', alignItems: 'flex-start',
                    gap: '12px', padding: '12px', borderRadius: '14px',
                    border: `1px solid ${isSelected ? 'rgba(54,214,195,.40)' : 'var(--line-2)'}`,
                    background: isSelected ? 'rgba(54,214,195,.08)' : 'var(--indigo, #141B3D)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'background 150ms ease, border-color 150ms ease',
                    outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                  onMouseOver={e => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(246,241,231,.04)'
                  }}
                  onMouseOut={e => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--indigo, #141B3D)'
                  }}
                >
                  {/* Photo thumbnail */}
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

                  {/* Text content */}
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
                        Photo entry — tap to view
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })
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
  )
}
