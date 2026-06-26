'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Supabase exchanges the recovery link for a temporary session on load and
  // fires PASSWORD_RECOVERY. Either path tells us the user may set a new password.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setHasSession(true)
      setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setDone(true)
    setTimeout(() => router.push('/my-journey'), 1800)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/gbm-horizontal-lockup-white.png" alt="Grace Bible Maui" className="mx-auto h-20 w-auto" />
          <h1 className="mt-4 text-2xl font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            Constellations
          </h1>
        </div>

        <div className="cn-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--fg-1)]">Set a new password</h2>

          {done ? (
            <p className="text-sm text-[var(--fg-2)]">Password updated. Taking you to your journey…</p>
          ) : !ready ? (
            <p className="text-sm text-[var(--fg-3)]">Loading…</p>
          ) : !hasSession ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--fg-2)]">
                This reset link is invalid or has expired. Request a new one from the sign-in page.
              </p>
              <button onClick={() => router.push('/my-journey')} className="cn-btn cn-btn-primary w-full">
                Go to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
              <div>
                <label htmlFor="new-password" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">New password</label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                  placeholder="At least 6 characters"
                  required
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                  placeholder="Confirm password"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="cn-btn cn-btn-primary w-full">
                {loading ? 'Saving…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
