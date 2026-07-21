'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '../../../../contexts/AuthContext'
import JourneyIntro from '../../../../components/journey/JourneyIntro'
import JourneyTour from '../../../../components/journey/JourneyTour'
import StoryMusic from '../../../../components/journey/StoryMusic'

const postToApp = (payload: Record<string, unknown>) => {
  const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView
  rn?.postMessage(JSON.stringify(payload))
}

/*
 * The cinematic story (intro film + journey tour) for the WikiChurch app.
 * Rendered inside a WebView after /embed/boot signs the session in. The app
 * passes the star's real ring progress so the tour ends on the disciple's own
 * star: ?progress=0.4,0,0,0&color=%2336D6C3. Completion (or skip) posts
 * {type:'story_done'} back to the app, which owns the seen-flag.
 */
export default function EmbedStory() {
  const { user, profile, loading, profileLoading } = useAuth()
  const [act, setAct] = useState<'intro' | 'tour'>('intro')
  const [params, setParams] = useState<{ progress: number[]; color: string } | null>(null)
  const [ending, setEnding] = useState(false)

  // Graceful outro: instead of cutting straight to the home page, fade the
  // scene to dark and let the music ramp out (StoryMusic fades when active
  // flips false), THEN hand back to the app. Matches the ~1.6s fade below.
  const handleStoryDone = () => {
    setEnding(true)
    setTimeout(() => postToApp({ type: 'story_done' }), 1700)
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const progress = (q.get('progress') ?? '0,0,0,0')
      .split(',')
      .map(n => Math.max(0, Math.min(1, Number(n) || 0)))
      .slice(0, 4)
    while (progress.length < 4) progress.push(0)
    setParams({ progress, color: q.get('color') || '#FBF6EC' })
  }, [])

  if (loading || profileLoading || !params) {
    return <div className="min-h-screen" style={{ background: 'var(--void, #060814)' }} />
  }
  if (!user || !profile) {
    postToApp({ type: 'boot_error', message: 'No session in story embed' })
    return <div className="min-h-screen" style={{ background: 'var(--void, #060814)' }} />
  }

  return (
    <div
      className="min-h-screen transition-opacity duration-[1600ms] ease-out"
      style={{ background: 'var(--void, #060814)', opacity: ending ? 0 : 1 }}
    >
      <StoryMusic active={!ending} />
      {act === 'intro' && (
        <JourneyIntro personId={profile.id} name={profile.name} onDone={() => setAct('tour')} />
      )}
      {act === 'tour' && (
        <JourneyTour
          realProgress={params.progress}
          realColor={params.color}
          onDone={handleStoryDone}
        />
      )}
    </div>
  )
}
