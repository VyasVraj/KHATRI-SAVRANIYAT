/**
 * Unit Tests: ChangeRoleModal (Phase 13 Subtask 3)
 * (src/features/admin/components/ChangeRoleModal.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChangeRoleModal } from '@/features/admin/components/ChangeRoleModal'
import * as authContext from '@/features/auth/context/AuthContext'
import * as useAdminUsersHooks from '@/features/admin/hooks/useAdminUsers'
import type { AdminUserItem } from '@/features/admin/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/admin/hooks/useAdminUsers')

const MOCK_TARGET_USER: AdminUserItem = {
  id: 'target-user-uuid',
  email: 'target@example.com',
  display_name: 'Target User',
  avatar_url: null,
  role: 'MEMBER',
  is_active: true,
  email_verified: true,
  created_at: '2026-10-16T12:00:00Z',
  updated_at: '2026-10-16T12:00:00Z',
}

describe('ChangeRoleModal Component', () => {
  const mockMutateAsync = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: 'admin-caller-uuid' } as never,
      profile: { role: 'ADMIN' } as never,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })

    vi.spyOn(useAdminUsersHooks, 'useAdminUserMutations').mockReturnValue({
      updateRole: {
        mutateAsync: mockMutateAsync,
        isPending: false,
      } as never,
      setStatus: {
        mutateAsync: vi.fn(),
        isPending: false,
      } as never,
    })
  })

  it('renders nothing when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChangeRoleModal, {
        user: MOCK_TARGET_USER,
        isOpen: false,
        onClose: mockOnClose,
      })
    )
    expect(markup).toBe('')
  })

  it('renders target user details and role selector when open', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChangeRoleModal, {
        user: MOCK_TARGET_USER,
        isOpen: true,
        onClose: mockOnClose,
      })
    )

    expect(markup).toContain('Change User Role')
    expect(markup).toContain('Target User')
    expect(markup).toContain('target@example.com')
    expect(markup).toContain('Current Role:')
    expect(markup).toContain('Member')
    expect(markup).toContain('Confirm Role Change')
  })

  it('disables SUPER_ADMIN option when caller is ADMIN (not SUPER_ADMIN)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChangeRoleModal, {
        user: MOCK_TARGET_USER,
        isOpen: true,
        onClose: mockOnClose,
      })
    )

    expect(markup).toContain('(Super Admin Only)')
  })

  it('shows restriction notice when target is SUPER_ADMIN and caller is ADMIN', () => {
    const superAdminTarget: AdminUserItem = {
      ...MOCK_TARGET_USER,
      role: 'SUPER_ADMIN',
    }

    const markup = renderToStaticMarkup(
      React.createElement(ChangeRoleModal, {
        user: superAdminTarget,
        isOpen: true,
        onClose: mockOnClose,
      })
    )

    expect(markup).toContain('Super Admin accounts can only be modified by a Super Admin')
  })
})
