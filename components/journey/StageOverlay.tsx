'use client'

import { useEffect, useRef, useState } from 'react'

/*
 * StageOverlay — pops a stage's steps in a panel OVER the star, always fully
 * on-screen. Replaces the old in-flow dock below the star, which could render
 * off the bottom of the viewport on shorter screens (some users never saw it).
 *
 * Dismiss: the ✕ in the panel header (rendered by the child StageDock), a tap on
 * the backdrop, or a downward swipe on the grabber handle (mobile bottom-sheet
 * gesture). The panel is vertically centered and scrolls internally for long
 * stages.
 */
export default function StageOverlay({
  onClose,
  color,
  children,
}: {
  onClose: () => void
  color?: string
  children: React.ReactNode
}) {
  const [dragY, setDragY] = useState(0)
  const dragging = useRef(false)
  const startY = useRef(0)

  // Lock the page behind the overlay so a swipe/scroll doesn't move it too.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Esc closes, matching the ✕.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const onGrabDown = (e: React.PointerEvent) => {
    dragging.current = true
    startY.current = e.clientY
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onGrabMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setDragY(Math.max(0, e.clientY - startY.current)) // downward only
  }
  const onGrabUp = () => {
    if (!dragging.current) return
    dragging.current = false
    if (dragY > 90) onClose()
    else setDragY(0)
  }

  // Backdrop fades as the sheet is dragged away, for tactile feedback.
  const backdropOpacity = Math.max(0.25, 0.55 - dragY / 600)

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `rgba(4,6,18,${backdropOpacity})`, backdropFilter: 'blur(3px)' }}
        onPointerDown={onClose}
      />

      {/* the sheet */}
      <div
        role="dialog"
        aria-modal="true"
        className="jy-quad-pop pointer-events-auto relative z-[1] flex max-h-[88vh] w-[min(380px,94vw)] flex-col"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragging.current ? 'none' : 'transform .22s cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {/* grabber — drag down to dismiss */}
        <div
          className="flex cursor-grab touch-none items-center justify-center py-2 active:cursor-grabbing"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
          aria-label="Drag down to close"
        >
          <span className="h-1.5 w-10 rounded-full" style={{ background: color ? `${color}88` : 'var(--line-3)' }} />
        </div>

        {/* scrollable content — StageDock (+ its ✕) and any siblings */}
        <div className="overflow-y-auto overflow-x-hidden overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  )
}
