/**
 * useFamilyRealtime — Supabase Realtime channel subscription for family roster and tree synchronization.
 *
 * Requirements:
 * - Scoped strictly to `family_id = eq.${familyId}` on public.family_members and public.relationships.
 * - Reference-counted per familyId to prevent duplicate subscriptions and manage React 18 StrictMode cleanly.
 * - Automatically invalidates ['family-members', 'list', familyId], ['family-tree'], and ['relationships']
 *   queries when an update occurs from another tab, session, or device.
 * - Cleans up channel subscription on unmount.
 */

import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/features/auth/context/AuthContext'

interface ActiveFamilySubscription {
  familyId: string
  channel: ReturnType<typeof supabase.channel>
  subscribersCount: number
  queryClients: Map<QueryClient, number>
}

// Module-level registry of active family subscriptions keyed by familyId
const activeSubscriptions = new Map<string, ActiveFamilySubscription>()

/**
 * Hook to subscribe to real-time changes for a specific family.
 *
 * @param familyId - Target family UUID
 */
export function useFamilyRealtime(familyId: string | undefined) {
  const queryClient = useQueryClient()
  const { isAuthenticated } = useAuthContext()

  useEffect(() => {
    if (!isAuthenticated || !familyId) {
      return
    }

    let sub = activeSubscriptions.get(familyId)

    if (!sub) {
      const queryClients = new Map<QueryClient, number>([[queryClient, 1]])
      const channelName = `family_sync:${familyId}`

      const invalidateAll = () => {
        const current = activeSubscriptions.get(familyId)
        if (current) {
          for (const [qc] of current.queryClients) {
            void qc.invalidateQueries({ queryKey: ['family-members', 'list', familyId] })
            void qc.invalidateQueries({ queryKey: ['family-members'] })
            void qc.invalidateQueries({ queryKey: ['family-tree'] })
            void qc.invalidateQueries({ queryKey: ['relationships'] })
            void qc.invalidateQueries({ queryKey: ['families', familyId] })
          }
        }
      }

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'family_members',
            filter: `family_id=eq.${familyId}`,
          },
          () => {
            invalidateAll()
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'relationships',
          },
          () => {
            invalidateAll()
          }
        )
        .subscribe()

      sub = {
        familyId,
        channel,
        subscribersCount: 1,
        queryClients,
      }
      activeSubscriptions.set(familyId, sub)
    } else {
      sub.subscribersCount += 1
      const count = sub.queryClients.get(queryClient) ?? 0
      sub.queryClients.set(queryClient, count + 1)
    }

    return () => {
      const current = activeSubscriptions.get(familyId)
      if (!current) return

      current.subscribersCount -= 1
      const count = current.queryClients.get(queryClient) ?? 1
      if (count <= 1) {
        current.queryClients.delete(queryClient)
      } else {
        current.queryClients.set(queryClient, count - 1)
      }

      if (current.subscribersCount <= 0) {
        // Deferred teardown to absorb React 18 StrictMode immediate remounts
        queueMicrotask(() => {
          const checkSub = activeSubscriptions.get(familyId)
          if (checkSub && checkSub.subscribersCount <= 0) {
            void supabase.removeChannel(checkSub.channel)
            activeSubscriptions.delete(familyId)
          }
        })
      }
    }
  }, [familyId, isAuthenticated, queryClient])
}
