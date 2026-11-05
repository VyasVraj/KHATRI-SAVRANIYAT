/**
 * Claims Service — Claim lifecycle operations for census persons (Phase 8)
 *
 * Implements the PERSON != USER boundary:
 * - A Person record represents a census/community entity.
 * - An authenticated User represents an application account.
 * - A claim allows an authenticated user to request linking their account to an unclaimed Person record.
 * - Linking occurs strictly via authorized review (approve_person_claim RPC), NOT directly by the claimant.
 * - Claimants may submit claims and cancel their own pending claims.
 * - Community moderators / admins review pending claims, approving or rejecting via secure RPCs.
 * - Client code NEVER directly modifies persons.user_id or person_claims.status for approval/rejection.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import {
  submitClaimSchema,
  cancelClaimSchema,
  approveClaimSchema,
  rejectClaimSchema,
  type SubmitClaimFormData,
  type CancelClaimFormData,
  type ApproveClaimFormData,
  type RejectClaimFormData,
} from '../schemas/claims.schemas'
import type {
  PersonClaim,
  SubmitClaimInput,
  CancelClaimInput,
  ClaimForReview,
  ApproveClaimInput,
  RejectClaimInput,
} from '../types'
import { ZodError } from 'zod'

// Helpers for dynamic table access while preserving TypeScript types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const personClaimsTable = () => (supabase.from as any)('person_claims')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const personsTable = () => (supabase.from as any)('persons')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const profilesTable = () => (supabase.from as any)('profiles')

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Sanitizes Supabase database errors into safe, user-friendly error messages.
 * Never leaks raw PostgreSQL schema details or internal query information.
 */
function sanitizeClaimError(
  err: unknown,
  defaultMessage: string,
  action: 'submit' | 'cancel' | 'approve' | 'reject' = 'submit'
): string {
  if (!err || typeof err !== 'object') {
    return defaultMessage
  }

  const pgError = err as { code?: string; message?: string; details?: string }
  const message = pgError.message ?? ''

  if (action === 'approve') {
    if (pgError.code === '42501' || message.includes('Unauthorized')) {
      return 'You do not have permission to approve claims. Community moderator access is required.'
    }
    if (message.includes('already linked')) {
      return 'Target person is already linked to a user account or claimant already has a linked person record.'
    }
    if (message.includes('expected PENDING') || message.includes('state')) {
      return 'This claim has already been reviewed or cancelled.'
    }
    if (message.includes('Deceased') || message.includes('soft-deleted') || message.includes('ACTIVE')) {
      return 'Cannot approve claim: Target person record is no longer eligible (deceased, inactive, or removed).'
    }
    if (pgError.code === 'P0002') {
      return 'Claim or target person record does not exist.'
    }
    return message || defaultMessage
  }

  if (action === 'reject') {
    if (pgError.code === '42501' || message.includes('Unauthorized')) {
      return 'You do not have permission to reject claims. Community moderator access is required.'
    }
    if (message.includes('expected PENDING') || message.includes('state')) {
      return 'This claim has already been reviewed or cancelled.'
    }
    if (message.includes('empty') || message.includes('Rejection reason')) {
      return 'A valid rejection reason is required (up to 1000 characters).'
    }
    if (pgError.code === 'P0002') {
      return 'Claim record does not exist.'
    }
    return message || defaultMessage
  }

  if (pgError.code === '23505') {
    const combined = `${message} ${pgError.details ?? ''}`
    if (combined.includes('idx_person_claims_pending_person')) {
      return 'There is already a pending claim under review for this person.'
    }
    if (combined.includes('idx_person_claims_pending_claimant')) {
      return 'You already have an active pending claim. You can only have one pending claim at a time.'
    }
    return 'A pending claim already exists for this record or user account.'
  }

  if (pgError.code === '42501') {
    if (action === 'cancel') {
      return 'Unable to cancel claim. You may only cancel your own pending claims.'
    }
    return 'Unable to submit claim. This record may already be claimed, deceased, inactive, or your account may already be linked to a person record.'
  }

  if (pgError.code === '23514') {
    return 'Claim validation failed. Evidence notes must not exceed 1000 characters.'
  }

  return message || defaultMessage
}

/**
 * Submits a new claim on an unclaimed census person record.
 *
 * @param input - Contains personId and optional evidenceNotes
 * @param callerUserId - The authenticated user's ID
 */
