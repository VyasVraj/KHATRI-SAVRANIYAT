/**
 * Verification Review Service — Moderator review data access layer (Phase 9 — Subtask 3)
 *
 * Implements strict domain boundaries:
 * - Direct table INSERT/UPDATE/DELETE on public.verification_requests is NEVER called.
 * - Approvals/rejections invoke authoritative PostgreSQL RPCs: approve_verification_request / reject_verification_request.
 * - Server-side authorization enforced via is_community_moderator() in RLS & RPCs.
 * - PERSON != USER: Verification attests to census data accuracy, NOT user account linkage.
 * - CLAIM != VERIFICATION: Claims link identity; verifications validate census records.
 * - VERIFICATION != OWNERSHIP: Verification does not alter record creators or ownership.
 * - Scope strictly bounded to PERSON and FAMILY entity types.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import {
  approveVerificationRequestSchema,
  rejectVerificationRequestSchema,
  type ApproveVerificationRequestFormData,
  type RejectVerificationRequestFormData,
} from '../schemas/verification.schemas'
import type {
  VerificationRequest,
  VerificationRequestForReview,
  ApproveVerificationRequestInput,
  RejectVerificationRequestInput,
  VerificationReviewFilters,
} from '../types'
import { ZodError } from 'zod'

// Helper accessors for dynamic table access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const verificationRequestsTable = () => (supabase.from as any)('verification_requests')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const personsTable = () => (supabase.from as any)('persons')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const familiesTable = () => (supabase.from as any)('families')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const profilesTable = () => (supabase.from as any)('profiles')

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Sanitizes Supabase/PostgreSQL database errors from verification review RPCs
 * into safe, human-readable user messages without leaking schema internals.
 */
export function sanitizeVerificationReviewError(
  err: unknown,
  defaultMessage: string = 'An error occurred during verification review. Please try again.',
  action: 'approve' | 'reject' = 'approve'
): string {
  if (!err) {
    return defaultMessage
  }

  const message =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message ?? ''

  // State machine concurrency conflicts
  if (
    message.includes('expected PENDING') ||
    message.includes('terminal state') ||
    message.includes('Invalid verification request status transition')
  ) {
    return 'This verification request has already been reviewed or cancelled. Please refresh the queue.'
  }

  // Target entity status mismatch
  if (message.includes('expected PENDING') || message.includes('verification status')) {
    return 'The target record is no longer pending verification. Please refresh the page.'
  }

  // Soft-deleted or inactive targets
  if (message.includes('soft-deleted') || message.includes('inactive') || message.includes('must be ACTIVE')) {
    return 'Cannot review verification for an inactive or deleted record.'
  }

  // Target record not found
  if (message.includes('does not exist') || message.includes('not found')) {
    return 'The requested record or verification request could not be found.'
  }

  // Authorization failures
  if (
    message.includes('Unauthorized') ||
    message.includes('permission denied') ||
    message.includes('only community moderators')
  ) {
    return 'Unauthorized: only community moderators and administrators can review verification requests.'
  }

  if (message.includes('Unauthenticated') || message.includes('signed in')) {
    return 'You must be signed in as a moderator to perform this action.'
  }

  // Validation errors
  if (message.includes('Rejection reason is required') || message.includes('cannot be empty')) {
    return 'A rejection reason is required.'
  }

  if (message.includes('1000 characters')) {
    return action === 'reject'
      ? 'Rejection reason must not exceed 1000 characters.'
      : 'Supporting notes must not exceed 1000 characters.'
  }

  return defaultMessage
}

/**
 * Fetches verification requests for moderator review, enriched with target Person/Family
 * and Requester profile summaries. Enforces server-side RLS (moderators only).
 *
 * @param filters - Optional filters (status, entityType, search query)
 * @param callerUserId - Optional caller UUID override
 */
