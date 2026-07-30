'use client'

// Open self-service signup wizard. Anyone can create an account:
//   email → OTP code → password → onboarding (claim a coach-made profile, or
//   start fresh with an optional coach code). Mirrors LoginPage / setup styling.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabaseClient'

type Step = 'email' | 'code' | 'password' | 'onboarding'
type OnboardingMode = 'preexisting' | 'orphan' | 'done'

const inputClass =
  'w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none'

export default function SignUpPage() {
  const router = useRouter()
  const { startEmailOtp, verifyEmailOtp, setPassword } = useAuth()

  const [step, setStep] = useState<Step>('email')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword1] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)

  // Onboarding state (populated once the session exists).
  const [mode, setMode] = useState<OnboardingMode | null>(null)
  const [coachName, setCoachName] = useState<string | null>(null)
  const [coachCode, setCoachCode] = useState<string | null>(null)
  const [personName, setPersonName] = useState<string | null>(null)
  const [inputCode, setInputCode] = useState('')
  // Arrived via a coach's invite link → prefill so the disciple auto-connects and
  // never has to type anything. Two link shapes:
  //   ?code=ABC123   generic coach code → connect a fresh profile to that coach
  //   ?claim=<id>    per-disciple link → claim the exact profile the coach made
  const [invited, setInvited] = useState(false)
  const [claimPersonId, setClaimPersonId] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const c = params.get('code')
    if (c) {
      setInputCode(c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
      setInvited(true)
    }
    const claim = params.get('claim')
    if (claim) {
      setClaimPersonId(claim.trim())
      setInvited(true)
    }
  }, [])

  const getAccessToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  // ── Step 1: name + email → send OTP ──
  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) { setError('Please enter your name.'); return }
    if (!email.trim()) { setError('Please enter your email.'); return }
    setLoading(true)
    const { error } = await startEmailOtp(email)
    if (error) setError(error.message)
    else { setStep('code'); setResent(false) }
    setLoading(false)
  }

  // ── Step 2: verify the 6-digit code ──
  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (code.trim().length < 6) { setError('Enter the 6-digit code from your email.'); return }
    setLoading(true)
    const { error } = await verifyEmailOtp(email, code)
    if (error) setError(error.message)
    else setStep('password')
    setLoading(false)
  }

  const handleResend = async () => {
    setError('')
    setLoading(true)
    const { error } = await startEmailOtp(email)
    if (error) setError(error.message)
    else setResent(true)
    setLoading(false)
  }

  // ── Step 3: set a password ──
  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error } = await setPassword(password)
    if (error) { setError(error.message); setLoading(false); return }
    // Enter onboarding — fetch the context that decides what to show.
    await loadOnboarding()
    setStep('onboarding')
    setLoading(false)
  }

  const loadOnboarding = async () => {
    setError('')
    const accessToken = await getAccessToken()
    if (!accessToken) { setError('Session expired. Please sign in.'); return }
    try {
      const res = await fetch('/api/signup-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'context', accessToken, claimPersonId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return }
      if (data.mode === 'done') {
        // Already set up — go straight in.
        router.push('/my-journey')
        return
      }
      setMode(data.mode)
      setCoachName(data.coachName ?? null)
      setCoachCode(data.coachCode ?? null)
      setPersonName(data.personName ?? null)
    } catch {
      setError('Something went wrong. Please try again.')
    }
  }

  // ── Step 4: finish (claim / create) ──
  const handleFinish = async () => {
    setError('')
    setLoading(true)
    const accessToken = await getAccessToken()
    if (!accessToken) { setError('Session expired. Please sign in.'); setLoading(false); return }
    try {
      const res = await fetch('/api/signup-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'finish',
          accessToken,
          name: name.trim(),
          coachCode: mode === 'orphan' ? inputCode.trim() : '',
          claimPersonId,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Something went wrong.'); setLoading(false); return }
      router.push('/my-journey')
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img
            src="/gbm-horizontal-lockup-white.png"
            alt="Grace Bible Maui"
            className="mx-auto h-20 w-auto"
          />
          <h1 className="mt-4 text-2xl font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            Constellations
          </h1>
          <p className="mt-1 text-sm text-[var(--fg-3)]">Create your account</p>
        </div>

        <div className="cn-card p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
          )}

          {/* ── Step 1: email ── */}
          {step === 'email' && (
            <form onSubmit={handleEmail}>
              <h2 className="mb-4 text-lg font-semibold text-[var(--fg-1)]">Get started</h2>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">Name</label>
                  <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="Your name" required />
                </div>
                <div>
                  <label htmlFor="email" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">Email</label>
                  <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" required />
                </div>
                <button type="submit" disabled={loading} className="cn-btn cn-btn-primary w-full">
                  {loading ? 'Sending code...' : 'Send verification code'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 2: code ── */}
          {step === 'code' && (
            <form onSubmit={handleCode}>
              <h2 className="mb-2 text-lg font-semibold text-[var(--fg-1)]">Enter your code</h2>
              <p className="mb-4 text-sm text-[var(--fg-2)]">
                We sent a 6-digit code to <span className="font-semibold text-[var(--fg-1)]">{email}</span>. Enter it below.
              </p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="code" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">Verification code</label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                    className={`${inputClass} text-center font-mono text-lg tracking-[.4em]`}
                    placeholder="000000"
                    maxLength={6}
                    required
                  />
                </div>
                <button type="submit" disabled={loading} className="cn-btn cn-btn-primary w-full">
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading}
                  className="w-full text-center text-xs text-[var(--gbm-cobalt-bright)] hover:underline"
                >
                  {resent ? 'Code re-sent ✓' : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: password ── */}
          {step === 'password' && (
            <form onSubmit={handlePassword}>
              <h2 className="mb-2 text-lg font-semibold text-[var(--fg-1)]">Set a password</h2>
              <p className="mb-4 text-sm text-[var(--fg-2)]">You&apos;ll use this to sign in next time.</p>
              <div className="space-y-4">
                <div>
                  <label htmlFor="password" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">Password</label>
                  <input id="password" type="password" value={password} onChange={e => setPassword1(e.target.value)} className={inputClass} placeholder="At least 6 characters" required />
                </div>
                <div>
                  <label htmlFor="confirm" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">Confirm password</label>
                  <input id="confirm" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} placeholder="Re-enter your password" required />
                </div>
                <button type="submit" disabled={loading} className="cn-btn cn-btn-primary w-full">
                  {loading ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </form>
          )}

          {/* ── Step 4: onboarding ── */}
          {step === 'onboarding' && (
            <div>
              {mode === 'preexisting' && (
                <>
                  <h2 className="mb-2 text-lg font-semibold text-[var(--fg-1)]">
                    Welcome{personName ? `, ${personName}` : ''}!
                  </h2>
                  <p className="mb-4 text-sm text-[var(--fg-2)]">
                    {coachName
                      ? <>You&apos;re connected to <span className="font-semibold text-[var(--fg-1)]">{coachName}</span>.</>
                      : <>Your profile is ready.</>}
                  </p>
                  {coachCode && (
                    <div className="mb-4">
                      <label className="mb-1 block text-xs font-medium text-[var(--fg-2)]">Your coach&apos;s code</label>
                      <input
                        type="text"
                        value={coachCode}
                        readOnly
                        className={`${inputClass} text-center font-mono tracking-[.3em]`}
                      />
                    </div>
                  )}
                  <button type="button" onClick={handleFinish} disabled={loading} className="cn-btn cn-btn-primary w-full">
                    {loading ? 'Entering...' : 'Enter the app'}
                  </button>
                </>
              )}

              {mode === 'orphan' && (
                <>
                  <h2 className="mb-2 text-lg font-semibold text-[var(--fg-1)]">
                    {invited ? 'You’ve been invited!' : 'You’re almost in'}
                  </h2>
                  <p className="mb-4 text-sm text-[var(--fg-2)]">
                    {invited
                      ? 'Your coach’s code is filled in below — finish to connect with them.'
                      : 'Let’s finish setting up your journey.'}
                  </p>
                  <div className="mb-4">
                    <label htmlFor="coach-code" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">
                      {invited ? 'Your coach’s code' : 'Coach code (optional)'}
                    </label>
                    <input
                      id="coach-code"
                      type="text"
                      value={inputCode}
                      onChange={e => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
                      className={`${inputClass} text-center font-mono tracking-[.3em]`}
                      placeholder="ABC123"
                      maxLength={6}
                    />
                    <p className="mt-1 text-xs text-[var(--fg-3)]">
                      {invited
                        ? 'From your invite link. Leave as-is to connect with your coach.'
                        : 'If your coach gave you a code, enter it to connect.'}
                    </p>
                  </div>
                  <button type="button" onClick={handleFinish} disabled={loading} className="cn-btn cn-btn-primary w-full">
                    {loading ? 'Finishing...' : 'Finish'}
                  </button>
                </>
              )}

              {mode === null && (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-4 w-full text-center text-xs text-[var(--fg-3)] hover:text-[var(--fg-1)]"
        >
          Already have an account? Sign in
        </button>
      </div>
    </div>
  )
}
