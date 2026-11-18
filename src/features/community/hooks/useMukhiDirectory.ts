/**
 * Hook: useMukhiDirectory (Phase 10 / ANDROID-11 Parity)
 *
 * Provides reactive query orchestration for the Mukhi Leadership Directory:
 * - Real-time client-side & backend directory search.
 * - Multi-criteria filters: State, City, Nukh, Gotra, Active status.
 * - Deterministic pagination controls.
 * - Automatic integration with active user profile and moderator permissions.
 * - Backed by TanStack Query for instant cross-component synchronization.
 */

import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { getMukhiDirectory, CANONICAL_MUKHI_REGISTRY } from '../services/mukhi.service'
import type {
  MukhiLeaderItem,
  MukhiDirectoryFilters,
  MukhiDirectoryResponse,
} from '../types'

export interface UseMukhiDirectoryReturn {
  data: MukhiDirectoryResponse | null
  leaders: MukhiLeaderItem[]
  isLoading: boolean
  error: string | null
  filters: MukhiDirectoryFilters
  setFilter: (key: keyof MukhiDirectoryFilters, value: string) => void
  resetFilters: () => void
  page: number
  setPage: (page: number) => void
  pageSize: number
  totalCount: number
  hasNextPage: boolean
  availableStates: string[]
  availableCities: string[]
  availableNukhs: string[]
  refresh: () => void
}

const DEFAULT_FILTERS: MukhiDirectoryFilters = {
  search: '',
  state: 'ALL',
  city: 'ALL',
  nukh: 'ALL',
  gotra: 'ALL',
  status: 'ACTIVE',
}

export function useMukhiDirectory(initialPageSize = 12): UseMukhiDirectoryReturn {
  const { user, profile } = useAuthContext()
  const [filters, setFilters] = useState<MukhiDirectoryFilters>(DEFAULT_FILTERS)
  const [page, setPage] = useState<number>(1)

  const isModerator = useMemo(() => {
    return (
      profile?.role === 'SUPER_ADMIN' ||
      profile?.role === 'ADMIN' ||
      profile?.role === 'COMMUNITY_MODERATOR'
    )
  }, [profile?.role])

  const initialData = useMemo<MukhiDirectoryResponse | undefined>(() => {
    if (
      page === 1 &&
      (!filters.status || filters.status === 'ACTIVE') &&
      filters.city === 'ALL' &&
      filters.state === 'ALL' &&
      !filters.search
    ) {
      return {
        items: CANONICAL_MUKHI_REGISTRY.slice(0, initialPageSize),
        totalCount: CANONICAL_MUKHI_REGISTRY.length,
        page: 1,
        pageSize: initialPageSize,
        hasNextPage: CANONICAL_MUKHI_REGISTRY.length > initialPageSize,
        availableStates: [],
        availableCities: [],
        availableNukhs: [],
      }
    }
    return undefined
  }, [filters, page, initialPageSize])

  const query = useQuery({
    queryKey: ['mukhi-directory', filters, page, initialPageSize, user?.id, isModerator],
    queryFn: async () => {
      const res = await getMukhiDirectory({
        filters,
        page,
        pageSize: initialPageSize,
        currentUserId: user?.id ?? null,
        isModerator,
      })
      if (res.error) {
        throw new Error(res.error.message)
      }
      return res.data
    },
    initialData,
    initialDataUpdatedAt: 0,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })

  const setFilter = useCallback((key: keyof MukhiDirectoryFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
    setPage(1) // Reset to first page on filter change
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }, [])

  const data = query.data ?? null

  return {
    data,
    leaders: data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    filters,
    setFilter,
    resetFilters,
    page,
    setPage,
    pageSize: initialPageSize,
    totalCount: data?.totalCount ?? 0,
    hasNextPage: data?.hasNextPage ?? false,
    availableStates: data?.availableStates ?? [],
    availableCities: data?.availableCities ?? [],
    availableNukhs: data?.availableNukhs ?? [],
    refresh: () => {
      query.refetch()
    },
  }
}
