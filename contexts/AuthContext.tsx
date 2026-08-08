'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { setViewerContext } from '../lib/supabaseQueries'
import type { User, Session } from '@supabase/supabase-js'
import type { Person } from '../types/database'

// Last-known profile (+downline) per auth user, so returning visitors skip the
// profile round-trip and page data queries can start immediately. Refreshed in
// the background on every load; cleared on sign-out.
const profileCacheKey = (userId: string) => `cn-profile-v1-${userId}`

type AuthContextType = {
  user: User | null
  session: Session | null
  profile: Person | null
  downline: string[]
  loading: boolean
  /** true while a signed-in user's profile row is still being fetched —
      pages should show a spinner, not "no profile linked". */
  profileLoading: boolean
  canEdit: (personId: string) => boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  /** Open self-service signup — emails a 6-digit OTP, creating the user if new. */
  startEmailOtp: (email: string) => Promise<{ error: Error | null }>
  /** Verify the emailed OTP; on success a session exists for the (new) user. */
  verifyEmailOtp: (email: string, token: string) => Promise<{ error: Error | null }>
  /** Set a password on the just-created (OTP-authed) account. */
  setPassword: (password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Person | null>(null)
  const [downline, setDownline] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(true)
  // auth user id of the fetch currently in flight — initAuth and the
  // INITIAL_SESSION auth event both fire on load; only one should hit the DB
  const fetchingFor = useRef<string | null>(null)

  // Every profile change also updates the query layer's viewer context, which
  // decides whether is_test (App Review demo) rows are visible.
  const applyProfile = (p: Person | null) => {
    setProfile(p)
    setViewerContext(p?.id ?? null, !!p?.is_test)
  }

  // Hydrate profile+downline instantly from the last visit; the network fetch
  // still runs and overwrites.
  const hydrateProfileFromCache = (userId: string): boolean => {
    try {
      const raw = localStorage.getItem(profileCacheKey(userId))
      if (!raw) return false
      const cached = JSON.parse(raw) as { profile: Person; downline: string[] }
      if (!cached?.profile) return false
      applyProfile(cached.profile)
      setDownline(cached.downline ?? [])
      return true
    } catch {
      return false
    }
  }

  const fetchProfile = async (userId: string, email?: string | null, retries = 2): Promise<boolean> => {
    console.log('Fetching profile for auth user:', userId, `(attempt ${3 - retries}/2)`)

    try {
      const queryPromise = supabase
        .from('people')
        .select('*')
        .eq('auth_user_id', userId)
        .maybeSingle()

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Profile query timeout')), 8000)
      )

      const { data: personData, error } = await Promise.race([queryPromise, timeoutPromise])

      console.log('Profile fetch result:', { personData, error })

      if (error) {
        console.error('Profile fetch error:', error)
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 500))
          return fetchProfile(userId, email, retries - 1)
        }
        return false
      }

      if (personData) {
        console.log('is_admin:', personData.is_admin)
        applyProfile(personData as Person)

        let downlineIds: string[] = []
        try {
          const { data: downlineData } = await supabase
            .rpc('get_downline', { coach_person_id: personData.id })

          if (downlineData) {
            downlineIds = downlineData.map((d: { person_id: string }) => d.person_id)
            setDownline(downlineIds)
          }
        } catch (downlineErr) {
          console.error('Downline fetch error:', downlineErr)
        }
        try {
          localStorage.setItem(profileCacheKey(userId), JSON.stringify({ profile: personData, downline: downlineIds }))
        } catch { /* quota — cache is best-effort */ }
        return true
      } else {
        // No profile linked to this auth id. This happens when a person record
        // is deleted + recreated after the user already signed up (the new
        // record starts unlinked). Safely relink by matching the user's OWN
        // confirmed email to an unlinked person record with the same email — a
        // user can only ever match their own email, so this can't reach anyone
        // else's account.
        if (email) {
          const { data: byEmail } = await supabase
            .from('people')
            .select('*')
            .ilike('email', email)
            .is('auth_user_id', null)
            // When two unclaimed rows share this email (a coach-side reverse-order
            // duplicate), claim the OLDEST — that's the original coach-created row
            // carrying the connection + progress; the newer one is the accidental
            // dup. Deterministic order avoids arbitrarily linking to the stray.
            .order('created_at', { ascending: true })
            .limit(1)
          const match = byEmail?.[0] as Person | undefined
          if (match) {
            await supabase
              .from('people')
              .update({ auth_user_id: userId, updated_at: new Date().toISOString() })
              .eq('id', match.id)
            const linked = { ...match, auth_user_id: userId } as Person
            console.log('Auto-relinked profile by email:', match.id)
            applyProfile(linked)
            let downlineIds: string[] = []
            try {
              const { data: downlineData } = await supabase.rpc('get_downline', { coach_person_id: linked.id })
              if (downlineData) {
                downlineIds = downlineData.map((d: { person_id: string }) => d.person_id)
                setDownline(downlineIds)
              }
            } catch (downlineErr) {
              console.error('Downline fetch error:', downlineErr)
            }
            try {
              localStorage.setItem(profileCacheKey(userId), JSON.stringify({ profile: linked, downline: downlineIds }))
            } catch { /* quota — cache is best-effort */ }
            return true
          }
        }
        console.log('No profile found for user')
        applyProfile(null)
        setDownline([])
        return false
      }
    } catch (err) {
      console.error('Profile fetch exception:', err)
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 500))
        return fetchProfile(userId, email, retries - 1)
      }
      return false
    }
  }

  // Single entry point for profile loading: dedupes the double-fire on page
  // load (initAuth + the INITIAL_SESSION auth event), and tracks
  // profileLoading so pages show a spinner instead of "no profile linked"
  // while the row is on its way.
  const loadProfileFor = async (userId: string, email?: string | null) => {
    if (fetchingFor.current === userId) return
    fetchingFor.current = userId
    setProfileLoading(true)
    try {
      await fetchProfile(userId, email)
    } catch (err) {
      console.error('Profile fetch failed:', err)
    } finally {
      setProfileLoading(false)
      fetchingFor.current = null
    }
  }

  const refreshProfile = async () => {
    if (user) {
      try {
        await fetchProfile(user.id, user.email)
      } catch (err) {
        console.error('Refresh profile error:', err)
      }
    }
  }

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        console.log('Got session:', session?.user?.email)

        setSession(session)
        setUser(session?.user ?? null)

        if (session?.user) {
          // Last visit's profile paints the page NOW; the fetch refreshes it.
          hydrateProfileFromCache(session.user.id)
          setLoading(false) // Stop blocking immediately once we know auth state
          loadProfileFor(session.user.id, session.user.email)
        } else {
          setLoading(false)
          setProfileLoading(false)
        }
      } catch (err) {
        console.error('Auth init error:', err)
        setLoading(false)
        setProfileLoading(false)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth state change:', event, session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          // Defer the profile query OUT of this callback. supabase-js invokes
          // onAuthStateChange while holding its navigator LockManager lock;
          // running a supabase query here (which itself needs the lock for token
          // handling) deadlocks the client — getSession() and the query hang
          // until the 8s "Profile query timeout" fires, ×3, leaving a returning
          // user on a blank/spinner page for ~24s. setTimeout(…,0) lets the
          // callback return and release the lock before the query runs.
          const u = session.user
          setTimeout(() => { loadProfileFor(u.id, u.email) }, 0)
        } else {
          applyProfile(null)
          setDownline([])
          setProfileLoading(false)
        }
        setLoading(false)
      }
    )

    // Handle returning from external sites (like OAuth)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('Page visible - checking session')
        try {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user && !profile) {
            console.log('Session exists but no profile - fetching...')
            await fetchProfile(session.user.id, session.user.email)
          }
        } catch (err) {
          console.error('Visibility check error:', err)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const canEdit = (personId: string): boolean => {
    if (!profile) return false
    if (profile.is_admin) return true
    if (profile.id === personId) return true
    return downline.includes(personId)
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error }
  }

  // Open self-service signup: email a 6-digit OTP (creating the auth user on
  // first send), then verify it to establish a session, then let them set a
  // password so they can sign in normally afterward.
  const startEmailOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    })
    return { error }
  }

  const verifyEmailOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    })
    return { error }
  }

  const setPassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    return { error }
  }

  // Sends a Supabase password-reset email; the link lands on /reset-password.
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    return { error }
  }

  const signOut = async () => {
    // Clear local state immediately so the UI reacts instantly...
    setUser(null)
    setSession(null)
    applyProfile(null)
    setDownline([])
    // Let one-per-sign-in nudges (e.g. the empowered coachmark) fire again next
    // time they sign in.
    try {
      Object.keys(sessionStorage)
        .filter(k => k.startsWith('empowered-coachmark'))
        .forEach(k => sessionStorage.removeItem(k))
    } catch { /* sessionStorage may be unavailable */ }
    // Drop the instant-paint caches so the next sign-in (possibly a different
    // person on this device) never flashes someone else's journey.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('cn-profile-') || k.startsWith('journey-snapshot-') || k.startsWith('journey-soaps-'))
        .forEach(k => localStorage.removeItem(k))
    } catch { /* localStorage may be unavailable */ }
    // ...and sign out with LOCAL scope: drops the session from this browser
    // without the slow server round-trip that 'global' makes to revoke every
    // session. The session is gone here, which is what logging out means.
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      downline,
      loading,
      profileLoading,
      canEdit,
      signIn,
      signUp,
      resetPassword,
      startEmailOtp,
      verifyEmailOtp,
      setPassword,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
