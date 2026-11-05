/**
 * Unit tests for Auth Service (src/features/auth/services/auth.service.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getSession,
  signUp,
  signIn,
  signOut,
  sendPasswordReset,
  updatePassword,
  exchangeCodeForSession,
} from '@/features/auth/services/auth.service'
import { AuthError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      exchangeCodeForSession: vi.fn(),
    },
  },
}))

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSession', () => {
    it('returns the session when one exists', async () => {
      const mockSession = { user: { id: 'user-123' }, access_token: 'token' }
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: mockSession as never },
        error: null,
      })

      const session = await getSession()
      expect(session).toEqual(mockSession)
    })

    it('returns null when no session exists', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
        error: null,
      })

      const session = await getSession()
      expect(session).toBeNull()
    })
  })

  describe('signUp', () => {
    it('returns needsEmailConfirmation = true when user created without immediate session', async () => {
      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        data: {
          user: { id: 'new-user' } as never,
          session: null,
        },
        error: null,
      })

      const response = await signUp({
        displayName: 'Alice Smith',
        email: 'alice@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
      })

      expect(response.error).toBeNull()
      expect(response.data?.needsEmailConfirmation).toBe(true)
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'alice@example.com',
        password: 'Password123',
        options: {
          data: { display_name: 'Alice Smith' },
          emailRedirectTo: expect.stringContaining('/auth/callback'),
        },
      })
    })

    it('returns needsEmailConfirmation = false when session is returned immediately', async () => {
      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        data: {
          user: { id: 'new-user' } as never,
          session: { access_token: 'token' } as never,
        },
        error: null,
      })

      const response = await signUp({
        displayName: 'Bob Jones',
        email: 'bob@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
      })

      expect(response.error).toBeNull()
      expect(response.data?.needsEmailConfirmation).toBe(false)
    })

    it('returns mapped error on signup failure', async () => {
      vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: new AuthError('User already registered', 400, 'user_already_exists'),
      })

      const response = await signUp({
        displayName: 'Existing User',
        email: 'existing@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
      })

      expect(response.data).toBeNull()
      expect(response.error?.message).toContain('already exists')
      expect(response.error?.code).toBe('user_already_exists')
    })
  })

  describe('signIn', () => {
    it('returns session on successful sign in', async () => {
      const mockSession = { user: { id: 'user-456' }, access_token: 'token-456' }
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: mockSession.user as never, session: mockSession as never },
        error: null,
      })

      const response = await signIn({
        email: 'user@example.com',
        password: 'Password123',
      })

      expect(response.error).toBeNull()
      expect(response.data).toEqual(mockSession)
    })

    it('maps invalid login credentials error to user-friendly message', async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
        data: { user: null, session: null },
        error: new AuthError('Invalid login credentials', 400, 'invalid_credentials'),
      })

      const response = await signIn({
        email: 'wrong@example.com',
        password: 'wrongpassword',
      })

      expect(response.data).toBeNull()
      expect(response.error?.message).toBe('Incorrect email or password. Please try again.')
    })
  })

  describe('signOut', () => {
    it('signs out successfully', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
        error: null,
      })

      const response = await signOut()
      expect(response.error).toBeNull()
      expect(supabase.auth.signOut).toHaveBeenCalled()
    })

    it('returns error if signOut fails', async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
        error: new AuthError('Network error', 500),
      })

      const response = await signOut()
      expect(response.error?.message).toBe('Network error')
    })
  })

  describe('sendPasswordReset', () => {
    it('calls resetPasswordForEmail with correct redirect', async () => {
      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
        data: {},
        error: null,
      })

      const response = await sendPasswordReset({ email: 'reset@example.com' })
      expect(response.error).toBeNull()
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'reset@example.com',
        expect.objectContaining({
          redirectTo: expect.stringContaining('/auth/reset-password'),
        })
      )
    })

    it('maps error if password reset fails', async () => {
      vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValueOnce({
        data: null,
        error: new AuthError('Too many requests', 429),
      })

      const response = await sendPasswordReset({ email: 'reset@example.com' })
      expect(response.error?.message).toContain('Too many attempts')
    })
  })

  describe('updatePassword', () => {
    it('updates password and returns user', async () => {
      const mockUser = { id: 'user-789' }
      vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
        data: { user: mockUser as never },
        error: null,
      })

      const response = await updatePassword({
        password: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      })

      expect(response.error).toBeNull()
      expect(response.data).toEqual(mockUser)
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: 'NewPassword123',
      })
    })

    it('returns mapped error on failure', async () => {
      vi.mocked(supabase.auth.updateUser).mockResolvedValueOnce({
        data: { user: null },
        error: new AuthError('Token has expired', 401),
      })

      const response = await updatePassword({
        password: 'NewPassword123',
        confirmPassword: 'NewPassword123',
      })

      expect(response.data).toBeNull()
      expect(response.error?.message).toContain('link has expired')
    })
  })

  describe('exchangeCodeForSession', () => {
    it('exchanges code for session', async () => {
      const mockSession = { access_token: 'auth-code-token' }
      vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValueOnce({
        data: { session: mockSession as never, user: {} as never },
        error: null,
      })

      const response = await exchangeCodeForSession('test-code-123')
      expect(response.error).toBeNull()
      expect(response.data).toEqual(mockSession)
      expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('test-code-123')
    })

    it('handles code exchange error', async () => {
      vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValueOnce({
        data: { session: null, user: null },
        error: new AuthError('Invalid code', 400, 'bad_code'),
      })

      const response = await exchangeCodeForSession('invalid-code')
      expect(response.data).toBeNull()
      expect(response.error?.message).toBe('Invalid code')
    })
  })
})
