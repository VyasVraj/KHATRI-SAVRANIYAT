/**
 * Unit Tests: Notifications Domain UI Components & Pages
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { NotificationCategoryIcon } from '@/features/notifications/components/NotificationCategoryIcon'
import { NotificationItemRow } from '@/features/notifications/components/NotificationItemRow'
import { NotificationBell } from '@/features/notifications/components/NotificationBell'
import { NotificationPopover } from '@/features/notifications/components/NotificationPopover'
import { NotificationFilters } from '@/features/notifications/components/NotificationFilters'
import { NotificationsPage } from '@/features/notifications/pages/NotificationsPage'
import * as authContext from '@/features/auth/context/AuthContext'
import * as useUnreadCountHook from '@/features/notifications/hooks/useUnreadCount'
import * as useNotificationsHook from '@/features/notifications/hooks/useNotifications'
import * as useNotificationMutationsHook from '@/features/notifications/hooks/useNotificationMutations'
import type { NotificationItem, NotificationCategory } from '@/features/notifications/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/notifications/hooks/useUnreadCount')
vi.mock('@/features/notifications/hooks/useNotifications')
vi.mock('@/features/notifications/hooks/useNotificationMutations')
vi.mock('@/features/notifications/hooks/useNotificationRealtime', () => ({
  useNotificationRealtime: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) =>
      React.createElement('a', { href: to, ...props }, children),
  }
})

const MOCK_USER_ID = '11111111-1111-4111-8111-111111111111'
const MOCK_NOTIF_1: NotificationItem = {
  id: 'notif-1',
  recipient_id: MOCK_USER_ID,
  actor_id: null,
  category: 'CONNECTION',
  type: 'connection_request',
  title: 'Connection Request Received',
  body: 'Aarav Sharma requested to connect with you.',
  action_url: '/connections',
  entity_type: 'connections',
  entity_id: 'conn-1',
  metadata: {},
  read_at: null,
  created_at: new Date().toISOString(),
  deleted_at: null,
}

const MOCK_NOTIF_READ: NotificationItem = {
  id: 'notif-2',
  recipient_id: MOCK_USER_ID,
  actor_id: null,
  category: 'EVENT',
  type: 'event_cancelled',
  title: 'Annual Meetup Cancelled',
  body: 'The annual community meetup has been cancelled.',
  action_url: '/community',
  entity_type: 'events',
  entity_id: 'event-1',
  metadata: {},
  read_at: '2026-10-16T12:00:00Z',
  created_at: '2026-10-16T11:00:00Z',
  deleted_at: null,
}

describe('Notifications UI Components', () => {
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
      user: { id: MOCK_USER_ID } as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })

    vi.spyOn(useNotificationMutationsHook, 'useNotificationMutations').mockReturnValue({
      markRead: { mutate: vi.fn(), isPending: false } as never,
      markAllRead: { mutate: vi.fn(), isPending: false } as never,
      dismiss: { mutate: vi.fn(), isPending: false } as never,
      userId: MOCK_USER_ID,
    })

    vi.spyOn(useUnreadCountHook, 'useUnreadCount').mockReturnValue({
      data: 0,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useUnreadCountHook.useUnreadCount>)

    vi.spyOn(useNotificationsHook, 'useNotifications').mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useNotificationsHook.useNotifications>)
  })

  describe('NotificationCategoryIcon', () => {
    const categories: NotificationCategory[] = [
      'CONNECTION',
      'INVITATION',
      'CLAIM',
      'VERIFICATION',
      'COMMUNITY',
      'EVENT',
      'FAMILY',
      'SECURITY',
    ]

    it.each(categories)('renders visual icon container for category %s', (category) => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationCategoryIcon, { category })
      )
      expect(html).toContain('rounded-full')
      expect(html).toContain('aria-hidden="true"')
    })
  })

  describe('NotificationItemRow', () => {
    it('renders unread notification with title, body, and unread indicator', () => {
      const html = renderWithProviders(
        React.createElement(NotificationItemRow, {
          notification: MOCK_NOTIF_1,
          onMarkRead: vi.fn(),
          onDismiss: vi.fn(),
        })
      )

      expect(html).toContain('Connection Request Received')
      expect(html).toContain('Aarav Sharma requested to connect with you.')
      expect(html).toContain('Unread: Connection Request Received')
      expect(html).toContain('Mark notification as read')
      expect(html).toContain('Dismiss notification')
    })

    it('renders read notification without unread dot or mark-as-read button', () => {
      const html = renderWithProviders(
        React.createElement(NotificationItemRow, {
          notification: MOCK_NOTIF_READ,
          onMarkRead: vi.fn(),
          onDismiss: vi.fn(),
        })
      )

      expect(html).toContain('Annual Meetup Cancelled')
      expect(html).not.toContain('Mark notification as read')
      expect(html).toContain('Dismiss notification')
    })

    it('renders compact mode with line-clamp for popovers', () => {
      const html = renderWithProviders(
        React.createElement(NotificationItemRow, {
          notification: MOCK_NOTIF_1,
          compact: true,
          onMarkRead: vi.fn(),
          onDismiss: vi.fn(),
        })
      )

      expect(html).toContain('line-clamp-2')
      expect(html).not.toContain('View details &rarr;')
    })
  })

  describe('NotificationBell', () => {
    it('renders bell with exact count when unreadCount between 1 and 99', () => {
      vi.spyOn(useUnreadCountHook, 'useUnreadCount').mockReturnValue({
        data: 5,
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useUnreadCountHook.useUnreadCount>)

      const html = renderWithProviders(React.createElement(NotificationBell))
      expect(html).toContain('5 unread notifications')
      expect(html).toContain('5</span>')
    })

    it('renders 99+ badge when unreadCount is 100 or greater', () => {
      vi.spyOn(useUnreadCountHook, 'useUnreadCount').mockReturnValue({
        data: 142,
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useUnreadCountHook.useUnreadCount>)

      const html = renderWithProviders(React.createElement(NotificationBell))
      expect(html).toContain('142 unread notifications')
      expect(html).toContain('99+</span>')
    })

    it('hides unread count badge when unreadCount is 0', () => {
      vi.spyOn(useUnreadCountHook, 'useUnreadCount').mockReturnValue({
        data: 0,
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useUnreadCountHook.useUnreadCount>)

      const html = renderWithProviders(React.createElement(NotificationBell))
      expect(html).toContain('aria-label="Notifications"')
      expect(html).not.toContain('bg-red-600')
    })
  })

  describe('NotificationPopover', () => {
    it('returns null when isOpen is false', () => {
      const html = renderWithProviders(
        React.createElement(NotificationPopover, {
          isOpen: false,
          onClose: vi.fn(),
          unreadCount: 3,
        })
      )
      expect(html).toBe('')
    })

    it('renders recent notifications and header when isOpen is true', () => {
      vi.spyOn(useNotificationsHook, 'useNotifications').mockReturnValue({
        data: [MOCK_NOTIF_1],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useNotificationsHook.useNotifications>)

      const html = renderWithProviders(
        React.createElement(NotificationPopover, {
          isOpen: true,
          onClose: vi.fn(),
          unreadCount: 1,
        })
      )

      expect(html).toContain('Notifications')
      expect(html).toContain('1 new')
      expect(html).toContain('Mark all read')
      expect(html).toContain('Connection Request Received')
      expect(html).toContain('View all notifications')
    })

    it('renders empty state when there are no notifications', () => {
      vi.spyOn(useNotificationsHook, 'useNotifications').mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
      } as unknown as ReturnType<typeof useNotificationsHook.useNotifications>)

      const html = renderWithProviders(
        React.createElement(NotificationPopover, {
          isOpen: true,
          onClose: vi.fn(),
          unreadCount: 0,
        })
      )

      expect(html).toContain('All caught up!')
      expect(html).toContain('No notifications right now.')
      expect(html).not.toContain('Mark all read')
    })
  })

  describe('NotificationFilters', () => {
    it('renders category filter buttons and unread toggle', () => {
      const onSelect = vi.fn()
      const onToggle = vi.fn()

      const html = renderToStaticMarkup(
        React.createElement(NotificationFilters, {
          selectedCategory: 'ALL',
          onSelectCategory: onSelect,
          unreadOnly: false,
          onToggleUnreadOnly: onToggle,
        })
      )

      expect(html).toContain('All')
      expect(html).toContain('Connections')
      expect(html).toContain('Invitations')
      expect(html).toContain('Claims')
      expect(html).toContain('Verifications')
      expect(html).toContain('Community')
      expect(html).toContain('Events')
      expect(html).toContain('Family')
      expect(html).toContain('Security')
      expect(html).toContain('Unread only')
    })
  })

  describe('NotificationsPage', () => {
    it('renders Notification Center with items and unread count header', () => {
      vi.spyOn(useUnreadCountHook, 'useUnreadCount').mockReturnValue({
        data: 1,
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useUnreadCountHook.useUnreadCount>)

      vi.spyOn(useNotificationsHook, 'useNotifications').mockReturnValue({
        data: [MOCK_NOTIF_1],
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useNotificationsHook.useNotifications>)

      const html = renderWithProviders(React.createElement(NotificationsPage))

      expect(html).toContain('Notification Center')
      expect(html).toContain('1 unread')
      expect(html).toContain('Mark all as read')
      expect(html).toContain('Connection Request Received')
      expect(html).toContain('Connections')
    })

    it('renders empty state when notifications query returns empty array', () => {
      vi.spyOn(useUnreadCountHook, 'useUnreadCount').mockReturnValue({
        data: 0,
        isLoading: false,
        isError: false,
      } as ReturnType<typeof useUnreadCountHook.useUnreadCount>)

      vi.spyOn(useNotificationsHook, 'useNotifications').mockReturnValue({
        data: [],
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof useNotificationsHook.useNotifications>)

      const html = renderWithProviders(React.createElement(NotificationsPage))

      expect(html).toContain('No notifications found')
    })
  })
})
