/**
 * Unit Tests: ModeratorRoute Guard (Phase 8 Subtask 3)
 * (src/components/common/ModeratorRoute.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Navigate, Outlet } from 'react-router-dom'
import { ModeratorRoute } from '@/components/common/ModeratorRoute'
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

describe('ModeratorRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ReactRouter.useLocation).mockReturnValue({
      pathname: '/admin/claims',
      search: '',
      hash: '',
      state: null,
      key: 'default',
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

    const result = ModeratorRoute()
    expect(result.type).toBe(LoadingScreen)
    expect(result.props.message).toBe('Checking moderator authorization…')
  })

  it('redirects to sign-in when user is unauthenticated', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
      isAuthenticated: false,
    })

    const result = ModeratorRoute()
    expect(result.type).toBe(Navigate)
    expect(result.props.to).toBe(ROUTES.SIGN_IN)
    expect(result.props.state).toEqual({ from: '/admin/claims' })
    expect(result.props.replace).toBe(true)
  })

  it('renders Access Denied view when authenticated user has MEMBER role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'user-1' } as User,
      profile: { id: 'user-1', role: 'MEMBER' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = ModeratorRoute()
    expect(result.type).not.toBe(Outlet)
    expect(result.type).not.toBe(Navigate)
    expect(result.props.className).toContain('text-center')
  })

  it('renders Outlet when user has COMMUNITY_MODERATOR role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'mod-1' } as User,
      profile: { id: 'mod-1', role: 'COMMUNITY_MODERATOR' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = ModeratorRoute()
    expect(result.type).toBe(Outlet)
  })

  it('renders Outlet when user has ADMIN role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'admin-1' } as User,
      profile: { id: 'admin-1', role: 'ADMIN' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = ModeratorRoute()
    expect(result.type).toBe(Outlet)
  })

  it('renders Outlet when user has SUPER_ADMIN role', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'super-1' } as User,
      profile: { id: 'super-1', role: 'SUPER_ADMIN' } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = ModeratorRoute()
    expect(result.type).toBe(Outlet)
  })
})
