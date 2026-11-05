/**
 * Invitations Service — Client data access layer for family invitations (Phase 8 — Subtask 4B)
 *
 * Implements strict domain boundaries:
 * - Routing strictly through canonical PostgreSQL RPCs:
 *   1. create_family_invitation
 *   2. get_invitation_by_token
 *   3. accept_invitation
 * - Direct table INSERT/UPDATE/DELETE on public.invitations is NEVER called.
 * - Plaintext tokens are NEVER stored in the database or logged.
 * - PERSON != USER: accept_invitation NEVER modifies persons.user_id.
 * - INVITATION != CLAIM: Invitations are family membership mechanisms, not identity claims.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import {
  createFamilyInvitationSchema,
  type CreateFamilyInvitationFormData,
} from '../schemas/invitation.schemas'
import {
  generateInvitationToken,
  hashInvitationToken,
} from '../utils/token'
import type {
  InvitationPreview,
  CreateFamilyInvitationInput,
  CreatedInvitationResult,
} from '../types'
import { ZodError } from 'zod'

/**
 * Sanitizes PostgreSQL / Supabase errors from invitation RPCs into safe, user-friendly messages.
 * Never leaks raw database schemas, query strings, or internal constraints.
 */
function sanitizeInvitationError(
  err: unknown,
  defaultMessage: string,
  action: 'create' | 'preview' | 'accept' = 'create'
): string {
  if (!err || typeof err !== 'object') {
    return defaultMessage
  }

  const pgError = err as { code?: string; message?: string; details?: string }
  const message = pgError.message ?? ''

  if (action === 'create') {
    if (message.includes('Authentication required')) {
      return 'You must be signed in to create a family invitation.'
    }
    if (message.includes('not authorized') || pgError.code === '42501') {
      return 'You are not authorized to create invitations for this family. Only the family creator or community moderators can issue invitations.'
    }
    if (message.includes('pending invitation already exists') || message.includes('idx_invitations_one_pending_per_person')) {
      return 'An active pending invitation already exists for this person in this family.'
    }
    if (message.includes('already an active member') || pgError.code === '23505') {
      return 'This person is already an active member of this family.'
    }
    if (message.includes('deceased')) {
      return 'Cannot issue an invitation for a deceased person record.'
    }
    if (pgError.code === 'P0002' || message.includes('does not exist')) {
      return 'The target family or person record was not found or is no longer active.'
    }
    if (pgError.code === '23514') {
      return 'Invitation validation failed. Please check the email and expiration date.'
    }
    return message || defaultMessage
  }

  if (action === 'preview') {
    if (pgError.code === 'P0002' || message.includes('not found')) {
      return 'Invitation not found. The link may be invalid or expired.'
    }
    return message || defaultMessage
  }

  if (action === 'accept') {
    if (pgError.code === '42501' || message.includes('Authentication required')) {
      return 'You must sign in to accept this invitation.'
    }
    if (message.includes('Invalid invitation token')) {
      return 'Invalid invitation link or token.'
    }
    if (pgError.code === 'P0002' || message.includes('Invitation not found')) {
      return 'Invitation was not found or does not exist.'
    }
    if (message.includes('no longer active') || message.includes('status:')) {
      return 'This invitation is no longer active (already accepted, revoked, or replaced).'
    }
    if (message.includes('expired') || message.includes('Invitation has expired')) {
      return 'This invitation has expired. Please request a new invitation.'
    }
    if (message.includes('deceased')) {
      return 'Cannot accept an invitation for a deceased person record.'
    }
    if (pgError.code === 'P0002' || message.includes('inactive') || message.includes('does not exist')) {
      return 'The target family or person record is no longer active.'
    }
    return message || defaultMessage
  }

  return message || defaultMessage
}

/**
 * Creates a new family member invitation.
 *
 * Client workflow:
 * 1. Validates input schema via Zod.
 * 2. Generates 256-bit cryptographic token.
 * 3. Hashes token using SHA-256 via Web Crypto.
 * 4. Calls canonical RPC public.create_family_invitation with token_hash.
 * 5. Returns plaintext token and full shareable URL to the caller (NEVER stored in DB).
 *
 * @param input - Family ID, Person ID, invited recipient email, role, and optional expiration
 * @param origin - Optional window.location.origin for constructing absolute invite URL
 */
