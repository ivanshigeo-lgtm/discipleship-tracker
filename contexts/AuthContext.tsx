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

  const fetchProfile = async (userId: string) => {
    console.log('Fetching profile for auth user:', userId)
    const { data: personData, error } = await supabase
      .from('people')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle()

    console.log('Profile fetch result:', { personData, error })

    if (personData) {
      console.log('is_admin:', personData.is_admin)
      setProfile(personData as Person)

      const { data: downlineData } = await supabase
        .rpc('get_downline', { coach_person_id: personData.id })

      if (downlineData) {
        setDownline(downlineData.map((d: { person_id: string }) => d.person_id))
      }
    } else {
      setProfile(null)
      setDownline([])
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
          setDownline([])
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
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
