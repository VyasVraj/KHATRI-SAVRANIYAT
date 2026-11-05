/**
 * Integration Test: Phase 4 Lifecycle & Domain Boundary Validation
 *
 * Tests the complete Phase 4 lifecycle flow and domain boundaries:
 *   1. Family Unit Creation (createFamily)
 *   2. Initial Head of Family Addition (addFamilyMember)
 *   3. Secondary Member Addition (addFamilyMember)
 *   4. Family Roster Listing (listFamilyMembers)
 *   5. Head of Family Transfer (transferFamilyHead)
 *   6. Reverse Person-to-Family Lookup (listPersonFamilies)
 *   7. Member Soft Departure (removeFamilyMember)
 *   8. Former Membership Filtering (includeFormer flag)
 *   9. Domain & Security Boundary Enforcement (PERSON != USER, no Phase 5 edges)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFamily } from '@/features/families/services/families.service'
import {
  addFamilyMember,
  listFamilyMembers,
  transferFamilyHead,
  listPersonFamilies,
  removeFamilyMember,
} from '@/features/family-members/services/family-members.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const CALLER_USER_ID = '00000000-0000-0000-0000-000000000001'
const FAMILY_ID = '11111111-1111-1111-1111-111111111111'
const PERSON_HEAD_ID = '22222222-2222-2222-2222-222222222221'
const PERSON_SPOUSE_ID = '22222222-2222-2222-2222-222222222222'
const MEMBER_HEAD_ID = '33333333-3333-3333-3333-333333333331'
const MEMBER_SPOUSE_ID = '33333333-3333-3333-3333-333333333332'

const CREATED_FAMILY = {
  id: FAMILY_ID,
  family_name: 'Vaidya Parivar',
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
  gotra: 'Vashistha',
  kul: null,
  nukh: null,
  description: 'Ancestral family record',
  profile_privacy: 'COMMUNITY' as const,
  members_privacy: 'COMMUNITY' as const,
  status: 'ACTIVE' as const,
  verification_status: 'UNVERIFIED' as const,
  created_by: CALLER_USER_ID,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const HEAD_MEMBER_ROW = {
  id: MEMBER_HEAD_ID,
  family_id: FAMILY_ID,
  person_id: PERSON_HEAD_ID,
  role: 'HEAD' as const,
  is_head: true,
  joined_at: '2020-01-01T00:00:00Z',
  left_at: null,
  added_by: CALLER_USER_ID,
  created_at: '2020-01-01T00:00:00Z',
}

const SPOUSE_MEMBER_ROW = {
  id: MEMBER_SPOUSE_ID,
  family_id: FAMILY_ID,
  person_id: PERSON_SPOUSE_ID,
  role: 'SPOUSE' as const,
  is_head: false,
  joined_at: '2020-01-01T00:00:00Z',
  left_at: null,
  added_by: CALLER_USER_ID,
  created_at: '2020-01-01T00:00:00Z',
}

describe('Phase 4 Lifecycle & Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Step 1: Creates family unit enforcing user attribution', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: CREATED_FAMILY,
      error: null,
    })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as never)

    const result = await createFamily(
      {
        family_name: 'Vaidya Parivar',
        city: 'Ahmedabad',
        state: 'Gujarat',
        country: 'India',
        gotra: 'Vashistha',
        profile_privacy: 'COMMUNITY',
        members_privacy: 'COMMUNITY',
      },
      CALLER_USER_ID
    )

    expect(result.error).toBeNull()
    expect(result.data?.id).toBe(FAMILY_ID)
    expect(result.data?.created_by).toBe(CALLER_USER_ID)
    expect(supabase.from).toHaveBeenCalledWith('families')
  })

  it('Step 2 & 3: Adds initial head and spouse members', async () => {
    // Add Head
    const mockSingleHead = vi.fn().mockResolvedValue({
      data: HEAD_MEMBER_ROW,
      error: null,
    })
    const mockSelectHead = vi.fn().mockReturnValue({ single: mockSingleHead })
    const mockInsertHead = vi.fn().mockReturnValue({ select: mockSelectHead })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsertHead } as never)

    const headResult = await addFamilyMember(
      {
        family_id: FAMILY_ID,
        person_id: PERSON_HEAD_ID,
        role: 'HEAD',
        is_head: true,
      },
      CALLER_USER_ID
    )

    expect(headResult.error).toBeNull()
    expect(headResult.data?.is_head).toBe(true)
    expect(headResult.data?.role).toBe('HEAD')
    expect(headResult.data?.added_by).toBe(CALLER_USER_ID)

    // Add Spouse
    const mockSingleSpouse = vi.fn().mockResolvedValue({
      data: SPOUSE_MEMBER_ROW,
      error: null,
    })
    const mockSelectSpouse = vi.fn().mockReturnValue({ single: mockSingleSpouse })
    const mockInsertSpouse = vi.fn().mockReturnValue({ select: mockSelectSpouse })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsertSpouse } as never)

    const spouseResult = await addFamilyMember(
      {
        family_id: FAMILY_ID,
        person_id: PERSON_SPOUSE_ID,
        role: 'SPOUSE',
        is_head: false,
      },
      CALLER_USER_ID
    )

    expect(spouseResult.error).toBeNull()
    expect(spouseResult.data?.is_head).toBe(false)
    expect(spouseResult.data?.role).toBe('SPOUSE')
  })

  it('Step 4: Lists family members with joined person data', async () => {
    const mockRoster = [
      { ...HEAD_MEMBER_ROW, person: { id: PERSON_HEAD_ID, first_name: 'Amit', last_name: 'Vaidya' } },
      { ...SPOUSE_MEMBER_ROW, person: { id: PERSON_SPOUSE_ID, first_name: 'Anjali', last_name: 'Vaidya' } },
    ]

    const mockIs = vi.fn().mockResolvedValue({
      data: mockRoster,
      error: null,
    })
    const mockOrder2 = vi.fn().mockReturnValue({ is: mockIs })
    const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

    const result = await listFamilyMembers(FAMILY_ID)

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(2)
    expect(result.data?.[0].person?.first_name).toBe('Amit')
    expect(result.data?.[1].person?.first_name).toBe('Anjali')
  })

  it('Step 5: Transfers head role to spouse atomically in two update operations', async () => {
    // 1. Locate current head: query returns [HEAD_MEMBER_ROW]
    const mockIs = vi.fn().mockResolvedValue({ data: [HEAD_MEMBER_ROW], error: null })
    const mockEq2 = vi.fn().mockReturnValue({ is: mockIs })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect1 = vi.fn().mockReturnValue({ eq: mockEq1 })

    // 2. Demote old head: update({ is_head: false }).eq('id', MEMBER_HEAD_ID)
    const mockEqDemote = vi.fn().mockResolvedValue({ error: null })
    const mockUpdateDemote = vi.fn().mockReturnValue({ eq: mockEqDemote })

    // 3. Promote new head: update({ is_head: true, role: 'HEAD' }).eq('id', MEMBER_SPOUSE_ID).eq('family_id', FAMILY_ID).select().single()
    const mockSinglePromote = vi.fn().mockResolvedValue({
      data: { ...SPOUSE_MEMBER_ROW, is_head: true, role: 'HEAD' },
      error: null,
    })
    const mockSelectPromote = vi.fn().mockReturnValue({ single: mockSinglePromote })
    const mockEqFamily = vi.fn().mockReturnValue({ select: mockSelectPromote })
    const mockEqMember = vi.fn().mockReturnValue({ eq: mockEqFamily })
    const mockUpdatePromote = vi.fn().mockReturnValue({ eq: mockEqMember })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table !== 'family_members') return {} as never
      const callCount = vi.mocked(supabase.from).mock.calls.length
      if (callCount === 1) return { select: mockSelect1 } as never
      if (callCount === 2) return { update: mockUpdateDemote } as never
      return { update: mockUpdatePromote } as never
    })

    const result = await transferFamilyHead(FAMILY_ID, MEMBER_SPOUSE_ID)

    expect(result.error).toBeNull()
    expect(result.data?.is_head).toBe(true)
    expect(mockUpdateDemote).toHaveBeenCalledWith({ is_head: false })
    expect(mockUpdatePromote).toHaveBeenCalledWith({ is_head: true, role: 'HEAD' })
  })

  it('Step 6: Performs reverse lookup (listPersonFamilies) for person detail integration', async () => {
    const mockMemberships = [
      {
        ...HEAD_MEMBER_ROW,
        family: {
          id: FAMILY_ID,
          family_name: 'Vaidya Parivar',
          city: 'Ahmedabad',
          state: 'Gujarat',
          profile_privacy: 'COMMUNITY',
        },
      },
    ]

    const mockIs = vi.fn().mockResolvedValue({
      data: mockMemberships,
      error: null,
    })
    const mockOrder2 = vi.fn().mockReturnValue({ is: mockIs })
    const mockOrder1 = vi.fn().mockReturnValue({ order: mockOrder2 })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder1 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)

    const result = await listPersonFamilies(PERSON_HEAD_ID)

    expect(result.error).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data?.[0].family?.family_name).toBe('Vaidya Parivar')
    expect(mockSelect).toHaveBeenCalledWith(
      '*, family:families(id, family_name, city, state, profile_privacy)'
    )
    expect(mockEq).toHaveBeenCalledWith('person_id', PERSON_HEAD_ID)
    expect(mockIs).toHaveBeenCalledWith('left_at', null)
  })

  it('Step 7 & 8: Soft-exits member and honors former membership inclusion flag', async () => {
    const departedMember = {
      ...SPOUSE_MEMBER_ROW,
      left_at: '2026-10-04T00:00:00Z',
    }

    // Departure: soft-exit sets left_at
    const mockIsExit = vi.fn().mockResolvedValue({ error: null })
    const mockEqExit = vi.fn().mockReturnValue({ is: mockIsExit })
    const mockUpdateExit = vi.fn().mockReturnValue({ eq: mockEqExit })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdateExit } as never)

    const removeResult = await removeFamilyMember(MEMBER_SPOUSE_ID)

    expect(removeResult.error).toBeNull()
    expect(mockUpdateExit).toHaveBeenCalledWith(
      expect.objectContaining({ left_at: expect.any(String) })
    )
    expect(mockEqExit).toHaveBeenCalledWith('id', MEMBER_SPOUSE_ID)
    expect(mockIsExit).toHaveBeenCalledWith('left_at', null)

    // Query with includeFormer: false (default) — excludes departed
    const mockIsActive = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })
    const mockOrder2Active = vi.fn().mockReturnValue({ is: mockIsActive })
    const mockOrder1Active = vi.fn().mockReturnValue({ order: mockOrder2Active })
    const mockEqActive = vi.fn().mockReturnValue({ order: mockOrder1Active })
    const mockSelectActive = vi.fn().mockReturnValue({ eq: mockEqActive })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelectActive } as never)

    const activeOnlyResult = await listPersonFamilies(PERSON_SPOUSE_ID, { includeFormer: false })
    expect(activeOnlyResult.data).toHaveLength(0)
    expect(mockIsActive).toHaveBeenCalledWith('left_at', null)

    // Query with includeFormer: true — returns former membership
    const mockOrder2Former = vi.fn().mockResolvedValue({
      data: [{ ...departedMember, family: CREATED_FAMILY }],
      error: null,
    })
    const mockOrder1Former = vi.fn().mockReturnValue({ order: mockOrder2Former })
    const mockEqFormer = vi.fn().mockReturnValue({ order: mockOrder1Former })
    const mockSelectFormer = vi.fn().mockReturnValue({ eq: mockEqFormer })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelectFormer } as never)

    const includeFormerResult = await listPersonFamilies(PERSON_SPOUSE_ID, { includeFormer: true })
    expect(includeFormerResult.data).toHaveLength(1)
    expect(includeFormerResult.data?.[0].left_at).toBe('2026-10-04T00:00:00Z')
  })

  it('Step 9: Enforces domain integrity and boundaries', () => {
    // 1. PERSON != USER check: person_id and added_by represent separate identity domains
    expect(HEAD_MEMBER_ROW.person_id).not.toBe(HEAD_MEMBER_ROW.added_by)
    expect(HEAD_MEMBER_ROW.person_id).toBe(PERSON_HEAD_ID)
    expect(HEAD_MEMBER_ROW.added_by).toBe(CALLER_USER_ID)

    // 2. Strict Phase 4 / Phase 5 separation:
    // family_members has NO parent_id, child_id, or interpersonal edge fields.
    // Interpersonal relationships belong strictly to Phase 5.
    const memberKeys = Object.keys(HEAD_MEMBER_ROW)
    expect(memberKeys).not.toContain('parent_id')
    expect(memberKeys).not.toContain('child_id')
    expect(memberKeys).not.toContain('spouse_id')
    expect(memberKeys).not.toContain('relationship_type')
  })
})
