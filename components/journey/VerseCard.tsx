'use client'

// Today's verse — the quiet SOAP on-ramp at the bottom of home. Verses come
// from /api/verse-week (a 7-verse set themed to last Sunday's message, one per
// weekday) with attribution back to the sermon; if that's unavailable for any
// reason we fall back to the original static rotation by day-of-year.
// "Sit with this verse" opens the SOAP editor pre-seeded with the Scripture
// line. Deliberately no glow, no streak, no guilt.

import { useEffect, useState } from 'react'
import { E_VERSES } from './journeyModel'

const VERSES: { text: string; ref: string }[] = [
  E_VERSES.Establish,
  { text: 'Your word is a lamp for my feet, a light on my path.', ref: 'Psalm 119:105' },
  { text: 'Come to me, all you who are weary and burdened, and I will give you rest.', ref: 'Matthew 11:28' },
  E_VERSES.Equip,
  { text: 'Trust in the LORD with all your heart and lean not on your own understanding.', ref: 'Proverbs 3:5' },
  { text: 'Be still, and know that I am God.', ref: 'Psalm 46:10' },
  { text: 'I am the vine; you are the branches. If you remain in me and I in you, you will bear much fruit.', ref: 'John 15:5' },
  E_VERSES.Empower,
  { text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.', ref: 'Philippians 4:6' },
  { text: 'Be strong and courageous. Do not be afraid; do not be discouraged, for the LORD your God will be with you wherever you go.', ref: 'Joshua 1:9' },
  { text: 'If anyone is in Christ, the new creation has come: the old has gone, the new is here!', ref: '2 Corinthians 5:17' },
  E_VERSES.Engage,
  { text: 'But those who hope in the LORD will renew their strength. They will soar on wings like eagles.', ref: 'Isaiah 40:31' },
  { text: 'And we know that in all things God works for the good of those who love him.', ref: 'Romans 8:28' },
  { text: 'Do not merely listen to the word, and so deceive yourselves. Do what it says.', ref: 'James 1:22' },
]

type WeekVerse = { ref: string; text: string; whyLine?: string }
type VerseWeek = { sermon_title: string; verses: WeekVerse[] }

export default function VerseCard({
  soapCount,
  onStart,
}: {
  soapCount: number
  onStart: (seedText: string) => void
}) {
  const [week, setWeek] = useState<VerseWeek | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/verse-week')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || j?.status !== 'ready') return
        const w = j.week as VerseWeek
        if (Array.isArray(w?.verses) && w.verses.length === 7) setWeek(w)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000)
  const fromSermon = week?.verses[now.getDay()]
  const verse = fromSermon ?? VERSES[dayOfYear % VERSES.length]
  const seasoned = soapCount >= 3

  return (
    <section className="mt-8 rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[rgba(9,12,26,.55)] p-5 text-center">
      <p className="cn-label" style={{ color: 'var(--fg-3)' }}>Today&rsquo;s verse</p>
      <p className="mx-auto mt-2 max-w-md text-lg italic leading-relaxed" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
        &ldquo;{verse.text}&rdquo;
      </p>
      <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--establish)' }}>{verse.ref}</p>
      {fromSermon && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--fg-3)' }}>
          {fromSermon.whyLine ? `${fromSermon.whyLine} · ` : ''}From Sunday&rsquo;s message · {week!.sermon_title}
        </p>
      )}
      <button
        type="button"
        onClick={() => onStart(`S — Scripture: "${verse.text}" — ${verse.ref}\n\n`)}
        className="cn-chip mt-4 !text-xs"
      >
        {seasoned ? 'Start today’s SOAP from this verse' : 'Sit with this verse'} ✍
      </button>
    </section>
  )
}
