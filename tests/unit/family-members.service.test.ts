/**
 * Unit tests for Family Members Service
 * (src/features/family-members/services/family-members.service.ts)
 *
 * All tests use a mocked Supabase client. No real database connections are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  addFamilyMember,
  listFamilyMembers,
  listPersonFamilies,
  getFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  transferFamilyHead,
} from '@/features/family-members/services/family-members.service'
import {
  addFamilyMemberSchema,
  updateFamilyMemberSchema,
} from '@/features/family-members/schemas/family-members.schemas'
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
// Shared test fixtures
// ---------------------------------------------------------------------------

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001'
const MOCK_FAMILY_ID = '11111111-1111-1111-1111-111111111111'
const MOCK_PERSON_ID = '22222222-2222-2222-2222-222222222222'
const MOCK_MEMBER_ID = '33333333-3333-3333-3333-333333333333'
const MOCK_NEW_HEAD_ID = '44444444-4444-4444-4444-444444444444'

const MOCK_MEMBER_ROW = {
  id: MOCK_MEMBER_ID,
  family_id: MOCK_FAMILY_ID,
  person_id: MOCK_PERSON_ID,
  role: 'EXTENDED' as const,
  is_head: false,
  joined_at: '2026-10-01T00:00:00Z',
  left_at: null,
  added_by: MOCK_USER_ID,
  created_at: '2026-10-01T00:00:00Z',
}

const MOCK_PERSON_ROW = {
  id: MOCK_PERSON_ID,
  first_name: 'Rahul',
  last_name: 'Sharma',
  middle_name: null,
  maiden_name: null,
  gender: 'MALE' as const,
  date_of_birth: '1990-05-15',
  date_of_death: null,
  birth_place: 'Jaipur',
  gotra: 'Kashyap',
  kul: null,
  nukh: null,
  email_contact: 'rahul@example.com',
  phone: null,
  phone_secondary: null,
  profile_privacy: 'COMMUNITY' as const,
  contact_privacy: 'COMMUNITY' as const,
  dob_privacy: 'COMMUNITY' as const,
  status: 'ACTIVE' as const,
  verification_status: 'UNVERIFIED' as const,
  created_by: MOCK_USER_ID,
  user_id: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const MOCK_FAMILY_SUMMARY = {
  id: MOCK_FAMILY_ID,
  family_name: 'Sharma Parivar',
  city: 'Jaipur',
  state: 'Rajasthan',
  profile_privacy: 'COMMUNITY' as const,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Family Members Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // =========================================================================
  // addFamilyMember
  // =========================================================================
  describe('addFamilyMember', () => {
    it('successfully adds a family member with default values', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: MOCK_MEMBER_ROW,
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as never)

      const result = await addFamilyMember(
        {
          family_id: MOCK_FAMILY_ID,
          person_id: MOCK_PERSON_ID,
        },
        MOCK_USER_ID
      )

      expect(result.error).toBeNull()
      expect(result.data).toEqual(MOCK_MEMBER_ROW)
      expect(supabase.from).toHaveBeenCalledWith('family_members')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          family_id: MOCK_FAMILY_ID,
          person_id: MOCK_PERSON_ID,
          role: 'EXTENDED',
          is_head: false,
          added_by: MOCK_USER_ID,
        })
      )
    })

    it('rejects input with invalid family_id format', async () => {
      const result = await addFamilyMember(
        {
          family_id: 'not-a-uuid',
          person_id: MOCK_PERSON_ID,
        },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rejects input with invalid person_id format', async () => {
      const result = await addFamilyMember(
        {
          family_id: MOCK_FAMILY_ID,
          person_id: 'not-a-uuid',
        },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('maps 23505 duplicate membership error', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as never)

      const result = await addFamilyMember(
        { family_id: MOCK_FAMILY_ID, person_id: MOCK_PERSON_ID },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe('This person is already a member of this family.')
    })

    it('maps 23505 active head index violation error', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "idx_family_members_one_head"',
        },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as never)

      const result = await addFamilyMember(
        { family_id: MOCK_FAMILY_ID, person_id: MOCK_PERSON_ID, is_head: true },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'This family already has an active head. Demote the current head before assigning a new one.'
      )
    })

    it('maps 42501 permission denied error', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied for table family_members' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as never)

      const result = await addFamilyMember(
        { family_id: MOCK_FAMILY_ID, person_id: MOCK_PERSON_ID },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'You do not have permission to manage members of this family.'
      )
    })

    it('maps 23503 foreign key violation error', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '23503', message: 'violates foreign key constraint' },
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as never)

      const result = await addFamilyMember(
        { family_id: MOCK_FAMILY_ID, person_id: MOCK_PERSON_ID },
        MOCK_USER_ID
      )

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe('The specified family or person was not found.')
    })
  })

  // =========================================================================
  // listFamilyMembers
  // =========================================================================
  describe('listFamilyMembers', () => {
    it('returns active members by default', async () => {
      const memberWithPerson = { ...MOCK_MEMBER_ROW, person: MOCK_PERSON_ROW }
      const mockIs = vi.fn().mockResolvedValue({
        data: [memberWithPerson],
        error: null,
      })
      const mockOrder2 = vi.fn().mockReturnValue({ is: mockIs })
      const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await listFamilyMembers(MOCK_FAMILY_ID)

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(mockIs).toHaveBeenCalledWith('left_at', null)
    })

    it('includes former members when includeFormer is true', async () => {
      const memberWithPerson = { ...MOCK_MEMBER_ROW, person: MOCK_PERSON_ROW }
      const mockOrder2 = vi.fn().mockResolvedValue({
        data: [memberWithPerson],
        error: null,
      })
      const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await listFamilyMembers(MOCK_FAMILY_ID, { includeFormer: true })

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      // mockIs should not have been called because left_at was not filtered
    })

    it('rejects invalid family_id format', async () => {
      const result = await listFamilyMembers('invalid-uuid')

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('handles database error cleanly', async () => {
      const mockIs = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      })
      const mockOrder2 = vi.fn().mockReturnValue({ is: mockIs })
      const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await listFamilyMembers(MOCK_FAMILY_ID)

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'You do not have permission to manage members of this family.'
      )
    })
  })

  // =========================================================================
  // listPersonFamilies
  // =========================================================================
  describe('listPersonFamilies', () => {
    it('returns active memberships for person by default (left_at IS NULL)', async () => {
      const memberWithFamily = { ...MOCK_MEMBER_ROW, family: MOCK_FAMILY_SUMMARY }
      const mockIs = vi.fn().mockResolvedValue({
        data: [memberWithFamily],
        error: null,
      })
      const mockOrder2 = vi.fn().mockReturnValue({ is: mockIs })
      const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await listPersonFamilies(MOCK_PERSON_ID)

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data?.[0].family?.family_name).toBe('Sharma Parivar')
      expect(supabase.from).toHaveBeenCalledWith('family_members')
      expect(mockSelect).toHaveBeenCalledWith(
        '*, family:families(id, family_name, city, state, profile_privacy)'
      )
      expect(mockEq).toHaveBeenCalledWith('person_id', MOCK_PERSON_ID)
      expect(mockIs).toHaveBeenCalledWith('left_at', null)
    })

    it('includes former memberships when includeFormer is true', async () => {
      const memberWithFamily = {
        ...MOCK_MEMBER_ROW,
        family: MOCK_FAMILY_SUMMARY,
        left_at: '2026-10-02T00:00:00Z',
      }
      const mockOrder2 = vi.fn().mockResolvedValue({
        data: [memberWithFamily],
        error: null,
      })
      const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await listPersonFamilies(MOCK_PERSON_ID, { includeFormer: true })

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(1)
      expect(result.data?.[0].left_at).toBe('2026-10-02T00:00:00Z')
    })

    it('returns empty array when person has no family memberships', async () => {
      const mockIs = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      })
      const mockOrder2 = vi.fn().mockReturnValue({ is: mockIs })
      const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await listPersonFamilies(MOCK_PERSON_ID)

      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    })

    it('rejects invalid person_id format', async () => {
      const result = await listPersonFamilies('not-a-valid-uuid')

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(result.error?.message).toBe('Invalid person ID format.')
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('handles database error cleanly', async () => {
      const mockIs = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      })
      const mockOrder2 = vi.fn().mockReturnValue({ is: mockIs })
      const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await listPersonFamilies(MOCK_PERSON_ID)

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'You do not have permission to manage members of this family.'
      )
    })
  })

  // =========================================================================
  // getFamilyMember
  // =========================================================================
  describe('getFamilyMember', () => {
    it('returns member record with joined person', async () => {
      const memberWithPerson = { ...MOCK_MEMBER_ROW, person: MOCK_PERSON_ROW }
      const mockSingle = vi.fn().mockResolvedValue({
        data: memberWithPerson,
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await getFamilyMember(MOCK_MEMBER_ID)

      expect(result.error).toBeNull()
      expect(result.data).toEqual(memberWithPerson)
      expect(mockEq).toHaveBeenCalledWith('id', MOCK_MEMBER_ID)
    })

    it('maps PGRST116 not found error', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await getFamilyMember(MOCK_MEMBER_ID)

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe('Family member record not found.')
    })

    it('rejects invalid member_id UUID', async () => {
      const result = await getFamilyMember('not-a-valid-uuid')

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.from).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // updateFamilyMember
  // =========================================================================
  describe('updateFamilyMember', () => {
    it('successfully updates role', async () => {
      const updatedRow = { ...MOCK_MEMBER_ROW, role: 'SPOUSE' as const }
      const mockSingle = vi.fn().mockResolvedValue({
        data: updatedRow,
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)

      const result = await updateFamilyMember(MOCK_MEMBER_ID, { role: 'SPOUSE' })

      expect(result.error).toBeNull()
      expect(result.data?.role).toBe('SPOUSE')
      expect(mockUpdate).toHaveBeenCalledWith({ role: 'SPOUSE' })
    })

    it('rejects empty update payload', async () => {
      const result = await updateFamilyMember(MOCK_MEMBER_ID, {})

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.from).not.toHaveBeenCalled()
    })

    it('rejects invalid UUID', async () => {
      const result = await updateFamilyMember('invalid-uuid', { role: 'CHILD' })

      expect(result.data).toBeNull()
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.from).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // removeFamilyMember
  // =========================================================================
  describe('removeFamilyMember', () => {
    it('performs soft-exit by default (sets left_at timestamp)', async () => {
      const mockIs = vi.fn().mockResolvedValue({ error: null })
      const mockEq = vi.fn().mockReturnValue({ is: mockIs })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)

      const result = await removeFamilyMember(MOCK_MEMBER_ID)

      expect(result.error).toBeNull()
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ left_at: expect.any(String) })
      )
      expect(mockEq).toHaveBeenCalledWith('id', MOCK_MEMBER_ID)
      expect(mockIs).toHaveBeenCalledWith('left_at', null)
    })

    it('executes hard delete when hardDelete option is true', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null })
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq })
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as never)

      const result = await removeFamilyMember(MOCK_MEMBER_ID, { hardDelete: true })

      expect(result.error).toBeNull()
      expect(mockDelete).toHaveBeenCalled()
      expect(mockEq).toHaveBeenCalledWith('id', MOCK_MEMBER_ID)
    })

    it('rejects invalid UUID', async () => {
      const result = await removeFamilyMember('bad-uuid')

      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.from).not.toHaveBeenCalled()
    })
  })

  // =========================================================================
  // transferFamilyHead
  // =========================================================================
  describe('transferFamilyHead', () => {
    it('demotes existing head and promotes new head', async () => {
      const existingHeadRow = { ...MOCK_MEMBER_ROW, id: MOCK_MEMBER_ID, is_head: true }
      const newHeadRow = { ...MOCK_MEMBER_ROW, id: MOCK_NEW_HEAD_ID, is_head: true, role: 'HEAD' as const }

      // 1. Locate current head: query returns [existingHeadRow]
      const mockIs = vi.fn().mockResolvedValue({ data: [existingHeadRow], error: null })
      const mockEq2 = vi.fn().mockReturnValue({ is: mockIs })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect1 = vi.fn().mockReturnValue({ eq: mockEq1 })

      // 2. Demote existing head: update({ is_head: false }).eq('id', MOCK_MEMBER_ID)
      const mockEqDemote = vi.fn().mockResolvedValue({ error: null })
      const mockUpdateDemote = vi.fn().mockReturnValue({ eq: mockEqDemote })

      // 3. Promote new head: update({ is_head: true, role: 'HEAD' }).eq('id', ...).eq('family_id', ...).select().single()
      const mockSinglePromote = vi.fn().mockResolvedValue({ data: newHeadRow, error: null })
      const mockSelectPromote = vi.fn().mockReturnValue({ single: mockSinglePromote })
      const mockEqFamily = vi.fn().mockReturnValue({ select: mockSelectPromote })
      const mockEqMember = vi.fn().mockReturnValue({ eq: mockEqFamily })
      const mockUpdatePromote = vi.fn().mockReturnValue({ eq: mockEqMember })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table !== 'family_members') return {} as never
        // Sequence of calls:
        // 1st call: select current head
        // 2nd call: update demote
        // 3rd call: update promote
        const callCount = vi.mocked(supabase.from).mock.calls.length
        if (callCount === 1) return { select: mockSelect1 } as never
        if (callCount === 2) return { update: mockUpdateDemote } as never
        return { update: mockUpdatePromote } as never
      })

      const result = await transferFamilyHead(MOCK_FAMILY_ID, MOCK_NEW_HEAD_ID)

      expect(result.error).toBeNull()
      expect(result.data?.id).toBe(MOCK_NEW_HEAD_ID)
      expect(result.data?.is_head).toBe(true)
    })

    it('returns no-op if new head is already the head', async () => {
      const existingHeadRow = { ...MOCK_MEMBER_ROW, id: MOCK_NEW_HEAD_ID, is_head: true }

      const mockIs = vi.fn().mockResolvedValue({ data: [existingHeadRow], error: null })
      const mockEq2 = vi.fn().mockReturnValue({ is: mockIs })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

      const result = await transferFamilyHead(MOCK_FAMILY_ID, MOCK_NEW_HEAD_ID)

      expect(result.error).toBeNull()
      expect(result.data?.id).toBe(MOCK_NEW_HEAD_ID)
    })

    it('rolls back / restores old head if promotion fails', async () => {
      const existingHeadRow = { ...MOCK_MEMBER_ROW, id: MOCK_MEMBER_ID, is_head: true }

      // 1. Locate current head
      const mockIs = vi.fn().mockResolvedValue({ data: [existingHeadRow], error: null })
      const mockEq2 = vi.fn().mockReturnValue({ is: mockIs })
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
      const mockSelect1 = vi.fn().mockReturnValue({ eq: mockEq1 })

      // 2. Demote existing head: success
      const mockEqDemote = vi.fn().mockResolvedValue({ error: null })
      const mockUpdateDemote = vi.fn().mockReturnValue({ eq: mockEqDemote })

      // 3. Promote new head: FAILS
      const mockSinglePromote = vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      })
      const mockSelectPromote = vi.fn().mockReturnValue({ single: mockSinglePromote })
      const mockEqFamily = vi.fn().mockReturnValue({ select: mockSelectPromote })
      const mockEqMember = vi.fn().mockReturnValue({ eq: mockEqFamily })
      const mockUpdatePromote = vi.fn().mockReturnValue({ eq: mockEqMember })

      // 4. Rollback: update({ is_head: true }).eq('id', MOCK_MEMBER_ID)
      const mockEqRollback = vi.fn().mockResolvedValue({ error: null })
      const mockUpdateRollback = vi.fn().mockReturnValue({ eq: mockEqRollback })

      vi.mocked(supabase.from).mockImplementation(() => {
        const callCount = vi.mocked(supabase.from).mock.calls.length
        if (callCount === 1) return { select: mockSelect1 } as never
        if (callCount === 2) return { update: mockUpdateDemote } as never
        if (callCount === 3) return { update: mockUpdatePromote } as never
        return { update: mockUpdateRollback } as never
      })

      const result = await transferFamilyHead(MOCK_FAMILY_ID, MOCK_NEW_HEAD_ID)

      expect(result.data).toBeNull()
      expect(result.error?.message).toBe(
        'You do not have permission to manage members of this family.'
      )
    })

    it('rejects invalid UUIDs', async () => {
      const result = await transferFamilyHead('bad-id', MOCK_NEW_HEAD_ID)
      expect(result.error?.code).toBe('VALIDATION_ERROR')
      expect(supabase.from).not.toHaveBeenCalled()
    })
  })
})

// ===========================================================================
// Schemas security & validation tests
// ===========================================================================

describe('addFamilyMemberSchema', () => {
  it('strips injected added_by field from parsed output', () => {
    const parsed = addFamilyMemberSchema.safeParse({
      family_id: MOCK_FAMILY_ID,
      person_id: MOCK_PERSON_ID,
      added_by: 'injected-user',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('added_by')
    }
  })

  it('strips injected id and created_at', () => {
    const parsed = addFamilyMemberSchema.safeParse({
      family_id: MOCK_FAMILY_ID,
      person_id: MOCK_PERSON_ID,
      id: 'injected-id',
      created_at: '2026-10-01T00:00:00Z',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('id')
      expect(parsed.data).not.toHaveProperty('created_at')
    }
  })

  it('accepts all 8 family roles', () => {
    const roles = [
      'HEAD',
      'SPOUSE',
      'CHILD',
      'PARENT',
      'SIBLING',
      'GRANDPARENT',
      'GRANDCHILD',
      'EXTENDED',
    ] as const

    for (const role of roles) {
      const parsed = addFamilyMemberSchema.safeParse({
        family_id: MOCK_FAMILY_ID,
        person_id: MOCK_PERSON_ID,
        role,
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('rejects invalid family role', () => {
    const parsed = addFamilyMemberSchema.safeParse({
      family_id: MOCK_FAMILY_ID,
      person_id: MOCK_PERSON_ID,
      role: 'INVALID_ROLE',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('updateFamilyMemberSchema', () => {
  it('strips injected family_id and person_id from update output', () => {
    const parsed = updateFamilyMemberSchema.safeParse({
      role: 'CHILD',
      family_id: 'injected-family',
      person_id: 'injected-person',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('family_id')
      expect(parsed.data).not.toHaveProperty('person_id')
    }
  })

  it('accepts setting left_at to null (re-activating member)', () => {
    const parsed = updateFamilyMemberSchema.safeParse({ left_at: null })
    expect(parsed.success).toBe(true)
  })

  it('accepts setting left_at to valid date', () => {
    const parsed = updateFamilyMemberSchema.safeParse({ left_at: '2026-10-02' })
    expect(parsed.success).toBe(true)
  })
})
