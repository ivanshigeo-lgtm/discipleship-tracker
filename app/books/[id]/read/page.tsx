'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useAuth } from '../../../../contexts/AuthContext'
import BookReader from '../../../../components/BookReader'

// Read & edit a database-drafted book. Only its author sees it.
export default function BookReadPage() {
  const { profile, loading } = useAuth()
  const params = useParams<{ id: string }>()
  const bookId = params?.id
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!bookId) return
    fetch(`/api/books/manuscript?bookId=${bookId}`)
      .then(r => r.json())
      .then(j => { setOwnerId(j.personId ?? null); setChecked(true) })
      .catch(() => setChecked(true))
  }, [bookId])

  if (loading || !checked) return <div className="min-h-screen bg-[var(--void)]" />
  if (!profile || !bookId || ownerId !== profile.id) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--void)] p-4">
        <p className="text-[var(--fg-2)]">No book draft here for your account.</p>
        <Link href="/books" className="text-sm text-[var(--fg-3)] underline">← Books</Link>
      </div>
    )
  }
  return <BookReader personId={profile.id} bookId={bookId} />
}
