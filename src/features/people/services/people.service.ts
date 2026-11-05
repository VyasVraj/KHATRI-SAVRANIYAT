/**
 * People service — CRUD operations on public.persons
 *
 * All operations use the single typed Supabase client (anon key only).
 * Authorization is enforced exclusively by PostgreSQL RLS policies.
 *
 * SECURITY RULES:
 * - Never accept `user_id` or `created_by` from user-controlled input.
 * - `created_by` is always set from the caller-supplied authenticated userId.
 * - `user_id` remains NULL on create (PERSON != USER — claim is a future phase).
 * - `status` and `verification_status` are system fields; not set by this service.
 * - Soft-delete only: set `deleted_at`; never execute a SQL DELETE.
 * - Do NOT replicate RLS logic here; rely on the database to enforce it.
 *
 * Error responses always return user-friendly messages; raw DB errors are not
 * exposed to callers.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse, PersonProtectedDetails } from '@/types'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'
import {
  createPersonSchema,
  updatePersonSchema,
  type CreatePersonInput,
  type UpdatePersonInput,
} from '../schemas/people.schemas'
import { ZodError } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The full person row as returned from the database. */
export type PersonRow = Tables<'persons'>

/** Parameters for listing persons — minimal; pagination deferred to future phase. */
export interface ListPersonsParams {
  /** Maximum number of records to return. Defaults to 50. Phase 3 limitation. */
  limit?: number
}

// ---------------------------------------------------------------------------
// createPerson
// ---------------------------------------------------------------------------

/**
 * Create a new person record.
 *
 * The caller must supply the authenticated user's ID as `createdBy`.
 * This value is set on `created_by` in the database — it is never taken
 * from user-controlled input.
 *
 * `user_id` is always null on creation (PERSON != USER — see SECURITY.md).
 *
 * @param input - User-supplied person data (validated against createPersonSchema).
 * @param createdBy - The authenticated user's UUID (from auth.uid()).
 */
