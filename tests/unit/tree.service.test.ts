/**
 * Unit tests: Tree Traversal Service
 * (src/features/tree/services/tree.service.ts)
 *
 * Verifies bounded Supabase queries, person batching, error propagation,
 * and graph construction delegation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchFamilyTreeGraph, getPersonTreeGraph } from '@/features/tree/services/tree.service'
import { supabase } from '@/lib/supabase'
import type { PersonSummary, RelationshipRow } from '@/features/relationships/types'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

const ROOT_ID = '11111111-1111-4111-8111-111111111111'
const PARENT_ID = '22222222-2222-4222-8222-222222222222'
const REL_ID = '33333333-3333-4333-8333-333333333333'

const MOCK_ROOT: PersonSummary = {
  id: ROOT_ID,
  first_name: 'Dev',
  middle_name: null,
  last_name: 'Patel',
  gender: 'MALE',
  date_of_birth: '1985-05-15',
  profile_privacy: 'COMMUNITY',
  status: 'ACTIVE',
}

const MOCK_PARENT: PersonSummary = {
  id: PARENT_ID,
  first_name: 'Kirit',
  middle_name: null,
  last_name: 'Patel',
  gender: 'MALE',
  date_of_birth: '1955-02-10',
  profile_privacy: 'COMMUNITY',
  status: 'ACTIVE',
}

const MOCK_REL: RelationshipRow = {
  id: REL_ID,
  person_a_id: PARENT_ID,
  person_b_id: ROOT_ID,
  relationship_type: 'PARENT',
  notes: null,
  verification_status: 'UNVERIFIED',
  created_by: 'user-1',
  created_at: '2026-10-04T00:00:00Z',
  updated_at: '2026-10-04T00:00:00Z',
  deleted_at: null,
}

describe('fetchFamilyTreeGraph & getPersonTreeGraph Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid UUID formats gracefully', async () => {
    const res = await getPersonTreeGraph('invalid-uuid')
    expect(res.error?.code).toBe('INVALID_ID')
    expect(res.error?.message).toBe('Invalid person ID format.')

    await expect(fetchFamilyTreeGraph('invalid-uuid')).rejects.toThrow('Invalid person ID format.')
  })

  it('fetches root person, traverses relationships, batches persons, and returns TreeGraph', async () => {
    const fromMock = vi.mocked(supabase.from)

    fromMock.mockImplementation((table: string) => {
      if (table === 'persons' || table === 'community_persons') {
        return {
          select: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: MOCK_ROOT, error: null }),
            }),
            in: vi.fn().mockResolvedValue({ data: [MOCK_PARENT], error: null }),
          })),
        } as unknown as ReturnType<typeof supabase.from>
      }
      if (table === 'relationships') {
        return {
          select: vi.fn().mockReturnValue({
            or: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [MOCK_REL], error: null }),
            }),
          }),
        } as unknown as ReturnType<typeof supabase.from>
      }
      return {} as unknown as ReturnType<typeof supabase.from>
    })

    const result = await fetchFamilyTreeGraph(ROOT_ID)

    expect(result.rootPersonId).toBe(ROOT_ID)
    expect(result.nodes.has(ROOT_ID)).toBe(true)
    expect(result.nodes.has(PARENT_ID)).toBe(true)
    expect(result.edges.has(REL_ID)).toBe(true)
  })

  it('throws an error if root person record is not found', async () => {
    const fromMock = vi.mocked(supabase.from)

    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>))

    await expect(fetchFamilyTreeGraph('44444444-4444-4444-8444-444444444444')).rejects.toThrow(
      'Person record not found or inaccessible.'
    )
  })

  it('propagates Supabase database errors during root query', async () => {
    const fromMock = vi.mocked(supabase.from)

    fromMock.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database query timeout', code: '504' },
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>))

    await expect(fetchFamilyTreeGraph(ROOT_ID)).rejects.toThrow('Could not load root person record.')
  })
})