export async function listVerificationRequestsForReview(
  filters?: VerificationReviewFilters,
  callerUserId?: string
): Promise<ApiResponse<VerificationRequestForReview[]>> {
  let userId = callerUserId
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData.user?.id
  }

  if (!userId || !isValidUuid(userId)) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Moderator authentication required.' },
    }
  }

  try {
    // 1. Build query for verification requests
    let query = verificationRequestsTable()
      .select('*')
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.entityType) {
      query = query.eq('entity_type', filters.entityType)
    }

    const { data: requestsData, error: requestsError } = await query

    if (requestsError) {
      return {
        data: null,
        error: {
          code: requestsError.code || 'DB_ERROR',
          message: sanitizeVerificationReviewError(requestsError, 'Failed to fetch verification review queue.'),
        },
      }
    }

    const requests = (requestsData ?? []) as VerificationRequest[]
    if (requests.length === 0) {
      return { data: [], error: null }
    }

    // 2. Collect target IDs and user profile IDs
    const personIds = Array.from(
      new Set(
        requests
          .filter((r) => r.entity_type === 'PERSON' && isValidUuid(r.entity_id))
          .map((r) => r.entity_id)
      )
    )

    const familyIds = Array.from(
      new Set(
        requests
          .filter((r) => r.entity_type === 'FAMILY' && isValidUuid(r.entity_id))
          .map((r) => r.entity_id)
      )
    )

    const userIds = Array.from(
      new Set(
        [
          ...requests.map((r) => r.requester_id),
          ...requests.map((r) => r.reviewed_by).filter(Boolean) as string[],
        ].filter(isValidUuid)
      )
    )

    // 3. Batch fetch persons
    const personMap = new Map<string, NonNullable<VerificationRequestForReview['person']>>()
    if (personIds.length > 0) {
      const { data: personsData } = await personsTable()
        .select('id, first_name, middle_name, last_name, gender, date_of_birth, date_of_death, birth_place, gotra, nukh, kul, status, verification_status')
        .in('id', personIds)

      for (const p of personsData ?? []) {
        personMap.set(p.id, p)
      }
    }

    // 4. Batch fetch families
    const familyMap = new Map<string, NonNullable<VerificationRequestForReview['family']>>()
    if (familyIds.length > 0) {
      const { data: familiesData } = await familiesTable()
        .select('id, family_name, description, gotra, nukh, kul, city, state, country, status, verification_status')
        .in('id', familyIds)

      for (const f of familiesData ?? []) {
        familyMap.set(f.id, f)
      }
    }

    // 5. Batch fetch profiles
    const profileMap = new Map<string, { id: string; display_name: string | null; avatar_url: string | null; email?: string | null }>()
    if (userIds.length > 0) {
      const { data: profilesData } = await profilesTable()
        .select('id, display_name, avatar_url, email')
        .in('id', userIds)

      for (const prof of profilesData ?? []) {
        profileMap.set(prof.id, prof)
      }
    }

    // 6. Map combined enriched records
    let result: VerificationRequestForReview[] = requests.map((req) => {
      const person = req.entity_type === 'PERSON' ? personMap.get(req.entity_id) ?? null : null
      const family = req.entity_type === 'FAMILY' ? familyMap.get(req.entity_id) ?? null : null
      const requester = profileMap.get(req.requester_id) ?? null
      const reviewer = req.reviewed_by ? profileMap.get(req.reviewed_by) ?? null : null

      return {
        ...req,
        person,
        family,
        requester,
        reviewer: reviewer ? { id: reviewer.id, display_name: reviewer.display_name } : null,
      }
    })

    // 7. Client-side search filtering if requested
    if (filters?.search && filters.search.trim().length > 0) {
      const queryLower = filters.search.trim().toLowerCase()
      result = result.filter((item) => {
        const personName = item.person
          ? `${item.person.first_name} ${item.person.middle_name || ''} ${item.person.last_name}`.toLowerCase()
          : ''
        const familyName = item.family?.family_name.toLowerCase() ?? ''
        const requesterName = item.requester?.display_name?.toLowerCase() ?? ''
        const requesterEmail = item.requester?.email?.toLowerCase() ?? ''
        const notes = item.supporting_notes?.toLowerCase() ?? ''

        return (
          personName.includes(queryLower) ||
          familyName.includes(queryLower) ||
          requesterName.includes(queryLower) ||
          requesterEmail.includes(queryLower) ||
          notes.includes(queryLower)
        )
      })
    }

    return { data: result, error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeVerificationReviewError(err, 'An unexpected error occurred while fetching the review queue.'),
      },
    }
  }
}

/**
 * Fetches a single verification request with target Person/Family and Requester details.
 *
 * @param requestId - Target verification request UUID
 * @param callerUserId - Optional caller UUID override
 */
