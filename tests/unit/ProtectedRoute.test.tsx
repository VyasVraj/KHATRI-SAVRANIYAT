/**
 * Unit tests for ProtectedRoute and GuestOnlyRoute
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Navigate, Outlet } from 'react-router-dom'
import { ProtectedRoute, GuestOnlyRoute } from '@/components/common/ProtectedRoute'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import * as AuthContextModule from '@/features/auth/context/AuthContext'
import * as ReactRouter from 'react-router-dom'
import { ROUTES } from '@/constants/app'

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

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ReactRouter.useLocation).mockReturnValue({
      pathname: '/protected',
      search: '',
      hash: '',
      state: null,
      key: 'default',
    })
  })

  it('renders LoadingScreen when auth is loading', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,
    })

    const result = ProtectedRoute()
    expect(result.type).toBe(LoadingScreen)
    expect(result.props.message).toBe('Checking authentication…')
  })

  it('redirects to sign-in when unauthenticated', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
      isAuthenticated: false,
    })

    const result = ProtectedRoute()
    expect(result.type).toBe(Navigate)
    expect(result.props.to).toBe(ROUTES.SIGN_IN)
    expect(result.props.state).toEqual({ from: '/protected' })
    expect(result.props.replace).toBe(true)
  })

  it('renders Outlet when authenticated', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: { access_token: 'token' } as never,
      user: { id: 'u1' } as never,
      profile: null,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = ProtectedRoute()
    expect(result.type).toBe(Outlet)
  })
})

describe('GuestOnlyRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders LoadingScreen when auth is loading', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,
    })

    const result = GuestOnlyRoute()
    expect(result.type).toBe(LoadingScreen)
  })

  it('redirects to home when already authenticated', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: { access_token: 'token' } as never,
      user: { id: 'u1' } as never,
      profile: null,
      isLoading: false,
      isAuthenticated: true,
    })

    const result = GuestOnlyRoute()
    expect(result.type).toBe(Navigate)
    expect(result.props.to).toBe(ROUTES.HOME)
    expect(result.props.replace).toBe(true)
  })

  it('renders Outlet when guest (unauthenticated)', () => {
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: null,
      profile: null,
      isLoading: false,
      isAuthenticated: false,
    })

    const result = GuestOnlyRoute()
    expect(result.type).toBe(Outlet)
  })
})
