/**
 * Community Birthdays TanStack Query Hook (Phase 10 / ANDROID-9 Parity)
 *
 * Provides reactive access to upcoming birthdays with:
 * - Deterministic celebration sorting
 * - 5-level privacy model enforcement (PRIVATE/COMMUNITY/PUBLIC)
 * - Local search and filtering ('ALL' | 'TODAY' | 'THIS_MONTH')
 * - Grouped outputs (Today, This Week, Later This Month, Upcoming)
 * - Interactive wish sending state tracking
 */

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import {
  getUpcomingBirthdays,
  groupBirthdays,
  type UpcomingBirthdayOptions,
} from '../services/birthdays.service'
import type { BirthdayFilters, BirthdayItem, BirthdayGroup } from '../types'

export const BIRTHDAYS_QUERY_KEY = 'community-birthdays'

export function useBirthdays(filters?: BirthdayFilters) {
  const { user, profile } = useAuthContext()

  const isModerator =
    profile?.role === 'SUPER_ADMIN' ||
    profile?.role === 'ADMIN' ||
    profile?.role === 'COMMUNITY_MODERATOR'

  const queryOptions: UpcomingBirthdayOptions = useMemo(
    () => ({
      currentUserId: user?.id ?? null,
      isModerator,
    }),
    [user?.id, isModerator]
  )

  const query = useQuery({
    queryKey: [BIRTHDAYS_QUERY_KEY, user?.id, isModerator],
    queryFn: async () => {
      const response = await getUpcomingBirthdays(queryOptions)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data || []
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  const rawData: BirthdayItem[] = useMemo(() => query.data || [], [query.data])

  // Filter items based on active criteria
  const filteredData = useMemo(() => {
    let result = rawData

    // 1. Search by member name
    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.trim().toLowerCase()
      result = result.filter((item) => {
        const fullName = `${item.first_name} ${item.last_name}`.toLowerCase()
        return fullName.includes(q)
      })
    }

    // 2. Filter mode ('TODAY' | 'THIS_MONTH' | 'ALL')
    if (filters?.filter === 'TODAY') {
      result = result.filter((item) => item.is_today)
    } else if (filters?.filter === 'THIS_MONTH') {
      result = result.filter((item) => item.is_this_month)
    }

    // 3. Specific month filter (1-12)
    if (filters?.month && filters.month >= 1 && filters.month <= 12) {
      result = result.filter((item) => item.birth_month === filters.month)
    }

    return result
  }, [rawData, filters?.search, filters?.filter, filters?.month])

  // Grouped results
  const groups: BirthdayGroup[] = useMemo(() => {
    return groupBirthdays(filteredData)
  }, [filteredData])

  // Metrics
  const todayCount = useMemo(() => {
    return rawData.filter((item) => item.is_today).length
  }, [rawData])

  const thisMonthCount = useMemo(() => {
    return rawData.filter((item) => item.is_this_month).length
  }, [rawData])

  // Track sent wishes per session
  const [wishedPersonIds, setWishedPersonIds] = useState<Set<string>>(
    () => new Set()
  )

  const sendWish = useCallback((personId: string) => {
    setWishedPersonIds((prev) => {
      const next = new Set(prev)
      next.add(personId)
      return next
    })
  }, [])

  const hasWished = useCallback(
    (personId: string) => wishedPersonIds.has(personId),
    [wishedPersonIds]
  )

  return {
    ...query,
    data: filteredData,
    rawData,
    groups,
    todayCount,
    thisMonthCount,
    totalCount: rawData.length,
    sendWish,
    hasWished,
  }
}