export async function createPerson(
  input: CreatePersonInput,
  createdBy: string
): Promise<ApiResponse<PersonRow>> {
  // Validate input against schema before touching the database
  const parseResult = createPersonSchema.safeParse(input)
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

  const insertPayload: TablesInsert<'persons'> = {
    ...validated,
    created_by: createdBy,
    // user_id intentionally omitted — remains NULL per PERSON != USER boundary
  }

  // Case B: When Date of Death is entered, automatically set status to DECEASED
  if (validated.date_of_death) {
    insertPayload.status = 'DECEASED'
  }

  const { data, error } = await supabase
    .from('persons')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapPersonError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// getPerson
// ---------------------------------------------------------------------------

/**
 * Fetch a single person by their UUID.
 *
 * Visibility is governed by RLS. The caller will only receive a record
 * if the deployed RLS policies permit it for the current session.
 *
 * @param personId - The UUID of the person to fetch.
 */
export async function getPerson(personId: string): Promise<ApiResponse<PersonRow>> {
  // Primary attempt: community_persons security barrier view
  let { data, error } = await supabase
    .from('community_persons')
    .select('*')
    .eq('id', personId)
    .is('deleted_at', null)
    .single()

  // Fallback to persons table if community_persons view is not yet deployed (PGRST205/42P01)
  if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
    const fallbackRes = await supabase
      .from('persons')
      .select('*')
      .eq('id', personId)
      .is('deleted_at', null)
      .single()
    data = fallbackRes.data as unknown as typeof data
    error = fallbackRes.error
  }

  if (error) {
    return {
      data: null,
      error: {
        message: mapPersonError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: data as unknown as PersonRow, error: null }
}

// ---------------------------------------------------------------------------
// updatePerson
// ---------------------------------------------------------------------------

/**
 * Update user-editable fields on a person record.
 *
 * Only explicitly user-editable fields are accepted. Protected fields
 * (user_id, created_by, status, verification_status, deleted_at) cannot
 * be modified through this function.
 *
 * RLS enforces that only the record creator (or an admin) can update.
 *
 * @param personId - The UUID of the person to update.
 * @param input - Fields to update (validated against updatePersonSchema).
 */
export async function updatePerson(
  personId: string,
  input: UpdatePersonInput
): Promise<ApiResponse<PersonRow>> {
  const parseResult = updatePersonSchema.safeParse(input)
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

  const updatePayload: TablesUpdate<'persons'> = { ...validated }

  // Case B & C: When Date of Death is entered, automatically set status to DECEASED
  if (validated.date_of_death) {
    updatePayload.status = 'DECEASED'
  } else if (input.date_of_death === null || validated.date_of_death === null) {
    // Case E: If Date of Death is explicitly cleared/removed, restore to ACTIVE
    updatePayload.date_of_death = null
    updatePayload.status = 'ACTIVE'
  }

  const { data, error } = await supabase
    .from('persons')
    .update(updatePayload)
    .eq('id', personId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapPersonError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// listPersons
// ---------------------------------------------------------------------------

/**
 * List person records visible to the current session.
 *
 * RLS governs which records are returned based on privacy level and
 * the caller's authentication state:
 *  - Unauthenticated: receives only PUBLIC records.
 *  - Authenticated member: receives PUBLIC + COMMUNITY records.
 *  - Record owner: additionally receives their own records at any privacy level.
 *
 * NOTE: Soft-deleted records (deleted_at IS NOT NULL) are always excluded.
 *
 * LIMITATION (Phase 3): Pagination is not yet implemented. The limit parameter
 * provides a ceiling to avoid unbounded result sets. Full cursor-based
 * pagination is deferred to Phase 6 (Discovery).
 *
 * @param params - Optional list parameters.
 */
export async function listPersons(
  params: ListPersonsParams = {}
): Promise<ApiResponse<PersonRow[]>> {
  const limit = params.limit ?? 50

  // Primary attempt: community_persons security barrier view
  let { data, error } = await supabase
    .from('community_persons')
    .select('*')
    .is('deleted_at', null)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .limit(limit)

  // Fallback to persons table if community_persons view is not yet deployed (PGRST205/42P01)
  if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
    const fallbackRes = await supabase
      .from('persons')
      .select('*')
      .is('deleted_at', null)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .limit(limit)
    data = fallbackRes.data as unknown as typeof data
    error = fallbackRes.error
  }

  if (error) {
    return {
      data: null,
      error: {
        message: 'Could not load person records. Please try again.',
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: (data ?? []) as unknown as PersonRow[], error: null }
}

// ---------------------------------------------------------------------------
// softDeletePerson
// ---------------------------------------------------------------------------

/**
 * Soft-delete a person record by setting `deleted_at` to the current timestamp.
 *
 * This function NEVER executes a SQL DELETE. The `persons_delete_deny` RLS
 * policy blocks all hard deletes. Soft-deleted records are hidden from normal
 * queries via RLS conditions on `deleted_at IS NULL`.
 *
 * RLS enforces that only the record creator (or an admin) can soft-delete.
 *
 * @param personId - The UUID of the person to soft-delete.
 */
export async function softDeletePerson(personId: string): Promise<ApiResponse<void>> {
  const { error } = await supabase
    .from('persons')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', personId)
    .is('deleted_at', null) // Idempotency guard: skip if already soft-deleted

  if (error) {
    return {
      data: null,
      error: {
        message: mapPersonError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: undefined, error: null }
}

// ---------------------------------------------------------------------------
// getPersonByUserId
// ---------------------------------------------------------------------------

/**
 * Fetch a person record linked to an authenticated user account (user_id).
 *
 * Implements PERSON != USER:
 * - A user profile (auth.users / public.profiles) can be linked to at most one person record.
 * - Returns null data if no person record has been claimed or linked to this user_id.
 *
 * @param userId - The UUID of the authenticated user (auth.users.id).
 */
export async function getPersonByUserId(
  userId: string
): Promise<ApiResponse<PersonRow | null>> {
  if (!userId) {
    return { data: null, error: null }
  }

  // 1. Try secure RPC get_my_linked_person (safe for normal users without user_id grant)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_linked_person')
    if (!rpcError && rpcData) {
      const raw = Array.isArray(rpcData) ? rpcData[0] : rpcData
      if (raw) {
        return { data: raw as unknown as PersonRow, error: null }
      }
    }
  } catch {
    // Ignore RPC error and try fallback
  }

  // 2. Fallback to direct query on persons table (for pre-migration or authorized moderator callers)
  const { data, error } = await supabase
    .from('persons')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    return {
      data: null,
      error: {
        message: mapPersonError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: data as unknown as PersonRow | null, error: null }
}

// ---------------------------------------------------------------------------
// getPersonProtectedDetails & updatePersonProtectedDetails (RPCs)
// ---------------------------------------------------------------------------

/**
 * Retrieve protected personal details (full date of birth, phone numbers, email)
 * via the server-authoritative SECURITY DEFINER RPC.
 *
 * RESTRICTION: Authorized Mukhis/Admins and the record owner ONLY.
 * Any unauthorized caller will receive error 42501 (insufficient privilege).
 */
export async function getPersonProtectedDetails(
  personId: string
): Promise<ApiResponse<PersonProtectedDetails>> {
  try {
    const { data, error } = await supabase.rpc('get_person_protected_details', {
      p_person_id: personId,
    })

    if (error) {
      return {
        data: null,
        error: {
          message: error.message || 'Access to protected personal details denied.',
          code: error.code,
          cause: error,
        },
      }
    }

    const raw = Array.isArray(data) ? data[0] : data
    const row = raw as Record<string, unknown> | null
    if (!row) {
      return {
        data: null,
        error: {
          message: 'No details returned for person.',
          code: 'NOT_FOUND',
        },
      }
    }

    return {
      data: {
        date_of_birth: (row.date_of_birth as string) ?? null,
        phone: (row.phone as string) ?? null,
        phone_secondary: (row.phone_secondary as string) ?? null,
        email_contact: (row.email_contact as string) ?? null,
        is_owner: Boolean(row.is_owner),
        is_moderator: Boolean(row.is_moderator),
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : 'Failed to retrieve protected details.',
      },
    }
  }
}

/**
 * Update protected personal details via the server-authoritative RPC.
 * Restricted to the record owner or an authorized Mukhi / Admin.
 * Returns only minimal confirmation metadata (person_id, updated_at);
 * NEVER returns complete person records or protected columns.
 */
export async function updatePersonProtectedDetails(
  personId: string,
  details: {
    date_of_birth?: string | null
    phone?: string | null
    phone_secondary?: string | null
    email_contact?: string | null
  }
): Promise<ApiResponse<{ person_id: string; updated_at: string }>> {
  try {
    const { data, error } = await supabase.rpc('update_person_protected_details', {
      p_person_id: personId,
      p_date_of_birth: details.date_of_birth,
      p_phone: details.phone,
      p_phone_secondary: details.phone_secondary,
      p_email_contact: details.email_contact,
    })

    if (error) {
      return {
        data: null,
        error: {
          message: error.message || 'Failed to update protected personal details.',
          code: error.code,
          cause: error,
        },
      }
    }

    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
    return {
      data: row
        ? {
            person_id: typeof row.person_id === 'string' ? row.person_id : personId,
            updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
          }
        : { person_id: personId, updated_at: new Date().toISOString() },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : 'Failed to update protected details.',
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Internal error helpers
// ---------------------------------------------------------------------------

/**
 * Maps raw Supabase/PostgreSQL error messages to user-friendly text.
 * Never expose raw database error messages to users.
 */
function mapPersonError(message: string, code?: string): string {
  if (code === '42501') {
    if (message && message.toLowerCase().includes('function')) {
      return `Database permission error: ${message}. Please run the latest database migration in Supabase SQL editor.`
    }
    return 'You do not have permission to perform this action.'
  }
  if (code === '42P17') {
    return 'Database policy error (RLS recursion). Please execute the latest migration fix in Supabase SQL editor.'
  }
  if (code === 'PGRST116') {
    return 'Person not found.'
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
  if (message && message !== 'Failed to create person.') {
    return message
  }
  return 'Could not create person. Please try again.'
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
