/**
 * Discovery service — Query architecture for Community Directory
 *
 * Provides query orchestration for discovering census persons and family units.
 * All queries execute through the single typed Supabase client (anon key only)
 * using the caller's active authenticated session.
 *
 * ARCHITECTURAL & PRIVACY INVARIANTS:
 * - PostgreSQL RLS remains authoritative (Gate 2); rows invisible to caller are excluded.
 * - Table-level privileges (Gate 1) restrict access to authenticated community members.
 * - Fetch N+1 pagination contract: requests `pageSize + 1` rows to determine `hasNextPage`
 *   without issuing full-table `COUNT(*)` queries under peak concurrency (~9,000 users).
 * - Directory-safe projections: contact details (phone, email) and internal keys
 *   (user_id, created_by, timestamps) are strictly excluded from query payloads.
 * - PERSON != USER: Exposes human census records, not authentication credentials.
 * - FAMILY != HOUSEHOLD: Exposes social family units, not residential physical locations.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type { ZodError } from 'zod'
import {
  personDiscoveryFilterSchema,
  familyDiscoveryFilterSchema,
  discoveryPaginationSchema,
  type PersonDiscoveryFilterInput,
  type FamilyDiscoveryFilterInput,
  type DiscoveryPaginationInput,
} from '../schemas/discovery.schemas'
import type {
  PersonDiscoveryResult,
  FamilyDiscoveryResult,
  DiscoveryPage,
  DiscoveryFilterOptions,
} from '../types'

// ---------------------------------------------------------------------------
// Projection Constants (Directory-Safe Payloads)
// ---------------------------------------------------------------------------

/** Safe projection for directory queries and community_persons view (server-authoritative) */
export const PERSON_DIRECTORY_COLUMNS =
  'id, first_name, middle_name, last_name, maiden_name, gender, dob_year, age, birth_place, city, state, date_of_death, gotra, kul, nukh, status, verification_status, is_same_family'

const PERSON_VIEW_COLUMNS = PERSON_DIRECTORY_COLUMNS

/** Fallback safe projection for persons table (pre-migration compatibility) */
const PERSON_FALLBACK_COLUMNS =
  'id, first_name, middle_name, last_name, maiden_name, gender, dob_year, date_of_death, gotra, kul, nukh, status, verification_status'

const FAMILY_DIRECTORY_COLUMNS =
  'id, family_name, description, gotra, kul, nukh, city, state, country, status, verification_status, profile_privacy, members_privacy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculates person's age from birth date string (YYYY-MM-DD)
 */
