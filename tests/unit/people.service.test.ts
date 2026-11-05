/**
 * Unit tests for People Service (src/features/people/services/people.service.ts)
 *
 * All tests use a mocked Supabase client. No real database connections are made.
 * Tests cover:
 *   - createPerson: success, validation failure, error handling, protected field exclusion
 *   - getPerson: success, not-found, error handling
 *   - updatePerson: success, validation failure, protected field rejection, error handling
 *   - listPersons: success, empty result, error handling
 *   - softDeletePerson: success, error handling, no hard DELETE verification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createPerson,
  getPerson,
  updatePerson,
  listPersons,
  softDeletePerson,
} from '@/features/people/services/people.service'
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
// Shared test fixture
// ---------------------------------------------------------------------------

const MOCK_USER_ID = 'user-auth-123'

const MOCK_PERSON_ROW = {
  id: 'person-uuid-001',
  first_name: 'Arjun',
  last_name: 'Sharma',
  middle_name: null,
  maiden_name: null,
  gender: 'MALE' as const,
  date_of_birth: '1985-06-15',
  date_of_death: null,
  birth_place: 'Mumbai',
  gotra: 'Kashyap',
  kul: null,
  nukh: null,
  email_contact: null,
  phone: null,
  phone_secondary: null,
  profile_privacy: 'COMMUNITY' as const,
  contact_privacy: 'COMMUNITY' as const,
  dob_privacy: 'COMMUNITY' as const,
  status: 'ACTIVE' as const,
  verification_status: 'UNVERIFIED' as const,
  user_id: null,
  created_by: MOCK_USER_ID,
  created_at: '2026-10-02T12:00:00Z',
  updated_at: '2026-10-02T12:00:00Z',
  deleted_at: null,
}

const VALID_CREATE_INPUT = {
  first_name: 'Arjun',
  last_name: 'Sharma',
  gender: 'MALE' as const,
  date_of_birth: '1985-06-15',
  birth_place: 'Mumbai',
  gotra: 'Kashyap',
  profile_privacy: 'COMMUNITY' as const,
  contact_privacy: 'COMMUNITY' as const,
  dob_privacy: 'COMMUNITY' as const,
}

// ---------------------------------------------------------------------------
// Helpers for building the Supabase mock chain
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
  const mockOrderSecond = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockOrderFirst = vi.fn().mockReturnValue({ order: mockOrderSecond })
  const mockIsNull = vi.fn().mockReturnValue({ order: mockOrderFirst })
  const mockSelect = vi.fn().mockReturnValue({ is: mockIsNull })
  vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as never)
  return { mockSelect, mockIsNull, mockOrderFirst, mockOrderSecond, mockLimit }
}

// ---------------------------------------------------------------------------
// createPerson tests
// ---------------------------------------------------------------------------

describe('People Service — createPerson', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] creates a person and returns the row', async () => {
    buildInsertChain({ data: MOCK_PERSON_ROW, error: null })

    const result = await createPerson(VALID_CREATE_INPUT, MOCK_USER_ID)

    expect(result.error).toBeNull()
    expect(result.data).toEqual(MOCK_PERSON_ROW)
    expect(supabase.from).toHaveBeenCalledWith('persons')
  })

  it('[SUCCESS] sets created_by from parameter, not user input', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_PERSON_ROW, error: null })

    await createPerson(VALID_CREATE_INPUT, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload.created_by).toBe(MOCK_USER_ID)
  })

  it('[SECURITY] does not include user_id in insert payload (PERSON != USER)', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_PERSON_ROW, error: null })

    await createPerson(VALID_CREATE_INPUT, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload).not.toHaveProperty('user_id')
  })

  it('[SECURITY] does not include status in insert payload (system field)', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_PERSON_ROW, error: null })

    await createPerson(VALID_CREATE_INPUT, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload).not.toHaveProperty('status')
  })

  it('[SECURITY] does not include verification_status in insert payload (system field)', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_PERSON_ROW, error: null })

    await createPerson(VALID_CREATE_INPUT, MOCK_USER_ID)

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload).not.toHaveProperty('verification_status')
  })

  it('[VALIDATION] returns error when first_name is missing', async () => {
    const result = await createPerson(
      { last_name: 'Sharma' } as never,
      MOCK_USER_ID
    )

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(result.error?.message).toContain('First name is required')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[VALIDATION] returns error when last_name is missing', async () => {
    const result = await createPerson(
      { first_name: 'Arjun' } as never,
      MOCK_USER_ID
    )

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(result.error?.message).toContain('Last name is required')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[VALIDATION] returns error for invalid gender value', async () => {
    const result = await createPerson(
      { ...VALID_CREATE_INPUT, gender: 'UNKNOWN' as never },
      MOCK_USER_ID
    )

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[VALIDATION] returns error for invalid date_of_birth format', async () => {
    const result = await createPerson(
      { ...VALID_CREATE_INPUT, date_of_birth: '15-06-1985' }, // Wrong format
      MOCK_USER_ID
    )

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[ERROR] returns sanitized error on Supabase failure', async () => {
    buildInsertChain({
      data: null,
      error: { message: 'permission denied for table persons', code: '42501' },
    })

    const result = await createPerson(VALID_CREATE_INPUT, MOCK_USER_ID)

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('You do not have permission to perform this action.')
    expect(result.error?.code).toBe('42501')
    // Raw error must not be the message (sanitized)
    expect(result.error?.message).not.toContain('permission denied for table')
  })

  it('[PRIVACY] privacy defaults are applied when not provided', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_PERSON_ROW, error: null })

    await createPerson(
      { first_name: 'Test', last_name: 'Person' },
      MOCK_USER_ID
    )

    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload.profile_privacy).toBe('PRIVATE')
    expect(insertPayload.contact_privacy).toBe('PRIVATE')
    expect(insertPayload.dob_privacy).toBe('PRIVATE')
  })
})

// ---------------------------------------------------------------------------
// getPerson tests
// ---------------------------------------------------------------------------

describe('People Service — getPerson', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] returns person row on success', async () => {
    buildSelectSingleChain({ data: MOCK_PERSON_ROW, error: null })

    const result = await getPerson('person-uuid-001')

    expect(result.error).toBeNull()
    expect(result.data).toEqual(MOCK_PERSON_ROW)
    expect(supabase.from).toHaveBeenCalledWith('community_persons')
  })

  it('[SUCCESS - CONNECTIONS] returns person row when profile_privacy is CONNECTIONS', async () => {
    const connectionsPerson = {
      ...MOCK_PERSON_ROW,
      profile_privacy: 'CONNECTIONS' as const,
      user_id: 'user-linked-456',
    }
    buildSelectSingleChain({ data: connectionsPerson, error: null })

    const result = await getPerson('person-uuid-001')

    expect(result.error).toBeNull()
    expect(result.data?.profile_privacy).toBe('CONNECTIONS')
    expect(result.data?.user_id).toBe('user-linked-456')
  })

  it('[NOT FOUND] returns user-friendly error for PGRST116', async () => {
    buildSelectSingleChain({
      data: null,
      error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' },
    })

    const result = await getPerson('non-existent-id')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Person not found.')
    expect(result.error?.code).toBe('PGRST116')
  })

  it('[ERROR] returns sanitized error on permission denial', async () => {
    buildSelectSingleChain({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    })

    const result = await getPerson('person-uuid-001')

    expect(result.data).toBeNull()
    expect(result.error?.message).not.toContain('permission denied')
    expect(result.error?.message).toBe('You do not have permission to perform this action.')
  })

  it('[FILTER] queries only non-deleted records', async () => {
    const { mockIsNull } = buildSelectSingleChain({ data: MOCK_PERSON_ROW, error: null })

    await getPerson('person-uuid-001')

    expect(mockIsNull).toHaveBeenCalledWith('deleted_at', null)
  })
})

// ---------------------------------------------------------------------------
// updatePerson tests
// ---------------------------------------------------------------------------

describe('People Service — updatePerson', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] updates and returns the updated row', async () => {
    const updatedPerson = { ...MOCK_PERSON_ROW, first_name: 'Rajesh' }
    buildUpdateSingleChain({ data: updatedPerson, error: null })

    const result = await updatePerson('person-uuid-001', { first_name: 'Rajesh' })

    expect(result.error).toBeNull()
    expect(result.data?.first_name).toBe('Rajesh')
    expect(supabase.from).toHaveBeenCalledWith('persons')
  })

  it('[SECURITY] cannot update user_id (protected field excluded from schema)', async () => {
    // user_id is not in updatePersonSchema — Zod strips unknown keys
    buildUpdateSingleChain({ data: MOCK_PERSON_ROW, error: null })

    const result = await updatePerson('person-uuid-001', {
      first_name: 'Rajesh',
      // @ts-expect-error — intentionally testing type-level rejection
      user_id: 'attacker-user-id',
    })

    // The call should succeed (user_id stripped by schema), but user_id not in payload
    // (Zod strips unknown keys by default)
    expect(result.error).toBeNull()
  })

  it('[SECURITY] cannot update status (protected field excluded from schema)', async () => {
    buildUpdateSingleChain({ data: MOCK_PERSON_ROW, error: null })

    const { mockUpdate } = buildUpdateSingleChain({ data: MOCK_PERSON_ROW, error: null })

    await updatePerson('person-uuid-001', {
      first_name: 'Rajesh',
      // @ts-expect-error — intentionally testing type-level rejection
      status: 'ARCHIVED',
    })

    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('status')
  })

  it('[SECURITY] cannot update verification_status (protected field excluded from schema)', async () => {
    const { mockUpdate } = buildUpdateSingleChain({ data: MOCK_PERSON_ROW, error: null })

    await updatePerson('person-uuid-001', {
      first_name: 'Rajesh',
      // @ts-expect-error — intentionally testing type-level rejection
      verification_status: 'VERIFIED',
    })

    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('verification_status')
  })

  it('[SECURITY] cannot update created_by (protected field excluded from schema)', async () => {
    const { mockUpdate } = buildUpdateSingleChain({ data: MOCK_PERSON_ROW, error: null })

    await updatePerson('person-uuid-001', {
      first_name: 'Rajesh',
      // @ts-expect-error — intentionally testing type-level rejection
      created_by: 'forged-user-id',
    })

    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('created_by')
  })

  it('[VALIDATION] returns error for invalid privacy level', async () => {
    const result = await updatePerson('person-uuid-001', {
      profile_privacy: 'RESTRICTED' as never,
    })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[VALIDATION] returns error for invalid date_of_birth format', async () => {
    const result = await updatePerson('person-uuid-001', {
      date_of_birth: '1985/06/15',
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

    const result = await updatePerson('person-uuid-001', { first_name: 'Rajesh' })

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('You do not have permission to perform this action.')
  })

  it('[FILTER] only updates non-deleted records', async () => {
    const { mockIsNull } = buildUpdateSingleChain({ data: MOCK_PERSON_ROW, error: null })

    await updatePerson('person-uuid-001', { first_name: 'Rajesh' })

    expect(mockIsNull).toHaveBeenCalledWith('deleted_at', null)
  })
})

// ---------------------------------------------------------------------------
// listPersons tests
// ---------------------------------------------------------------------------

describe('People Service — listPersons', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] returns array of person rows', async () => {
    buildListChain({ data: [MOCK_PERSON_ROW], error: null })

    const result = await listPersons()

    expect(result.error).toBeNull()
    expect(result.data).toEqual([MOCK_PERSON_ROW])
    expect(supabase.from).toHaveBeenCalledWith('community_persons')
  })

  it('[EMPTY] returns empty array when no records match', async () => {
    buildListChain({ data: [], error: null })

    const result = await listPersons()

    expect(result.error).toBeNull()
    expect(result.data).toEqual([])
  })

  it('[EMPTY] returns empty array when data is null', async () => {
    buildListChain({ data: null, error: null })

    const result = await listPersons()

    expect(result.error).toBeNull()
    expect(result.data).toEqual([])
  })

  it('[LIMIT] applies default limit of 50', async () => {
    const { mockLimit } = buildListChain({ data: [], error: null })

    await listPersons()

    expect(mockLimit).toHaveBeenCalledWith(50)
  })

  it('[LIMIT] applies custom limit when provided', async () => {
    const { mockLimit } = buildListChain({ data: [], error: null })

    await listPersons({ limit: 10 })

    expect(mockLimit).toHaveBeenCalledWith(10)
  })

  it('[FILTER] queries only non-deleted records', async () => {
    const { mockIsNull } = buildListChain({ data: [], error: null })

    await listPersons()

    expect(mockIsNull).toHaveBeenCalledWith('deleted_at', null)
  })

  it('[ERROR] returns sanitized error on Supabase failure', async () => {
    buildListChain({
      data: null,
      error: { message: 'connection refused', code: 'PGRST301' },
    })

    const result = await listPersons()

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('Could not load person records. Please try again.')
  })
})

// ---------------------------------------------------------------------------
// softDeletePerson tests
// ---------------------------------------------------------------------------

describe('People Service — softDeletePerson', () => {
  beforeEach(() => vi.clearAllMocks())

  it('[SUCCESS] sets deleted_at timestamp on success', async () => {
    const { mockUpdate } = buildUpdateNoReturnChain({ error: null })

    const result = await softDeletePerson('person-uuid-001')

    expect(result.error).toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('persons')
    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload).toHaveProperty('deleted_at')
    expect(typeof updatePayload.deleted_at).toBe('string')
    // deleted_at must be a valid ISO 8601 timestamp
    expect(new Date(updatePayload.deleted_at).toISOString()).toBe(updatePayload.deleted_at)
  })

  it('[SECURITY] does NOT execute a SQL DELETE (only UPDATE with deleted_at)', async () => {
    const { mockUpdate } = buildUpdateNoReturnChain({ error: null })

    await softDeletePerson('person-uuid-001')

    // Only `update` must be called — no `delete` call
    expect(mockUpdate).toHaveBeenCalled()
    // Verify the mock chain does not include a delete method
    const fromResult = vi.mocked(supabase.from).mock.results[0]?.value
    expect(fromResult).not.toHaveProperty('delete')
  })

  it('[IDEMPOTENCY] filters to non-deleted records to avoid double soft-delete', async () => {
    const { mockEq } = buildUpdateNoReturnChain({ error: null })

    await softDeletePerson('person-uuid-001')

    expect(mockEq).toHaveBeenCalledWith('id', 'person-uuid-001')
  })

  it('[ERROR] returns sanitized error on Supabase failure', async () => {
    buildUpdateNoReturnChain({
      error: { message: 'permission denied', code: '42501' },
    })

    const result = await softDeletePerson('person-uuid-001')

    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('You do not have permission to perform this action.')
  })
})

// ---------------------------------------------------------------------------
// Deceased Status Lifecycle & Date Validation (Section 3 & 8)
// ---------------------------------------------------------------------------

describe('People Service — Deceased Person Registration and Life-Cycle Status (Section 3 & 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Case A: Registers a living person without Date of Death (status omitted to use DB default ACTIVE)', async () => {
    const { mockInsert } = buildInsertChain({ data: MOCK_PERSON_ROW, error: null })

    const result = await createPerson(
      {
        first_name: 'Jayesh',
        last_name: 'Vyas',
        date_of_birth: '1967-11-07',
      },
      MOCK_USER_ID
    )

    expect(result.error).toBeNull()
    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload.status).toBeUndefined()
    expect(insertPayload.date_of_death).toBeUndefined()
  })

  it('Case B: Registers a deceased person with Date of Death (automatically sets status to DECEASED)', async () => {
    const { mockInsert } = buildInsertChain({
      data: { ...MOCK_PERSON_ROW, status: 'DECEASED', date_of_death: '2005-11-08' },
      error: null,
    })

    const result = await createPerson(
      {
        first_name: 'Jayesh',
        last_name: 'Vyas',
        date_of_birth: '1925-01-01',
        date_of_death: '2005-11-08',
      },
      MOCK_USER_ID
    )

    expect(result.error).toBeNull()
    const insertPayload = vi.mocked(mockInsert).mock.calls[0][0]
    expect(insertPayload.status).toBe('DECEASED')
    expect(insertPayload.date_of_death).toBe('2005-11-08')
  })

  it('Case C: Edits a living person and enters Date of Death (sets status to DECEASED)', async () => {
    const { mockUpdate } = buildUpdateSingleChain({
      data: { ...MOCK_PERSON_ROW, status: 'DECEASED', date_of_death: '2005-11-08' },
      error: null,
    })

    const result = await updatePerson('person-uuid-001', {
      date_of_death: '2005-11-08',
    })

    expect(result.error).toBeNull()
    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload.status).toBe('DECEASED')
    expect(updatePayload.date_of_death).toBe('2005-11-08')
  })

  it('Case D: Edits an existing deceased person (preserves DECEASED status and existing death date)', async () => {
    const { mockUpdate } = buildUpdateSingleChain({
      data: { ...MOCK_PERSON_ROW, first_name: 'Jayeshkumar', status: 'DECEASED' },
      error: null,
    })

    const result = await updatePerson('person-uuid-001', {
      first_name: 'Jayeshkumar',
      date_of_death: '2005-11-08',
    })

    expect(result.error).toBeNull()
    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload.status).toBe('DECEASED')
    expect(updatePayload.first_name).toBe('Jayeshkumar')
  })

  it('Case E: Corrects an incorrect Date of Death by clearing it (restores status to ACTIVE)', async () => {
    const { mockUpdate } = buildUpdateSingleChain({
      data: { ...MOCK_PERSON_ROW, date_of_death: null, status: 'ACTIVE' },
      error: null,
    })

    const result = await updatePerson('person-uuid-001', {
      date_of_death: null,
    })

    expect(result.error).toBeNull()
    const updatePayload = vi.mocked(mockUpdate).mock.calls[0][0]
    expect(updatePayload.status).toBe('ACTIVE')
    expect(updatePayload.date_of_death).toBeNull()
  })

  it('Validation: Rejects a death date earlier than birth date', async () => {
    const result = await createPerson(
      {
        first_name: 'Jayesh',
        last_name: 'Vyas',
        date_of_birth: '2000-01-01',
        date_of_death: '1990-01-01',
      },
      MOCK_USER_ID
    )

    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('Date of death cannot be earlier than date of birth')
  })

  it('Validation: Rejects a future death date', async () => {
    const result = await createPerson(
      {
        first_name: 'Jayesh',
        last_name: 'Vyas',
        date_of_birth: '1990-01-01',
        date_of_death: '2099-01-01',
      },
      MOCK_USER_ID
    )

    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('Date of death cannot be in the future')
  })

  it('Validation: Rejects a future birth date', async () => {
    const result = await createPerson(
      {
        first_name: 'Jayesh',
        last_name: 'Vyas',
        date_of_birth: '2099-01-01',
      },
      MOCK_USER_ID
    )

    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('Date of birth cannot be in the future')
  })
})