export async function submitPersonClaim(
  input: SubmitClaimInput,
  callerUserId?: string
): Promise<ApiResponse<PersonClaim>> {
  let userId = callerUserId
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData.user?.id
  }

  if (!userId || !isValidUuid(userId)) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'You must be signed in to submit a claim.' },
    }
  }

  let validated: SubmitClaimFormData
  try {
    validated = submitClaimSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors[0]?.message ?? 'Invalid claim submission data.',
        },
      }
    }
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid claim submission data.' },
    }
  }

  try {
    const trimmedNotes = validated.evidenceNotes?.trim() || null

    const { data, error } = await personClaimsTable()
      .insert({
        person_id: validated.personId,
        claimant_id: userId,
        status: 'PENDING',
        evidence_notes: trimmedNotes,
      })
      .select('*')
      .single()

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'DB_ERROR',
          message: sanitizeClaimError(error, 'Failed to submit claim. Please try again.'),
        },
      }
    }

    return {
      data: data as PersonClaim,
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeClaimError(err, 'An unexpected error occurred while submitting your claim.'),
      },
    }
  }
}

/**
 * Fetches the caller's most recent claim for a specific person record.
 *
 * @param personId - Target person UUID
 * @param callerUserId - The authenticated user's ID
 */
export async function getMyClaimForPerson(
  personId: string,
  callerUserId?: string
): Promise<ApiResponse<PersonClaim | null>> {
  if (!personId || !isValidUuid(personId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid person ID is required.' },
    }
  }

  let userId = callerUserId
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData.user?.id
  }

  if (!userId) {
    return { data: null, error: null }
  }

  try {
    const { data, error } = await personClaimsTable()
      .select('*')
      .eq('person_id', personId)
      .eq('claimant_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'DB_ERROR',
          message: 'Failed to retrieve claim status.',
        },
      }
    }

    return {
      data: (data as PersonClaim | null) ?? null,
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeClaimError(err, 'An unexpected error occurred retrieving your claim.'),
      },
    }
  }
}

/**
 * Fetches all claims submitted by the authenticated claimant.
 *
 * @param callerUserId - The authenticated user's ID
 */
export async function getMyClaims(
  callerUserId?: string
): Promise<ApiResponse<PersonClaim[]>> {
  let userId = callerUserId
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData.user?.id
  }

  if (!userId) {
    return { data: [], error: null }
  }

  try {
    const { data, error } = await personClaimsTable()
      .select('*')
      .eq('claimant_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'DB_ERROR',
          message: 'Failed to retrieve your claims.',
        },
      }
    }

    return {
      data: (data as PersonClaim[]) || [],
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeClaimError(err, 'An unexpected error occurred retrieving your claims.'),
      },
    }
  }
}

/**
 * Cancels a pending claim submitted by the current authenticated user.
 *
 * @param input - Contains claimId and personId
 * @param callerUserId - The authenticated user's ID
 */
export async function cancelPersonClaim(
  input: CancelClaimInput,
  callerUserId?: string
): Promise<ApiResponse<PersonClaim>> {
  let userId = callerUserId
  if (!userId) {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData.user?.id
  }

  if (!userId || !isValidUuid(userId)) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'You must be signed in to cancel a claim.' },
    }
  }

  let validated: CancelClaimFormData
  try {
    validated = cancelClaimSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors[0]?.message ?? 'Invalid claim cancellation data.',
        },
      }
    }
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid claim cancellation data.' },
    }
  }

  try {
    const { data, error } = await personClaimsTable()
      .update({ status: 'CANCELLED' })
      .eq('id', validated.claimId)
      .eq('claimant_id', userId)
      .eq('status', 'PENDING')
      .select('*')
      .single()

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'DB_ERROR',
          message: sanitizeClaimError(
            error,
            'Unable to cancel claim. The claim may have already been reviewed or does not belong to you.',
            'cancel'
          ),
        },
      }
    }

    return {
      data: data as PersonClaim,
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeClaimError(
          err,
          'An unexpected error occurred while cancelling your claim.',
          'cancel'
        ),
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Moderator Review Workflows (Phase 8 Subtask 3)
// ---------------------------------------------------------------------------

/**
 * Fetches all pending claims for moderator/admin review.
 * Enforces server-side RLS: only community moderators/administrators receive records.
 *
 * @param callerUserId - Optional caller UUID
 */
export async function listPendingClaimsForReview(
  callerUserId?: string
): Promise<ApiResponse<ClaimForReview[]>> {
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
    // 1. Fetch pending claims
    const { data: claimsData, error: claimsError } = await personClaimsTable()
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })

    if (claimsError) {
      return {
        data: null,
        error: {
          code: claimsError.code || 'DB_ERROR',
          message: claimsError.message || 'Failed to fetch pending claims queue.',
        },
      }
    }

    const claims = (claimsData ?? []) as PersonClaim[]
    if (claims.length === 0) {
      return { data: [], error: null }
    }

    // 2. Fetch associated target persons
    const personIds = Array.from(new Set(claims.map((c) => c.person_id)))
    const { data: personsData } = await personsTable()
      .select('id, first_name, middle_name, last_name, date_of_birth, birth_place, gotra, nukh, kul, status, verification_status, user_id')
      .in('id', personIds)

    const personMap = new Map<string, ClaimForReview['person']>()
    for (const p of personsData ?? []) {
      personMap.set(p.id, p)
    }

    // 3. Fetch associated claimant profiles (gracefully handled if RLS restricts)
    const claimantIds = Array.from(new Set(claims.map((c) => c.claimant_id)))
    const { data: profilesData } = await profilesTable()
      .select('id, display_name, avatar_url, email')
      .in('id', claimantIds)

    const profileMap = new Map<string, ClaimForReview['claimant']>()
    for (const prof of profilesData ?? []) {
      profileMap.set(prof.id, prof)
    }

    // 4. Map combined ClaimForReview records
    const result: ClaimForReview[] = claims.map((claim) => ({
      ...claim,
      person: personMap.get(claim.person_id) ?? null,
      claimant: profileMap.get(claim.claimant_id) ?? null,
    }))

    return { data: result, error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeClaimError(err, 'An error occurred fetching the review queue.'),
      },
    }
  }
}