export async function getVerificationRequestForReview(
  requestId: string,
  callerUserId?: string
): Promise<ApiResponse<VerificationRequestForReview | null>> {
  if (!requestId || !isValidUuid(requestId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid verification request ID is required.' },
    }
  }

  let userId = callerUserId
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData.user?.id
  }

  if (!userId || !isValidUuid(userId)) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Moderator authentication required.' },
    }
  }

  try {
    const { data: reqData, error: reqError } = await verificationRequestsTable()
      .select('*')
      .eq('id', requestId)
      .maybeSingle()

    if (reqError) {
      return {
        data: null,
        error: {
          code: reqError.code || 'DB_ERROR',
          message: sanitizeVerificationReviewError(reqError, 'Failed to fetch verification request.'),
        },
      }
    }

    if (!reqData) {
      return { data: null, error: null }
    }

    const req = reqData as VerificationRequest

    // Fetch target entity
    let person: VerificationRequestForReview['person'] = null
    let family: VerificationRequestForReview['family'] = null

    if (req.entity_type === 'PERSON') {
      const { data: pData } = await personsTable()
        .select('id, first_name, middle_name, last_name, gender, date_of_birth, date_of_death, birth_place, gotra, nukh, kul, status, verification_status')
        .eq('id', req.entity_id)
        .maybeSingle()
      person = pData ?? null
    } else if (req.entity_type === 'FAMILY') {
      const { data: fData } = await familiesTable()
        .select('id, family_name, description, gotra, nukh, kul, city, state, country, status, verification_status')
        .eq('id', req.entity_id)
        .maybeSingle()
      family = fData ?? null
    }

    // Fetch requester and reviewer profiles
    const userIds = [req.requester_id, req.reviewed_by].filter(Boolean) as string[]
    const { data: profilesData } = await profilesTable()
      .select('id, display_name, avatar_url, email')
      .in('id', userIds)

    const profileMap = new Map<string, { id: string; display_name: string | null; avatar_url: string | null; email?: string | null }>()
    for (const prof of profilesData ?? []) {
      profileMap.set(prof.id, prof)
    }

    const requester = profileMap.get(req.requester_id) ?? null
    const reviewerProfile = req.reviewed_by ? profileMap.get(req.reviewed_by) : null

    return {
      data: {
        ...req,
        person,
        family,
        requester,
        reviewer: reviewerProfile ? { id: reviewerProfile.id, display_name: reviewerProfile.display_name } : null,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeVerificationReviewError(err, 'An unexpected error occurred while fetching request details.'),
      },
    }
  }
}

/**
 * Approves a pending verification request via the authoritative PostgreSQL function `approve_verification_request`.
 *
 * DB-level guarantees:
 * - Caller must be community moderator or admin (is_community_moderator() in SQL).
 * - Locks verification_requests row FOR UPDATE.
 * - Validates status is PENDING.
 * - Validates target Person/Family is ACTIVE, non-deleted, and in PENDING verification status.
 * - Transitions target entity verification_status = 'VERIFIED'.
 * - Transitions verification_requests.status = 'APPROVED'.
 * - Writes immutable audit log event.
 *
 * @param input - Contains requestId
 * @param callerUserId - Optional caller UUID override
 */
export async function approveVerificationRequest(
  input: ApproveVerificationRequestInput,
  callerUserId?: string
): Promise<ApiResponse<{ success: boolean }>> {
  let userId = callerUserId
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData.user?.id
  }

  if (!userId || !isValidUuid(userId)) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Moderator authentication required.' },
    }
  }

  let validated: ApproveVerificationRequestFormData
  try {
    validated = approveVerificationRequestSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors[0]?.message ?? 'Invalid approval parameters.',
        },
      }
    }
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid approval parameters.' },
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('approve_verification_request', {
      p_request_id: validated.requestId,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'DB_ERROR',
          message: sanitizeVerificationReviewError(error, 'Failed to approve verification request.', 'approve'),
        },
      }
    }

    return {
      data: { success: Boolean(data) },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeVerificationReviewError(err, 'An unexpected error occurred during request approval.', 'approve'),
      },
    }
  }
}

/**
 * Rejects a pending verification request via the authoritative PostgreSQL function `reject_verification_request`.
 *
 * DB-level guarantees:
 * - Caller must be community moderator or admin (is_community_moderator() in SQL).
 * - Locks verification_requests row FOR UPDATE.
 * - Validates status is PENDING and rejection reason is non-empty and <= 1000 chars.
 * - Validates target Person/Family is ACTIVE, non-deleted, and in PENDING verification status.
 * - Reverts target entity verification_status = 'UNVERIFIED'.
 * - Sets verification_requests.status = 'REJECTED' with rejection_reason, reviewed_by, reviewed_at.
 * - Writes immutable audit log event.
 *
 * @param input - Contains requestId and reason
 * @param callerUserId - Optional caller UUID override
 */
export async function rejectVerificationRequest(
  input: RejectVerificationRequestInput,
  callerUserId?: string
): Promise<ApiResponse<{ success: boolean }>> {
  let userId = callerUserId
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData.user?.id
  }

  if (!userId || !isValidUuid(userId)) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Moderator authentication required.' },
    }
  }

  let validated: RejectVerificationRequestFormData
  try {
    validated = rejectVerificationRequestSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors[0]?.message ?? 'Invalid rejection parameters.',
        },
      }
    }
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid rejection parameters.' },
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('reject_verification_request', {
      p_request_id: validated.requestId,
      p_rejection_reason: validated.reason,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'DB_ERROR',
          message: sanitizeVerificationReviewError(error, 'Failed to reject verification request.', 'reject'),
        },
      }
    }

    return {
      data: { success: Boolean(data) },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeVerificationReviewError(err, 'An unexpected error occurred during request rejection.', 'reject'),
      },
    }
  }
}
