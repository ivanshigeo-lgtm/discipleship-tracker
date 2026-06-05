'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'
import type { Person } from '../../types/database'

export default function SetupPage() {
  const router = useRouter()
  const [people, setPeople] = useState<Person[]>([])
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchPeople = async () => {
      console.log('Fetching people for setup...')
      const { data, error } = await supabase
        .from('people')
        .select('*')
        .is('auth_user_id', null)
        .order('name')

      console.log('Setup fetch result:', { data, error })

      if (error) {
        setError('Failed to load profiles: ' + error.message)
      } else if (data) {
        setPeople(data as Person[])
      }
      setLoading(false)
    }

    fetchPeople()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!selectedPersonId) {
      setError('Please select your profile')
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
        .eq('id', selectedPersonId)

      if (updateError) {
        setError('Failed to link profile: ' + updateError.message)
        setSubmitting(false)
        return
      }

      setSuccess(true)
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
          <div className="mb-4 text-4xl text-green-400">✓</div>
          <h2 className="text-lg font-semibold text-[var(--fg-1)]">Account Created!</h2>
          <p className="mt-2 text-sm text-[var(--fg-2)]">
            Check your email to confirm your account, then sign in.
          </p>
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

  if (people.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="cn-card max-w-sm p-6 text-center">
          <p className="text-sm text-[var(--fg-2)]">
            No unclaimed profiles available. All profiles have been claimed.
          </p>
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
          <p className="mt-1 text-sm text-[var(--fg-3)]">Initial Setup</p>
        </div>

        <form onSubmit={handleSubmit} className="cn-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-[var(--fg-1)]">Create Your Account</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="person" className="mb-1 block text-xs font-medium text-[var(--fg-2)]">
                Select Your Profile
              </label>
              <select
                id="person"
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="w-full rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                required
              >
                <option value="">Choose your name...</option>
                {people.map(person => (
                  <option key={person.id} value={person.id}>
                    {person.name} ({person.current_stage})
                  </option>
                ))}
              </select>
            </div>

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
