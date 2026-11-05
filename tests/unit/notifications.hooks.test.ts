/**
 * Unit Tests: Notifications Domain React Hooks
 * (src/features/notifications/hooks/*)
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { useUnreadCount } from '@/features/notifications/hooks/useUnreadCount'
import { useNotifications } from '@/features/notifications/hooks/useNotifications'
import { useNotificationMutations } from '@/features/notifications/hooks/useNotificationMutations'
import {
  useNotificationRealtime,
  _resetNotificationRealtimeSubscriptionForTesting,
} from '@/features/notifications/hooks/useNotificationRealtime'
import * as notificationsService from '@/features/notifications/services/notifications.service'
import * as authContext from '@/features/auth/context/AuthContext'
import { supabase } from '@/lib/supabase'

let queryClientInstance: QueryClient

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => queryClientInstance,
  }
})

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/notifications/services/notifications.service')
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

const MOCK_USER_ID = '11111111-1111-4111-8111-111111111111'
const MOCK_NOTIF_ID = '22222222-2222-4222-8222-222222222222'

describe('Notifications Hooks', () => {
  let queryClient: QueryClient

  function captureHook<T>(hookFn: () => T): T {
    let captured!: T
    function TestComponent() {
      captured = hookFn()
      return null
    }
    renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(TestComponent)
      )
    )
    return captured
  }

  beforeEach(() => {
    vi.clearAllMocks()
    _resetNotificationRealtimeSubscriptionForTesting()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClientInstance = queryClient

    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      user: { id: MOCK_USER_ID } as User,
      profile: null,
      session: null,
      isAuthenticated: true,
      isLoading: false,
    })
  })

  describe('useUnreadCount', () => {
    it('initializes query with unread count key and enabled when authenticated', () => {
      vi.spyOn(notificationsService, 'getUnreadNotificationCount').mockResolvedValue(7)

      const result = captureHook(() => useUnreadCount())
      expect(result.isLoading).toBe(true)
    })

    it('disables query when user is not authenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })

      const result = captureHook(() => useUnreadCount())
      expect(result.fetchStatus).toBe('idle')
    })
  })

  describe('useNotifications', () => {
    it('initializes query for notifications list', () => {
      vi.spyOn(notificationsService, 'listMyNotifications').mockResolvedValue([])

      const result = captureHook(() =>
        useNotifications({
          page: 2,
          pageSize: 15,
          category: 'CONNECTION',
          unreadOnly: true,
        })
      )

      expect(result.isLoading).toBe(true)
    })

    it('disables query when unauthenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })

      const result = captureHook(() => useNotifications())
      expect(result.fetchStatus).toBe('idle')
    })
  })

  describe('useNotificationMutations', () => {
    it('executes markRead mutation and invalidates queries', async () => {
      vi.spyOn(notificationsService, 'markNotificationRead').mockResolvedValue(true)
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const mutations = captureHook(() => useNotificationMutations())
      await mutations.markRead.mutateAsync(MOCK_NOTIF_ID)

      expect(notificationsService.markNotificationRead).toHaveBeenCalledWith(MOCK_NOTIF_ID)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    })

    it('executes markAllRead mutation and invalidates queries', async () => {
      vi.spyOn(notificationsService, 'markAllNotificationsRead').mockResolvedValue(5)
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const mutations = captureHook(() => useNotificationMutations())
      await mutations.markAllRead.mutateAsync('INVITATION')

      expect(notificationsService.markAllNotificationsRead).toHaveBeenCalledWith('INVITATION')
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    })

    it('executes dismiss mutation and invalidates queries', async () => {
      vi.spyOn(notificationsService, 'dismissNotification').mockResolvedValue(true)
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const mutations = captureHook(() => useNotificationMutations())
      await mutations.dismiss.mutateAsync(MOCK_NOTIF_ID)

      expect(notificationsService.dismissNotification).toHaveBeenCalledWith(MOCK_NOTIF_ID)
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    })
  })

  describe('useNotificationRealtime', () => {
    it('sets up supabase channel subscription and cleans up on unmount', async () => {
      let postgresChangesCallback: (() => void) | undefined

      const mockChannel = {
        on: vi.fn().mockImplementation((_event, _filter, callback) => {
          postgresChangesCallback = callback
          return mockChannel
        }),
        subscribe: vi.fn().mockReturnThis(),
      }

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as never)

      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)

      function TestSubscriber() {
        useNotificationRealtime()
        return null
      }

      await act(async () => {
        root.render(
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(TestSubscriber)
          )
        )
      })

      expect(supabase.channel).toHaveBeenCalledWith(`notifications:user_${MOCK_USER_ID}`)
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${MOCK_USER_ID}`,
        },
        expect.any(Function)
      )
      expect(mockChannel.subscribe).toHaveBeenCalledTimes(1)

      // When realtime event fires, queries are invalidated
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      await act(async () => {
        postgresChangesCallback?.()
      })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })

      // Cleanup removes channel on unmount
      await act(async () => {
        root.unmount()
      })
      expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel)
      container.remove()
    })

    it('shares a single channel across multiple concurrent mounting subscribers without duplicate subscriptions', async () => {
      let postgresChangesCallback: (() => void) | undefined

      const mockChannel = {
        on: vi.fn().mockImplementation((_event, _filter, callback) => {
          postgresChangesCallback = callback
          return mockChannel
        }),
        subscribe: vi.fn().mockReturnThis(),
      }

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as never)

      const container1 = document.createElement('div')
      const container2 = document.createElement('div')
      document.body.appendChild(container1)
      document.body.appendChild(container2)
      const root1 = createRoot(container1)
      const root2 = createRoot(container2)

      function SubscriberOne() {
        useNotificationRealtime()
        return null
      }

      function SubscriberTwo() {
        useNotificationRealtime()
        return null
      }

      // Mount both subscribers concurrently (e.g. Desktop & Mobile NotificationBell)
      await act(async () => {
        root1.render(
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(SubscriberOne)
          )
        )
        root2.render(
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(SubscriberTwo)
          )
        )
      })

      // Channel should only be created and subscribed ONCE
      expect(supabase.channel).toHaveBeenCalledTimes(1)
      expect(mockChannel.on).toHaveBeenCalledTimes(1)
      expect(mockChannel.subscribe).toHaveBeenCalledTimes(1)

      // Unmounting subscriber 1 should NOT remove the channel because subscriber 2 is still mounted
      await act(async () => {
        root1.unmount()
      })
      expect(supabase.removeChannel).not.toHaveBeenCalled()

      // Realtime event still invalidates queries
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      await act(async () => {
        postgresChangesCallback?.()
      })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['notifications'] })

      // Unmounting subscriber 2 (last subscriber) cleans up channel
      await act(async () => {
        root2.unmount()
      })
      expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel)

      container1.remove()
      container2.remove()
    })

    it('does not create channel when user is unauthenticated', async () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        profile: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      })

      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)

      function TestSubscriber() {
        useNotificationRealtime()
        return null
      }

      await act(async () => {
        root.render(
          React.createElement(
            QueryClientProvider,
            { client: queryClient },
            React.createElement(TestSubscriber)
          )
        )
      })

      expect(supabase.channel).not.toHaveBeenCalled()

      await act(async () => {
        root.unmount()
      })
      container.remove()
    })

    it('handles StrictMode mount -> unmount -> remount without channel churn', async () => {
      const mockChannel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      }

      vi.mocked(supabase.channel).mockReturnValue(mockChannel as never)

      const container = document.createElement('div')
      document.body.appendChild(container)
      const root = createRoot(container)

      function TestSubscriber() {
        useNotificationRealtime()
        return null
      }

      // In React StrictMode, effects mount, run cleanup, and run mount again
      await act(async () => {
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(
              QueryClientProvider,
              { client: queryClient },
              React.createElement(TestSubscriber)
            )
          )
        )
      })

      // Channel should NOT be re-created or re-subscribed during StrictMode remount
      expect(supabase.channel).toHaveBeenCalledTimes(1)
      expect(mockChannel.subscribe).toHaveBeenCalledTimes(1)
      expect(supabase.removeChannel).not.toHaveBeenCalled()

      // Full unmount cleans up channel
      await act(async () => {
        root.unmount()
      })
      expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel)
      container.remove()
    })
  })
})
