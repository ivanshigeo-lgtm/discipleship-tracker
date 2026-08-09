'use client'

// Standalone public assessment onramp (no login). A funnel: menu → take each of
// the three tests (Spiritual Gifts, Big Five, Passion), seeing each result as you
// finish → name + email → consolidated ministry-fit summary. Submitting creates
// an unassigned lead on WikiChurch for the team to follow up.
import { useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import {
  QUESTIONS as GIFT_QUESTIONS,
  SCALE as GIFT_SCALE,
} from '@/lib/spiritualGifts'
import {
  QUESTIONS as BIG_QUESTIONS,
  SCALE as BIG_SCALE,
} from '@/lib/bigFive'
import type { PassionAnswers } from '@/lib/passion'
import QuestionRunner from './_components/QuestionRunner'
import PassionRunner from './_components/PassionRunner'
import { GiftsResult, BigFiveResult, PassionResult, SummaryView } from './_components/results'

const ASSESSMENT_URL = 'https://wikichurch.app/assessment'

type Phase =
  | 'menu'
  | 'gifts'
  | 'bigfive'
  | 'passion'
  | 'giftsResult'
  | 'bigfiveResult'
  | 'passionResult'
  | 'capture'
  | 'generating'
  | 'summary'

const TESTS = [
  { key: 'gifts', label: 'Spiritual Gifts', blurb: 'Discover how the Spirit has gifted you.', minutes: '10 min', color: 'var(--equip)' },
  { key: 'bigfive', label: 'Personality', blurb: 'How you\'re naturally wired.', minutes: '5 min', color: 'var(--establish)' },
  { key: 'passion', label: 'Ministry Passion', blurb: 'The people and causes that stir you.', minutes: '5 min', color: 'var(--engage)' },
] as const

export default function AssessmentPage() {
  const [phase, setPhase] = useState<Phase>('menu')
  const [gifts, setGifts] = useState<Record<number, number> | null>(null)
  const [bigFive, setBigFive] = useState<Record<number, number> | null>(null)
  const [passion, setPassion] = useState<PassionAnswers | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    summary: string | null
    suggestions: { ministry: string; rationale: string; fitScore: number }[]
    newIdeas: { name: string; rationale: string }[]
  } | null>(null)

  const done = { gifts: !!gifts, bigfive: !!bigFive, passion: !!passion }
  const allDone = done.gifts && done.bigfive && done.passion
  const nextContinue = allDone ? 'Continue to your results' : 'Back to menu'

  const submit = async () => {
    setError('')
    if (!name.trim()) return setError('Please enter your name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Please enter a valid email.')
    setPhase('generating')
    try {
      const res = await fetch('/api/assessment-onramp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          giftsResponses: gifts,
          bigFiveResponses: bigFive,
          passionAnswers: passion,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Please try again.')
        setPhase('capture')
        return
      }
      setResult({
        summary: data.summary ?? null,
        suggestions: data.suggestions ?? [],
        newIdeas: data.newMinistryIdeas ?? [],
      })
      setPhase('summary')
    } catch {
      setError('Could not reach the server. Please try again.')
      setPhase('capture')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--void)] px-5 py-10 text-[var(--fg-1)]">
      <div className="mx-auto w-full max-w-2xl">
        {/* header */}
        {phase === 'menu' && (
          <header className="mb-10 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
              Grace Bible Maui
            </p>
            <h1 className="mt-3 [font-family:var(--font-display)] text-4xl leading-tight text-[var(--fg-1)]">
              How has God wired you to serve?
            </h1>
            <p className="mx-auto mt-4 max-w-md text-[var(--fg-2)]">
              Using our unique gifts to minister to others is one of the greatest joys that we
              can experience. These tests will help you discover, develop and deploy your gifts
              that God has given to you.
            </p>
          </header>
        )}

        {/* menu */}
        {phase === 'menu' && (
          <div className="flex flex-col gap-4">
            {TESTS.map((t) => (
              <button
                key={t.key}
                onClick={() => setPhase(t.key as Phase)}
                className="flex items-center gap-4 rounded-[var(--r-lg)] border border-[var(--line-2)] bg-[var(--indigo-2)] p-5 text-left transition-all hover:border-[var(--gbm-cobalt-bright)] shadow-[var(--elev-2)]"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                  style={{ background: `${t.color}22`, color: t.color }}
                >
                  {done[t.key] ? '✓' : '✦'}
                </span>
                <span className="flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-lg font-semibold text-[var(--fg-1)]">{t.label}</span>
                    {done[t.key] && (
                      <span className="rounded-full bg-[var(--success)]/20 px-2 py-0.5 text-[11px] font-semibold text-[var(--success)]">
                        Done
                      </span>
                    )}
                  </span>
                  <span className="block text-sm text-[var(--fg-3)]">{t.blurb}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--fg-3)]">{t.minutes}</span>
              </button>
            ))}

            {allDone && (
              <button
                onClick={() => setPhase('capture')}
                className="cn-btn cn-btn-primary mt-2 w-full"
              >
                Continue to your results →
              </button>
            )}

            {/* on-page QR to share */}
            <div className="mt-10 flex flex-col items-center gap-3 border-t border-[var(--line-1)] pt-8">
              <div className="rounded-[var(--r-md)] bg-white p-3">
                <QRCodeSVG value={ASSESSMENT_URL} size={104} />
              </div>
              <p className="text-xs text-[var(--fg-3)]">
                Scan to share ·{' '}
                <Link href="/assessment/qr" className="text-[var(--gbm-cobalt-soft)] underline">
                  printable flyer
                </Link>
              </p>
            </div>
          </div>
        )}

        {/* tests */}
        {phase === 'gifts' && (
          <QuestionRunner
            title="Spiritual Gifts"
            subtitle="For each statement, choose how often it's true of you."
            accent="var(--equip)"
            questions={GIFT_QUESTIONS}
            scale={GIFT_SCALE}
            onComplete={(r) => { setGifts(r); setPhase('giftsResult') }}
            onExit={() => setPhase('menu')}
          />
        )}
        {phase === 'bigfive' && (
          <QuestionRunner
            title="Personality"
            subtitle="Rate how much you agree with each statement."
            accent="var(--establish)"
            questions={BIG_QUESTIONS}
            scale={BIG_SCALE}
            onComplete={(r) => { setBigFive(r); setPhase('bigfiveResult') }}
            onExit={() => setPhase('menu')}
          />
        )}
        {phase === 'passion' && (
          <PassionRunner
            onComplete={(a) => { setPassion(a); setPhase('passionResult') }}
            onExit={() => setPhase('menu')}
          />
        )}

        {/* per-test results */}
        {phase === 'giftsResult' && gifts && (
          <GiftsResult responses={gifts} continueLabel={nextContinue}
            onContinue={() => setPhase(allDone ? 'capture' : 'menu')} />
        )}
        {phase === 'bigfiveResult' && bigFive && (
          <BigFiveResult responses={bigFive} continueLabel={nextContinue}
            onContinue={() => setPhase(allDone ? 'capture' : 'menu')} />
        )}
        {phase === 'passionResult' && passion && (
          <PassionResult answers={passion} continueLabel={nextContinue}
            onContinue={() => setPhase(allDone ? 'capture' : 'menu')} />
        )}

        {/* capture */}
        {phase === 'capture' && (
          <div className="mx-auto flex w-full max-w-md flex-col gap-5">
            <div className="text-center">
              <h2 className="[font-family:var(--font-display)] text-3xl text-[var(--fg-1)]">
                One last step
              </h2>
              <p className="mt-2 text-sm text-[var(--fg-3)]">
                Tell us who you are and we'll put together your ministry-fit summary.
              </p>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Email"
              className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
            />
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <button onClick={submit} className="cn-btn cn-btn-primary w-full">
              See my ministry fit →
            </button>
            <button
              onClick={() => setPhase('menu')}
              className="text-sm text-[var(--fg-3)] transition-colors hover:text-[var(--fg-1)]"
            >
              ← Back
            </button>
          </div>
        )}

        {/* generating */}
        {phase === 'generating' && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--line-2)] border-t-[var(--gold)]" />
            <p className="text-[var(--fg-2)]">Discerning how you're wired to serve…</p>
          </div>
        )}

        {/* summary */}
        {phase === 'summary' && result && (
          <SummaryView
            name={name}
            summary={result.summary}
            suggestions={result.suggestions}
            newIdeas={result.newIdeas}
          />
        )}
      </div>
    </div>
  )
}
