'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import type { Person } from '../../../types/database'

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const personId = params.personId as string

  const [person, setPerson] = useState<Person | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchPerson = async () => {
      const { data } = await supabase
        .from('people')
        .select('*')
        .eq('id', personId)
        .maybeSingle()

      if (data) {
        if (data.auth_user_id) {
          setError('This profile has already been claimed. Please sign in instead.')
        } else {
          setPerson(data as Person)
          if (data.email) {
            setEmail(data.email)
          }
        }
      } else {
        setError('Profile not found.')
      }
      setLoading(false)
    }

    fetchPerson()
  }, [personId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setSubmitting(true)

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signUpError) {
      setError(signUpError.message)
      setSubmitting(false)
      return
    }

    if (authData.user) {
      const { error: updateError } = await supabase
        .from('people')
        .update({
          auth_user_id: authData.user.id,
          email: email
        })
        .eq('id', personId)

      if (updateError) {
        setError('Failed to link profile. Please contact your coach.')
        setSubmitting(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push('/')
      }, 2000)
    }

    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--fg-2)]">Loading...</p>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="cn-card max-w-sm p-6 text-center">
          <div className="mb-4 text-4xl">✓</div>
          <h2 className="text-lg font-semibold text-[var(--fg-1)]">Account Created!</h2>
          <p className="mt-2 text-sm text-[var(--fg-2)]">
            Check your email to confirm your account, then you can sign in.
          </p>
          <p className="mt-2 text-xs text-[var(--fg-3)]">Redirecting...</p>
        </div>
      </div>
    )
  }

  if (error && !person) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="cn-card max-w-sm p-6 text-center">
          <div className="mb-4 text-4xl text-red-400">!</div>
          <p className="text-sm text-[var(--fg-2)]">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="cn-btn cn-btn-primary mt-4"
          >
            Go to Sign In
          </button>
        </div>
      </div>
    )
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
        </div>

        <form onSubmit={handleSubmit} className="cn-card p-6">
          <h2 className="mb-2 text-lg font-semibold text-[var(--fg-1)]">
            Welcome, {person?.name}!
          </h2>
          <p className="mb-4 text-sm text-[var(--fg-2)]">
            Set up your account to access your coaching dashboard.
          </p>

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
                placeholder="At least 6 characters"
                required
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                placeholder="Confirm password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="cn-btn cn-btn-primary w-full"
            >
              {submitting ? 'Creating account...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
