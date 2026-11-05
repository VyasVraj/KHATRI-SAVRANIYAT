/**
 * Family members service — CRUD operations on public.family_members
 *
 * All operations use the single typed Supabase client (anon key only).
 * Authorization is enforced exclusively by PostgreSQL RLS policies.
 *
 * SECURITY RULES:
 * - Never accept `added_by` from user-controlled input.
 * - `added_by` is always set from the caller-supplied authenticated userId.
 * - PERSON != USER: `person_id` refers to a public.persons census record, NOT an auth.users id.
 * - Soft-exit by default: `removeFamilyMember` sets `left_at = NOW()` by default to preserve
 *   genealogical ties. Hard-delete is available only via explicit opt-in.
 * - Do NOT replicate RLS logic here; rely on the database to enforce it.
 *
 * Error responses always return user-friendly messages; raw DB errors are not exposed.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type { Tables } from '@/types/database.types'
import {
  addFamilyMemberSchema,
  updateFamilyMemberSchema,
  type AddFamilyMemberInput,
  type UpdateFamilyMemberInput,
} from '../schemas/family-members.schemas'
import { ZodError } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Base family member row from database */
export type FamilyMemberRow = Tables<'family_members'>

/** Person row from database */
export type PersonRow = Tables<'persons'>

/** Family member joined with person details */
export type FamilyMemberWithPerson = FamilyMemberRow & {
  person: PersonRow | null
}

/** Family summary fields joined with family member for reverse lookup */
export type FamilySummary = Pick<
  Tables<'families'>,
  'id' | 'family_name' | 'city' | 'state' | 'profile_privacy'
>

/** Family member joined with family details (for reverse lookup) */
export type FamilyMemberWithFamily = FamilyMemberRow & {
  family: FamilySummary | null
}

/** Parameters for listing family members */
export interface ListFamilyMembersOptions {
  /** If true, returns former members (left_at IS NOT NULL) alongside active members */
  includeFormer?: boolean
}

/** Parameters for listing a person's family memberships */
export interface ListPersonFamiliesOptions {
  /** If true, returns former memberships (left_at IS NOT NULL) alongside active memberships */
  includeFormer?: boolean
}

/** Safe projection for person join to prevent leaking protected contact or full DOB fields */
const PERSON_MEMBER_SAFE_COLUMNS =
  'id, first_name, middle_name, last_name, maiden_name, gender, date_of_death, birth_place, gotra, kul, nukh, status, verification_status, profile_privacy, avatar_url'

/** Options for removing a family member */
export interface RemoveFamilyMemberOptions {
  /**
   * If true, executes a hard SQL DELETE instead of soft-exit (left_at timestamp).
   * Permitted by RLS for the family creator to purge accidental additions.
   * Default is false (soft-exit).
   */
  hardDelete?: boolean
}

// ---------------------------------------------------------------------------
// addFamilyMember
// ---------------------------------------------------------------------------

/**
 * Add a person to a family unit.
 *
 * Sourced from the authenticated caller's userId to populate `added_by`.
 * `added_by` is NEVER accepted from form or client input.
 *
 * Database constraints enforced:
 *   - UNIQUE (family_id, person_id) — prevents duplicate additions
 *   - idx_family_members_one_head — at most one active head per family
 *
 * @param input - Data for membership (family_id, person_id, role, is_head, joined_at)
 * @param callerUserId - The authenticated user's UUID (from auth.uid())
 */
