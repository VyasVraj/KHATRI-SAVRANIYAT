/**
 * Unit tests for mapRoleToCanonicalRelationship & mutation hooks
 * (src/features/relationships/hooks/useRelationshipMutations.ts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mapRoleToCanonicalRelationship,
  useAddRelationship,
  useUpdateRelationship,
  useSoftDeleteRelationship,
} from '@/features/relationships/hooks/useRelationshipMutations'
import * as authContext from '@/features/auth/context/AuthContext'
import * as relationshipsService from '@/features/relationships/services/relationships.service'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const PERSON_A_ID = '11111111-1111-1111-1111-111111111111'
const PERSON_B_ID = '22222222-2222-2222-2222-222222222222'
const MOCK_USER_ID = 'user-0001'

describe('mapRoleToCanonicalRelationship', () => {
  it('maps parent role: relatedPerson is parent (person_a), target is child (person_b)', () => {
    const result = mapRoleToCanonicalRelationship({
      targetPersonId: PERSON_B_ID,
      relatedPersonId: PERSON_A_ID,
      relativeRole: 'parent',
      notes: ' biological parent ',
    })

    expect(result).toEqual({
      person_a_id: PERSON_A_ID,
      person_b_id: PERSON_B_ID,
      relationship_type: 'PARENT',
      notes: 'biological parent',
    })
  })

  it('maps child role: target is parent (person_a), relatedPerson is child (person_b)', () => {
    const result = mapRoleToCanonicalRelationship({
      targetPersonId: PERSON_A_ID,
      relatedPersonId: PERSON_B_ID,
      relativeRole: 'child',
      notes: ' eldest child ',
    })

    expect(result).toEqual({
      person_a_id: PERSON_A_ID,
      person_b_id: PERSON_B_ID,
      relationship_type: 'PARENT',
      notes: 'eldest child',
    })
  })

  it('maps spouse role with canonical ordering when target < related', () => {
    const result = mapRoleToCanonicalRelationship({
      targetPersonId: PERSON_A_ID,
      relatedPersonId: PERSON_B_ID,
      relativeRole: 'spouse',
      notes: null,
    })

    expect(result).toEqual({
      person_a_id: PERSON_A_ID,
      person_b_id: PERSON_B_ID,
      relationship_type: 'SPOUSE',
      notes: null,
    })
  })

  it('maps spouse role with canonical ordering when target > related', () => {
    const result = mapRoleToCanonicalRelationship({
      targetPersonId: PERSON_B_ID,
      relatedPersonId: PERSON_A_ID,
      relativeRole: 'spouse',
      notes: '   ',
    })

    expect(result).toEqual({
      person_a_id: PERSON_A_ID,
      person_b_id: PERSON_B_ID,
      relationship_type: 'SPOUSE',
      notes: null,
    })
  })

  it('maps sibling role with canonical ordering when target < related', () => {
    const result = mapRoleToCanonicalRelationship({
      targetPersonId: PERSON_A_ID,
      relatedPersonId: PERSON_B_ID,
      relativeRole: 'sibling',
    })

    expect(result).toEqual({
      person_a_id: PERSON_A_ID,
      person_b_id: PERSON_B_ID,
      relationship_type: 'SIBLING',
      notes: null,
    })
  })

  it('maps sibling role with canonical ordering when target > related', () => {
    const result = mapRoleToCanonicalRelationship({
      targetPersonId: PERSON_B_ID,
      relatedPersonId: PERSON_A_ID,
      relativeRole: 'sibling',
      notes: 'Brother',
    })

    expect(result).toEqual({
      person_a_id: PERSON_A_ID,
      person_b_id: PERSON_B_ID,
      relationship_type: 'SIBLING',
      notes: 'Brother',
    })
  })

  it('throws error when targetPersonId === relatedPersonId', () => {
    expect(() =>
      mapRoleToCanonicalRelationship({
        targetPersonId: PERSON_A_ID,
        relatedPersonId: PERSON_A_ID,
        relativeRole: 'spouse',
      })
    ).toThrow('A person cannot have a relationship with themselves.')
  })

  it('throws error for unsupported role', () => {
    expect(() =>
      mapRoleToCanonicalRelationship({
        targetPersonId: PERSON_A_ID,
        relatedPersonId: PERSON_B_ID,
        relativeRole: 'cousin' as never,
      })
    ).toThrow('Unsupported relationship role: cousin')
  })
})

describe('Relationship mutation hooks', () => {
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
    vi.restoreAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  describe('useAddRelationship', () => {
    it('calls createRelationship with canonical input and authenticated user id', async () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: { id: MOCK_USER_ID },
        isAuthenticated: true,
      } as never)

      const mockCreate = vi.spyOn(relationshipsService, 'createRelationship').mockResolvedValue({
        data: {
          id: 'rel-1',
          person_a_id: PERSON_A_ID,
          person_b_id: PERSON_B_ID,
          relationship_type: 'SPOUSE',
          verification_status: 'UNVERIFIED',
          notes: null,
          created_by: MOCK_USER_ID,
          created_at: '2026-10-04T00:00:00Z',
          updated_at: '2026-10-04T00:00:00Z',
          deleted_at: null,
        },
        error: null,
      })

      const mutation = captureHook(() => useAddRelationship())

      await mutation.mutateAsync({
        targetPersonId: PERSON_A_ID,
        relatedPersonId: PERSON_B_ID,
        relativeRole: 'spouse',
      })

      expect(mockCreate).toHaveBeenCalledWith(
        {
          person_a_id: PERSON_A_ID,
          person_b_id: PERSON_B_ID,
          relationship_type: 'SPOUSE',
          notes: null,
        },
        MOCK_USER_ID
      )
    })

    it('throws error when user is not authenticated', async () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: null,
        isAuthenticated: false,
      } as never)

      const mutation = captureHook(() => useAddRelationship())

      await expect(
        mutation.mutateAsync({
          targetPersonId: PERSON_A_ID,
          relatedPersonId: PERSON_B_ID,
          relativeRole: 'spouse',
        })
      ).rejects.toThrow('Authentication required to record a relationship.')
    })
  })

  describe('useUpdateRelationship', () => {
    it('calls updateRelationship with relationship id, notes, and user id', async () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: { id: MOCK_USER_ID },
        isAuthenticated: true,
      } as never)

      const mockUpdate = vi.spyOn(relationshipsService, 'updateRelationship').mockResolvedValue({
        data: {
          id: 'rel-1',
          person_a_id: PERSON_A_ID,
          person_b_id: PERSON_B_ID,
          relationship_type: 'SPOUSE',
          verification_status: 'UNVERIFIED',
          notes: 'Updated notes',
          created_by: MOCK_USER_ID,
          created_at: '2026-10-04T00:00:00Z',
          updated_at: '2026-10-04T00:00:00Z',
          deleted_at: null,
        },
        error: null,
      })

      const mutation = captureHook(() => useUpdateRelationship())

      await mutation.mutateAsync({
        id: 'rel-1',
        notes: 'Updated notes',
      })

      expect(mockUpdate).toHaveBeenCalledWith('rel-1', { notes: 'Updated notes' }, MOCK_USER_ID)
    })
  })

  describe('useSoftDeleteRelationship', () => {
    it('calls softDeleteRelationship with id and user id', async () => {
      vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
        user: { id: MOCK_USER_ID },
        isAuthenticated: true,
      } as never)

      const mockSoftDelete = vi.spyOn(relationshipsService, 'softDeleteRelationship').mockResolvedValue({
        data: undefined,
        error: null,
      })

      const mutation = captureHook(() => useSoftDeleteRelationship())

      await mutation.mutateAsync('rel-1')

      expect(mockSoftDelete).toHaveBeenCalledWith('rel-1', MOCK_USER_ID)
    })
  })
})
