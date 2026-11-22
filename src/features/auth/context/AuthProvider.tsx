/**
 * AuthProvider — provides session and profile state to the entire application
 *
 * Wraps Supabase Auth's onAuthStateChange listener in a React context.
 * All components that need auth state should use useAuthContext() or
 * the convenience hooks from AuthContext.ts.
 */

import {
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { ProfileRow } from '@/types'
import { AuthContext, type AuthContextValue } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch the user's profile from public.profiles
  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      // Profile may not yet exist if trigger hasn't fired; fail silently
      setProfile(null)
      return
    }

    setProfile(data)
  }

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id)
    }
  }, [session?.user?.id])

  useEffect(() => {
    // 1. Resolve the initial session on app load
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession)
      if (initialSession?.user.id) {
        fetchProfile(initialSession.user.id).finally(() => setIsLoading(false))
      } else {
        setIsLoading(false)
      }
    })

    // 2. Subscribe to future auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)

      if (nextSession?.user.id) {
        fetchProfile(nextSession.user.id)
      } else {
        setProfile(null)
      }

      // Stop loading on first state change if still loading
      setIsLoading(false)
    })

    // 3. Listen to global avatar updates to immediately refresh current user profile
    const handleAvatarUpdated = () => {
      if (session?.user?.id) {
        void fetchProfile(session.user.id)
      }
    }

    window.addEventListener('community-roots:avatar-updated', handleAvatarUpdated)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('community-roots:avatar-updated', handleAvatarUpdated)
    }
  }, [session?.user?.id])

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    isLoading,
    isAuthenticated: session !== null,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