export async function addFamilyMember(
  input: AddFamilyMemberInput,
  callerUserId: string
): Promise<ApiResponse<FamilyMemberRow>> {
  const parseResult = addFamilyMemberSchema.safeParse(input)
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

  const { data, error } = await supabase
    .from('family_members')
    .insert({
      family_id: validated.family_id,
      person_id: validated.person_id,
      role: validated.role,
      is_head: validated.is_head,
      joined_at: validated.joined_at,
      added_by: callerUserId,
    })
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyMemberError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// listFamilyMembers
// ---------------------------------------------------------------------------

/**
 * List all members of a family.
 *
 * By default returns only active members (`left_at IS NULL`).
 * Set `options.includeFormer = true` to include former members.
 * Joins person details for each member.
 *
 * @param familyId - UUID of the family
 * @param options - Listing options (includeFormer)
 */
export async function listFamilyMembers(
  familyId: string,
  options: ListFamilyMembersOptions = {}
): Promise<ApiResponse<FamilyMemberWithPerson[]>> {
  if (!isValidUuid(familyId)) {
    return {
      data: null,
      error: {
        message: 'Invalid family ID format.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  let query = supabase
    .from('family_members')
    .select(`*, person:persons(${PERSON_MEMBER_SAFE_COLUMNS})`)
    .eq('family_id', familyId)
    .order('is_head', { ascending: false })
    .order('created_at', { ascending: true })

  if (!options.includeFormer) {
    query = query.is('left_at', null)
  }

  const { data, error } = await query

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyMemberError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: (data as unknown as FamilyMemberWithPerson[]) ?? [], error: null }
}

// ---------------------------------------------------------------------------
// listPersonFamilies
// ---------------------------------------------------------------------------

/**
 * List all family memberships for a specific person (reverse lookup).
 *
 * By default returns only active memberships (`left_at IS NULL`).
 * Set `options.includeFormer = true` to include former/departed memberships.
 * Joins selected family details (id, family_name, city, state, profile_privacy).
 *
 * @param personId - UUID of the person
 * @param options - Listing options (includeFormer)
 */
export async function listPersonFamilies(
  personId: string,
  options: ListPersonFamiliesOptions = {}
): Promise<ApiResponse<FamilyMemberWithFamily[]>> {
  if (!isValidUuid(personId)) {
    return {
      data: null,
      error: {
        message: 'Invalid person ID format.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  let query = supabase
    .from('family_members')
    .select('*, family:families(id, family_name, city, state, profile_privacy)')
    .eq('person_id', personId)
    .order('is_head', { ascending: false })
    .order('created_at', { ascending: true })

  if (!options.includeFormer) {
    query = query.is('left_at', null)
  }

  const { data, error } = await query

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyMemberError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: (data as unknown as FamilyMemberWithFamily[]) ?? [], error: null }
}

// ---------------------------------------------------------------------------
// getFamilyMember
// ---------------------------------------------------------------------------

/**
 * Fetch a single family member record by UUID, including joined person details.
 *
 * @param memberId - UUID of the membership row
 */
export async function getFamilyMember(
  memberId: string
): Promise<ApiResponse<FamilyMemberWithPerson>> {
  if (!isValidUuid(memberId)) {
    return {
      data: null,
      error: {
        message: 'Invalid member ID format.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const { data, error } = await supabase
    .from('family_members')
    .select(`*, person:persons(${PERSON_MEMBER_SAFE_COLUMNS})`)
    .eq('id', memberId)
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyMemberError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: data as unknown as FamilyMemberWithPerson, error: null }
}

// ---------------------------------------------------------------------------
// updateFamilyMember
// ---------------------------------------------------------------------------

/**
 * Update attributes of an existing family membership (role, is_head, left_at).
 *
 * Protected fields (id, family_id, person_id, added_by, created_at) cannot
 * be altered through this function.
 *
 * @param memberId - UUID of the membership row
 * @param input - Fields to update
 */
export async function updateFamilyMember(
  memberId: string,
  input: UpdateFamilyMemberInput
): Promise<ApiResponse<FamilyMemberRow>> {
  if (!isValidUuid(memberId)) {
    return {
      data: null,
      error: {
        message: 'Invalid member ID format.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const parseResult = updateFamilyMemberSchema.safeParse(input)
  if (!parseResult.success) {
    return {
      data: null,
      error: {
        message: formatZodError(parseResult.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const { data, error } = await supabase
    .from('family_members')
    .update(parseResult.data)
    .eq('id', memberId)
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyMemberError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// removeFamilyMember
// ---------------------------------------------------------------------------

/**
 * Remove a family member from a family.
 *
 * DEFAULT BEHAVIOR: Soft-exit (sets `left_at = NOW()`), preserving the historical
 * genealogical record of membership.
 *
 * OPTIONAL BEHAVIOR: When `options.hardDelete === true`, executes a SQL DELETE.
 * Allowed by database RLS (`family_members_delete_creator`) for family creators
 * to remove accidental entries.
 *
 * @param memberId - UUID of the membership row
 * @param options - Removal options (hardDelete)
 */
export async function removeFamilyMember(
  memberId: string,
  options: RemoveFamilyMemberOptions = {}
): Promise<ApiResponse<void>> {
  if (!isValidUuid(memberId)) {
    return {
      data: null,
      error: {
        message: 'Invalid member ID format.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  if (options.hardDelete) {
    const { error } = await supabase
      .from('family_members')
      .delete()
      .eq('id', memberId)

    if (error) {
      return {
        data: null,
        error: {
          message: mapFamilyMemberError(error.message, error.code),
          code: error.code,
          cause: error,
        },
      }
    }

    return { data: undefined, error: null }
  }

  // Default: soft exit via left_at timestamp
  const { error } = await supabase
    .from('family_members')
    .update({ left_at: new Date().toISOString() })
    .eq('id', memberId)
    .is('left_at', null) // Idempotency guard

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyMemberError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: undefined, error: null }
}

// ---------------------------------------------------------------------------
// transferFamilyHead
// ---------------------------------------------------------------------------

/**
 * Transfer head-of-family designation to a different member.
 *
 * IMPORTANT ARCHITECTURAL LIMITATION:
 * This operation is client-orchestrated across multiple queries and is NOT
 * database-transactional (Supabase JS client does not support multi-statement
 * transactions over REST without a custom RPC).
 *
 * SEQUENCE:
 *   1. Identifies the current active head of the family.
 *   2. If found and different from newHeadMemberId, demotes the existing head (`is_head = false`).
 *   3. Promotes the new head (`is_head = true, role = 'HEAD'`).
 *   4. If promotion fails, attempts recovery by re-promoting the original head.
 *
 * @param familyId - UUID of the family
 * @param newHeadMemberId - UUID of the family_members row to designate as new head
 */
export async function transferFamilyHead(
  familyId: string,
  newHeadMemberId: string
): Promise<ApiResponse<FamilyMemberRow>> {
  if (!isValidUuid(familyId) || !isValidUuid(newHeadMemberId)) {
    return {
      data: null,
      error: {
        message: 'Invalid family or member ID format.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  // 1. Locate current active head
  const { data: currentHeads, error: headQueryError } = await supabase
    .from('family_members')
    .select('*')
    .eq('family_id', familyId)
    .eq('is_head', true)
    .is('left_at', null)

  if (headQueryError) {
    return {
      data: null,
      error: {
        message: mapFamilyMemberError(headQueryError.message, headQueryError.code),
        code: headQueryError.code,
        cause: headQueryError,
      },
    }
  }

  const existingHead = currentHeads && currentHeads.length > 0 ? currentHeads[0] : null

  // If new head is already the head, no-op
  if (existingHead && existingHead.id === newHeadMemberId) {
    return { data: existingHead, error: null }
  }

  // 2. Demote existing head if one exists
  if (existingHead) {
    const { error: demoteError } = await supabase
      .from('family_members')
      .update({ is_head: false })
      .eq('id', existingHead.id)

    if (demoteError) {
      return {
        data: null,
        error: {
          message: mapFamilyMemberError(demoteError.message, demoteError.code),
          code: demoteError.code,
          cause: demoteError,
        },
      }
    }
  }

  // 3. Promote new head
  const { data: updatedNewHead, error: promoteError } = await supabase
    .from('family_members')
    .update({ is_head: true, role: 'HEAD' })
    .eq('id', newHeadMemberId)
    .eq('family_id', familyId)
    .select()
    .single()

  if (promoteError) {
    // 4. Recovery: attempt to restore previous head if demoted
    if (existingHead) {
      await supabase
        .from('family_members')
        .update({ is_head: true })
        .eq('id', existingHead.id)
    }

    return {
      data: null,
      error: {
        message: mapFamilyMemberError(promoteError.message, promoteError.code),
        code: promoteError.code,
        cause: promoteError,
      },
    }
  }

  return { data: updatedNewHead, error: null }
}

// ---------------------------------------------------------------------------
// Error handling helpers
// ---------------------------------------------------------------------------

/**
 * Maps raw Supabase / PostgreSQL error messages to user-friendly text.
 * Never exposes raw database internals or schema details to clients.
 */
function mapFamilyMemberError(message: string, code?: string): string {
  if (code === '42501') {
    return 'You do not have permission to manage members of this family.'
  }
  if (code === '23505') {
    const lower = message.toLowerCase()
    if (lower.includes('idx_family_members_one_head') || lower.includes('one_head')) {
      return 'This family already has an active head. Demote the current head before assigning a new one.'
    }
    return 'This person is already a member of this family.'
  }
  if (code === '23503') {
    return 'The specified family or person was not found.'
  }
  if (code === 'PGRST116') {
    return 'Family member record not found.'
  }
  const lower = message.toLowerCase()
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/** Formats Zod errors into a single string */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => issue.message)
    .filter((msg, idx, arr) => arr.indexOf(msg) === idx)
    .join('; ')
}

/** Basic UUID format check */
function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}