export async function createFamilyInvitation(
  input: CreateFamilyInvitationInput,
  origin: string = typeof window !== 'undefined' ? window.location.origin : ''
): Promise<ApiResponse<CreatedInvitationResult>> {
  let validated: CreateFamilyInvitationFormData
  try {
    validated = createFamilyInvitationSchema.parse(input)
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: { code: 'VALIDATION_ERROR', message: err.errors[0]?.message ?? 'Invalid input.' },
      }
    }
    return { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid input.' } }
  }

  // Expiration: default to 7 days from now if not explicitly provided
  const expiresAt =
    validated.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  try {
    // Generate secure plaintext token and compute SHA-256 hash
    const plaintextToken = generateInvitationToken()
    const tokenHash = await hashInvitationToken(plaintextToken)

    // Call canonical RPC with 6 parameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invitationId, error } = await (supabase.rpc as any)('create_family_invitation', {
      p_family_id: validated.familyId,
      p_person_id: validated.personId,
      p_invited_email: validated.invitedEmail,
      p_role: validated.role,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'INVITATION_CREATE_FAILED',
          message: sanitizeInvitationError(error, 'Failed to create family invitation.', 'create'),
        },
      }
    }

    const inviteUrl = `${origin}/invite/${plaintextToken}`

    return {
      data: {
        id: invitationId as string,
        familyId: validated.familyId,
        personId: validated.personId,
        invitedEmail: validated.invitedEmail,
        role: validated.role,
        token: plaintextToken,
        inviteUrl,
        expiresAt,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'INVITATION_CREATE_FAILED',
        message: sanitizeInvitationError(err, 'Failed to create family invitation.', 'create'),
      },
    }
  }
}

/**
 * Resolves an invitation token to safe public preview fields for redemption.
 *
 * Computes the SHA-256 hash client-side and passes only p_token_hash to the RPC.
 * Accessible to anonymous users and authenticated users.
 *
 * @param token - Plaintext invitation token from URL
 */
export async function getInvitationByToken(
  token: string
): Promise<ApiResponse<InvitationPreview | null>> {
  const trimmed = token?.trim()
  if (!trimmed) {
    return {
      data: null,
      error: { code: 'INVALID_TOKEN', message: 'Invitation token is missing or empty.' },
    }
  }

  try {
    const tokenHash = await hashInvitationToken(trimmed)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_invitation_by_token', {
      p_token_hash: tokenHash,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'PREVIEW_ERROR',
          message: sanitizeInvitationError(error, 'Could not retrieve invitation details.', 'preview'),
        },
      }
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return {
        data: null,
        error: { code: 'NOT_FOUND', message: 'Invitation not found. The link may be invalid or expired.' },
      }
    }

    const row = data[0] as InvitationPreview
    return { data: row, error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'PREVIEW_ERROR',
        message: sanitizeInvitationError(err, 'Could not retrieve invitation details.', 'preview'),
      },
    }
  }
}

/**
 * Accepts a family invitation.
 *
 * Computes SHA-256 hash client-side and invokes canonical RPC accept_invitation.
 * Requires authenticated session.
 * PERSON != USER: Adds person to family_members with is_head=FALSE, never touches persons.user_id.
 *
 * @param token - Plaintext invitation token
 */
export async function acceptInvitation(token: string): Promise<ApiResponse<boolean>> {
  const trimmed = token?.trim()
  if (!trimmed) {
    return {
      data: null,
      error: { code: 'INVALID_TOKEN', message: 'Invitation token is missing or empty.' },
    }
  }

  try {
    const tokenHash = await hashInvitationToken(trimmed)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('accept_invitation', {
      p_token_hash: tokenHash,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'ACCEPT_ERROR',
          message: sanitizeInvitationError(error, 'Failed to accept invitation.', 'accept'),
        },
      }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'ACCEPT_ERROR',
        message: sanitizeInvitationError(err, 'Failed to accept invitation.', 'accept'),
      },
    }
  }
}
