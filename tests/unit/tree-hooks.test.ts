/**
 * Unit tests: Tree Hooks
 * (src/features/tree/hooks/useFamilyTree.ts)
 * (src/features/tree/hooks/useTreeLayout.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTreeLayout } from '@/features/tree/hooks/useTreeLayout'
import { useFamilyTree, treeQueryKeys } from '@/features/tree/hooks/useFamilyTree'
import * as authContext from '@/features/auth/context/AuthContext'
import type { TreeGraph } from '@/features/tree/types'

vi.mock('@/features/auth/context/AuthContext')

describe('Tree Hooks', () => {
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

  describe('useTreeLayout Hook', () => {
    it('returns empty layout structure when treeGraph is null or undefined', () => {
      const nullLayout = captureHook(() => useTreeLayout(null))
      expect(nullLayout.nodes).toEqual([])
      expect(nullLayout.edges).toEqual([])
      expect(nullLayout.bounds.width).toBe(0)

      const undefLayout = captureHook(() => useTreeLayout(undefined))
      expect(undefLayout.nodes).toEqual([])
      expect(undefLayout.edges).toEqual([])
    })

    it('computes layout correctly for valid graph', () => {
      const mockGraph: TreeGraph = {
        rootPersonId: 'p-1',
        nodes: new Map([
          [
            'p-1',
            {
              id: 'p-1',
              person: {
                id: 'p-1',
                first_name: 'A',
                middle_name: null,
                last_name: 'B',
                gender: 'MALE',
                date_of_birth: '1980-01-01',
                profile_privacy: 'COMMUNITY',
                status: 'ACTIVE',
              },
              generation: 0,
              isRoot: true,
              rolesInTree: new Set(['ROOT']),
            },
          ],
        ]),
        edges: new Map(),
        generations: new Map([[0, ['p-1']]]),
        isBounded: false,
      }

      const layout = captureHook(() => useTreeLayout(mockGraph))
      expect(layout.nodes.length).toBe(1)
      expect(layout.nodes[0].id).toBe('p-1')
      expect(layout.nodes[0].data.isRoot).toBe(true)
    })
  })

  describe('useFamilyTree Hook', () => {
    it('disables query when session is unauthenticated', () => {
      vi.mocked(authContext.useAuthContext).mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        session: null,
        user: null,
        profile: null,
      })

      const query = captureHook(() => useFamilyTree('11111111-1111-4111-8111-111111111111'))
      expect(query.fetchStatus).toBe('idle')
    })
  })

  describe('treeQueryKeys', () => {
    it('generates consistent TanStack Query cache keys', () => {
      expect(treeQueryKeys.all).toEqual(['family-tree'])
      expect(treeQueryKeys.tree('person-123')).toEqual(['family-tree', 'person-123'])
      expect(treeQueryKeys.tree(undefined)).toEqual(['family-tree', undefined])
    })
  })
})
