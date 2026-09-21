'use client'

// Temporary stub while full meetings-only Engagements page is restored.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function EngagementsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/my-journey')
  }, [router])
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--void)]">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#F4B650] border-t-transparent" />
    </div>
  )
}
