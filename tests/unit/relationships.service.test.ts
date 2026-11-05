/**
 * Unit tests for Relationships Service & Validation Schemas
 * (src/features/relationships/services/relationships.service.ts)
 * (src/features/relationships/schemas/relationships.schema.ts)
 *
 * All tests use a mocked Supabase client. No real database connections are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createRelationship,
  listPersonRelationships,
  getRelationship,
  updateRelationship,
  softDeleteRelationship,
  canonicalizeRelationshipEndpoints,
} from '@/features/relationships/services/relationships.service'
import {
  createRelationshipSchema,
  updateRelationshipSchema,
  relationshipTypeSchema,
} from '@/features/relationships/schemas/relationships.schema'
import { supabase } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001'

// Notice lexicographical ordering: PERSON_A (1111...) < PERSON_B (2222...) < PERSON_C (3333...)
const MOCK_PERSON_A_ID = '11111111-1111-1111-1111-111111111111'
const MOCK_PERSON_B_ID = '22222222-2222-2222-2222-222222222222'
const MOCK_PERSON_C_ID = '33333333-3333-3333-3333-333333333333'
const MOCK_RELATIONSHIP_ID = '55555555-5555-5555-5555-555555555555'

const MOCK_PERSON_A_ROW = {
  id: MOCK_PERSON_A_ID,
  first_name: 'Harish',
  middle_name: null,
  last_name: 'Patel',
  gender: 'MALE' as const,
  date_of_birth: '1960-01-01',
  profile_privacy: 'COMMUNITY' as const,
  status: 'ACTIVE' as const,
}

const MOCK_PERSON_B_ROW = {
  id: MOCK_PERSON_B_ID,
  first_name: 'Anand',
  middle_name: null,
  last_name: 'Patel',
  gender: 'MALE' as const,
  date_of_birth: '1985-05-15',
  profile_privacy: 'COMMUNITY' as const,
  status: 'ACTIVE' as const,
}

const MOCK_RELATIONSHIP_ROW = {
  id: MOCK_RELATIONSHIP_ID,
  person_a_id: MOCK_PERSON_A_ID,
  person_b_id: MOCK_PERSON_B_ID,
  relationship_type: 'PARENT' as const,
  notes: 'Father and son',
  verification_status: 'UNVERIFIED' as const,
  created_by: MOCK_USER_ID,
  created_at: '2026-10-04T12:00:00Z',
  updated_at: '2026-10-04T12:00:00Z',
  deleted_at: null,
}

// ---------------------------------------------------------------------------
// Tests: Zod Validation Schemas
// ---------------------------------------------------------------------------

describe('Relationships Validation Schemas', () => {
  describe('relationshipTypeSchema', () => {
    it('accepts valid relationship types', () => {
      expect(relationshipTypeSchema.safeParse('PARENT').success).toBe(true)
      expect(relationshipTypeSchema.safeParse('SPOUSE').success).toBe(true)
      expect(relationshipTypeSchema.safeParse('SIBLING').success).toBe(true)
    })

    it('rejects invalid relationship types', () => {
      expect(relationshipTypeSchema.safeParse('FRIEND').success).toBe(false)
      expect(relationshipTypeSchema.safeParse('COUSIN').success).toBe(false)
      expect(relationshipTypeSchema.safeParse('').success).toBe(false)
    })
  })

  describe('createRelationshipSchema', () => {
    it('accepts a valid directional PARENT relationship regardless of UUID order', () => {
      // PARENT: person_a (older parent) can have larger UUID than child
      const result = createRelationshipSchema.safeParse({
        person_a_id: MOCK_PERSON_B_ID,
        person_b_id: MOCK_PERSON_A_ID,
        relationship_type: 'PARENT',
        notes: 'Parent relationship',
      })
      expect(result.success).toBe(true)
    })

    it('accepts valid canonically ordered SPOUSE relationship (person_a < person_b)', () => {
      const result = createRelationshipSchema.safeParse({
        person_a_id: MOCK_PERSON_A_ID,
        person_b_id: MOCK_PERSON_B_ID,
        relationship_type: 'SPOUSE',
        notes: 'Married in 2010',
      })
      expect(result.success).toBe(true)
    })

    it('accepts valid canonically ordered SIBLING relationship (person_a < person_b)', () => {
      const result = createRelationshipSchema.safeParse({
        person_a_id: MOCK_PERSON_A_ID,
        person_b_id: MOCK_PERSON_B_ID,
        relationship_type: 'SIBLING',
      })
      expect(result.success).toBe(true)
    })

    it('rejects self-referential relationships (person_a_id === person_b_id)', () => {
      const result = createRelationshipSchema.safeParse({
        person_a_id: MOCK_PERSON_A_ID,
        person_b_id: MOCK_PERSON_A_ID,
        relationship_type: 'PARENT',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('cannot have a relationship with themselves')
      }
    })

    it('rejects non-canonical symmetric SPOUSE ordering (person_a > person_b)', () => {
      const result = createRelationshipSchema.safeParse({
        person_a_id: MOCK_PERSON_B_ID,
        person_b_id: MOCK_PERSON_A_ID,
        relationship_type: 'SPOUSE',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must be ordered with person_a_id < person_b_id')
      }
    })

    it('rejects non-canonical symmetric SIBLING ordering (person_a > person_b)', () => {
      const result = createRelationshipSchema.safeParse({
        person_a_id: MOCK_PERSON_B_ID,
        person_b_id: MOCK_PERSON_A_ID,
        relationship_type: 'SIBLING',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('must be ordered with person_a_id < person_b_id')
      }
    })

    it('rejects notes exceeding 1000 characters', () => {
      const result = createRelationshipSchema.safeParse({
        person_a_id: MOCK_PERSON_A_ID,
        person_b_id: MOCK_PERSON_B_ID,
        relationship_type: 'SPOUSE',
        notes: 'A'.repeat(1001),
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Notes cannot exceed 1000 characters')
      }
    })

    it('rejects protected fields via strict schema validation', () => {
      const result = createRelationshipSchema.safeParse({
        person_a_id: MOCK_PERSON_A_ID,
        person_b_id: MOCK_PERSON_B_ID,
        relationship_type: 'SPOUSE',
        created_by: MOCK_USER_ID,
        verification_status: 'OFFICIALLY_VERIFIED',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('updateRelationshipSchema', () => {
    it('accepts valid notes update', () => {
      const result = updateRelationshipSchema.safeParse({
        notes: 'Updated context notes',
      })
      expect(result.success).toBe(true)
    })

    it('accepts clearing notes (null or empty)', () => {
      const resultNull = updateRelationshipSchema.safeParse({ notes: null })
      expect(resultNull.success).toBe(true)
      const resultEmpty = updateRelationshipSchema.safeParse({})
      expect(resultEmpty.success).toBe(true)
    })

    it('rejects immutable fields (person_a_id, relationship_type, etc.)', () => {
      const result = updateRelationshipSchema.safeParse({
        notes: 'New notes',
        person_a_id: MOCK_PERSON_A_ID,
      })
      expect(result.success).toBe(false)
    })

    it('strictly rejects all protected identity and lifecycle fields from client update', () => {
      const protectedFields = [
        { id: '11111111-1111-1111-1111-111111111111' },
        { person_a_id: MOCK_PERSON_A_ID },
        { person_b_id: MOCK_PERSON_B_ID },
        { relationship_type: 'SPOUSE' },
        { created_by: MOCK_USER_ID },
        { created_at: '2026-10-04T12:00:00Z' },
        { verification_status: 'COMMUNITY_VERIFIED' },
        { deleted_at: '2026-10-04T12:00:00Z' },
      ]

      for (const field of protectedFields) {
        const res = updateRelationshipSchema.safeParse({
          notes: 'Valid notes',
          ...field,
        })
        expect(res.success).toBe(false)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: Relationships Service
// ---------------------------------------------------------------------------

describe('Relationships Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // createRelationship
  // =========================================================================
  describe('createRelationship', () => {
    it('successfully creates a PARENT relationship', async () => {
      // Mock cycle detection: no ancestors
      const mockCycleSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({ data: [], error: null }),
          }),
        }),
      })

      // Mock duplicate check: no existing active
      const mockDuplicateMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockDuplicateQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({ maybeSingle: mockDuplicateMaybeSingle }),
              }),
            }),
          }),
        }),
      }

      // Mock insert
      const mockSingle = vi.fn().mockResolvedValue({
        data: MOCK_RELATIONSHIP_ROW,
        error: null,
      })
      const mockInsertSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === 'id') {
                return mockDuplicateQuery.select(cols)
              }
              if (cols === 'person_a_id') {
                return mockCycleSelect()
              }
              return { eq: vi.fn() }
            }),
            insert: mockInsert,
          } as never
        }
        return {} as never
      })

      const result = await createRelationship(
        {
          person_a_id: MOCK_PERSON_A_ID,
          person_b_id: MOCK_PERSON_B_ID,
          relationship_type: 'PARENT',
          notes: 'Father and son',
        },
        MOCK_USER_ID
      )

      expect(result.error).toBeNull()
      expect(result.data).toEqual(MOCK_RELATIONSHIP_ROW)
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          person_a_id: MOCK_PERSON_A_ID,
          person_b_id: MOCK_PERSON_B_ID,
          relationship_type: 'PARENT',
          notes: 'Father and son',
          created_by: MOCK_USER_ID,
        })
      )
    })

    it('rejects unauthenticated caller', async () => {
      const result = await createRelationship(
        {
          person_a_id: MOCK_PERSON_A_ID,
          person_b_id: MOCK_PERSON_B_ID,
          relationship_type: 'PARENT',
        },
        'invalid-user-id'
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('UNAUTHENTICATED')
    })

    it('rejects self-referential relationships', async () => {
      const result = await createRelationship(
        {
          person_a_id: MOCK_PERSON_A_ID,
          person_b_id: MOCK_PERSON_A_ID,
          relationship_type: 'PARENT',
        },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(result.error?.message).toContain('cannot have a relationship with themselves')
    })

    it('rejects non-canonical symmetric SPOUSE ordering', async () => {
      const result = await createRelationship(
        {
          person_a_id: MOCK_PERSON_B_ID,
          person_b_id: MOCK_PERSON_A_ID,
          relationship_type: 'SPOUSE',
        },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(result.error?.message).toContain('must be ordered with person_a_id < person_b_id')
    })

    it('detects and rejects ancestry cycles in PARENT relationships', async () => {
      // Setup cycle: Anand (person_b) is already parent/ancestor of Harish (person_a)
      // Attempting to make Harish parent of Anand would create a cycle!
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockResolvedValue({
                    // Harish's parent is Anand!
                    data: [{ person_a_id: MOCK_PERSON_B_ID }],
                    error: null,
                  }),
                }),
              }),
            }),
          } as never
        }
        return {} as never
      })

      const result = await createRelationship(
        {
          person_a_id: MOCK_PERSON_A_ID,
          person_b_id: MOCK_PERSON_B_ID,
          relationship_type: 'PARENT',
        },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('ANCESTRY_CYCLE_DETECTED')
      expect(result.error?.message).toContain('ancestry cycle')
    })

    it('rejects duplicate active relationship when one already exists', async () => {
      // Mock cycle detection: no ancestors
      const mockCycleSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({ data: [], error: null }),
          }),
        }),
      })

      // Mock duplicate check returning existing ID
      const mockDuplicateMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'existing-relationship-id' },
        error: null,
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === 'id') {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        is: vi.fn().mockReturnValue({ maybeSingle: mockDuplicateMaybeSingle }),
                      }),
                    }),
                  }),
                }
              }
              return mockCycleSelect()
            }),
          } as never
        }
        return {} as never
      })

      const result = await createRelationship(
        {
          person_a_id: MOCK_PERSON_A_ID,
          person_b_id: MOCK_PERSON_B_ID,
          relationship_type: 'PARENT',
        },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('DUPLICATE_RELATIONSHIP')
      expect(result.error?.message).toContain('already exists')
    })

    it('maps database duplicate key error (23505) correctly', async () => {
      // Mock cycle check clean, duplicate check clean, but DB insert hits race condition
      const mockCycleSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({ data: [], error: null }),
          }),
        }),
      })

      const mockDuplicateMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
      const mockInsertSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === 'id') {
                return {
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      eq: vi.fn().mockReturnValue({
                        is: vi.fn().mockReturnValue({ maybeSingle: mockDuplicateMaybeSingle }),
                      }),
                    }),
                  }),
                }
              }
              return mockCycleSelect()
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({ single: mockInsertSingle }),
            }),
          } as never
        }
        return {} as never
      })

      const result = await createRelationship(
        {
          person_a_id: MOCK_PERSON_A_ID,
          person_b_id: MOCK_PERSON_B_ID,
          relationship_type: 'PARENT',
        },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('23505')
      expect(result.error?.message).toContain('already exists')
    })
  })

  // =========================================================================
  // listPersonRelationships
  // =========================================================================
  describe('listPersonRelationships', () => {
    it('lists relationships with directional projection from parent perspective', async () => {
      // Target person is Harish (MOCK_PERSON_A_ID).
      // Row has person_a = Harish, person_b = Anand, type = PARENT.
      // Harish is parent -> Anand is child.
      const mockRows = [MOCK_RELATIONSHIP_ROW]

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
              }),
            }),
          } as never
        }
        if (table === 'persons' || table === 'community_persons') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_PERSON_B_ROW],
                error: null,
              }),
            }),
          } as never
        }
        return {} as never
      })

      const result = await listPersonRelationships(MOCK_PERSON_A_ID)

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      const summary = result.data!
      expect(summary.personId).toBe(MOCK_PERSON_A_ID)
      expect(summary.children).toHaveLength(1)
      expect(summary.children[0].role).toBe('child')
      expect(summary.children[0].relatedPerson?.first_name).toBe('Anand')
      expect(summary.parents).toHaveLength(0)
      expect(summary.spouses).toHaveLength(0)
      expect(summary.siblings).toHaveLength(0)
    })

    it('lists relationships with directional projection from child perspective', async () => {
      // Target person is Anand (MOCK_PERSON_B_ID).
      // Row has person_a = Harish, person_b = Anand, type = PARENT.
      // Anand is child -> Harish is parent.
      const mockRows = [MOCK_RELATIONSHIP_ROW]

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
              }),
            }),
          } as never
        }
        if (table === 'persons' || table === 'community_persons') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_PERSON_A_ROW],
                error: null,
              }),
            }),
          } as never
        }
        return {} as never
      })

      const result = await listPersonRelationships(MOCK_PERSON_B_ID)

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      const summary = result.data!
      expect(summary.personId).toBe(MOCK_PERSON_B_ID)
      expect(summary.parents).toHaveLength(1)
      expect(summary.parents[0].role).toBe('parent')
      expect(summary.parents[0].relatedPerson?.first_name).toBe('Harish')
      expect(summary.children).toHaveLength(0)
    })

    it('categorizes spouse and sibling relationships correctly', async () => {
      const spouseRow = {
        ...MOCK_RELATIONSHIP_ROW,
        id: 'spouse-row-id',
        relationship_type: 'SPOUSE' as const,
      }
      const siblingRow = {
        ...MOCK_RELATIONSHIP_ROW,
        id: 'sibling-row-id',
        person_b_id: MOCK_PERSON_C_ID,
        relationship_type: 'SIBLING' as const,
      }

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockReturnValue({
              or: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [spouseRow, siblingRow],
                  error: null,
                }),
              }),
            }),
          } as never
        }
        if (table === 'persons' || table === 'community_persons') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_PERSON_B_ROW, { ...MOCK_PERSON_A_ROW, id: MOCK_PERSON_C_ID, first_name: 'Dinesh' }],
                error: null,
              }),
            }),
          } as never
        }
        return {} as never
      })

      const result = await listPersonRelationships(MOCK_PERSON_A_ID)

      expect(result.error).toBeNull()
      const summary = result.data!
      expect(summary.spouses).toHaveLength(1)
      expect(summary.spouses[0].role).toBe('spouse')
      expect(summary.siblings).toHaveLength(1)
      expect(summary.siblings[0].role).toBe('sibling')
      expect(summary.all).toHaveLength(2)
    })

    it('rejects invalid person ID', async () => {
      const result = await listPersonRelationships('invalid-uuid')
      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('INVALID_ID')
    })
  })

  // =========================================================================
  // getRelationship
  // =========================================================================
  describe('getRelationship', () => {
    it('successfully retrieves a relationship joined with both person endpoints', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: MOCK_RELATIONSHIP_ROW,
        error: null,
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSingle }),
            }),
          } as never
        }
        if (table === 'persons' || table === 'community_persons') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [MOCK_PERSON_A_ROW, MOCK_PERSON_B_ROW],
                error: null,
              }),
            }),
          } as never
        }
        return {} as never
      })

      const result = await getRelationship(MOCK_RELATIONSHIP_ID)

      expect(result.error).toBeNull()
      expect(result.data).not.toBeNull()
      expect(result.data?.id).toBe(MOCK_RELATIONSHIP_ID)
      expect(result.data?.person_a?.first_name).toBe('Harish')
      expect(result.data?.person_b?.first_name).toBe('Anand')
    })

    it('rejects invalid relationship ID', async () => {
      const result = await getRelationship('bad-uuid')
      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('INVALID_ID')
    })

    it('handles not found error', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' },
      })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'relationships') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSingle }),
            }),
          } as never
        }
        return {} as never
      })

      const result = await getRelationship(MOCK_RELATIONSHIP_ID)
      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('PGRST116')
      expect(result.error?.message).toContain('not found')
    })
  })

  // =========================================================================
  // updateRelationship
  // =========================================================================
  describe('updateRelationship', () => {
    it('successfully updates notes on an active relationship', async () => {
      const updatedRow = {
        ...MOCK_RELATIONSHIP_ROW,
        notes: 'Updated biographical relationship note',
        updated_at: '2026-10-04T13:00:00Z',
      }

      const mockSingle = vi.fn().mockResolvedValue({
        data: updatedRow,
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockIs = vi.fn().mockReturnValue({ select: mockSelect })
      const mockEq = vi.fn().mockReturnValue({ is: mockIs })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)

      const result = await updateRelationship(
        MOCK_RELATIONSHIP_ID,
        { notes: 'Updated biographical relationship note' },
        MOCK_USER_ID
      )

      expect(result.error).toBeNull()
      expect(result.data?.notes).toBe('Updated biographical relationship note')
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'Updated biographical relationship note',
        })
      )
      expect(mockEq).toHaveBeenCalledWith('id', MOCK_RELATIONSHIP_ID)
      expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
    })

    it('rejects unauthenticated caller on update', async () => {
      const result = await updateRelationship(
        MOCK_RELATIONSHIP_ID,
        { notes: 'New notes' },
        'invalid-caller-id'
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('UNAUTHENTICATED')
    })

    it('rejects invalid relationship ID on update', async () => {
      const result = await updateRelationship(
        'not-a-uuid',
        { notes: 'New notes' },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('INVALID_ID')
    })
  })

  // =========================================================================
  // softDeleteRelationship
  // =========================================================================
  describe('softDeleteRelationship', () => {
    it('successfully soft deletes an active relationship without requesting select', async () => {
      const mockIs = vi.fn().mockResolvedValue({
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ is: mockIs })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)

      const result = await softDeleteRelationship(MOCK_RELATIONSHIP_ID, MOCK_USER_ID)

      expect(result.error).toBeNull()
      expect(result.data).toBeUndefined()
      expect(mockUpdate).toHaveBeenCalledWith({
        deleted_at: expect.any(String),
        updated_at: expect.any(String),
      })
      expect(mockEq).toHaveBeenCalledWith('id', MOCK_RELATIONSHIP_ID)
      expect(mockIs).toHaveBeenCalledWith('deleted_at', null)
    })

    it('ensures protected fields cannot be passed or modified through soft-delete path', async () => {
      const mockIs = vi.fn().mockResolvedValue({ error: null })
      const mockEq = vi.fn().mockReturnValue({ is: mockIs })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)

      await softDeleteRelationship(MOCK_RELATIONSHIP_ID, MOCK_USER_ID)

      // Strict verification: only deleted_at and updated_at are sent
      const updatePayload = mockUpdate.mock.calls[0][0]
      expect(Object.keys(updatePayload).sort()).toEqual(['deleted_at', 'updated_at'])
      expect(updatePayload).not.toHaveProperty('created_by')
      expect(updatePayload).not.toHaveProperty('verification_status')
      expect(updatePayload).not.toHaveProperty('person_a_id')
      expect(updatePayload).not.toHaveProperty('person_b_id')
      expect(updatePayload).not.toHaveProperty('relationship_type')
    })

    it('rejects unauthenticated caller on soft delete', async () => {
      const result = await softDeleteRelationship(MOCK_RELATIONSHIP_ID, 'bad-caller')
      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('UNAUTHENTICATED')
    })

    it('rejects invalid relationship ID on soft delete', async () => {
      const result = await softDeleteRelationship('bad-uuid', MOCK_USER_ID)
      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('INVALID_ID')
    })

    it('maps database error during soft delete correctly', async () => {
      const mockIs = vi.fn().mockResolvedValue({
        error: { code: '42501', message: 'permission denied' },
      })
      const mockEq = vi.fn().mockReturnValue({ is: mockIs })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)

      const result = await softDeleteRelationship(MOCK_RELATIONSHIP_ID, MOCK_USER_ID)
      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('42501')
      expect(result.error?.message).toContain('Permission denied')
    })
  })

  // -------------------------------------------------------------------------
  // canonicalizeRelationshipEndpoints
  // -------------------------------------------------------------------------
  describe('canonicalizeRelationshipEndpoints', () => {
    const smallerUuid = '11111111-1111-1111-1111-111111111111'
    const largerUuid = '22222222-2222-2222-2222-222222222222'

    it('orders personA < personB for symmetric SPOUSE relationship when given in reverse', () => {
      const result = canonicalizeRelationshipEndpoints(largerUuid, smallerUuid, 'SPOUSE')
      expect(result.person_a_id).toBe(smallerUuid)
      expect(result.person_b_id).toBe(largerUuid)
    })

    it('preserves order for symmetric SPOUSE relationship when already smaller < larger', () => {
      const result = canonicalizeRelationshipEndpoints(smallerUuid, largerUuid, 'SPOUSE')
      expect(result.person_a_id).toBe(smallerUuid)
      expect(result.person_b_id).toBe(largerUuid)
    })

    it('orders personA < personB for symmetric SIBLING relationship when given in reverse', () => {
      const result = canonicalizeRelationshipEndpoints(largerUuid, smallerUuid, 'SIBLING')
      expect(result.person_a_id).toBe(smallerUuid)
      expect(result.person_b_id).toBe(largerUuid)
    })

    it('preserves directed semantics for PARENT regardless of UUID ordering', () => {
      // Parent is larger UUID, child is smaller UUID
      const result1 = canonicalizeRelationshipEndpoints(largerUuid, smallerUuid, 'PARENT')
      expect(result1.person_a_id).toBe(largerUuid)
      expect(result1.person_b_id).toBe(smallerUuid)

      // Parent is smaller UUID, child is larger UUID
      const result2 = canonicalizeRelationshipEndpoints(smallerUuid, largerUuid, 'PARENT')
      expect(result2.person_a_id).toBe(smallerUuid)
      expect(result2.person_b_id).toBe(largerUuid)
    })
  })
})
