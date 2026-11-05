/**
 * useNotificationRealtime — Supabase Realtime channel subscription
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 * Phase 13 — Subtask 2: Realtime channel lifecycle hardening & ref-counted multi-subscriber management
 *
 * Invariants:
 * - Listens for postgres_changes on public.notifications scoped to recipient_id = current_user.id.
 * - Reference-counted across all mounting components (e.g. desktop/mobile NotificationBell, NotificationsPage).
 * - Avoids Supabase Realtime "cannot add 'postgres_changes' callbacks after 'subscribe()'" error by reusing single active channel.
 * - Handles React 18 StrictMode mount -> cleanup -> remount cycles cleanly via deferred microtask teardown.
 * - Automatically invalidates ['notifications'] queries without client polling loops.
 * - Safely removes channel subscription when all subscribers unmount or on session termination.
 */

import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/features/auth/context/AuthContext'

interface ActiveNotificationSubscription {
  userId: string
  channel: ReturnType<typeof supabase.channel>
  subscribersCount: number
  queryClients: Map<QueryClient, number>
}

// Module-level ref-counted registry of active notification subscriptions keyed by userId
const activeSubscriptions = new Map<string, ActiveNotificationSubscription>()

export function useNotificationRealtime() {
  const queryClient = useQueryClient()
  const { user, isAuthenticated } = useAuthContext()
  const userId = user?.id

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      return
    }

    let sub = activeSubscriptions.get(userId)

    if (!sub) {
      const queryClients = new Map<QueryClient, number>([[queryClient, 1]])
      const channelName = `notifications:user_${userId}`

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${userId}`,
          },
          () => {
            const current = activeSubscriptions.get(userId)
            if (current) {
              for (const [qc] of current.queryClients) {
                qc.invalidateQueries({ queryKey: ['notifications'] })
              }
            }
          }
        )
        .subscribe()

      sub = {
        userId,
        channel,
        subscribersCount: 1,
        queryClients,
      }
      activeSubscriptions.set(userId, sub)
    } else {
      sub.subscribersCount += 1
      sub.queryClients.set(queryClient, (sub.queryClients.get(queryClient) ?? 0) + 1)
    }

    return () => {
      const current = activeSubscriptions.get(userId)
      if (!current) return

      current.subscribersCount -= 1
      const count = (current.queryClients.get(queryClient) ?? 1) - 1
      if (count <= 0) {
        current.queryClients.delete(queryClient)
      } else {
        current.queryClients.set(queryClient, count)
      }

      if (current.subscribersCount <= 0) {
        queueMicrotask(() => {
          const pending = activeSubscriptions.get(userId)
          if (pending && pending.subscribersCount <= 0) {
            activeSubscriptions.delete(userId)
            try {
              void supabase.removeChannel(pending.channel)
            } catch {
              // Ignore synchronous removal errors
            }
          }
        })
      }
    }
  }, [isAuthenticated, userId, queryClient])
}

/**
 * Testing helper: resets the internal subscription registry and removes any active channels.
 */
export function _resetNotificationRealtimeSubscriptionForTesting() {
  for (const [, sub] of activeSubscriptions) {
    try {
      void supabase.removeChannel(sub.channel)
    } catch {
      // Ignore
    }
  }
  activeSubscriptions.clear()
}
