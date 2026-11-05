/**
 * useUnreadCount — Hook to retrieve active unread notification count
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 *
 * Invariants:
 * - Scoped strictly to authenticated user via RPC get_unread_notification_count.
 * - Respects PERSON != USER.
 */

import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { getUnreadNotificationCount } from '../services/notifications.service'

export function useUnreadCount() {
  const { user, isAuthenticated } = useAuthContext()
  const userId = user?.id ?? ''

  return useQuery<number, Error>({
    queryKey: ['notifications', 'unread-count', userId],
    queryFn: async () => {
      return await getUnreadNotificationCount()
    },
    enabled: isAuthenticated && Boolean(userId),
    staleTime: 1000 * 30, // 30 seconds
  })
}
