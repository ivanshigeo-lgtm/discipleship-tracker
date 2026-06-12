'use client'

import { useEffect, useState } from 'react'
import { getSoapLeaderboard, getAttendanceLeaderboard } from '../../lib/supabaseQueries'

type SoapRow = { person_id: string; name: string; entries_30d: number; current_streak: number }
type AttendRow = { person_id: string; name: string; attended_8w: number }

/*
 * "We grow together" — rhythms across the constellation.
 * Deliberately not a scoreboard: no ranks past the glow, warm copy,
 * the focus is faithfulness, not competition.
 */
export default function CommunityLights({ myPersonId }: { myPersonId: string }) {
  const [soap, setSoap] = useState<SoapRow[]>([])
  const [attend, setAttend] = useState<AttendRow[]>([])
  const [tab, setTab] = useState<'word' | 'gathering'>('word')

  useEffect(() => {
    getSoapLeaderboard().then(({ data }) => data && setSoap(data as SoapRow[]))
    getAttendanceLeaderboard().then(({ data }) => data && setAttend(data as AttendRow[]))
  }, [])

  if (soap.length === 0 && attend.length === 0) return null

  const rows = tab === 'word' ? soap.slice(0, 8) : attend.slice(0, 8)

  return (
    <section className="cn-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="cn-label">We grow together</div>
          <p className="mt-1 text-xs text-[var(--fg-3)]">Faithful rhythms across the constellation</p>
        </div>
        <div className="flex rounded-full bg-[var(--indigo-3)] p-0.5">
          <button
            type="button"
            onClick={() => setTab('word')}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${tab === 'word' ? 'bg-[var(--indigo)] text-[var(--fg-1)]' : 'text-[var(--fg-3)]'}`}
          >
            In the Word
          </button>
          <button
            type="button"
            onClick={() => setTab('gathering')}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${tab === 'gathering' ? 'bg-[var(--indigo)] text-[var(--fg-1)]' : 'text-[var(--fg-3)]'}`}
          >
            Gathering
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {rows.map((row, i) => {
          const isMe = row.person_id === myPersonId
          const value = tab === 'word' ? (row as SoapRow).current_streak : (row as AttendRow).attended_8w
          const sub =
            tab === 'word'
              ? `${(row as SoapRow).entries_30d} entries this month`
              : 'gatherings these 8 weeks'
          const glow = Math.min(1, value / (tab === 'word' ? 14 : 8))
          return (
            <div
              key={row.person_id}
              className="flex items-center gap-3 rounded-xl px-3 py-2"
              style={isMe ? { background: 'rgba(54,214,195,.08)', border: '1px solid rgba(54,214,195,.25)' } : undefined}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background: '#FBF6EC',
                  opacity: 0.35 + glow * 0.65,
                  boxShadow: `0 0 ${4 + glow * 8}px ${1 + glow * 2}px rgba(251,246,236,${0.2 + glow * 0.5})`,
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--fg-1)]">
                {row.name}
                {isMe && <span className="ml-2 text-[10px] font-semibold text-[var(--establish)]">you</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-bold text-[var(--fg-1)]">
                  {value}
                  {tab === 'word' && <span className="ml-1 text-[10px] font-medium text-[var(--fg-3)]">day{value === 1 ? '' : 's'}</span>}
                </span>
                <span className="block text-[9px] text-[var(--fg-3)]">{sub}</span>
              </span>
            </div>
          )
        })}
        {rows.length === 0 && (
          <p className="px-3 py-2 text-xs text-[var(--fg-3)]">
            {tab === 'word'
              ? 'The first SOAP of the season is still waiting to be written.'
              : 'No gatherings recorded yet this season.'}
          </p>
        )}
      </div>
    </section>
  )
}
