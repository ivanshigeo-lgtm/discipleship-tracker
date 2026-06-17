'use client'

import { useState, useMemo } from 'react'
import { SoapJournal } from '../types/database'

interface Props {
  soaps: SoapJournal[]
  onNewEntry: () => void
  soapStreak: number
  onRefresh?: () => void
}

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function visibilityLabel(v: SoapJournal['visibility']): string {
  switch (v) {
    case 'private':      return 'Just me'
    case 'coach':        return 'My coach'
    case 'group':        return 'My Grace Group'
    case 'constellation': return 'The constellation'
    default:             return v
  }
}

function formatNiceDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD; parse as local date
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function toLocalIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function SoapCalendarSection({ soaps, onNewEntry, soapStreak, onRefresh }: Props) {
  const today = new Date()
  const todayIso = toLocalIso(today)

  const [currentYear, setCurrentYear] = useState(() => today.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(() => today.getMonth()) // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState<string | null>(null)

  // Map journal_date → SoapJournal
  const soapMap = useMemo(() => {
    const map = new Map<string, SoapJournal>()
    for (const s of soaps) {
      map.set(s.journal_date, s)
    }
    return map
  }, [soaps])

  // Calendar grid: array of { dateIso, dayNum, inMonth }
  const calendarDays = useMemo(() => {
    const firstOfMonth = new Date(currentYear, currentMonth, 1)
    const startWeekday = firstOfMonth.getDay() // 0 = Sun
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

    // Days from previous month to fill the first row
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate()

    const days: Array<{ dateIso: string; dayNum: number; inMonth: boolean }> = []

    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const iso = toLocalIso(new Date(currentYear, currentMonth - 1, d))
      days.push({ dateIso: iso, dayNum: d, inMonth: false })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = toLocalIso(new Date(currentYear, currentMonth, d))
      days.push({ dateIso: iso, dayNum: d, inMonth: true })
    }

    // Fill remaining cells to complete last row
    const remaining = (7 - (days.length % 7)) % 7
    for (let d = 1; d <= remaining; d++) {
      const iso = toLocalIso(new Date(currentYear, currentMonth + 1, d))
      days.push({ dateIso: iso, dayNum: d, inMonth: false })
    }

    return days
  }, [currentYear, currentMonth])

  // Filtered search results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return soaps.filter(s =>
      (s.ocr_text?.toLowerCase().includes(q)) ||
      (s.scripture_reference?.toLowerCase().includes(q)) ||
      (s.summary?.toLowerCase().includes(q))
    ).sort((a, b) => b.journal_date.localeCompare(a.journal_date))
  }, [soaps, searchQuery])

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(y => y - 1)
    } else {
      setCurrentMonth(m => m - 1)
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(y => y + 1)
    } else {
      setCurrentMonth(m => m + 1)
    }
  }

  const selectedEntry = selectedDate ? soapMap.get(selectedDate) ?? null : null
  const displayOcrText = ocrResult ?? selectedEntry?.ocr_text ?? null
  const isSearching = searchQuery.trim().length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{
            margin: 0,
            color: 'var(--fg-1)',
            fontSize: '19px',
            fontWeight: 600,
            letterSpacing: '-0.01em',
          }}>
            My SOAPs
          </h2>
          {soapStreak > 0 && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 10px',
              borderRadius: '999px',
              background: 'rgba(244,182,80,.15)',
              border: '1px solid rgba(244,182,80,.30)',
              color: '#F4B650',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.01em',
            }}>
              ⚡ {soapStreak} {soapStreak === 1 ? 'day' : 'days'}
            </span>
          )}
        </div>
        <button
          onClick={onNewEntry}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '10px',
            border: 'none',
            background: 'var(--establish, #36D6C3)',
            color: '#0B1027',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: '0.01em',
            flexShrink: 0,
            transition: 'opacity 150ms ease',
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
        onChange={e => {
          setSearchQuery(e.target.value)
          setSelectedDate(null)
          setOcrResult(null)
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '10px 14px',
          borderRadius: '10px',
          border: '1px solid var(--line-2)',
          background: 'var(--indigo, #141B3D)',
          color: 'var(--fg-1)',
          fontSize: '14px',
          outline: 'none',
          transition: 'border-color 150ms ease',
        }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--establish, #36D6C3)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--line-2)')}
      />

      {/* ── Calendar (only when not searching) ── */}
      {!isSearching && (
        <div style={{
          borderRadius: '16px',
          border: '1px solid var(--line-2)',
          background: 'var(--indigo, #141B3D)',
          overflow: 'hidden',
        }}>
          {/* Month navigation */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--line-2)',
          }}>
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--line-2)',
                background: 'transparent',
                color: 'var(--fg-2)',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 150ms ease',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(246,241,231,.06)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              ‹
            </button>
            <span style={{ color: 'var(--fg-1)', fontWeight: 600, fontSize: '15px' }}>
              {MONTH_NAMES[currentMonth]} {currentYear}
            </span>
            <button
              onClick={nextMonth}
              aria-label="Next month"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--line-2)',
                background: 'transparent',
                color: 'var(--fg-2)',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 150ms ease',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(246,241,231,.06)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              ›
            </button>
          </div>

          {/* Day-of-week header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            padding: '8px 8px 0',
          }}>
            {DAY_HEADERS.map(d => (
              <div key={d} style={{
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--fg-3)',
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                paddingBottom: '6px',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '2px',
            padding: '0 8px 10px',
          }}>
            {calendarDays.map(({ dateIso, dayNum, inMonth }) => {
              const hasSoap = soapMap.has(dateIso)
              const isSelected = selectedDate === dateIso
              const isToday = dateIso === todayIso

              return (
                <button
                  key={dateIso}
                  onClick={() => {
                    if (hasSoap) {
                      setSelectedDate(prev => prev === dateIso ? null : dateIso)
                      setOcrResult(null)
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '6px 2px',
                    borderRadius: '8px',
                    border: isToday
                      ? '1.5px solid rgba(246,241,231,.30)'
                      : '1.5px solid transparent',
                    background: isSelected
                      ? 'rgba(54,214,195,.15)'
                      : hasSoap && inMonth
                        ? 'rgba(54,214,195,.05)'
                        : 'transparent',
                    color: inMonth ? 'var(--fg-1)' : 'var(--fg-3)',
                    opacity: inMonth ? 1 : 0.30,
                    cursor: hasSoap ? 'pointer' : 'default',
                    fontSize: '13px',
                    fontWeight: isToday ? 700 : 400,
                    minHeight: '44px',
                    transition: 'background 150ms ease',
                    outline: 'none',
                  }}
                  onMouseOver={e => {
                    if (hasSoap) e.currentTarget.style.background = 'rgba(54,214,195,.12)'
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.background = isSelected
                      ? 'rgba(54,214,195,.15)'
                      : hasSoap && inMonth
                        ? 'rgba(54,214,195,.05)'
                        : 'transparent'
                  }}
                >
                  <span>{dayNum}</span>
                  {hasSoap && inMonth && (
                    <span style={{
                      width: '5px',
                      height: '5px',
                      borderRadius: '50%',
                      background: 'var(--establish, #36D6C3)',
                      boxShadow: '0 0 5px var(--establish, #36D6C3)',
                      flexShrink: 0,
                    }} />
                  )}
                </button>
              )
            })}
          </div>
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
                onClick={() => setSelectedDate(
                  selectedDate === entry.journal_date ? null : entry.journal_date
                )}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '4px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: `1px solid ${selectedDate === entry.journal_date ? 'rgba(54,214,195,.40)' : 'var(--line-2)'}`,
                  background: selectedDate === entry.journal_date
                    ? 'rgba(54,214,195,.08)'
                    : 'var(--indigo, #141B3D)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 150ms ease, border-color 150ms ease',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
                onMouseOver={e => {
                  if (selectedDate !== entry.journal_date)
                    e.currentTarget.style.background = 'rgba(246,241,231,.04)'
                }}
                onMouseOut={e => {
                  if (selectedDate !== entry.journal_date)
                    e.currentTarget.style.background = 'var(--indigo, #141B3D)'
                }}
              >
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
                {entry.ocr_text && (
                  <span style={{ color: 'var(--fg-3)', fontSize: '13px', lineHeight: 1.5 }}>
                    {entry.ocr_text.slice(0, 120)}{entry.ocr_text.length > 120 ? '…' : ''}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Selected entry viewer ── */}
      {selectedEntry && (
        <div style={{
          borderRadius: '16px',
          border: '1px solid rgba(54,214,195,.25)',
          background: 'var(--indigo, #141B3D)',
          overflow: 'hidden',
          boxShadow: '0 0 24px rgba(54,214,195,.08)',
        }}>
          {/* Card header */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--line-2)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ color: 'var(--fg-1)', fontSize: '15px', fontWeight: 700 }}>
                {formatNiceDate(selectedEntry.journal_date)}
              </span>
              {selectedEntry.scripture_reference && (
                <span style={{
                  color: 'var(--establish, #36D6C3)',
                  fontSize: '13px',
                  fontWeight: 500,
                }}>
                  {selectedEntry.scripture_reference}
                </span>
              )}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginTop: '2px',
                padding: '2px 8px',
                borderRadius: '999px',
                background: 'rgba(246,241,231,.06)',
                border: '1px solid var(--line-2)',
                color: 'var(--fg-3)',
                fontSize: '11px',
                letterSpacing: '0.08em',
                width: 'fit-content',
              }}>
                {visibilityLabel(selectedEntry.visibility)}
              </span>
            </div>
            <button
              onClick={() => setSelectedDate(null)}
              aria-label="Close entry"
              style={{
                flexShrink: 0,
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                border: '1px solid var(--line-2)',
                background: 'transparent',
                color: 'var(--fg-3)',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 150ms ease, color 150ms ease',
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = 'rgba(246,241,231,.08)'
                e.currentTarget.style.color = 'var(--fg-1)'
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--fg-3)'
              }}
            >
              ✕
            </button>
          </div>

          {/* Card body */}
          <div style={{ padding: '16px' }}>
            {selectedEntry.photo_url ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedEntry.photo_url}
                  alt="SOAP journal entry"
                  style={{
                    width: '100%',
                    borderRadius: '10px',
                    display: 'block',
                    objectFit: 'cover',
                  }}
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
                        if (json.ocr_text) {
                          setOcrResult(json.ocr_text)
                          onRefresh?.()
                        }
                      } catch {}
                      setOcrLoading(false)
                    }}
                    disabled={ocrLoading}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: '1px solid var(--line-2)',
                      background: 'var(--indigo-2)',
                      color: 'var(--fg-2)',
                      fontSize: '13px',
                      cursor: ocrLoading ? 'default' : 'pointer',
                      opacity: ocrLoading ? 0.6 : 1,
                      width: '100%',
                    }}
                  >
                    {ocrLoading ? 'Reading…' : 'Read this entry'}
                  </button>
                )}
                {displayOcrText && (
                  <pre style={{
                    margin: 0,
                    color: 'var(--fg-2)',
                    fontSize: '14px',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'inherit',
                  }}>
                    {displayOcrText}
                  </pre>
                )}
              </div>
            ) : selectedEntry.ocr_text ? (
              <pre style={{
                margin: 0,
                color: 'var(--fg-2)',
                fontSize: '14px',
                lineHeight: 1.65,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
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
