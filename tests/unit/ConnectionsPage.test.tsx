/**
 * Unit Tests: ConnectionsPage component
 * (src/features/connections/pages/ConnectionsPage.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { ConnectionsPage } from '@/features/connections/pages/ConnectionsPage'
import * as authContext from '@/features/auth/context/AuthContext'
import * as connectionsService from '@/features/connections/services/connections.service'
import type { ConnectionWithProfile } from '@/features/connections/types'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/connections/services/connections.service')

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

const MOCK_ACCEPTED: ConnectionWithProfile = {
  id: 'conn-1',
  requester_id: USER_A,
  addressee_id: USER_B,
  status: 'ACCEPTED',
  created_at: '2026-10-05T00:00:00Z',
  updated_at: '2026-10-05T00:00:00Z',
  is_requester: true,
  other_user: {
    id: USER_B,
    display_name: 'Sunita Roy',
    avatar_url: null,
  },
}

describe('ConnectionsPage', () => {
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

    vi.spyOn(connectionsService, 'listConnections').mockImplementation(async (_caller, filter) => {
      if (filter === 'ACCEPTED') return { data: [MOCK_ACCEPTED], error: null }
      if (filter === 'BLOCKED') return { data: [], error: null }
      if (filter === 'PENDING_RECEIVED') return { data: [], error: null }
      if (filter === 'PENDING_SENT') return { data: [], error: null }
      return { data: [], error: null }
    })
  })

  it('renders page header with title, subtitle, and Connect button', () => {
    const html = renderWithProviders(<ConnectionsPage />)

    expect(html).toContain('My Connections')
    expect(html).toContain('Manage your community social network')
    expect(html).toContain('Connect')
  })

  it('renders tabs for Connected, Requests, and Blocked', () => {
    const html = renderWithProviders(<ConnectionsPage />)

    expect(html).toContain('Connected')
    expect(html).toContain('Requests')
    expect(html).toContain('Blocked')
  })

  it('renders accessible tablist and tabpanel elements', () => {
    const html = renderWithProviders(<ConnectionsPage />)

    expect(html).toContain('role="tablist"')
    expect(html).toContain('role="tab"')
    expect(html).toContain('role="tabpanel"')
  })
})
