'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import LoginPage from '../../components/LoginPage'
import JourneyTabs, { type JourneyTab } from '../../components/journey/JourneyTabs'
import { Starfield } from '../../components/journey/StarPrimitives'

/** Minimal My Journey shell so mobile Engagements bottom-nav can be verified.
 *  Full page restore: see agent-tools/restore_journey_mcp.json (~51KB). */
export default function MyJourneyPage() {
  const { user, profile, loading, profileLoading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<JourneyTab>('home')

  if (loading || (user && !profile && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--void)]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#F4B650] border-t-transparent" />
      </div>
    )
  }
  if (!user) return <LoginPage />
  if (!profile) return null

  return (
    <div className="relative min-h-screen bg-[var(--void)]">
      <div className="pointer-events-none fixed inset-0">
        <Starfield count={40} seed={3} />
      </div>
      <JourneyTabs
        active={tab}
        onChange={t => { setTab(t); window.scrollTo({ top: 0, behavior: 'auto' }) }}
        onMessage={() => {}}
        onEngagements={() => router.push('/my-journey/engagements')}
      />
      <div className="md:pl-52">
        <main className="relative z-10 mx-auto max-w-5xl px-4 pb-28 pt-6 md:pb-16">
          <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
            My Journey
          </h1>
          <p className="mt-2 text-sm text-[var(--fg-3)]">
            Full Journey UI restoring. Use bottom / side nav — Engagements is meetings-only.
          </p>
          <p className="mt-4 text-sm text-[var(--fg-2)]">Active tab: <strong>{tab}</strong></p>
        </main>
      </div>
    </div>
  )
}