function calculateAge(dobIso: string | null): number | null {
  if (!dobIso) return null
  const dob = new Date(dobIso)
  if (isNaN(dob.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--
  }
  return age >= 0 ? age : null
}

/**
 * Sanitizes free-text search terms to prevent syntax conflicts in PostgREST .or() queries.
 * Strips commas, parentheses, quotes, and backslashes.
 */
function sanitizeSearchQuery(term: string): string {
  return term.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Maps raw Supabase/PostgreSQL errors to user-safe error messages.
 */
function mapDiscoveryError(message: string, code?: string): string {
  if (code === '42501') {
    return 'You do not have permission to view directory records.'
  }
  const lower = message.toLowerCase()
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  return 'Could not complete directory search. Please try again.'
}

/**
 * Formats a Zod validation error into a readable string.
 */
function formatZodError(error: ZodError): string {
  const issues = error.issues
  if (issues.length === 0) return 'Validation failed.'
  return issues
    .map((issue) => issue.message)
    .filter((msg, idx, arr) => arr.indexOf(msg) === idx)
    .join('; ')
}

// ---------------------------------------------------------------------------
// searchPersons
// ---------------------------------------------------------------------------

/**
 * Discovers and searches census persons visible to the authenticated session.
 *
 * Implements deterministic ordering, Fetch N+1 pagination, and directory-safe projection.
 *
 * @param filtersInput - Validated against personDiscoveryFilterSchema.
 * @param paginationInput - Validated against discoveryPaginationSchema.
 * @param _callerUserId - Optional caller identifier (RLS governs actual authorization).
 */
export async function searchPersons(
  filtersInput: PersonDiscoveryFilterInput = {},
  paginationInput: DiscoveryPaginationInput = { page: 1, pageSize: 20 },
  _callerUserId?: string
): Promise<ApiResponse<DiscoveryPage<PersonDiscoveryResult>>> {
  // 1. Validate filters
  const filterParse = personDiscoveryFilterSchema.safeParse(filtersInput)
  if (!filterParse.success) {
    return {
      data: null,
      error: {
        message: formatZodError(filterParse.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  // 2. Validate pagination
  const paginationParse = discoveryPaginationSchema.safeParse(paginationInput)
  if (!paginationParse.success) {
    return {
      data: null,
      error: {
        message: formatZodError(paginationParse.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const filters = filterParse.data
  const { page, pageSize } = paginationParse.data

  // 3. Build query targeting community_persons view (primary) or persons (fallback)
  const executeQuery = async (tableOrView: 'community_persons' | 'persons', columns: string) => {
    let q = supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(tableOrView as any)
      .select(columns)
      .is('deleted_at', null)

    // Lifecycle filter: explicit status or omit ARCHIVED by directory policy
    if (filters.status) {
      q = q.eq('status', filters.status)
    } else {
      q = q.neq('status', 'ARCHIVED')
    }

    // Verification filter
    if (filters.verification_status) {
      q = q.eq('verification_status', filters.verification_status)
    }

    // Lineage filters
    if (filters.gotra) {
      q = q.ilike('gotra', filters.gotra)
    }
    if (filters.nukh) {
      q = q.ilike('nukh', filters.nukh)
    }
    if (filters.kul) {
      q = q.ilike('kul', filters.kul)
    }

    // Location / Birth place filter
    if (filters.birth_place) {
      if (tableOrView === 'community_persons') {
        q = q.or(`city.ilike.%${filters.birth_place}%,state.ilike.%${filters.birth_place}%`)
      } else {
        q = q.ilike('birth_place', `%${filters.birth_place}%`)
      }
    }

    // Free-text name search (accelerated by idx_persons_name_fts & trigram indexes)
    if (filters.search) {
      const cleanTerm = sanitizeSearchQuery(filters.search)
      if (cleanTerm.length > 0) {
        q = q.or(
          `first_name.ilike.%${cleanTerm}%,last_name.ilike.%${cleanTerm}%,maiden_name.ilike.%${cleanTerm}%`
        )
      }
    }

    // Deterministic ordering
    q = q
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .order('id', { ascending: true })

    // Fetch N+1 Pagination: fetch (pageSize + 1) rows
    const from = (page - 1) * pageSize
    const to = from + pageSize // Inclusive range: length is pageSize + 1
    return q.range(from, to)
  }

  // Primary attempt: community_persons security barrier view
  let { data, error } = await executeQuery('community_persons', PERSON_VIEW_COLUMNS)
  let usedFallback = false

  // Fallback attempt: if view not found (PGRST205/42P01) or column missing (42703) before DB migration
  if (error && (error.code === 'PGRST205' || error.code === '42P01' || error.code === '42703')) {
    const fallbackRes = await executeQuery('persons', PERSON_FALLBACK_COLUMNS)
    data = fallbackRes.data
    error = fallbackRes.error
    usedFallback = true
  }

  if (error) {
    return {
      data: null,
      error: {
        message: mapDiscoveryError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  const rawRows = (data ?? []) as unknown as Record<string, unknown>[]
  const hasNextPage = rawRows.length > pageSize
  const pageRows = hasNextPage ? rawRows.slice(0, pageSize) : rawRows

  const items: PersonDiscoveryResult[] = pageRows.map((row) => {
    if (usedFallback) {
      const rawDob = (row.date_of_birth as string | null) ?? null
      const birthYear = rawDob ? parseInt(rawDob.slice(0, 4), 10) : null
      const age = calculateAge(rawDob)
      return {
        ...(row as unknown as PersonDiscoveryResult),
        dob_year: birthYear,
        age: age,
        date_of_birth: null, // Strictly mask full date of birth
      }
    }
    return {
      ...(row as unknown as PersonDiscoveryResult),
      date_of_birth: null, // Strictly masked for directory view
    }
  })

  return {
    data: {
      items,
      page,
      pageSize,
      hasNextPage,
      hasPreviousPage: page > 1,
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// searchFamilies
// ---------------------------------------------------------------------------

/**
 * Discovers and searches community family units visible to the authenticated session.
 *
 * Implements deterministic ordering, Fetch N+1 pagination, and directory-safe projection.
 *
 * @param filtersInput - Validated against familyDiscoveryFilterSchema.
 * @param paginationInput - Validated against discoveryPaginationSchema.
 * @param _callerUserId - Optional caller identifier (RLS governs actual authorization).
 */
export async function searchFamilies(
  filtersInput: FamilyDiscoveryFilterInput = {},
  paginationInput: DiscoveryPaginationInput = { page: 1, pageSize: 20 },
  _callerUserId?: string
): Promise<ApiResponse<DiscoveryPage<FamilyDiscoveryResult>>> {
  // 1. Validate filters
  const filterParse = familyDiscoveryFilterSchema.safeParse(filtersInput)
  if (!filterParse.success) {
    return {
      data: null,
      error: {
        message: formatZodError(filterParse.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  // 2. Validate pagination
  const paginationParse = discoveryPaginationSchema.safeParse(paginationInput)
  if (!paginationParse.success) {
    return {
      data: null,
      error: {
        message: formatZodError(paginationParse.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const filters = filterParse.data
  const { page, pageSize } = paginationParse.data

  // 3. Build PostgREST query
  let query = supabase
    .from('families')
    .select(FAMILY_DIRECTORY_COLUMNS)
    .is('deleted_at', null)

  // Lifecycle filter
  if (filters.status) {
    query = query.eq('status', filters.status)
  } else {
    query = query.neq('status', 'ARCHIVED')
  }

  // Verification filter
  if (filters.verification_status) {
    query = query.eq('verification_status', filters.verification_status)
  }

  // Family name filter
  if (filters.family_name) {
    query = query.ilike('family_name', `%${filters.family_name}%`)
  }

  // Lineage filters
  if (filters.gotra) {
    query = query.ilike('gotra', filters.gotra)
  }
  if (filters.nukh) {
    query = query.ilike('nukh', filters.nukh)
  }
  if (filters.kul) {
    query = query.ilike('kul', filters.kul)
  }

  // Location filters
  if (filters.city) {
    query = query.ilike('city', `%${filters.city}%`)
  }
  if (filters.state) {
    query = query.ilike('state', `%${filters.state}%`)
  }
  if (filters.country) {
    query = query.ilike('country', `%${filters.country}%`)
  }

  // Free-text search (accelerated by idx_families_fts & idx_families_name_trgm)
  if (filters.search) {
    const cleanTerm = sanitizeSearchQuery(filters.search)
    if (cleanTerm.length > 0) {
      query = query.or(
        `family_name.ilike.%${cleanTerm}%,description.ilike.%${cleanTerm}%`
      )
    }
  }

  // 4. Deterministic ordering
  query = query
    .order('family_name', { ascending: true })
    .order('id', { ascending: true })

  // 5. Fetch N+1 Pagination: fetch (pageSize + 1) rows
  const from = (page - 1) * pageSize
  const to = from + pageSize
  query = query.range(from, to)

  const { data, error } = await query

  if (error) {
    return {
      data: null,
      error: {
        message: mapDiscoveryError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  const rawRows = (data ?? []) as unknown as FamilyDiscoveryResult[]
  const hasNextPage = rawRows.length > pageSize
  const items = hasNextPage ? rawRows.slice(0, pageSize) : rawRows

  return {
    data: {
      items,
      page,
      pageSize,
      hasNextPage,
      hasPreviousPage: page > 1,
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// getDiscoveryFilterOptions
// ---------------------------------------------------------------------------

/**
 * Retrieves safe distinct filter options for lineage and location dropdowns.
 *
 * Implements bounded, non-sensitive querying to prevent unindexed full-table scans.
 */
export async function getDiscoveryFilterOptions(): Promise<
  ApiResponse<DiscoveryFilterOptions>
> {
  try {
    // 1. Fetch bounded samples from persons for gotras and nukhs
    const [personsRes, familiesRes] = await Promise.all([
      supabase
        .from('persons')
        .select('gotra, nukh, kul')
        .is('deleted_at', null)
        .neq('status', 'ARCHIVED')
        .limit(100),
      supabase
        .from('families')
        .select('gotra, nukh, kul, city, state')
        .is('deleted_at', null)
        .neq('status', 'ARCHIVED')
        .limit(100),
    ])

    if (personsRes.error) {
      return {
        data: null,
        error: {
          message: mapDiscoveryError(personsRes.error.message, personsRes.error.code),
          code: personsRes.error.code,
        },
      }
    }

    if (familiesRes.error) {
      return {
        data: null,
        error: {
          message: mapDiscoveryError(familiesRes.error.message, familiesRes.error.code),
          code: familiesRes.error.code,
        },
      }
    }

    const gotrasSet = new Set<string>()
    const nukhsSet = new Set<string>()
    const kulsSet = new Set<string>()
    const citiesSet = new Set<string>()
    const statesSet = new Set<string>()

    for (const p of personsRes.data ?? []) {
      if (p.gotra) gotrasSet.add(p.gotra.trim())
      if (p.nukh) nukhsSet.add(p.nukh.trim())
      if (p.kul) kulsSet.add(p.kul.trim())
    }

    for (const f of familiesRes.data ?? []) {
      if (f.gotra) gotrasSet.add(f.gotra.trim())
      if (f.nukh) nukhsSet.add(f.nukh.trim())
      if (f.kul) kulsSet.add(f.kul.trim())
      if (f.city) citiesSet.add(f.city.trim())
      if (f.state) statesSet.add(f.state.trim())
    }

    return {
      data: {
        gotras: Array.from(gotrasSet).sort(),
        nukhs: Array.from(nukhsSet).sort(),
        kuls: Array.from(kulsSet).sort(),
        cities: Array.from(citiesSet).sort(),
        states: Array.from(statesSet).sort(),
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        message: 'Could not load filter options.',
        code: 'INTERNAL_ERROR',
        cause: err,
      },
    }
  }
}
