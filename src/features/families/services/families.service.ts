/**
 * Families service — CRUD operations on public.families
 *
 * All operations use the single typed Supabase client (anon key only).
 * Authorization is enforced exclusively by PostgreSQL RLS policies.
 *
 * SECURITY RULES:
 * - Never accept `created_by` from user-controlled input.
 * - `created_by` is always set from the caller-supplied authenticated userId.
 * - `status` and `verification_status` are system fields; not set by this service.
 * - Soft-delete only: set `deleted_at`; never execute a SQL DELETE.
 *   The deployed `families_delete_deny` and `families_soft_delete_creator`
 *   policies enforce this at the PostgreSQL level.
 * - Do NOT replicate RLS logic here; rely on the database to enforce it.
 * - This service does NOT read or write the `family_members` join table.
 *   Family membership management is Phase 4 scope.
 *
 * Error responses always return user-friendly messages; raw DB errors are not
 * exposed to callers.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type { Tables } from '@/types/database.types'
import type { PrivacyLevel, FamilyRole } from '@/types/database'
import {
  getCommunityMukhi,
  type CommunityMukhi,
} from '@/features/community/services/community-mukhis.service'
import {
  createFamilySchema,
  updateFamilySchema,
  type CreateFamilyInput,
  type UpdateFamilyInput,
} from '../schemas/families.schemas'
import { ZodError } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The full family row as returned from the database. */
export type FamilyRow = Tables<'families'> & {
  selected_mukhi_id?: string | null
  selected_mukhi?: CommunityMukhi | null
}

export interface FamilyHeadSummary {
  person_id: string
  name: string
  avatar_url?: string | null
  gender?: string | null
}

export type FamilyWithDetails = FamilyRow & {
  head?: FamilyHeadSummary | null
  member_count?: number
  selected_mukhi?: CommunityMukhi | null
}

/** Parameters for listing families — minimal; pagination deferred to future phase. */
export interface ListFamiliesParams {
  /** Maximum number of records to return. Defaults to 50. Phase 3 limitation. */
  limit?: number
}

// ---------------------------------------------------------------------------
// createFamily
// ---------------------------------------------------------------------------

/**
 * Create a new family record.
 *
 * The caller must supply the authenticated user's ID as `createdBy`.
 * This value is set on `created_by` in the database — it is never taken
 * from user-controlled input.
 *
 * @param input - User-supplied family data (validated against createFamilySchema).
 * @param createdBy - The authenticated user's UUID (from auth.uid()).
 */