/**
 * Fetches a single claim with person and claimant details for moderator review.
 *
 * @param claimId - Target claim UUID
 * @param callerUserId - Optional caller UUID
 */
export async function getClaimForReview(
  claimId: string,
  callerUserId?: string
): Promise<ApiResponse<ClaimForReview | null>> {
  if (!claimId || !isValidUuid(claimId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid claim ID is required.' },
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
    const { data: claimData, error: claimError } = await personClaimsTable()
      .select('*')
      .eq('id', claimId)
      .maybeSingle()

    if (claimError) {
      return {
        data: null,
        error: {
          code: claimError.code || 'DB_ERROR',
          message: claimError.message || 'Failed to fetch claim details.',
        },
      }
    }

    if (!claimData) {
      return { data: null, error: null }
    }

    const claim = claimData as PersonClaim

    // Fetch target person
    const { data: personData } = await personsTable()
      .select('id, first_name, middle_name, last_name, date_of_birth, birth_place, gotra, nukh, kul, status, verification_status, user_id')
      .eq('id', claim.person_id)
      .maybeSingle()

    // Fetch claimant profile
    const { data: profileData } = await profilesTable()
      .select('id, display_name, avatar_url, email')
      .eq('id', claim.claimant_id)
      .maybeSingle()

    return {
      data: {
        ...claim,
        person: personData ?? null,
        claimant: profileData ?? null,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: sanitizeClaimError(err, 'An error occurred fetching the claim record.'),
      },
    }
  }
}

/**
 * Approves a pending person claim via the authoritative database function `approve_person_claim`.
 *
 * INVARIANTS ENFORCED AT DB LEVEL:
 * - Caller must be community moderator or administrator (is_community_moderator() in SQL).
 * - Claim must be PENDING; locks rows for update.
 * - Person must be unclaimed, active, non-deleted, and living.
 * - Claimant must not have any existing linked person record.
 * - Atomically links persons.user_id = claim.claimant_id.
 * - Transitions person_claims.status = APPROVED.
 * - Writes immutable audit log event.
 *
 * @param input - Contains claimId
 * @param callerUserId - Optional caller UUID
 */
export async function approveClaim(
  input: ApproveClaimInput,
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

  let validated: ApproveClaimFormData
  try {
    validated = approveClaimSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors[0]?.message ?? 'Invalid approval input.',
        },
      }
    }
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid approval input.' },
    }
  }

  try {
    // Invoke authoritative database RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('approve_person_claim', {
      p_claim_id: validated.claimId,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'DB_ERROR',
          message: sanitizeClaimError(error, 'Failed to approve claim.', 'approve'),
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
        message: sanitizeClaimError(err, 'An unexpected error occurred during claim approval.', 'approve'),
      },
    }
  }
}

/**
 * Rejects a pending person claim via the authoritative database function `reject_person_claim`.
 *
 * INVARIANTS ENFORCED AT DB LEVEL:
 * - Caller must be community moderator or administrator (is_community_moderator() in SQL).
 * - Claim must be PENDING; locks row for update.
 * - Rejection reason is mandatory, trimmed, and between 1 and 1000 characters.
 * - Transitions person_claims.status = REJECTED.
 * - Writes immutable audit log event.
 *
 * @param input - Contains claimId and reason
 * @param callerUserId - Optional caller UUID
 */
export async function rejectClaim(
  input: RejectClaimInput,
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

  let validated: RejectClaimFormData
  try {
    validated = rejectClaimSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors[0]?.message ?? 'Invalid rejection input.',
        },
      }
    }
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid rejection input.' },
    }
  }

  try {
    // Invoke authoritative database RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('reject_person_claim', {
      p_claim_id: validated.claimId,
      p_reason: validated.reason,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'DB_ERROR',
          message: sanitizeClaimError(error, 'Failed to reject claim.', 'reject'),
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
        message: sanitizeClaimError(err, 'An unexpected error occurred during claim rejection.', 'reject'),
      },
    }
  }
}
