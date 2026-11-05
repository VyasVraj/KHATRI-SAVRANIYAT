/**
 * Hook: useMukhiDirectory (Phase 10 / ANDROID-11 Parity)
 *
 * Provides reactive query orchestration for the Mukhi Leadership Directory:
 * - Real-time client-side & backend directory search.
 * - Multi-criteria filters: State, City, Nukh, Gotra, Active status.
 * - Deterministic pagination controls.
 * - Automatic integration with active user profile and moderator permissions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { getMukhiDirectory } from '../services/mukhi.service'
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
  const [data, setData] = useState<MukhiDirectoryResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const isModerator = useMemo(() => {
    return (
      profile?.role === 'SUPER_ADMIN' ||
      profile?.role === 'ADMIN' ||
      profile?.role === 'COMMUNITY_MODERATOR'
    )
  }, [profile?.role])

  const fetchDirectory = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    const res = await getMukhiDirectory({
      filters,
      page,
      pageSize: initialPageSize,
      currentUserId: user?.id ?? null,
      isModerator,
    })

    if (res.error) {
      setError(res.error.message)
      setData(null)
    } else {
      setData(res.data)
      setError(null)
    }
    setIsLoading(false)
  }, [filters, page, initialPageSize, user?.id, isModerator])

  useEffect(() => {
    fetchDirectory()
  }, [fetchDirectory])

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

  return {
    data,
    leaders: data?.items ?? [],
    isLoading,
    error,
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
    refresh: fetchDirectory,
  }
}
