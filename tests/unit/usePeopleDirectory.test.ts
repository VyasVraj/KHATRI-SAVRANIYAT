/**
 * Unit tests: People Directory Hooks
 * (src/features/discover/hooks/usePeopleDirectory.ts)
 * (src/features/discover/hooks/useDebounce.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User, Session } from '@supabase/supabase-js'
import {
  usePeopleDirectory,
  useDiscoveryFilterOptions,
  directoryQueryKeys,
} from '@/features/discover/hooks/usePeopleDirectory'
import { useDebounce } from '@/features/discover/hooks/useDebounce'
import * as discoveryService from '@/features/discover/services/discovery.service'
import * as authContext from '@/features/auth/context/AuthContext'
import type { DiscoveryPage, PersonDiscoveryResult, DiscoveryFilterOptions } from '@/features/discover/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/discover/services/discovery.service')

const FAKE_USER = { id: 'user-1' } as unknown as User
const FAKE_SESSION = { access_token: 'fake-token' } as unknown as Session

describe('People Directory Hooks', () => {
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
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  describe('directoryQueryKeys', () => {
    it('generates consistent query keys', () => {
      expect(directoryQueryKeys.all).toEqual(['people-directory'])
      expect(directoryQueryKeys.list({ gotra: 'Kashyap' }, 1, 20)).toEqual([
        'people-directory',
        { gotra: 'Kashyap' },
        1,
        20,
      ])
      expect(directoryQueryKeys.filterOptions()).toEqual(['discovery-filter-options'])
    })
  })

  describe('usePeopleDirectory Hook', () => {
    it('disables query when user is not authenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        session: null,
        profile: null,
        isLoading: false,
        isAuthenticated: false,
      })

      const hook = captureHook(() => usePeopleDirectory({}, 1, 20))
      expect(hook.fetchStatus).toBe('idle')
      expect(discoveryService.searchPersons).not.toHaveBeenCalled()
    })

    it('enables query and executes search when authenticated', async () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: FAKE_USER,
        session: FAKE_SESSION,
        profile: null,
        isLoading: false,
        isAuthenticated: true,
      })

      const mockData: DiscoveryPage<PersonDiscoveryResult> = {
        items: [],
        page: 1,
        pageSize: 20,
        hasNextPage: false,
        hasPreviousPage: false,
      }

      vi.spyOn(discoveryService, 'searchPersons').mockResolvedValue({
        data: mockData,
        error: null,
      })

      const hook = captureHook(() => usePeopleDirectory({ gotra: 'Kashyap' }, 1, 20))
      expect(hook.fetchStatus).toBe('fetching')
    })
  })

  describe('useDiscoveryFilterOptions Hook', () => {
    it('disables query when unauthenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        session: null,
        profile: null,
        isLoading: false,
        isAuthenticated: false,
      })

      const hook = captureHook(() => useDiscoveryFilterOptions())
      expect(hook.fetchStatus).toBe('idle')
      expect(discoveryService.getDiscoveryFilterOptions).not.toHaveBeenCalled()
    })

    it('enables query when authenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: FAKE_USER,
        session: FAKE_SESSION,
        profile: null,
        isLoading: false,
        isAuthenticated: true,
      })

      const mockOptions: DiscoveryFilterOptions = {
        gotras: ['Kashyap'],
        nukhs: ['SomeNukh'],
        kuls: ['SomeKul'],
        cities: [],
        states: [],
      }

      vi.spyOn(discoveryService, 'getDiscoveryFilterOptions').mockResolvedValue({
        data: mockOptions,
        error: null,
      })

      const hook = captureHook(() => useDiscoveryFilterOptions())
      expect(hook.fetchStatus).toBe('fetching')
    })
  })

  describe('useDebounce Hook', () => {
    it('returns initial value immediately upon mounting', () => {
      let debounced!: string
      function TestComp() {
        debounced = useDebounce('hello', 300)
        return null
      }
      renderToStaticMarkup(React.createElement(TestComp))
      expect(debounced).toBe('hello')
    })
  })
})
