'use client'

import type { ReactNode } from 'react'

type NavItem = {
  key: string
  label: string
  icon: ReactNode
}

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: <HomeIcon /> },
  { key: 'meetings', label: 'Meetings', icon: <CalendarIcon /> },
  { key: 'add', label: 'Add', icon: <PlusIcon /> },
  { key: 'pipeline', label: 'Pipeline', icon: <UsersIcon /> },
]

interface MobileNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

export default function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--line-1)] bg-[var(--indigo)] px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map(item => {
          const isActive = activeTab === item.key
          const isAdd = item.key === 'add'

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onTabChange(item.key)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 transition-colors ${
                isAdd
                  ? 'relative -mt-4'
                  : isActive
                  ? 'text-[var(--gbm-cobalt-bright)]'
                  : 'text-[var(--fg-3)] hover:text-[var(--fg-2)]'
              }`}
            >
              {isAdd ? (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--gbm-cobalt-bright)] text-white shadow-lg">
                  {item.icon}
                </div>
              ) : (
                <>
                  {item.icon}
                  <span className="text-[10px] font-medium">{item.label}</span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
