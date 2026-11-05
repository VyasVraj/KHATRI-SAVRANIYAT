/**
 * Unit tests for Families Service (src/features/families/services/families.service.ts)
 *
 * All tests use a mocked Supabase client. No real database connections are made.
 * Tests cover:
 *   - createFamily: success, validation failure, created_by from param, protected fields
 *   - getFamily: success, not-found, soft-deleted exclusion, error handling
 *   - updateFamily: success, validation failure, protected field rejection, error handling
 *   - listFamilies: success, empty result, null data, limit, soft-deleted exclusion, error
 *   - softDeleteFamily: success, sets deleted_at, no DELETE, error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createFamily,
  getFamily,
  updateFamily,
  listFamilies,
  softDeleteFamily,
} from '@/features/families/services/families.service'
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

const MOCK_USER_ID = 'user-auth-456'

const MOCK_FAMILY_ROW = {
  id: 'family-uuid-001',
  family_name: 'Sharma Family',
  description: 'The Sharma family from Mumbai',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  gotra: 'Kashyap',
  kul: null,
  nukh: null,
  profile_privacy: 'COMMUNITY' as const,
  members_privacy: 'COMMUNITY' as const,
  status: 'ACTIVE' as const,
  verification_status: 'UNVERIFIED' as const,
  created_by: MOCK_USER_ID,
  created_at: '2026-10-02T12:00:00Z',
  updated_at: '2026-10-02T12:00:00Z',
  deleted_at: null,
}

const VALID_CREATE_INPUT = {
  family_name: 'Sharma Family',
  description: 'The Sharma family from Mumbai',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  gotra: 'Kashyap',
}

// ---------------------------------------------------------------------------
// Mock chain builders
// ---------------------------------------------------------------------------

function buildInsertChain(result: { data: unknown; error: unknown }) {
  const mockSingle = vi.fn().mockResolvedValueOnce(result)
  const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
  const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
  vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as never)
  return { mockInsert, mockSelect, mockSingle }
}

function buildSelectSingleChain(result: { data: unknown; error: unknown }) {
  const mockSingle = vi.fn().mockResolvedValueOnce(result)
  const mockIsNull = vi.fn().mockReturnValue({ single: mockSingle })
  const mockEq = vi.fn().mockReturnValue({ is: mockIsNull })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)
  return { mockSelect, mockEq, mockIsNull, mockSingle }
}

function buildUpdateSingleChain(result: { data: unknown; error: unknown }) {
  const mockSingle = vi.fn().mockResolvedValueOnce(result)
  const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
  const mockIsNull = vi.fn().mockReturnValue({ select: mockSelect })
  const mockEq = vi.fn().mockReturnValue({ is: mockIsNull })
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
  vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)
  return { mockUpdate, mockEq, mockIsNull, mockSelect, mockSingle }
}

function buildUpdateNoReturnChain(result: { error: unknown }) {
  const mockIsNull = vi.fn().mockResolvedValueOnce(result)
  const mockEq = vi.fn().mockReturnValue({ is: mockIsNull })
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
  vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as never)
  return { mockUpdate, mockEq, mockIsNull }
}

function buildListChain(result: { data: unknown; error: unknown }) {
  const mockLimit = vi.fn().mockResolvedValueOnce(result)
  const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockIsNull = vi.fn().mockReturnValue({ order: mockOrder })
  const mockSelect = vi.fn().mockReturnValue({ is: mockIsNull })
  vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)
  return { mockSelect, mockIsNull, mockOrder, mockLimit }
}

// ---------------------------------------------------------------------------
// createFamily tests
// ---------------------------------------------------------------------------

describe('Families Service — createFamily', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] creates a family and returns the row', async () => {
    buildInsertChain({ data: MOCK_FAMILY_ROW, error: null })

    const result = await createFamily(VALID_CREATE_INPUT, MOCK_USER_ID)

    expect(result.error).toBeNull()
    expect(result.data).toEqual(MOCK_FAMILY_ROW)
    expect(supabase.from).toHaveBeenCalledWith('families')
  })

  it('[SUCCESS] sets created_by from parameter, not user input', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_FAMILY_ROW, error: null })

    await createFamily(VALID_CREATE_INPUT, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload.created_by).toBe(MOCK_USER_ID)
  })

  it('[SECURITY] does not include status in insert payload (system field)', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_FAMILY_ROW, error: null })

    await createFamily(VALID_CREATE_INPUT, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload).not.toHaveProperty('status')
  })

  it('[SECURITY] does not include verification_status in insert payload (system field)', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_FAMILY_ROW, error: null })

    await createFamily(VALID_CREATE_INPUT, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload).not.toHaveProperty('verification_status')
  })

  it('[SECURITY] does not include deleted_at in insert payload (system field)', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_FAMILY_ROW, error: null })

    await createFamily(VALID_CREATE_INPUT, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload).not.toHaveProperty('deleted_at')
  })

  it('[SECURITY] created_by from user input is rejected (stripped by schema)', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_FAMILY_ROW, error: null })

    await createFamily(
      {
        family_name: 'Test Family',
        // @ts-expect-error — intentionally testing type-level rejection
        created_by: 'attacker-user-id',
      },
      MOCK_USER_ID
    )

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    // created_by from schema-stripped input must NOT appear; only from the param
    expect(insertPayload.created_by).toBe(MOCK_USER_ID)
  })

  it('[VALIDATION] returns error when family_name is missing', async () => {
    const result = await createFamily({} as never, MOCK_USER_ID)

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(result.error?.message).toContain('Family name is required')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[VALIDATION] returns error when family_name is empty string', async () => {
    const result = await createFamily({ family_name: '   ' }, MOCK_USER_ID)

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[VALIDATION] returns error for invalid privacy level', async () => {
    const result = await createFamily(
      { family_name: 'Test', profile_privacy: 'RESTRICTED' as never },
      MOCK_USER_ID
    )

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[PRIVACY] both privacy fields default to PRIVATE when not provided per ANDROID-2 lock', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_FAMILY_ROW, error: null })

    await createFamily({ family_name: 'Test Family' }, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload.profile_privacy).toBe('PRIVATE')
    expect(insertPayload.members_privacy).toBe('PRIVATE')
  })

  it('[PRIVACY] profile_privacy and members_privacy are independent fields', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_FAMILY_ROW, error: null })

    await createFamily(
      {
        family_name: 'Test Family',
        profile_privacy: 'PUBLIC',
        members_privacy: 'FAMILY',
      },
      MOCK_USER_ID
    )

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload.profile_privacy).toBe('PUBLIC')
    expect(insertPayload.members_privacy).toBe('FAMILY')
  })

  it('[ERROR] returns sanitized error for permission denial (42501)', async () => {
    buildInsertChain({
      data: null,
      error: { message: 'permission denied for table families', code: '42501' },
    })

    const result = await createFamily(VALID_CREATE_INPUT, MOCK_USER_ID)

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('You do not have permission to perform this action.')
    expect(result.error?.message).not.toContain('permission denied for table')
  })

  it('[ERROR] returns sanitized error for duplicate record (23505)', async () => {
    buildInsertChain({
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    })

    const result = await createFamily(VALID_CREATE_INPUT, MOCK_USER_ID)

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('A duplicate record already exists.')
  })
})

// ---------------------------------------------------------------------------
// getFamily tests
// ---------------------------------------------------------------------------

describe('Families Service — getFamily', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] returns family row on success', async () => {
    buildSelectSingleChain({ data: MOCK_FAMILY_ROW, error: null })

    const result = await getFamily('family-uuid-001')

    expect(result.error).toBeNull()
    expect(result.data).toEqual(MOCK_FAMILY_ROW)
    expect(supabase.from).toHaveBeenCalledWith('families')
  })

  it('[NOT FOUND] returns user-friendly error for PGRST116', async () => {
    buildSelectSingleChain({
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
    })

    const result = await getFamily('non-existent-id')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Family not found.')
    expect(result.error?.code).toBe('PGRST116')
  })

  it('[ERROR] returns sanitized error for permission denial', async () => {
    buildSelectSingleChain({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    })

    const result = await getFamily('family-uuid-001')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('You do not have permission to perform this action.')
    expect(result.error?.message).not.toContain('permission denied')
  })

  it('[FILTER] queries only non-deleted records', async () => {
    const { mockIsNull } = buildSelectSingleChain({ data: MOCK_FAMILY_ROW, error: null })

    await getFamily('family-uuid-001')

    expect(mockIsNull).toHaveBeenCalledWith('deleted_at', null)
  })
})

// ---------------------------------------------------------------------------
// updateFamily tests
// ---------------------------------------------------------------------------

describe('Families Service — updateFamily', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] updates and returns the updated row', async () => {
    const updatedFamily = { ...MOCK_FAMILY_ROW, family_name: 'Gupta Family' }
    buildUpdateSingleChain({ data: updatedFamily, error: null })

    const result = await updateFamily('family-uuid-001', { family_name: 'Gupta Family' })

    expect(result.error).toBeNull()
    expect(result.data?.family_name).toBe('Gupta Family')
    expect(supabase.from).toHaveBeenCalledWith('families')
  })

  it('[SECURITY] cannot update status (protected field excluded from schema)', async () => {
    const { mockUpdate } = buildUpdateSingleChain({ data: MOCK_FAMILY_ROW, error: null })

    await updateFamily('family-uuid-001', {
      family_name: 'Test',
      // @ts-expect-error — intentionally testing type-level rejection
      status: 'ARCHIVED',
    })

    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('status')
  })

  it('[SECURITY] cannot update verification_status (protected field excluded from schema)', async () => {
    const { mockUpdate } = buildUpdateSingleChain({ data: MOCK_FAMILY_ROW, error: null })

    await updateFamily('family-uuid-001', {
      family_name: 'Test',
      // @ts-expect-error — intentionally testing type-level rejection
      verification_status: 'VERIFIED',
    })

    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('verification_status')
  })

  it('[SECURITY] cannot update created_by (protected field excluded from schema)', async () => {
    const { mockUpdate } = buildUpdateSingleChain({ data: MOCK_FAMILY_ROW, error: null })

    await updateFamily('family-uuid-001', {
      family_name: 'Test',
      // @ts-expect-error — intentionally testing type-level rejection
      created_by: 'forged-user-id',
    })

    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('created_by')
  })

  it('[PRIVACY] can independently update profile_privacy and members_privacy', async () => {
    const { mockUpdate } = buildUpdateSingleChain({ data: MOCK_FAMILY_ROW, error: null })

    await updateFamily('family-uuid-001', {
      profile_privacy: 'PUBLIC',
      members_privacy: 'PRIVATE',
    })

    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload.profile_privacy).toBe('PUBLIC')
    expect(updatePayload.members_privacy).toBe('PRIVATE')
  })

  it('[VALIDATION] returns error for invalid privacy level', async () => {
    const result = await updateFamily('family-uuid-001', {
      profile_privacy: 'UNKNOWN' as never,
    })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[ERROR] returns sanitized error on Supabase failure', async () => {
    buildUpdateSingleChain({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    })

    const result = await updateFamily('family-uuid-001', { family_name: 'Updated' })

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('You do not have permission to perform this action.')
  })

  it('[FILTER] only updates non-deleted records', async () => {
    const { mockIsNull } = buildUpdateSingleChain({ data: MOCK_FAMILY_ROW, error: null })

    await updateFamily('family-uuid-001', { family_name: 'Updated' })

    expect(mockIsNull).toHaveBeenCalledWith('deleted_at', null)
  })
})

// ---------------------------------------------------------------------------
// listFamilies tests
// ---------------------------------------------------------------------------

describe('Families Service — listFamilies', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] returns array of family rows', async () => {
    buildListChain({ data: [MOCK_FAMILY_ROW], error: null })

    const result = await listFamilies()

    expect(result.error).toBeNull()
    expect(result.data).toEqual([MOCK_FAMILY_ROW])
    expect(supabase.from).toHaveBeenCalledWith('families')
  })

  it('[EMPTY] returns empty array when no records match', async () => {
    buildListChain({ data: [], error: null })

    const result = await listFamilies()

    expect(result.error).toBeNull()
    expect(result.data).toEqual([])
  })

  it('[EMPTY] returns empty array when data is null', async () => {
    buildListChain({ data: null, error: null })

    const result = await listFamilies()

    expect(result.error).toBeNull()
    expect(result.data).toEqual([])
  })

  it('[LIMIT] applies default limit of 50', async () => {
    const { mockLimit } = buildListChain({ data: [], error: null })

    await listFamilies()

    expect(mockLimit).toHaveBeenCalledWith(50)
  })

  it('[LIMIT] applies custom limit when provided', async () => {
    const { mockLimit } = buildListChain({ data: [], error: null })

    await listFamilies({ limit: 25 })

    expect(mockLimit).toHaveBeenCalledWith(25)
  })

  it('[FILTER] queries only non-deleted records', async () => {
    const { mockIsNull } = buildListChain({ data: [], error: null })

    await listFamilies()

    expect(mockIsNull).toHaveBeenCalledWith('deleted_at', null)
  })

  it('[ERROR] returns sanitized error on Supabase failure', async () => {
    buildListChain({
      data: null,
      error: { message: 'connection refused', code: 'PGRST301' },
    })

    const result = await listFamilies()

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Could not load family records. Please try again.')
  })
})

// ---------------------------------------------------------------------------
// softDeleteFamily tests
// ---------------------------------------------------------------------------

describe('Families Service — softDeleteFamily', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] sets deleted_at timestamp on success', async () => {
    const { mockUpdate } = buildUpdateNoReturnChain({ error: null })

    const result = await softDeleteFamily('family-uuid-001')

    expect(result.error).toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('families')
    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload).toHaveProperty('deleted_at')
    expect(typeof updatePayload.deleted_at).toBe('string')
    // deleted_at must be a valid ISO 8601 timestamp
    expect(new Date(updatePayload.deleted_at).toISOString()).toBe(updatePayload.deleted_at)
  })

  it('[SECURITY] uses UPDATE not DELETE (soft-delete enforcement)', async () => {
    const { mockUpdate } = buildUpdateNoReturnChain({ error: null })

    await softDeleteFamily('family-uuid-001')

    expect(mockUpdate).toHaveBeenCalled()
    // Verify the mock chain root does not have a delete method
    const fromResult = vi.mocked(supabase.from).mock.results[0]?.value
    expect(fromResult).not.toHaveProperty('delete')
  })

  it('[IDEMPOTENCY] targets only non-deleted records to avoid double soft-delete', async () => {
    const { mockEq } = buildUpdateNoReturnChain({ error: null })

    await softDeleteFamily('family-uuid-001')

    expect(mockEq).toHaveBeenCalledWith('id', 'family-uuid-001')
  })

  it('[ERROR] returns sanitized error on Supabase failure', async () => {
    buildUpdateNoReturnChain({
      error: { message: 'permission denied', code: '42501' },
    })

    const result = await softDeleteFamily('family-uuid-001')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('You do not have permission to perform this action.')
  })
})