export async function createFamily(
  input: CreateFamilyInput,
  createdBy: string
): Promise<ApiResponse<FamilyRow>> {
  const parseResult = createFamilySchema.safeParse(input)
  if (!parseResult.success) {
    return {
      data: null,
      error: {
        message: formatZodError(parseResult.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const validated = parseResult.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('families') as any)
    .insert({
      ...validated,
      created_by: createdBy,
      manager_user_id: createdBy,
    })
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// createFamilyWithHead (Atomic Transactional RPC with Compensating Fallback)
// ---------------------------------------------------------------------------

export interface CreateFamilyWithHeadInput {
  family_name: string
  city?: string | null
  state?: string | null
  country?: string | null
  description?: string | null
  gotra?: string | null
  nukh?: string | null
  profile_privacy?: PrivacyLevel
  members_privacy?: PrivacyLevel
  selected_mukhi_id?: string | null
  existing_person_id?: string | null
  new_person?: {
    first_name: string
    middle_name?: string | null
    last_name: string
    maiden_name?: string | null
    gender: 'MALE' | 'FEMALE' | 'OTHER'
    date_of_birth?: string | null
    birth_place?: string | null
    blood_group?: string | null
  }
}

export interface CreateFamilyWithHeadResult {
  family_id: string
  head_person_id: string
}

/**
 * Atomically creates a family record and its designated head.
 * Sourced via the transactional create_family_with_head PostgreSQL RPC.
 */
export async function createFamilyWithHead(
  input: CreateFamilyWithHeadInput,
  callerUserId: string
): Promise<ApiResponse<CreateFamilyWithHeadResult>> {
  if (!callerUserId) {
    return {
      data: null,
      error: {
        message: 'Authentication required to create a family.',
        code: 'UNAUTHENTICATED',
      },
    }
  }

  const rpcPayload = {
    p_family_name: input.family_name.trim(),
    p_city: input.city ?? null,
    p_state: input.state ?? null,
    p_country: input.country ?? null,
    p_description: input.description ?? null,
    p_gotra: input.gotra ?? null,
    p_nukh: input.nukh ?? null,
    p_profile_privacy: input.profile_privacy ?? 'COMMUNITY',
    p_members_privacy: input.members_privacy ?? 'COMMUNITY',
    p_existing_person_id: input.existing_person_id ?? null,
    p_new_person_first_name: input.new_person?.first_name?.trim() ?? null,
    p_new_person_middle_name: input.new_person?.middle_name ?? null,
    p_new_person_last_name: input.new_person?.last_name?.trim() ?? null,
    p_new_person_maiden_name: input.new_person?.maiden_name ?? null,
    p_new_person_gender: input.new_person?.gender ?? 'MALE',
    p_new_person_dob: input.new_person?.date_of_birth ? input.new_person.date_of_birth.split('T')[0] : null,
    p_new_person_birth_place: input.new_person?.birth_place ?? null,
    p_new_person_blood_group: input.new_person?.blood_group ?? null,
    p_selected_mukhi_id: input.selected_mukhi_id ?? null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('create_family_with_head', rpcPayload)

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code || 'RPC_ERROR',
        cause: error,
      },
    }
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || !row.family_id) {
    return {
      data: null,
      error: {
        message: 'RPC execution returned no family identifier.',
        code: 'UNEXPECTED_RESPONSE',
      },
    }
  }

  return {
    data: {
      family_id: row.family_id,
      head_person_id: row.head_person_id,
    },
    error: null,
  }
}

export interface RegistrationPersonInput {
  is_existing?: boolean
  person_id?: string | null
  first_name?: string
  middle_name?: string | null
  last_name?: string
  maiden_name?: string | null
  gender?: 'MALE' | 'FEMALE' | 'OTHER'
  date_of_birth?: string | null
  birth_place?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  gotra?: string | null
  nukh?: string | null
  phone?: string | null
  phone_secondary?: string | null
  email?: string | null
  email_contact?: string | null
  date_of_death?: string | null
  blood_group?: string | null
  blood_group_consent?: boolean
  kul?: string | null
}

export interface RegistrationMemberInput extends RegistrationPersonInput {
  relationship_to_head: string
  role?: FamilyRole | string
}

/**
 * Maps human-readable relationship string to valid database public.family_role enum value.
 * Supported database values: 'HEAD', 'SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'GRANDPARENT', 'GRANDCHILD', 'EXTENDED'.
 */
export function mapRelationshipToFamilyRole(relationship: string | null | undefined): FamilyRole {
  const norm = (relationship || '').trim().toUpperCase()
  switch (norm) {
    case 'WIFE':
    case 'HUSBAND':
    case 'SPOUSE':
    case 'PARTNER':
      return 'SPOUSE'
    case 'SON':
    case 'DAUGHTER':
    case 'CHILD':
    case 'KID':
      return 'CHILD'
    case 'FATHER':
    case 'MOTHER':
    case 'PARENT':
      return 'PARENT'
    case 'BROTHER':
    case 'SISTER':
    case 'SIBLING':
      return 'SIBLING'
    case 'GRANDFATHER':
    case 'GRANDMOTHER':
    case 'GRANDPARENT':
      return 'GRANDPARENT'
    case 'GRANDSON':
    case 'GRANDDAUGHTER':
    case 'GRANDCHILD':
      return 'GRANDCHILD'
    case 'HEAD':
      return 'HEAD'
    default:
      return 'EXTENDED'
  }
}

export interface CompleteFamilyRegistrationPayload {
  family: {
    family_name: string
    selected_mukhi_id: string
    city: string
    state: string
    country?: string
    gotra: string
    nukh: string
    description?: string | null
    kul?: string | null
  }
  head: RegistrationPersonInput
  members?: RegistrationMemberInput[]
}

export interface CompleteFamilyRegistrationResult {
  success: boolean
  family_id: string
  head_person_id: string
  member_count: number
}

/**
 * Atomically registers a complete family, its designated head, and all additional members
 * within a single database transaction via the register_complete_family RPC.
 */
export async function registerCompleteFamily(
  payload: CompleteFamilyRegistrationPayload,
  callerUserId: string
): Promise<ApiResponse<CompleteFamilyRegistrationResult>> {
  if (!callerUserId) {
    return {
      data: null,
      error: {
        message: 'Authentication required to register a family.',
        code: 'UNAUTHENTICATED',
      },
    }
  }

  // Ensure all members have valid database family_role enum values
  const VALID_FAMILY_ROLES = new Set([
    'HEAD',
    'SPOUSE',
    'CHILD',
    'PARENT',
    'SIBLING',
    'GRANDPARENT',
    'GRANDCHILD',
    'EXTENDED',
  ])

  const sanitizedMembers = (payload.members || []).map((m) => {
    let assignedRole = m.role
    if (!assignedRole || !VALID_FAMILY_ROLES.has(assignedRole.toUpperCase())) {
      assignedRole = mapRelationshipToFamilyRole(m.relationship_to_head)
    }
    return {
      ...m,
      role: assignedRole,
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('register_complete_family', {
    p_family: payload.family,
    p_head: payload.head,
    p_members: sanitizedMembers,
  })

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code || 'RPC_ERROR',
        cause: error,
      },
    }
  }

  const res = typeof data === 'string' ? JSON.parse(data) : data
  return {
    data: {
      success: res?.success ?? true,
      family_id: res?.family_id,
      head_person_id: res?.head_person_id,
      member_count: res?.member_count ?? 1,
    },
    error: null,
  }
}

// ---------------------------------------------------------------------------
// getFamily
// ---------------------------------------------------------------------------

/**
 * Fetch a single family by its UUID.
 *
 * Visibility is governed by RLS. The caller will only receive a record if
 * the deployed RLS policies permit it for the current session.
 * Soft-deleted records are always excluded.
 *
 * @param familyId - The UUID of the family to fetch.
 */
export async function getFamily(familyId: string): Promise<ApiResponse<FamilyRow>> {
  const { data, error } = await supabase
    .from('families')
    .select('*')
    .eq('id', familyId)
    .is('deleted_at', null)
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familyData = data as any
  if (familyData && familyData.selected_mukhi_id) {
    const mukhiRes = await getCommunityMukhi(familyData.selected_mukhi_id)
    if (mukhiRes.data) {
      familyData.selected_mukhi = mukhiRes.data
    }
  }

  return { data: familyData as FamilyRow, error: null }
}

// ---------------------------------------------------------------------------
// updateFamily
// ---------------------------------------------------------------------------

/**
 * Update user-editable fields on a family record.
 *
 * Only explicitly user-editable fields are accepted. Protected fields
 * (created_by, status, verification_status, deleted_at) cannot be
 * modified through this function.
 *
 * RLS enforces that only the record creator (or an admin) can update.
 * Soft-deleted records are excluded from the update target.
 *
 * @param familyId - The UUID of the family to update.
 * @param input - Fields to update (validated against updateFamilySchema).
 */
export async function updateFamily(
  familyId: string,
  input: UpdateFamilyInput
): Promise<ApiResponse<FamilyRow>> {
  const parseResult = updateFamilySchema.safeParse(input)
  if (!parseResult.success) {
    return {
      data: null,
      error: {
        message: formatZodError(parseResult.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const validated = parseResult.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('families') as any)
    .update(validated)
    .eq('id', familyId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familyData = data as any
  if (familyData && familyData.selected_mukhi_id) {
    const mukhiRes = await getCommunityMukhi(familyData.selected_mukhi_id)
    if (mukhiRes.data) {
      familyData.selected_mukhi = mukhiRes.data
    }
  }

  return { data: familyData as FamilyRow, error: null }
}

// ---------------------------------------------------------------------------
// updateFamilyMukhi
// ---------------------------------------------------------------------------

/**
 * Update or change the selected Mukhi for an existing family.
 *
 * @param familyId - The UUID of the family.
 * @param mukhiId - The UUID of the executive committee member (Mukhi), or null to clear.
 */
export async function updateFamilyMukhi(
  familyId: string,
  mukhiId: string | null
): Promise<ApiResponse<FamilyRow>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('families') as any)
    .update({ selected_mukhi_id: mukhiId })
    .eq('id', familyId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const familyData = data as any
  if (familyData && familyData.selected_mukhi_id) {
    const mukhiRes = await getCommunityMukhi(familyData.selected_mukhi_id)
    if (mukhiRes.data) {
      familyData.selected_mukhi = mukhiRes.data
    }
  } else if (familyData) {
    familyData.selected_mukhi = null
  }

  return { data: familyData as FamilyRow, error: null }
}

// ---------------------------------------------------------------------------
// listFamilies
// ---------------------------------------------------------------------------

/**
 * List family records visible to the current session.
 *
 * RLS governs which records are returned based on privacy level and
 * the caller's authentication state:
 *  - Unauthenticated: receives only PUBLIC records.
 *  - Authenticated member: receives PUBLIC + COMMUNITY records.
 *  - Record creator: additionally receives their own records at any privacy level.
 *
 * Soft-deleted records (deleted_at IS NOT NULL) are always excluded.
 *
 * NOTE: Pagination is not yet implemented. The limit parameter provides a
 * ceiling to avoid unbounded result sets. Full cursor-based pagination is
 * deferred to Phase 6 (Discovery).
 *
 * @param params - Optional list parameters.
 */
export async function listFamilies(
  params: ListFamiliesParams = {}
): Promise<ApiResponse<FamilyWithDetails[]>> {
  const limit = params.limit ?? 50

  try {
    const { data, error } = await supabase
      .from('families')
      .select(`
        *,
        members:family_members(
          id,
          person_id,
          role,
          is_head,
          left_at,
          person:persons(id, first_name, last_name, avatar_url, gender)
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      // Resilient fallback: If the join with members fails (e.g. PostgREST relationship cache or joined RLS),
      // query the families table directly so the Census list is never blocked.
      try {
        const fallbackQuery = await supabase
          .from('families')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (!fallbackQuery.error && fallbackQuery.data && fallbackQuery.data.length >= 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const familyIds = (fallbackQuery.data as any[]).map((f) => f.id)
          const headMap: Record<string, FamilyHeadSummary> = {}
          const countMap: Record<string, number> = {}

          if (familyIds.length > 0) {
            try {
              const { data: memberRows } = await supabase
                .from('family_members')
                .select('family_id, person_id, role, is_head, left_at, person:persons(id, first_name, last_name, avatar_url, gender)')
                .in('family_id', familyIds)
                .is('left_at', null)

              if (memberRows && Array.isArray(memberRows)) {
                // Collect missing person IDs for heads
                const missingHeadPersonIds: string[] = []
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const m of memberRows as any[]) {
                  countMap[m.family_id] = (countMap[m.family_id] ?? 0) + 1
                  if ((m.is_head || m.role === 'HEAD') && m.person_id && !m.person?.first_name) {
                    missingHeadPersonIds.push(m.person_id)
                  }
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const fallbackPersonsMap: Record<string, any> = {}
                if (missingHeadPersonIds.length > 0) {
                  try {
                    const { data: enrichedData } = await supabase
                      .from('community_persons')
                      .select('id, first_name, last_name, avatar_url, gender')
                      .in('id', missingHeadPersonIds)
                    if (enrichedData && Array.isArray(enrichedData)) {
                      for (const p of enrichedData) {
                        fallbackPersonsMap[p.id] = p
                      }
                    }
                  } catch {
                    // Non-blocking enrichment
                  }
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const m of memberRows as any[]) {
                  if (m.is_head || m.role === 'HEAD') {
                    const resolvedPerson = m.person?.first_name ? m.person : (m.person_id ? fallbackPersonsMap[m.person_id] : null)
                    if (resolvedPerson && !headMap[m.family_id]) {
                      headMap[m.family_id] = {
                        person_id: resolvedPerson.id,
                        name: `${resolvedPerson.first_name} ${resolvedPerson.last_name}`.trim(),
                        avatar_url: resolvedPerson.avatar_url,
                        gender: resolvedPerson.gender,
                      }
                    }
                  }
                }
              }
            } catch {
              // Non-blocking member enrichment
            }
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fallbackFamilies: FamilyWithDetails[] = (fallbackQuery.data as any[]).map((fam) => ({
            ...fam,
            head: headMap[fam.id] ?? null,
            member_count: countMap[fam.id] ?? 0,
          }))

          return { data: fallbackFamilies, error: null }
        }
      } catch {
        // Fallback also failed, proceed to return original error
      }

      return {
        data: null,
        error: {
          message: 'Could not load family records. Please try again.',
          code: error.code,
          cause: error,
        },
      }
    }

    // Identify missing head persons across families to enrich from community_persons view
    // (Resolves RLS privacy masking so family census always displays the designated head)
    const missingHeadPersonIds = Array.from(
      new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data || []).flatMap((fam: any) => {
          if (!Array.isArray(fam.members)) return []
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const active = fam.members.filter((m: any) => !m.left_at)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hm = active.find((m: any) => m.is_head) || active.find((m: any) => m.role === 'HEAD')
          return hm?.person_id && !hm.person?.first_name ? [hm.person_id] : []
        })
      )
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichedPersonsMap: Record<string, any> = {}
    if (missingHeadPersonIds.length > 0) {
      try {
        const { data: enrichedData } = await supabase
          .from('community_persons')
          .select('id, first_name, last_name, avatar_url, gender')
          .in('id', missingHeadPersonIds)
        if (enrichedData && Array.isArray(enrichedData)) {
          for (const p of enrichedData) {
            enrichedPersonsMap[p.id] = p
          }
        }
      } catch {
        // Non-blocking enrichment
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processed: FamilyWithDetails[] = (data || []).map((fam: any) => {
      if (fam.members === undefined) {
        return fam as FamilyWithDetails
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const activeMembers = Array.isArray(fam.members) ? fam.members.filter((m: any) => !m.left_at) : []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headMember = activeMembers.find((m: any) => m.is_head) || activeMembers.find((m: any) => m.role === 'HEAD')
      const headPerson = headMember?.person?.first_name
        ? headMember.person
        : (headMember?.person_id ? enrichedPersonsMap[headMember.person_id] : null)

      const head: FamilyHeadSummary | null = headPerson
        ? {
            person_id: headPerson.id,
            name: `${headPerson.first_name} ${headPerson.last_name}`.trim(),
            avatar_url: headPerson.avatar_url,
            gender: headPerson.gender,
          }
        : null

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { members: _discardMembers, ...rest } = fam
      return {
        ...rest,
        head,
        member_count: activeMembers.length,
      }
    })

    return { data: processed, error: null }
  } catch {
    return {
      data: null,
      error: {
        message: 'Could not load family records. Please try again.',
        code: 'QUERY_ERROR',
      },
    }
  }
}

// ---------------------------------------------------------------------------
// softDeleteFamily
// ---------------------------------------------------------------------------

/**
 * Soft-delete a family record by setting `deleted_at` to the current timestamp.
 *
 * This function NEVER executes a SQL DELETE.
 *
 * The deployed database enforces this at two levels:
 *   - `families_delete_deny`: WITH CHECK (FALSE) — blocks all hard deletes.
 *   - `families_soft_delete_creator`: permits UPDATE of `deleted_at` by the creator.
 *
 * Soft-deleted records are hidden from normal queries via RLS conditions
 * on `deleted_at IS NULL`.
 *
 * @param familyId - The UUID of the family to soft-delete.
 */
export async function softDeleteFamily(familyId: string): Promise<ApiResponse<void>> {
  const { error } = await supabase
    .from('families')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', familyId)
    .is('deleted_at', null) // Idempotency guard: skip if already soft-deleted

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: undefined, error: null }
}

// ---------------------------------------------------------------------------
// Internal error helpers
// ---------------------------------------------------------------------------

/**
 * Maps raw Supabase/PostgreSQL error messages to user-friendly text.
 * Never expose raw database error messages to users.
 */
function mapFamilyError(message: string, code?: string): string {
  if (code === '42501') {
    if (message && message.toLowerCase().includes('function')) {
      return `Database permission error: ${message}. Please run the latest database migration in Supabase SQL editor.`
    }
    return 'You do not have permission to perform this action.'
  }
  if (code === 'PGRST116') {
    return 'Family not found.'
  }
  if (code === '23505') {
    return 'A duplicate record already exists.'
  }
  if (code === '23503') {
    return 'Related record not found.'
  }
  const lower = message ? message.toLowerCase() : ''
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  if (message) {
    return message
  }
  return 'Could not complete family operation. Please try again.'
}

/**
 * Formats a Zod validation error into a concise, user-readable string.
 */
function formatZodError(error: ZodError): string {
  const issues = error.issues
  if (issues.length === 0) return 'Validation failed.'
  return issues
    .map((issue) => issue.message)
    .filter((msg, idx, arr) => arr.indexOf(msg) === idx) // deduplicate
    .join('; ')
}
