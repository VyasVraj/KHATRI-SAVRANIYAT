/**
 * Unit Tests: Notification Preferences UI & Hooks
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import * as authContext from '@/features/auth/context/AuthContext'
import * as usePreferencesHook from '@/features/notifications/hooks/useNotificationPreferences'
import { NotificationPreferencesPage } from '@/features/notifications/pages/NotificationPreferencesPage'
import type { NotificationPreferences } from '@/features/notifications/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/notifications/hooks/useNotificationPreferences')

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) =>
      React.createElement('a', { href: to, ...props }, children),
  }
})

const MOCK_USER_ID = 'user-pref-1234'
const MOCK_PREFS: NotificationPreferences = {
  user_id: MOCK_USER_ID,
  in_app_enabled: true,
  email_enabled: true,
  email_connections: true,
  email_invitations: true,
  email_claims: true,
  email_verifications: true,
  email_announcements: true,
  email_events: false,
  email_family_media: true,
  created_at: '2026-10-16T10:00:00Z',
  updated_at: '2026-10-16T10:00:00Z',
}

describe('NotificationPreferencesPage UI', () => {
  let queryClient: QueryClient

  function renderWithProviders(element: React.ReactElement): string {
    return renderToStaticMarkup(
      React.createElement(QueryClientProvider, { client: queryClient }, element)
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MOCK_USER_ID, email: 'user@example.com' } as unknown as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
  })

  it('renders loading skeleton when query is loading', () => {
    vi.spyOn(usePreferencesHook, 'useNotificationPreferences').mockReturnValue({
      preferences: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      updatePreferences: { mutateAsync: vi.fn(), isPending: false } as never,
      isUpdating: false,
    })

    const html = renderWithProviders(React.createElement(NotificationPreferencesPage))
    expect(html).toContain('animate-spin')
    expect(html).toContain('Loading preferences...')
  })

  it('renders error state with retry button when query fails', () => {
    vi.spyOn(usePreferencesHook, 'useNotificationPreferences').mockReturnValue({
      preferences: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed to load preferences from database'),
      refetch: vi.fn(),
      updatePreferences: { mutateAsync: vi.fn(), isPending: false } as never,
      isUpdating: false,
    })

    const html = renderWithProviders(React.createElement(NotificationPreferencesPage))
    expect(html).toContain('Failed to load preferences')
    expect(html).toContain('Failed to load preferences from database')
    expect(html).toContain('Try Again')
  })

  it('renders loaded preferences with in-app banner, email toggle, and categories', () => {
    vi.spyOn(usePreferencesHook, 'useNotificationPreferences').mockReturnValue({
      preferences: MOCK_PREFS,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      updatePreferences: { mutateAsync: vi.fn(), isPending: false } as never,
      isUpdating: false,
    })

    const html = renderWithProviders(React.createElement(NotificationPreferencesPage))

    // Header & summary
    expect(html).toContain('Notification Preferences')
    expect(html).toContain('Configure how you receive activity updates')

    // In-app info banner
    expect(html).toContain('In-App Notification Center')
    expect(html).toContain('Always Active')

    // Master email toggle
    expect(html).toContain('Email Notifications')
    expect(html).toContain('Send important alerts and digests to your registered email address')

    // Category options
    expect(html).toContain('Connection Requests &amp; Acceptances')
    expect(html).toContain('Family Member Invitations')
    expect(html).toContain('Person Claims &amp; Outcomes')
    expect(html).toContain('Verification Reviews')
    expect(html).toContain('Community Announcements &amp; Group Roles')
    expect(html).toContain('Community Events &amp; RSVPs')
    expect(html).not.toContain('Family Photos')

    // Mandatory Security note
    expect(html).toContain('Account Security &amp; Critical Notices')
    expect(html).toContain('Mandatory')
  })

  it('disables category options when master email toggle is off', () => {
    vi.spyOn(usePreferencesHook, 'useNotificationPreferences').mockReturnValue({
      preferences: {
        ...MOCK_PREFS,
        email_enabled: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      updatePreferences: { mutateAsync: vi.fn(), isPending: false } as never,
      isUpdating: false,
    })

    const html = renderWithProviders(React.createElement(NotificationPreferencesPage))
    // Category inputs should have disabled attribute and opacity class
    expect(html).toContain('opacity-40')
    expect(html).toContain('disabled=""')
  })
})
