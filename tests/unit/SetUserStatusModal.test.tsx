/**
 * Unit Tests: SetUserStatusModal (Phase 13 Subtask 3)
 * (src/features/admin/components/SetUserStatusModal.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SetUserStatusModal } from '@/features/admin/components/SetUserStatusModal'
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

describe('SetUserStatusModal Component', () => {
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
        mutateAsync: vi.fn(),
        isPending: false,
      } as never,
      setStatus: {
        mutateAsync: mockMutateAsync,
        isPending: false,
      } as never,
    })
  })

  it('renders nothing when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SetUserStatusModal, {
        user: MOCK_TARGET_USER,
        targetStatus: false,
        isOpen: false,
        onClose: mockOnClose,
      })
    )
    expect(markup).toBe('')
  })

  it('renders deactivation confirmation with mandatory reason field', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SetUserStatusModal, {
        user: MOCK_TARGET_USER,
        targetStatus: false,
        isOpen: true,
        onClose: mockOnClose,
      })
    )

    expect(markup).toContain('Deactivate User Account')
    expect(markup).toContain('Reason for Deactivation')
    expect(markup).toContain('Reason will be logged in the immutable security audit trail')
    expect(markup).toContain('Deactivate Account')
  })

  it('renders activation confirmation without mandatory reason', () => {
    const inactiveUser: AdminUserItem = {
      ...MOCK_TARGET_USER,
      is_active: false,
    }

    const markup = renderToStaticMarkup(
      React.createElement(SetUserStatusModal, {
        user: inactiveUser,
        targetStatus: true,
        isOpen: true,
        onClose: mockOnClose,
      })
    )

    expect(markup).toContain('Activate User Account')
    expect(markup).toContain('Optional Note / Reason')
    expect(markup).toContain('Activate Account')
  })

  it('blocks self-deactivation with clear message', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MOCK_TARGET_USER.id } as never,
      profile: { role: 'ADMIN' } as never,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })

    const markup = renderToStaticMarkup(
      React.createElement(SetUserStatusModal, {
        user: MOCK_TARGET_USER,
        targetStatus: false,
        isOpen: true,
        onClose: mockOnClose,
      })
    )

    expect(markup).toContain('Administrators cannot deactivate their own account')
  })

  it('blocks ADMIN from deactivating SUPER_ADMIN with warning', () => {
    const superAdminTarget: AdminUserItem = {
      ...MOCK_TARGET_USER,
      role: 'SUPER_ADMIN',
    }

    const markup = renderToStaticMarkup(
      React.createElement(SetUserStatusModal, {
        user: superAdminTarget,
        targetStatus: false,
        isOpen: true,
        onClose: mockOnClose,
      })
    )

    expect(markup).toContain('Super Admin accounts can only be modified or deactivated by another Super Admin')
  })
})
