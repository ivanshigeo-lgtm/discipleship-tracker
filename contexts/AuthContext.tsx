'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { User, Session } from '@supabase/supabase-js'
import type { Person } from '../types/database'

type AuthContextType = {
  user: User | null
  session: Session | null
  profile: Person | null
  downline: string[]
  loading: boolean
  canEdit: (personId: string) => boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
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

  const fetchProfile = async (userId: string, retries = 2): Promise<boolean> => {
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
          return fetchProfile(userId, retries - 1)
        }
        return false
      }

      if (personData) {
        console.log('is_admin:', personData.is_admin)
        setProfile(personData as Person)

        try {
          const { data: downlineData } = await supabase
            .rpc('get_downline', { coach_person_id: personData.id })

          if (downlineData) {
            setDownline(downlineData.map((d: { person_id: string }) => d.person_id))
          }
        } catch (downlineErr) {
          console.error('Downline fetch error:', downlineErr)
        }
        return true
      } else {
        console.log('No profile found for user')
        setProfile(null)
        setDownline([])
        return false
      }
    } catch (err) {
      console.error('Profile fetch exception:', err)
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 500))
        return fetchProfile(userId, retries - 1)
      }
      return false
    }
  }

  const refreshProfile = async () => {
    if (user) {
      try {
        await fetchProfile(user.id)
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
        setLoading(false) // Stop blocking immediately once we know auth state

        if (session?.user) {
          // Fetch profile in background - don't block
          fetchProfile(session.user.id)
        }
      } catch (err) {
        console.error('Auth init error:', err)
        setLoading(false)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.email)
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          try {
            await fetchProfile(session.user.id)
          } catch (err) {
            console.error('Profile fetch in auth state change failed:', err)
          }
        } else {
          setProfile(null)
          setDownline([])
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
            await fetchProfile(session.user.id)
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

  const signOut = async () => {
    console.log('Signing out...')
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Sign out error:', error)
    } else {
      console.log('Signed out successfully')
    }
    setUser(null)
    setSession(null)
    setProfile(null)
    setDownline([])
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      downline,
      loading,
      canEdit,
      signIn,
      signUp,
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
