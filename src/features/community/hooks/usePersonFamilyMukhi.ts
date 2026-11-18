/**
 * Hook: usePersonFamilyMukhi
 * TanStack Query hook to retrieve a person's authoritative family-assigned Mukhi.
 *
 * Business Rule: "One family = One selected Mukhi = All members of that family."
 *
 * Resolves person's effective Mukhi strictly through:
 * Person -> Family Membership (left_at IS NULL) -> Family (selected_mukhi_id) -> Community Mukhi (is_active = true).
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getEffectivePersonMukhi,
  type EffectivePersonMukhiResult,
} from '../services/community-mukhis.service'

export function usePersonFamilyMukhi(personId: string | undefined) {
  let hasClient = false
  try {
    if (useQueryClient()) {
      hasClient = true
    }
  } catch {
    hasClient = false
  }

  if (!hasClient) {
    return {
      data: {
        mukhi: null,
        family: null,
        status: 'NO_FAMILY' as const,
        displayText: 'Mukhi Not Assigned',
      },
      isLoading: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useQuery<EffectivePersonMukhiResult>>
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery<EffectivePersonMukhiResult>({
    queryKey: ['person-family-mukhi', personId] as const,
    queryFn: async () => {
      if (!personId) {
        return {
          mukhi: null,
          family: null,
          status: 'NO_FAMILY',
          displayText: 'Mukhi Not Assigned',
        }
      }
      const res = await getEffectivePersonMukhi(personId)
      if (res.error && !res.data) {
        throw new Error(res.error.message)
      }
      return (
        res.data ?? {
          mukhi: null,
          family: null,
          status: 'NO_FAMILY',
          displayText: 'Mukhi Not Assigned',
        }
      )
    },
    enabled: Boolean(personId),
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}
