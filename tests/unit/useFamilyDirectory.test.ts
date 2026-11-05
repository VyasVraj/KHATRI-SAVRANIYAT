/**
 * Unit tests: Family Directory Hooks
 * (src/features/discover/hooks/useFamilyDirectory.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User, Session } from '@supabase/supabase-js'
import {
  useFamilyDirectory,
  familyDirectoryQueryKeys,
} from '@/features/discover/hooks/useFamilyDirectory'
import * as discoveryService from '@/features/discover/services/discovery.service'
import * as authContext from '@/features/auth/context/AuthContext'
import type { DiscoveryPage, FamilyDiscoveryResult } from '@/features/discover/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/discover/services/discovery.service')

const FAKE_USER = { id: 'user-family-1' } as unknown as User
const FAKE_SESSION = { access_token: 'fake-token' } as unknown as Session

describe('Family Directory Hooks', () => {
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

  describe('familyDirectoryQueryKeys', () => {
    it('generates consistent query keys', () => {
      expect(familyDirectoryQueryKeys.all).toEqual(['family-directory'])
      expect(familyDirectoryQueryKeys.list({ city: 'Mumbai' }, 1, 20)).toEqual([
        'family-directory',
        { city: 'Mumbai' },
        1,
        20,
      ])
    })
  })

  describe('useFamilyDirectory Hook', () => {
    it('disables query when user is not authenticated', () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        session: null,
        profile: null,
        isLoading: false,
        isAuthenticated: false,
      })

      const hook = captureHook(() => useFamilyDirectory({}, 1, 20))
      expect(hook.fetchStatus).toBe('idle')
      expect(discoveryService.searchFamilies).not.toHaveBeenCalled()
    })

    it('enables query and executes search when authenticated', async () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: FAKE_USER,
        session: FAKE_SESSION,
        profile: null,
        isLoading: false,
        isAuthenticated: true,
      })

      const mockData: DiscoveryPage<FamilyDiscoveryResult> = {
        items: [],
        page: 1,
        pageSize: 20,
        hasNextPage: false,
        hasPreviousPage: false,
      }

      vi.spyOn(discoveryService, 'searchFamilies').mockResolvedValue({
        data: mockData,
        error: null,
      })

      const hook = captureHook(() => useFamilyDirectory({ city: 'Mumbai' }, 1, 20))
      expect(hook.fetchStatus).toBe('fetching')
    })
  })
})
