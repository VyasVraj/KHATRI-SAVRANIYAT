/**
 * Unit Tests: UserManagementPage (Phase 13 Subtask 3)
 * (src/features/admin/pages/UserManagementPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { UserManagementPage } from '@/features/admin/pages/UserManagementPage'
import * as authContext from '@/features/auth/context/AuthContext'
import * as useAdminUsersHooks from '@/features/admin/hooks/useAdminUsers'
import type { AdminUserItem } from '@/features/admin/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/admin/hooks/useAdminUsers')

const MOCK_USERS: AdminUserItem[] = [
  {
    id: 'user-1',
    email: 'admin@example.com',
    display_name: 'Admin User',
    avatar_url: null,
    role: 'ADMIN',
    is_active: true,
    email_verified: true,
    created_at: '2026-10-16T10:00:00Z',
    updated_at: '2026-10-16T10:00:00Z',
  },
  {
    id: 'user-2',
    email: 'member@example.com',
    display_name: 'Regular Member',
    avatar_url: null,
    role: 'MEMBER',
    is_active: false,
    email_verified: true,
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
  },
]

describe('UserManagementPage Component', () => {
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: 'admin-id' } as never,
      profile: { role: 'SUPER_ADMIN' } as never,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })

    vi.spyOn(useAdminUsersHooks, 'useAdminUserMutations').mockReturnValue({
      updateRole: { mutateAsync: vi.fn(), isPending: false } as never,
      setStatus: { mutateAsync: vi.fn(), isPending: false } as never,
    })
  })

  function renderPage(): string {
    return renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(UserManagementPage)
      )
    )
  }

  it('renders loading state when users query is loading', () => {
    vi.spyOn(useAdminUsersHooks, 'useAdminUsers').mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: true,
    } as never)

    const markup = renderPage()
    expect(markup).toContain('Loading platform users...')
  })

  it('renders error state with retry button when query fails', () => {
    vi.spyOn(useAdminUsersHooks, 'useAdminUsers').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Permission denied'),
      refetch: mockRefetch,
      isFetching: false,
    } as never)

    const markup = renderPage()
    expect(markup).toContain('Failed to load platform users')
    expect(markup).toContain('Permission denied')
    expect(markup).toContain('Retry')
  })

  it('renders empty state when no users are found', () => {
    vi.spyOn(useAdminUsersHooks, 'useAdminUsers').mockReturnValue({
      data: { users: [], totalCount: 0, page: 1, pageSize: 15, totalPages: 1 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    } as never)

    const markup = renderPage()
    expect(markup).toContain('No users found')
  })

  it('renders user list, PERSON != USER banner, and action buttons on success', () => {
    vi.spyOn(useAdminUsersHooks, 'useAdminUsers').mockReturnValue({
      data: { users: MOCK_USERS, totalCount: 2, page: 1, pageSize: 15, totalPages: 1 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
      isFetching: false,
    } as never)

    const markup = renderPage()

    // Title & Invariant
    expect(markup).toContain('User Administration')
    expect(markup).toContain('PERSON ≠ USER:')

    // Users
    expect(markup).toContain('admin@example.com')
    expect(markup).toContain('Admin User')
    expect(markup).toContain('member@example.com')
    expect(markup).toContain('Regular Member')

    // Statuses & Actions
    expect(markup).toContain('Active')
    expect(markup).toContain('Inactive')
    expect(markup).toContain('Deactivate')
    expect(markup).toContain('Activate')

    // Pagination
    expect(markup).toContain('Showing')
    expect(markup).toContain('2')
    expect(markup).toContain('platform users')
  })
})
