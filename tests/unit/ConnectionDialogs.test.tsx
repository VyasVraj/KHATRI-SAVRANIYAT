/**
 * Unit Tests: Connection Dialogs & Modals
 * (SendConnectionModal, RemoveConnectionDialog, BlockUserDialog)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { SendConnectionModal } from '@/features/connections/components/SendConnectionModal'
import { RemoveConnectionDialog } from '@/features/connections/components/RemoveConnectionDialog'
import { BlockUserDialog } from '@/features/connections/components/BlockUserDialog'
import * as authContext from '@/features/auth/context/AuthContext'
import type { ConnectionWithProfile } from '@/features/connections/types'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

const MOCK_CONN: ConnectionWithProfile = {
  id: 'conn-1',
  requester_id: USER_A,
  addressee_id: USER_B,
  status: 'ACCEPTED',
  created_at: '2026-10-05T00:00:00Z',
  updated_at: '2026-10-05T00:00:00Z',
  is_requester: true,
  other_user: {
    id: USER_B,
    display_name: 'Pooja Shah',
    avatar_url: null,
  },
}

describe('Connection Dialogs', () => {
  let queryClient: QueryClient

  function renderWithProviders(element: React.ReactElement): string {
    return renderToStaticMarkup(
      React.createElement(QueryClientProvider, { client: queryClient }, element)
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: USER_A } as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
  })

  describe('SendConnectionModal', () => {
    it('returns empty string when isOpen is false', () => {
      const html = renderWithProviders(
        <SendConnectionModal isOpen={false} onClose={vi.fn()} />
      )
      expect(html).toBe('')
    })

    it('renders dialog elements when isOpen is true', () => {
      const html = renderWithProviders(
        <SendConnectionModal isOpen={true} onClose={vi.fn()} />
      )

      expect(html).toContain('Send Connection Request')
      expect(html).toContain('Target User Account ID')
      expect(html).toContain('Send Request')
      expect(html).toContain('Cancel')
    })
  })

  describe('RemoveConnectionDialog', () => {
    it('returns empty string when isOpen is false or connection is null', () => {
      const html = renderWithProviders(
        <RemoveConnectionDialog
          isOpen={false}
          connection={null}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      )
      expect(html).toBe('')
    })

    it('renders confirmation text with user name when open', () => {
      const html = renderWithProviders(
        <RemoveConnectionDialog
          isOpen={true}
          connection={MOCK_CONN}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      )

      expect(html).toContain('Remove Connection')
      expect(html).toContain('Pooja Shah')
      expect(html).toContain('Keep')
      expect(html).toContain('Remove Connection')
    })
  })

  describe('BlockUserDialog', () => {
    it('returns empty string when isOpen is false', () => {
      const html = renderWithProviders(
        <BlockUserDialog
          isOpen={false}
          connection={null}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      )
      expect(html).toBe('')
    })

    it('renders block confirmation and consequences when open', () => {
      const html = renderWithProviders(
        <BlockUserDialog
          isOpen={true}
          connection={MOCK_CONN}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      )

      expect(html).toContain('Block Pooja Shah')
      expect(html).toContain('Block User')
      expect(html).toContain('Cancel')
    })
  })
})
