/**
 * Verification Service — Client data access layer for verification requests (Phase 9 — Subtask 2)
 *
 * Implements strict domain boundaries:
 * - Direct table INSERT/UPDATE/DELETE on public.verification_requests is NEVER called.
 * - Routing strictly through canonical PostgreSQL RPC: submit_verification_request.
 * - PERSON != USER: Verification validates census accuracy, never modifies persons.user_id.
 * - CLAIM != VERIFICATION: Claims manage identity linking; verifications attest to record authenticity.
 * - VERIFICATION != OWNERSHIP: Verification does not alter created_by or transfer ownership.
 * - SCOPE: Strictly PERSON and FAMILY entities.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import {
  submitVerificationRequestSchema,
  type SubmitVerificationRequestFormData,
} from '../schemas/verification.schemas'
import type {
  SubmitVerificationRequestInput,
  SubmitVerificationResult,
} from '../types'
import { ZodError } from 'zod'

/**
 * Sanitizes PostgreSQL / Supabase errors from verification RPCs into safe, user-friendly messages.
 * Never leaks raw database schemas, query strings, or internal table constraints.
 */
export function sanitizeVerificationError(
  err: unknown,
  defaultMessage: string = 'An error occurred while submitting the verification request. Please try again.'
): string {
  if (!err) {
    return defaultMessage
  }

  const message =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message ?? ''

  if (message.includes('deceased') || message.includes('Cannot verify deceased persons')) {
    return 'Cannot verify deceased persons.'
  }

  if (message.includes('already verified')) {
    return 'This record is already verified.'
  }

  if (
    message.includes('already pending') ||
    message.includes('already has a pending verification') ||
    message.includes('idx_verification_requests_one_pending')
  ) {
    return 'A verification request is already pending for this record.'
  }

  if (message.includes('inactive') || message.includes('Person not found or is inactive')) {
    return 'The specified record was not found or is inactive.'
  }

  if (message.includes('soft-deleted')) {
    return 'Cannot request verification for a deleted record.'
  }

  if (
    message.includes('Unauthenticated') ||
    message.includes('signed in')
  ) {
    return 'You must be signed in to submit a verification request.'
  }

  if (
    message.includes('permission denied') ||
    message.includes('Unauthorized')
  ) {
    return 'You do not have permission to submit verification requests.'
  }

  if (message.includes('1000 characters')) {
    return 'Verification request validation failed. Supporting notes must not exceed 1000 characters.'
  }

  return defaultMessage
}

/**
 * Submits a verification request for an eligible Person or Family record.
 * Atomically transitions target entity verification_status to PENDING via server-side RPC.
 *
 * @param input - The verification request submission parameters
 * @param callerUserId - Optional caller user ID override (for test harnesses or pre-authenticated contexts)
 * @returns ApiResponse containing the created request ID and target details
 */
export async function submitVerificationRequest(
  input: SubmitVerificationRequestInput,
  callerUserId?: string
): Promise<ApiResponse<SubmitVerificationResult>> {
  if (!callerUserId) {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      return {
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You must be signed in to submit a verification request.',
        },
      }
    }
  }

  let validated: SubmitVerificationRequestFormData

  try {
    validated = submitVerificationRequestSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      const firstIssue = err.issues[0]
      return {
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: firstIssue?.message ?? 'Invalid verification request parameters.',
        },
      }
    }
    return {
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid verification request input.',
      },
    }
  }

  try {
    // Invoke canonical RPC submit_verification_request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: requestId, error } = await (supabase.rpc as any)(
      'submit_verification_request',
      {
        p_entity_type: validated.entityType,
        p_entity_id: validated.entityId,
        p_supporting_notes: validated.supportingNotes ?? null,
      }
    )

    if (error) {
      return {
        data: null,
        error: {
          code: 'RPC_ERROR',
          message: sanitizeVerificationError(error),
        },
      }
    }

    if (!requestId || typeof requestId !== 'string') {
      return {
        data: null,
        error: {
          code: 'VERIFICATION_SUBMIT_INVALID_RESPONSE',
          message: 'Server returned an invalid verification request identifier.',
        },
      }
    }

    return {
      data: {
        requestId,
        entityType: validated.entityType,
        entityId: validated.entityId,
        status: 'PENDING',
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: (err as Error)?.message ?? 'An unexpected error occurred while submitting your verification request.',
      },
    }
  }
}

/**
 * Cancels a pending verification request.
 * Can be called by the original requester or a community moderator.
 * Reverts the target entity back to UNVERIFIED.
 *
 * @param requestId - The UUID of the verification request to cancel
 * @returns ApiResponse containing boolean success
 */
export async function cancelVerificationRequest(
  requestId: string
): Promise<ApiResponse<boolean>> {
  if (!requestId || typeof requestId !== 'string') {
    return {
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'A valid verification request ID is required to cancel.',
      },
    }
  }

  try {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) {
      return {
        data: null,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You must be signed in to cancel a verification request.',
        },
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: result, error } = await (supabase.rpc as any)(
      'cancel_verification_request',
      {
        p_request_id: requestId,
      }
    )

    if (error) {
      return {
        data: null,
        error: {
          code: 'RPC_ERROR',
          message: sanitizeVerificationError(error, 'Failed to cancel verification request.'),
        },
      }
    }

    return {
      data: Boolean(result),
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message:
          (err as Error)?.message ??
          'An unexpected error occurred while cancelling your verification request.',
      },
    }
  }
}

