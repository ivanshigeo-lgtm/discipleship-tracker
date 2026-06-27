'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const router = useRouter()
  const { signIn, resetPassword } = useAuth()
  const [mode, setMode] = useState<'signin' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) {
      setError(error.message)
    } else {
      // Everyone's home is My Journey; coaches/admins toggle to My Constellations.
      router.push('/my-journey')
    }
    setLoading(false)
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email) {
      setError('Enter your email first.')
      return
    }
    setLoading(true)
    const { error } = await resetPassword(email)
    if (error) {
      setError(error.message)
    } else {
      setResetSent(true)
    }
    setLoading(false)
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
          <p className="mt-1 text-sm text-[var(--fg-3)]">Coach's Dashboard</p>
        </div>

        {mode === 'reset' ? (
          <form onSubmit={handleReset} className="cn-card p-6">
            <h2 className="mb-2 text-lg font-semibold text-[var(--fg-1)]">Reset Password</h2>
            {resetSent ? (
              <p className="text-sm text-[var(--fg-2)]">
                If an account exists for <span className="font-semibold text-[var(--fg-1)]">{email}</span>, a
                password reset link is on its way. Check your inbox (and spam) and follow the link to set a new password.
              </p>
            ) : (
              <>
                <p className="mb-4 text-sm text-[var(--fg-2)]">
                  Enter your email and we&apos;ll send you a link to set a new password.
                </p>
                {error && (
                  <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
                )}
                <div className="space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">Email</label>
                    <input
                      id="reset-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <button type="submit" disabled={loading} className="cn-btn cn-btn-primary w-full">
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(''); setResetSent(false) }}
              className="mt-4 w-full text-center text-xs text-[var(--fg-3)] hover:text-[var(--fg-1)]"
            >
              ← Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="cn-card p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--fg-1)]">Sign In</h2>

            {error && (
              <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                  placeholder="Your password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="cn-btn cn-btn-primary w-full"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setResetSent(false) }}
                className="w-full text-center text-xs text-[var(--gbm-cobalt-bright)] hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </form>
        )}

        <p className="mt-4 text-center text-xs text-[var(--fg-3)]">
          Contact your coach if you need access
        </p>
      </div>
    </div>
  )
}
