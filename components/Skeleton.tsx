'use client'

// Lightweight loading placeholders so sections show structure immediately
// instead of a blank gap while their data loads.

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-[var(--line-1)] bg-[var(--indigo-2)] p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--indigo-3)]" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 rounded bg-[var(--indigo-3)]" />
              <div className="h-2 w-1/3 rounded bg-[var(--indigo-3)]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--void)] p-4 sm:p-6">
      <div className="mb-6 h-8 w-56 animate-pulse rounded bg-[var(--indigo-3)]" />
      <SectionSkeleton title="Loading…" count={4} />
      <SectionSkeleton title="" count={2} />
    </div>
  )
}

export function SectionSkeleton({ title, count = 4 }: { title: string; count?: number }) {
  return (
    <section className="cn-card mb-6 p-4">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="cn-h3 opacity-60">{title}</h2>
        <div className="h-4 w-8 animate-pulse rounded-full bg-[var(--indigo-3)]" />
      </div>
      <CardSkeleton count={count} />
    </section>
  )
}
