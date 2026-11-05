/**
 * AuthContext — Context definition and consumer hooks
 *
 * Contains the AuthContext instance, AuthContextValue interface,
 * and consumer hooks (useAuthContext, useSession, etc.).
 *
 * Separated from AuthProvider to comply with React Fast Refresh conventions.
 */

import { createContext, useContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { ProfileRow } from '@/types'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  /** The current Supabase session, or null if not authenticated */
  session: Session | null
  /** The current authenticated user (derived from session) */
  user: User | null
  /** The user's profile from public.profiles, or null */
  profile: ProfileRow | null
  /** TRUE while the initial session is being resolved */
  isLoading: boolean
  /** Convenience: whether a session currently exists */
  isAuthenticated: boolean
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthContextValue | null>(null)
AuthContext.displayName = 'AuthContext'

// ---------------------------------------------------------------------------
// Hook: useAuthContext
// ---------------------------------------------------------------------------

/**
 * Access the full auth context.
 * Must be used inside <AuthProvider />.
 */
export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext must be used inside <AuthProvider>')
  }
  return context
}

// ---------------------------------------------------------------------------
// Convenience hooks
// ---------------------------------------------------------------------------

/** Returns the current session or null */
export function useSession() {
  return useAuthContext().session
}

/** Returns the current user or null */
export function useCurrentUser() {
  return useAuthContext().user
}

/** Returns the current profile or null */
export function useCurrentProfile() {
  return useAuthContext().profile
}

/** Returns true while the initial auth state is resolving */
export function useAuthIsLoading() {
  return useAuthContext().isLoading
}

/** Returns true if the user is authenticated */
export function useIsAuthenticated() {
  return useAuthContext().isAuthenticated
}
