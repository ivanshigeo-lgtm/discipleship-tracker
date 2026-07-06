'use client'

import Link from 'next/link'
import { useAuth } from '../../contexts/AuthContext'
import BookReader from '../../components/BookReader'

// The original (static) Lahaina draft — served from public/book/manuscript.md.
const AUTHOR_PERSON_ID = '2aa35958-9057-44bd-aaf2-bd12a4cf9ecd'

export default function BookPage() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-[var(--void)]" />
  if (!profile || profile.id !== AUTHOR_PERSON_ID) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--void)] p-4">
        <p className="text-[var(--fg-2)]">No book draft on your account yet.</p>
        <Link href="/" className="text-sm text-[var(--fg-3)] underline">← My Journey</Link>
      </div>
    )
  }
  return <BookReader personId={profile.id} />
}
