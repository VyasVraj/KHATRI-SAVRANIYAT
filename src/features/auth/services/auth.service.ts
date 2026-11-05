/**
 * Auth service — all authentication operations
 *
 * Wraps Supabase Auth with typed ApiResponse returns.
 * All functions return { data, error: null } | { data: null, error: AppError }.
 *
 * SECURITY NOTE:
 * These functions operate on auth.users via Supabase Auth SDK.
 * The public.profiles table is populated automatically by the handle_new_user() trigger.
 * Never replicate RLS checks here — they are enforced at the database level.
 */

import { supabase } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'
import type { ApiResponse } from '@/types'
import type { SignUpInput, SignInInput, ForgotPasswordInput, ResetPasswordInput } from '../schemas/auth.schemas'

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

/**
 * Returns the current active session or null.
 * Used on initial app load to restore authentication state.
 */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ---------------------------------------------------------------------------
// signUp
// ---------------------------------------------------------------------------

/**
 * Register a new user account.
 * Supabase Auth creates the auth.users row; the handle_new_user() DB trigger
 * automatically creates the public.profiles row.
 *
 * After signup, the user receives a confirmation email.
 * They cannot sign in until email is confirmed (unless email confirmation
 * is disabled in the Supabase Auth settings).
 */
export async function signUp(
  input: SignUpInput
): Promise<ApiResponse<{ needsEmailConfirmation: boolean }>> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        display_name: input.displayName,
      },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) {
    return {
      data: null,
      error: { message: mapAuthError(error.message), code: error.code },
    }
  }

  // If session is null but user exists → email confirmation required
  const needsEmailConfirmation = data.user !== null && data.session === null

  return { data: { needsEmailConfirmation }, error: null }
}

// ---------------------------------------------------------------------------
// signIn
// ---------------------------------------------------------------------------

/**
 * Sign in with email + password.
 * Returns the session on success.
 */
export async function signIn(input: SignInInput): Promise<ApiResponse<Session>> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })

  if (error) {
    return {
      data: null,
      error: { message: mapAuthError(error.message), code: error.code },
    }
  }

  return { data: data.session, error: null }
}

// ---------------------------------------------------------------------------
// signOut
// ---------------------------------------------------------------------------

/**
 * Sign out the current user.
 * Clears the session from localStorage and revokes the refresh token.
 */
export async function signOut(): Promise<ApiResponse<void>> {
  const { error } = await supabase.auth.signOut()

  if (error) {
    return {
      data: null,
      error: { message: error.message, code: error.code },
    }
  }

  return { data: undefined, error: null }
}

// ---------------------------------------------------------------------------
// sendPasswordReset
// ---------------------------------------------------------------------------

/**
 * Send a password reset email.
 * User receives a link that redirects to /auth/reset-password with a code.
 */
export async function sendPasswordReset(
  input: ForgotPasswordInput
): Promise<ApiResponse<void>> {
  const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })

  if (error) {
    return {
      data: null,
      error: { message: mapAuthError(error.message), code: error.code },
    }
  }

  return { data: undefined, error: null }
}

// ---------------------------------------------------------------------------
// updatePassword
// ---------------------------------------------------------------------------

/**
 * Update the password for the currently authenticated user.
 * Called on the /auth/reset-password page after the user has been
 * authenticated via the password reset email link.
 */
export async function updatePassword(
  input: ResetPasswordInput
): Promise<ApiResponse<User>> {
  const { data, error } = await supabase.auth.updateUser({
    password: input.password,
  })

  if (error) {
    return {
      data: null,
      error: { message: mapAuthError(error.message), code: error.code },
    }
  }

  return { data: data.user, error: null }
}

// ---------------------------------------------------------------------------
// exchangeCodeForSession (auth callback handler)
// ---------------------------------------------------------------------------

/**
 * Exchange an auth code for a session.
 * Called on /auth/callback after email confirmation or OAuth redirect.
 */
export async function exchangeCodeForSession(
  code: string
): Promise<ApiResponse<Session>> {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return {
      data: null,
      error: { message: error.message, code: error.code },
    }
  }

  return { data: data.session, error: null }
}

// ---------------------------------------------------------------------------
// Error message mapping
// Maps raw Supabase/Auth API error messages to user-friendly text.
// Never expose raw DB/network errors to users.
// ---------------------------------------------------------------------------

function mapAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials') || lower.includes('invalid email or password')) {
    return 'Incorrect email or password. Please try again.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in. Check your inbox.'
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (lower.includes('password should be at least')) {
    return 'Password must be at least 8 characters.'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  if (lower.includes('token has expired') || lower.includes('link has expired')) {
    return 'This link has expired. Please request a new one.'
  }

  // Fallback — do not expose raw error
  return 'Something went wrong. Please try again.'
}
