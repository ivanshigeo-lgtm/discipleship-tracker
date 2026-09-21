'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// TEMPORARY: full My Journey page was corrupted by a bad MCP upload.
// Redirect home while we restore the real page.tsx from tip+permission patch.
export default function MyJourneyPageTemp() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/')
  }, [router])
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--void)] text-[var(--fg-2)]">
      Restoring My Journey…
    </div>
  )
}
