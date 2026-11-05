/**
 * Unit Tests: AdminRoute Guard (Phase 13 Subtask 1)
 * (src/components/common/AdminRoute.tsx)
 *
 * Verifies strict administrator route access:
 * - Allows SUPER_ADMIN and ADMIN
 * - Blocks unauthenticated users (redirects to /sign-in)
 * - Blocks COMMUNITY_MODERATOR (renders Access Restricted view)
 * - Blocks MEMBER, GUEST, FAMILY_HEAD, COMMITTEE_MEMBER
 * - Renders LoadingScreen while auth state is resolving
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Navigate, Outlet } from 'react-router-dom'
import { AdminRoute } from '@/components/common/AdminRoute'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import * as AuthContextModule from '@/features/auth/context/AuthContext'
import * as ReactRouter from 'react-router-dom'
import { ROUTES } from '@/constants/app'
import type { ProfileRow } from '@/types'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuthContext: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useLocation: vi.fn(),
  }
})

describe('AdminRoute Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ReactRouter.useLocation).mockReturnValue({
      pathname: '/admin/users',
      search: '',
      hash: '',
      state: null,
      key: 'test-admin-key',
    })
  })

  it('renders LoadingScreen while authentication is loading', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,
    })

    const result = AdminRoute()
    expect(result.type).toBe(LoadingScreen)
    expect(result.props.message).toBe('Checking administrator authorization…')
  })

  it('redirects to sign-in when user is unauthenticated', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
      isAuthenticated: false,
    })

    const result = AdminRoute()
    expect(result.type).toBe(Navigate)
    expect(result.props.to).toBe(ROUTES.SIGN_IN)
    expect(result.props.state).toEqual({ from: '/admin/users' })
    expect(result.props.replace).toBe(true)
  })

  it('renders Access Restricted view when user has MEMBER role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'user-member-1' } as User,
      profile: { id: 'user-member-1', role: 'MEMBER' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).not.toBe(Outlet)
    expect(result.type).not.toBe(Navigate)
    expect(result.props['data-testid']).toBe('admin-unauthorized')
  })

  it('renders Access Restricted view when user has COMMUNITY_MODERATOR role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'user-mod-1' } as User,
      profile: { id: 'user-mod-1', role: 'COMMUNITY_MODERATOR' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).not.toBe(Outlet)
    expect(result.type).not.toBe(Navigate)
    expect(result.props['data-testid']).toBe('admin-unauthorized')
  })

  it('renders Access Restricted view when user has GUEST role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'user-guest-1' } as User,
      profile: { id: 'user-guest-1', role: 'GUEST' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).not.toBe(Outlet)
    expect(result.type).not.toBe(Navigate)
    expect(result.props['data-testid']).toBe('admin-unauthorized')
  })

  it('renders Access Restricted view when user has FAMILY_HEAD role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'user-head-1' } as User,
      profile: { id: 'user-head-1', role: 'FAMILY_HEAD' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).not.toBe(Outlet)
    expect(result.props['data-testid']).toBe('admin-unauthorized')
  })

  it('renders Access Restricted view when user has COMMITTEE_MEMBER role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'user-comm-1' } as User,
      profile: { id: 'user-comm-1', role: 'COMMITTEE_MEMBER' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).not.toBe(Outlet)
    expect(result.props['data-testid']).toBe('admin-unauthorized')
  })

  it('renders Access Restricted view when profile role is missing or undefined', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'user-norole-1' } as User,
      profile: { id: 'user-norole-1' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).not.toBe(Outlet)
    expect(result.props['data-testid']).toBe('admin-unauthorized')
  })

  it('renders Outlet when authenticated user has ADMIN role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'admin-user-1' } as User,
      profile: { id: 'admin-user-1', role: 'ADMIN' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).toBe(Outlet)
  })

  it('renders Outlet when authenticated user has SUPER_ADMIN role on /admin/duplicates', () => {
    vi.mocked(ReactRouter.useLocation).mockReturnValue({
      pathname: '/admin/duplicates',
      search: '',
      hash: '',
      state: null,
      key: 'test-dup-key',
    })

    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'super-admin-user-1' } as User,
      profile: { id: 'super-admin-user-1', role: 'SUPER_ADMIN' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).toBe(Outlet)
  })

  it('denies COMMUNITY_MODERATOR when accessing /admin/duplicates', () => {
    vi.mocked(ReactRouter.useLocation).mockReturnValue({
      pathname: '/admin/duplicates',
      search: '',
      hash: '',
      state: null,
      key: 'test-dup-key-mod',
    })

    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'mod-user-1' } as User,
      profile: { id: 'mod-user-1', role: 'COMMUNITY_MODERATOR' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = AdminRoute()
    expect(result.type).not.toBe(Outlet)
    expect(result.props['data-testid']).toBe('admin-unauthorized')
  })
})
