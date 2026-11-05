/**
 * useNotificationPreferences — Hook for managing user notification channel & category settings
 *
 * Phase 12 — Subtask 4: Notification Preferences UI & Email Dispatch Infrastructure
 *
 * Invariants:
 * - Scoped strictly to authenticated caller via auth.uid().
 * - Mutations route through authoritative SECURITY DEFINER RPC update_my_notification_preferences.
 * - In-app notifications are mandatory and cannot be suppressed.
 * - Account security alerts are mandatory and cannot be disabled.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
} from '../services/notifications.service'
import type { NotificationPreferences, UpdatePreferencesInput } from '../types'

export function useNotificationPreferences() {
  const queryClient = useQueryClient()
  const { user, isAuthenticated } = useAuthContext()
  const userId = user?.id ?? ''

  const preferencesQuery = useQuery<NotificationPreferences, Error>({
    queryKey: ['notifications', 'preferences', userId],
    queryFn: async () => {
      return await getMyNotificationPreferences()
    },
    enabled: isAuthenticated && Boolean(userId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const updateMutation = useMutation<NotificationPreferences, Error, UpdatePreferencesInput>({
    mutationFn: async (input: UpdatePreferencesInput) => {
      return await updateMyNotificationPreferences(input)
    },
    onSuccess: (updatedData) => {
      queryClient.setQueryData(['notifications', 'preferences', userId], updatedData)
      queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences', userId] })
    },
  })

  return {
    preferences: preferencesQuery.data,
    isLoading: preferencesQuery.isLoading,
    isError: preferencesQuery.isError,
    error: preferencesQuery.error,
    refetch: preferencesQuery.refetch,
    updatePreferences: updateMutation,
    isUpdating: updateMutation.isPending,
  }
}
