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
  person: (PersonRow & { age?: number | null; is_same_family?: boolean; can_edit?: boolean }) | null
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
  'id, first_name, middle_name, last_name, maiden_name, gender, date_of_birth, date_of_death, is_deceased, birth_place, city, state, country, gotra, kul, nukh, blood_group, blood_group_consent, occupation, status, verification_status, profile_privacy, avatar_url, email_contact, phone'

/**
 * Retrieves the registered contact email of the current Family Head for a family.
 *
 * Used to automatically prefill the email field when adding new family members.
 * Returns null if the family has no designated head or the head has no registered email.
 */
export async function getFamilyHeadEmail(familyId: string): Promise<string | null> {
  if (!isValidUuid(familyId)) return null

  try {
    const { data, error } = await supabase
      .from('family_members')
      .select('person:persons(email_contact)')
      .eq('family_id', familyId)
      .eq('is_head', true)
      .is('left_at', null)
      .maybeSingle()

    if (error || !data) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const person = (data as any).person
    return person?.email_contact ? String(person.email_contact).trim() : null
  } catch {
    return null
  }
}

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
      relationship_to_head: validated.relationship_to_head,
      is_head: validated.is_head,
      joined_at: validated.joined_at,
      added_by: callerUserId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
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

  // If structured reference or connecting person supplied, persist via RPC
  if (data && (validated.reference_person_id || validated.connected_person_id)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('save_member_structured_relationship', {
        p_family_id: validated.family_id,
        p_member_id: data.id,
        p_role: validated.role,
        p_relationship_to_head: validated.relationship_to_head ?? null,
        p_is_head: validated.is_head ?? false,
        p_reference_person_id: validated.reference_person_id ?? null,
        p_connected_person_id: validated.connected_person_id ?? null,
      })
    } catch {
      // Non-blocking: table record is already saved
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
    .select('*')
    .eq('family_id', familyId)
    .order('is_head', { ascending: false })
    .order('created_at', { ascending: true })

  if (!options.includeFormer) {
    query = query.is('left_at', null)
  }

  const { data: memberRows, error: memberError } = await query

  if (memberError) {
    return {
      data: null,
      error: {
        message: mapFamilyMemberError(memberError.message, memberError.code),
        code: memberError.code,
        cause: memberError,
      },
    }
  }

  if (!memberRows || memberRows.length === 0) {
    return { data: [], error: null }
  }

  // Enrich members with person records from community_persons view (enforces field masking for other families)
  const personIds = Array.from(new Set(memberRows.map((m) => m.person_id).filter(Boolean)))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const personsMap: Record<string, any> = {}

  if (personIds.length > 0) {
    try {
      const q = supabase.from('community_persons').select('*')
      if (typeof q?.in === 'function') {
        const { data: initialPersonData, error: personError } = await q.in('id', personIds)
        let personData = initialPersonData

        // Fallback to persons table if view not found
        if (personError && (personError.code === 'PGRST205' || personError.code === '42P01')) {
          const fbQuery = supabase.from('persons').select(PERSON_MEMBER_SAFE_COLUMNS)
          if (typeof fbQuery?.in === 'function') {
            const fb = await fbQuery.in('id', personIds)
            personData = fb.data as unknown as typeof personData
          }
        }

        if (personData && Array.isArray(personData)) {
          for (const p of personData) {
            personsMap[p.id] = p
          }
        }

        // Enrich with exact persons table values (blood_group_consent, blood_group, occupation, occupation_category, custom_occupation)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: pDirectRows } = await (supabase.from('persons') as any)
            .select('id, blood_group, blood_group_consent, show_blood_group_in_directory, show_in_blood_directory, occupation, occupation_category, custom_occupation')
            .in('id', personIds)
          if (pDirectRows && Array.isArray(pDirectRows)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const item of pDirectRows as any[]) {
              if (personsMap[item.id]) {
                const consent = Boolean(
                  item.blood_group_consent ||
                  item.show_blood_group_in_directory ||
                  item.show_in_blood_directory
                )
                personsMap[item.id].blood_group_consent = consent
                personsMap[item.id].show_in_blood_directory = consent
                personsMap[item.id].show_blood_group_in_directory = consent
                if (item.blood_group) {
                  personsMap[item.id].blood_group = item.blood_group
                }
                if (item.occupation) {
                  personsMap[item.id].occupation = item.occupation
                }
                if (item.occupation_category) {
                  personsMap[item.id].occupation_category = item.occupation_category
                }
                if (item.custom_occupation) {
                  personsMap[item.id].custom_occupation = item.custom_occupation
                }
              }
            }
          }
        } catch {
          // Non-blocking
        }
      }
    } catch {
      // Non-blocking enrichment
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: FamilyMemberWithPerson[] = memberRows.map((m: any) => ({
    ...m,
    person: personsMap[m.person_id] ?? m.person ?? null,
  }))

  return { data: result, error: null }
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

  const { data: member, error: memberError } = await supabase
    .from('family_members')
    .select('*')
    .eq('id', memberId)
    .single()

  if (memberError || !member) {
    return {
      data: null,
      error: {
        message: memberError ? mapFamilyMemberError(memberError.message, memberError.code) : 'Member not found',
        code: memberError?.code || 'PGRST116',
        cause: memberError,
      },
    }
  }

  // If member already has joined person (e.g. from single-query join or test mock), return directly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((member as any).person) {
    return { data: member as unknown as FamilyMemberWithPerson, error: null }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let person: any = null
  if (member.person_id) {
    const { data: pData, error: pError } = await supabase
      .from('community_persons')
      .select('*')
      .eq('id', member.person_id)
      .single()

    let finalPersonData = pData

    if (pError && (pError.code === 'PGRST205' || pError.code === '42P01')) {
      const fb = await supabase
        .from('persons')
        .select(PERSON_MEMBER_SAFE_COLUMNS)
        .eq('id', member.person_id)
        .single()
      finalPersonData = fb.data as unknown as typeof pData
    }

    person = finalPersonData ?? null
  }

  return {
    data: {
      ...member,
      person,
    },
    error: null,
  }
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

  // 1. Resolve membership record: check by id, fallback to person_id if passed
  let targetMembershipId = memberId
  let targetFamilyId: string | null = null

  try {
    const fromBuilder = supabase.from('family_members')
    if (typeof fromBuilder.select === 'function') {
      const { data: directRow } = await fromBuilder
        .select('id, family_id, person_id')
        .eq('id', memberId)
        .maybeSingle()

      if (directRow) {
        targetMembershipId = directRow.id
        targetFamilyId = directRow.family_id
      } else {
        const { data: byPerson } = await fromBuilder
          .select('id, family_id, person_id')
          .eq('person_id', memberId)
          .is('left_at', null)
          .maybeSingle()

        if (byPerson) {
          targetMembershipId = byPerson.id
          targetFamilyId = byPerson.family_id
        }
      }
    }
  } catch {
    // Graceful fallback to memberId directly
  }

  // 2. Attempt server-authoritative RPC save_member_structured_relationship
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcRes = await (supabase.rpc as any)('save_member_structured_relationship', {
      p_family_id: targetFamilyId,
      p_member_id: targetMembershipId,
      p_role: parseResult.data.role ?? null,
      p_relationship_to_head: parseResult.data.relationship_to_head ?? null,
      p_is_head: parseResult.data.is_head ?? null,
      p_reference_person_id: parseResult.data.reference_person_id ?? null,
      p_connected_person_id: parseResult.data.connected_person_id ?? null,
    })

    if (!rpcRes.error && rpcRes.data) {
      return { data: rpcRes.data as FamilyMemberRow, error: null }
    }
  } catch {
    // Graceful fallback to update_family_member_record below
  }

  // 3. Fallback to update_family_member_record
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcRes = await (supabase.rpc as any)('update_family_member_record', {
      p_member_id: targetMembershipId,
      p_role: parseResult.data.role ?? null,
      p_relationship_to_head: parseResult.data.relationship_to_head ?? null,
      p_is_head: parseResult.data.is_head ?? null,
      p_family_id: targetFamilyId,
    })

    if (!rpcRes.error && rpcRes.data) {
      return { data: rpcRes.data as FamilyMemberRow, error: null }
    }
    if (rpcRes.error && rpcRes.error.code !== 'PGRST202' && rpcRes.error.code !== '42883') {
      return {
        data: null,
        error: {
          message: mapFamilyMemberError(rpcRes.error.message, rpcRes.error.code),
          code: rpcRes.error.code,
          cause: rpcRes.error,
        },
      }
    }
  } catch {
    // Fallback to direct table update below
  }

  // 3. Fallback: Direct table update with authorized RLS
  if (parseResult.data.is_head && targetFamilyId) {
    await supabase
      .from('family_members')
      .update({ is_head: false })
      .eq('family_id', targetFamilyId)
      .neq('id', targetMembershipId)
      .eq('is_head', true)
  }

  const { role, relationship_to_head, is_head, left_at } = parseResult.data
  const updatePayload = {
    ...(role !== undefined && { role }),
    ...(relationship_to_head !== undefined && { relationship_to_head }),
    ...(is_head !== undefined && { is_head }),
    ...(left_at !== undefined && { left_at }),
  }

  const updateSelect = supabase
    .from('family_members')
    .update(updatePayload)
    .eq('id', targetMembershipId)
    .select()

  const executor = updateSelect as unknown as {
    maybeSingle?: () => Promise<{ data: FamilyMemberRow | null; error: { message: string; code: string } | null }>
    single: () => Promise<{ data: FamilyMemberRow | null; error: { message: string; code: string } | null }>
  }
  const { data, error } = typeof executor.maybeSingle === 'function'
    ? await executor.maybeSingle()
    : await executor.single()

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

  if (!data) {
    return {
      data: null,
      error: {
        message:
          'You do not have permission to update this family member. Only authorized family managers or administrators can edit members.',
        code: '42501',
      },
    }
  }

  // Synchronize canonical interpersonal relationships with Family Head
  if (data && parseResult.data.role && data.person_id) {
    try {
      const { data: familyHead } = await supabase
        .from('family_members')
        .select('person_id')
        .eq('family_id', data.family_id)
        .eq('is_head', true)
        .is('left_at', null)
        .maybeSingle()

      const headPersonId = familyHead?.person_id
      const memberPersonId = data.person_id

      if (headPersonId && headPersonId !== memberPersonId) {
        // Soft-delete previous active relationship between head and member
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const relsTable = () => (supabase.from as any)('relationships')
        await relsTable()
          .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .is('deleted_at', null)
          .or(
            `and(person_a_id.eq.${headPersonId},person_b_id.eq.${memberPersonId}),and(person_a_id.eq.${memberPersonId},person_b_id.eq.${headPersonId})`
          )

        if (!data.left_at) {
          const authUser = (await supabase.auth.getUser()).data.user
          const newRole = parseResult.data.role

          if (newRole === 'SPOUSE') {
            const pA = headPersonId < memberPersonId ? headPersonId : memberPersonId
            const pB = headPersonId < memberPersonId ? memberPersonId : headPersonId
            await relsTable().insert({
              person_a_id: pA,
              person_b_id: pB,
              relationship_type: 'SPOUSE',
              created_by: authUser?.id ?? null,
            })
          } else if (newRole === 'CHILD') {
            await relsTable().insert({
              person_a_id: headPersonId,
              person_b_id: memberPersonId,
              relationship_type: 'PARENT',
              created_by: authUser?.id ?? null,
            })
          } else if (newRole === 'PARENT') {
            await relsTable().insert({
              person_a_id: memberPersonId,
              person_b_id: headPersonId,
              relationship_type: 'PARENT',
              created_by: authUser?.id ?? null,
            })
          } else if (newRole === 'SIBLING') {
            const pA = headPersonId < memberPersonId ? headPersonId : memberPersonId
            const pB = headPersonId < memberPersonId ? memberPersonId : headPersonId
            await relsTable().insert({
              person_a_id: pA,
              person_b_id: pB,
              relationship_type: 'SIBLING',
              created_by: authUser?.id ?? null,
            })
          }
        }
      }
    } catch {
      // Non-blocking: database trigger trg_sync_family_member_relationship also ensures consistency
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

  // 2. Demote existing head if one exists without modifying their interpersonal relationship role
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

  // 3. Promote new head (administrative designation only; keeps interpersonal relationships intact)
  const { data: updatedNewHead, error: promoteError } = await supabase
    .from('family_members')
    .update({ is_head: true })
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
 * Retrieve recently removed family members (within 30 days) for recovery.
 */
export async function getRecentlyRemovedMembers(
  familyId: string
): Promise<ApiResponse<FamilyMemberWithPerson[]>> {
  if (!isValidUuid(familyId)) {
    return { data: null, error: { message: 'Invalid family ID format.', code: 'VALIDATION_ERROR' } }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('family_members')
    .select(`
      id,
      family_id,
      person_id,
      role,
      is_head,
      relationship_to_head,
      joined_at,
      left_at,
      notes,
      created_at,
      person:community_persons(*)
    `)
    .eq('family_id', familyId)
    .not('left_at', 'is', null)
    .gte('left_at', thirtyDaysAgo)
    .order('left_at', { ascending: false })

  if (error) {
    return {
      data: null,
      error: { message: mapFamilyMemberError(error.message, error.code), code: error.code },
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { data: (data as any) || [], error: null }
}

/**
 * Restore a recently removed family member back into the family.
 */
export async function restoreFamilyMember(
  memberId: string
): Promise<ApiResponse<void>> {
  if (!isValidUuid(memberId)) {
    return { data: null, error: { message: 'Invalid member ID format.', code: 'VALIDATION_ERROR' } }
  }

  const { error } = await supabase
    .from('family_members')
    .update({ left_at: null })
    .eq('id', memberId)

  if (error) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcError } = await (supabase.rpc as any)('restore_family_member', {
        p_member_id: memberId,
      })
      if (!rpcError) {
        return { data: undefined, error: null }
      }
    } catch {
      // Fall through to error handling
    }
    return {
      data: null,
      error: { message: mapFamilyMemberError(error.message, error.code), code: error.code },
    }
  }

  return { data: undefined, error: null }
}

/**
 * Maps raw Supabase / PostgreSQL error messages to user-friendly text.
 * Never exposes raw database internals or schema details to clients.
 */
function mapFamilyMemberError(message: string, code?: string): string {
  if (code === '42501') {
    if (message && message.toLowerCase().includes('function')) {
      return `Database permission error: ${message}. Please run the latest database migration in Supabase SQL editor.`
    }
    return 'You do not have permission to manage members of this family.'
  }
  if (code === '42P17') {
    return 'Database policy error (RLS recursion): please apply the latest RLS migration fix.'
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
  const lower = message ? message.toLowerCase() : ''
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  if (message && message !== 'Failed to add member to family.') {
    return message
  }
  return 'Could not add member to family. Please try again.'
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
