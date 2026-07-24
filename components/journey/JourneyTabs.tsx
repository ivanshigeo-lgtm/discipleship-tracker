'use client'

import type { ReactNode } from 'react'

/*
 * JourneyTabs — the five first-class destinations, matching the native app
 * (Journey · SOAPs · Prayer · Feed · Milestones). Not a phone bottom-bar port:
 * on desktop it's a persistent left rail so content breathes wide; on phones it
 * collapses to the familiar bottom tab bar. One component, one source of truth.
 */
export type JourneyTab = 'home' | 'soaps' | 'prayer' | 'feed' | 'milestones'

type TabDef = { key: JourneyTab; label: string; icon: ReactNode }

const I = (d: string, extra?: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
    {extra}
  </svg>
)

const TABS: TabDef[] = [
  { key: 'home',       label: 'Journey',    icon: I('M3 10.5 12 3l9 7.5', <path d="M5 9.5V21h14V9.5" />) },
  { key: 'soaps',      label: 'SOAPs',      icon: I('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', <path d="M19 19H6a2 2 0 0 0-2 2" />) },
  { key: 'prayer',     label: 'Prayer',     icon: I('M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-6.6 1-1a5.5 5.5 0 0 0 0-7.8z') },
  { key: 'feed',       label: 'Feed',       icon: I('M12 3l1.9 4.8L19 9.5l-4.2 3.3L16 18l-4-2.8L8 18l1.2-5.2L5 9.5l5.1-1.7z') },
  { key: 'milestones', label: 'Milestones', icon: I('M12 2 21 7v10l-9 5-9-5V7z', <path d="M12 7v10M8 9v6M16 9v6" />) },
]

function TabButton({
  tab, active, onClick, orientation,
}: { tab: TabDef; active: boolean; onClick: () => void; orientation: 'row' | 'col' }) {
  const col = orientation === 'col'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center transition-colors ${
        col
          ? 'w-full gap-3 rounded-xl px-3 py-2.5 text-[15px]'
          : 'flex-1 flex-col gap-1 py-2 text-[10px]'
      }`}
      style={{
        color: active ? 'var(--fg-1)' : 'var(--fg-3)',
        background: active && col ? 'rgba(91,141,247,.12)' : 'transparent',
      }}
    >
      <span
        className="grid place-items-center transition-transform"
        style={{
          color: active ? 'var(--gbm-cobalt-bright)' : 'var(--fg-3)',
          filter: active ? 'drop-shadow(0 0 8px rgba(91,141,247,.5))' : 'none',
        }}
      >
        {tab.icon}
      </span>
      <span className={`${col ? 'font-medium' : 'font-semibold uppercase tracking-wide'}`}>{tab.label}</span>
    </button>
  )
}

export default function JourneyTabs({
  active, onChange,
}: { active: JourneyTab; onChange: (t: JourneyTab) => void }) {
  return (
    <>
      {/* Desktop: persistent left rail */}
      <aside className="fixed left-0 top-0 z-30 hidden h-full w-52 flex-col border-r border-[var(--line-2)] px-3 pt-6 md:flex"
             style={{ background: 'rgba(9,12,26,.72)', backdropFilter: 'blur(16px)' }}>
        <div className="mb-6 px-3">
          <p className="text-xs font-semibold uppercase tracking-[.14em] text-[var(--fg-3)]">Constellation</p>
          <p className="mt-0.5 text-lg" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>My Journey</p>
        </div>
        <nav className="flex flex-col gap-1">
          {TABS.map(t => (
            <TabButton key={t.key} tab={t} active={active === t.key} onClick={() => onChange(t.key)} orientation="col" />
          ))}
        </nav>
        <div className="mt-auto pb-6 pl-3 text-base" style={{ color: 'rgba(91,141,247,.25)' }}>✦</div>
      </aside>

      {/* Phone: bottom tab bar (native feel) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-[var(--line-2)] px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
           style={{ background: 'rgba(9,12,26,.9)', backdropFilter: 'blur(16px)' }}>
        {TABS.map(t => (
          <TabButton key={t.key} tab={t} active={active === t.key} onClick={() => onChange(t.key)} orientation="row" />
        ))}
      </nav>
    </>
  )
}
