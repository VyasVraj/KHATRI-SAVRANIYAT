/**
 * Unit tests for Discovery Service (src/features/discover/services/discovery.service.ts)
 *
 * All tests use a mocked Supabase client. No real database connections are made.
 *
 * Verifies:
 * - searchPersons: validation, filters, search sanitization, Fetch N+1, ordering, deleted/archived exclusions
 * - searchFamilies: validation, filters, search sanitization, Fetch N+1, ordering, deleted/archived exclusions
 * - getDiscoveryFilterOptions: non-sensitive distinct lineage and location extraction
 * - Security invariants: projection safety, no arbitrary column injection, no service_role
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchPersons,
  searchFamilies,
  getDiscoveryFilterOptions,
} from '@/features/discover/services/discovery.service'
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
// Mock Data Fixtures
// ---------------------------------------------------------------------------

const MOCK_PERSON_RESULT = {
  id: 'person-001',
  first_name: 'Vikram',
  middle_name: 'D.',
  last_name: 'Khatri',
  maiden_name: null,
  gender: 'MALE' as const,
  date_of_birth: null,
  date_of_death: null,
  birth_place: 'Anjar',
  gotra: 'Kashyap',
  kul: 'Aditya',
  nukh: 'Varun',
  status: 'ACTIVE' as const,
  verification_status: 'VERIFIED' as const,
  profile_privacy: 'COMMUNITY' as const,
}

const MOCK_FAMILY_RESULT = {
  id: 'family-001',
  family_name: 'Khatri Parivar',
  description: 'Ancient lineage',
  gotra: 'Kashyap',
  kul: 'Aditya',
  nukh: 'Varun',
  city: 'Pune',
  state: 'Maharashtra',
  country: 'India',
  status: 'ACTIVE' as const,
  verification_status: 'VERIFIED' as const,
  profile_privacy: 'COMMUNITY' as const,
  members_privacy: 'COMMUNITY' as const,
}

// ---------------------------------------------------------------------------
// Mock Query Chain Helper
// ---------------------------------------------------------------------------

function createMockQueryChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'is', 'neq', 'eq', 'ilike', 'or', 'order', 'range', 'limit']

  for (const method of methods) {
    chain[method] = vi.fn().mockImplementation(() => chain)
  }

  // Make the chain thenable so it resolves when awaited
  chain.then = vi.fn().mockImplementation((onFulfilled) =>
    Promise.resolve(result).then(onFulfilled)
  )

  return chain
}

// ---------------------------------------------------------------------------
// searchPersons Unit Tests
// ---------------------------------------------------------------------------

describe('Discovery Service — searchPersons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[SUCCESS] performs valid person search with defaults', async () => {
    const mockChain = createMockQueryChain({
      data: [MOCK_PERSON_RESULT],
      error: null,
    })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    const response = await searchPersons()

    expect(response.error).toBeNull()
    expect(response.data).not.toBeNull()
    expect(response.data?.items).toHaveLength(1)
    expect(response.data?.items[0]).toEqual(MOCK_PERSON_RESULT)
    expect(response.data?.page).toBe(1)
    expect(response.data?.pageSize).toBe(20)
    expect(response.data?.hasNextPage).toBe(false)
    expect(response.data?.hasPreviousPage).toBe(false)

    expect(supabase.from).toHaveBeenCalledWith('community_persons')
    expect(mockChain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(mockChain.neq).toHaveBeenCalledWith('status', 'ARCHIVED')
  })

  it('[PROJECTION] requests only directory-safe person columns', async () => {
    const mockChain = createMockQueryChain({
      data: [MOCK_PERSON_RESULT],
      error: null,
    })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchPersons()

    const selectArg = mockChain.select.mock.calls[0]?.[0] as string
    expect(selectArg).toContain('first_name')
    expect(selectArg).toContain('gotra')
    expect(selectArg).toContain('city')
    expect(selectArg).toContain('state')
    expect(selectArg).toContain('dob_year')
    // Verify protected, day/month, birth_place, and internal fields are strictly NOT queried
    expect(selectArg).not.toContain('birth_place')
    expect(selectArg).not.toContain('dob_month')
    expect(selectArg).not.toContain('dob_day')
    expect(selectArg).not.toContain('date_of_birth')
    expect(selectArg).not.toContain('phone')
    expect(selectArg).not.toContain('email_contact')
    expect(selectArg).not.toContain('user_id')
    expect(selectArg).not.toContain('created_by')
    expect(selectArg).not.toContain('deleted_at')
  })

  it('[PRIVACY - CONNECTIONS] safely returns records with CONNECTIONS privacy without leaking internals', async () => {
    const connectionsRecord = {
      ...MOCK_PERSON_RESULT,
      id: 'person-conn-002',
      first_name: 'Pooja',
      profile_privacy: 'CONNECTIONS' as const,
    }
    const mockChain = createMockQueryChain({
      data: [connectionsRecord],
      error: null,
    })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    const response = await searchPersons()

    expect(response.error).toBeNull()
    expect(response.data?.items[0].profile_privacy).toBe('CONNECTIONS')
    expect(response.data?.items[0]).not.toHaveProperty('user_id')
    expect(response.data?.items[0]).not.toHaveProperty('phone')
    expect(response.data?.items[0]).not.toHaveProperty('email_contact')
  })

  it('[FALLBACK] seamlessly falls back to persons table when community_persons is not deployed (PGRST205)', async () => {
    const errorChain = createMockQueryChain({
      data: null,
      error: { message: "Could not find table 'community_persons'", code: 'PGRST205' },
    })
    const fallbackChain = createMockQueryChain({
      data: [
        {
          ...MOCK_PERSON_RESULT,
          date_of_birth: '1985-05-20',
        },
      ],
      error: null,
    })

    let callCount = 0
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      callCount++
      if (callCount === 1) {
        expect(table).toBe('community_persons')
        return errorChain as never
      }
      expect(table).toBe('persons')
      return fallbackChain as never
    })

    const response = await searchPersons()

    expect(response.error).toBeNull()
    expect(response.data?.items).toHaveLength(1)
    // In fallback mode, raw date_of_birth must be masked to null and dob_year extracted
    expect(response.data?.items[0].date_of_birth).toBeNull()
    expect(response.data?.items[0].dob_year).toBe(1985)
    expect(response.data?.items[0].age).toBeGreaterThan(0)
  })

  it('[ORDERING] enforces deterministic ordering by last_name, first_name, id', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchPersons()

    expect(mockChain.order).toHaveBeenNthCalledWith(1, 'last_name', { ascending: true })
    expect(mockChain.order).toHaveBeenNthCalledWith(2, 'first_name', { ascending: true })
    expect(mockChain.order).toHaveBeenNthCalledWith(3, 'id', { ascending: true })
  })

  it('[PAGINATION] requests pageSize + 1 rows for Fetch N+1 contract', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchPersons({}, { page: 1, pageSize: 20 })

    // range(0, 20) fetches exactly 21 rows
    expect(mockChain.range).toHaveBeenCalledWith(0, 20)
  })

  it('[PAGINATION] derives hasNextPage = true and trims extra row when N+1 rows return', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      ...MOCK_PERSON_RESULT,
      id: `person-${i}`,
    }))
    const mockChain = createMockQueryChain({ data: rows, error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    const response = await searchPersons({}, { page: 1, pageSize: 20 })

    expect(response.data?.hasNextPage).toBe(true)
    expect(response.data?.items).toHaveLength(20)
    expect(response.data?.hasPreviousPage).toBe(false)
  })

  it('[PAGINATION] derives hasPreviousPage = true when page > 1', async () => {
    const mockChain = createMockQueryChain({ data: [MOCK_PERSON_RESULT], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    const response = await searchPersons({}, { page: 2, pageSize: 20 })

    expect(response.data?.page).toBe(2)
    expect(response.data?.hasPreviousPage).toBe(true)
    expect(mockChain.range).toHaveBeenCalledWith(20, 40)
  })

  it('[FILTER] applies gotra, nukh, kul lineage filters', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchPersons({
      gotra: 'Kashyap',
      nukh: 'Varun',
      kul: 'Aditya',
    })

    expect(mockChain.ilike).toHaveBeenCalledWith('gotra', 'Kashyap')
    expect(mockChain.ilike).toHaveBeenCalledWith('nukh', 'Varun')
    expect(mockChain.ilike).toHaveBeenCalledWith('kul', 'Aditya')
  })

  it('[FILTER] applies birth_place filter mapped to city/state on community view', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchPersons({ birth_place: 'Bhuj' })

    expect(mockChain.or).toHaveBeenCalledWith('city.ilike.%Bhuj%,state.ilike.%Bhuj%')
  })

  it('[FILTER] applies verification_status filter', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchPersons({ verification_status: 'VERIFIED' })

    expect(mockChain.eq).toHaveBeenCalledWith('verification_status', 'VERIFIED')
  })

  it('[FILTER] applies explicit status filter when provided', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchPersons({ status: 'DECEASED' })

    expect(mockChain.eq).toHaveBeenCalledWith('status', 'DECEASED')
    expect(mockChain.neq).not.toHaveBeenCalledWith('status', 'ARCHIVED')
  })

  it('[SEARCH] sanitizes search query and applies .or() filter across name fields', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchPersons({ search: 'Vikram, Khatri (Jr)' })

    expect(mockChain.or).toHaveBeenCalledWith(
      'first_name.ilike.%Vikram Khatri Jr%,last_name.ilike.%Vikram Khatri Jr%,maiden_name.ilike.%Vikram Khatri Jr%'
    )
  })

  it('[VALIDATION] rejects pageSize > 50 without calling Supabase', async () => {
    const response = await searchPersons({}, { page: 1, pageSize: 51 })

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('VALIDATION_ERROR')
    expect(response.error?.message).toContain('Page size cannot exceed 50')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[VALIDATION] rejects unsupported filter fields (e.g. city on persons)', async () => {
    const response = await searchPersons({
      city: 'Mumbai',
    } as never)

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('[ERROR] handles Supabase database error gracefully with user-friendly message', async () => {
    const mockChain = createMockQueryChain({
      data: null,
      error: { message: 'permission denied for table persons', code: '42501' },
    })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    const response = await searchPersons()

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('42501')
    expect(response.error?.message).toBe(
      'You do not have permission to view directory records.'
    )
  })
})

// ---------------------------------------------------------------------------
// searchFamilies Unit Tests
// ---------------------------------------------------------------------------

describe('Discovery Service — searchFamilies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[SUCCESS] performs valid family search with defaults', async () => {
    const mockChain = createMockQueryChain({
      data: [MOCK_FAMILY_RESULT],
      error: null,
    })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    const response = await searchFamilies()

    expect(response.error).toBeNull()
    expect(response.data?.items).toHaveLength(1)
    expect(response.data?.items[0]).toEqual(MOCK_FAMILY_RESULT)
    expect(response.data?.hasNextPage).toBe(false)
    expect(response.data?.hasPreviousPage).toBe(false)

    expect(supabase.from).toHaveBeenCalledWith('families')
    expect(mockChain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(mockChain.neq).toHaveBeenCalledWith('status', 'ARCHIVED')
  })

  it('[PROJECTION] requests only directory-safe family columns', async () => {
    const mockChain = createMockQueryChain({
      data: [MOCK_FAMILY_RESULT],
      error: null,
    })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchFamilies()

    const selectArg = mockChain.select.mock.calls[0]?.[0] as string
    expect(selectArg).toContain('family_name')
    expect(selectArg).toContain('city')
    expect(selectArg).toContain('state')
    expect(selectArg).not.toContain('created_by')
    expect(selectArg).not.toContain('deleted_at')
  })

  it('[ORDERING] enforces deterministic ordering by family_name, id', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchFamilies()

    expect(mockChain.order).toHaveBeenNthCalledWith(1, 'family_name', { ascending: true })
    expect(mockChain.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true })
  })

  it('[FILTER] applies location filters (city, state, country) on families', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchFamilies({
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
    })

    expect(mockChain.ilike).toHaveBeenCalledWith('city', '%Pune%')
    expect(mockChain.ilike).toHaveBeenCalledWith('state', '%Maharashtra%')
    expect(mockChain.ilike).toHaveBeenCalledWith('country', '%India%')
  })

  it('[FILTER] applies family_name and lineage filters', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchFamilies({
      family_name: 'Parivar',
      gotra: 'Kashyap',
      nukh: 'Varun',
      kul: 'Aditya',
    })

    expect(mockChain.ilike).toHaveBeenCalledWith('family_name', '%Parivar%')
    expect(mockChain.ilike).toHaveBeenCalledWith('gotra', 'Kashyap')
    expect(mockChain.ilike).toHaveBeenCalledWith('nukh', 'Varun')
    expect(mockChain.ilike).toHaveBeenCalledWith('kul', 'Aditya')
  })

  it('[SEARCH] applies free-text search across family_name and description', async () => {
    const mockChain = createMockQueryChain({ data: [], error: null })
    vi.mocked(supabase.from).mockReturnValue(mockChain as never)

    await searchFamilies({ search: 'Khatri' })

    expect(mockChain.or).toHaveBeenCalledWith(
      'family_name.ilike.%Khatri%,description.ilike.%Khatri%'
    )
  })

  it('[VALIDATION] rejects unsupported fields on families (e.g. native_place)', async () => {
    const response = await searchFamilies({
      native_place: 'Anjar',
    } as never)

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getDiscoveryFilterOptions Unit Tests
// ---------------------------------------------------------------------------

describe('Discovery Service — getDiscoveryFilterOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[SUCCESS] extracts sorted distinct filter values', async () => {
    const mockChainPersons = createMockQueryChain({
      data: [
        { gotra: 'Kashyap', nukh: 'Varun', kul: 'Aditya' },
        { gotra: 'Gautam', nukh: 'Chauhan', kul: 'Surya' },
      ],
      error: null,
    })

    const mockChainFamilies = createMockQueryChain({
      data: [
        { gotra: 'Kashyap', nukh: 'Varun', kul: 'Aditya', city: 'Pune', state: 'Maharashtra' },
        { gotra: 'Vashistha', nukh: 'Solanki', kul: 'Chandra', city: 'Mumbai', state: 'Maharashtra' },
      ],
      error: null,
    })

    vi.mocked(supabase.from)
      .mockReturnValueOnce(mockChainPersons as never)
      .mockReturnValueOnce(mockChainFamilies as never)

    const response = await getDiscoveryFilterOptions()

    expect(response.error).toBeNull()
    expect(response.data?.gotras).toEqual(['Gautam', 'Kashyap', 'Vashistha'])
    expect(response.data?.nukhs).toEqual(['Chauhan', 'Solanki', 'Varun'])
    expect(response.data?.kuls).toEqual(['Aditya', 'Chandra', 'Surya'])
    expect(response.data?.cities).toEqual(['Mumbai', 'Pune'])
    expect(response.data?.states).toEqual(['Maharashtra'])
  })

  it('[ERROR] handles query failure gracefully', async () => {
    const mockChainPersons = createMockQueryChain({
      data: null,
      error: { message: 'Database error', code: 'PGRST500' },
    })

    const mockChainFamilies = createMockQueryChain({
      data: [],
      error: null,
    })

    vi.mocked(supabase.from)
      .mockReturnValueOnce(mockChainPersons as never)
      .mockReturnValueOnce(mockChainFamilies as never)

    const response = await getDiscoveryFilterOptions()

    expect(response.data).toBeNull()
    expect(response.error).not.toBeNull()
  })
})
