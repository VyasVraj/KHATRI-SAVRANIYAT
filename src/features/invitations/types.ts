/**
 * Invitation types definition (Phase 8 — Subtask 4B)
 *
 * Implements the domain boundaries:
 * - PERSON != USER: Invitations target a census Person and add them to a Family.
 *   Acceptance does NOT claim the Person record and never sets persons.user_id.
 * - INVITATION != CLAIM: Invitations are family membership mechanisms, not identity claims.
 * - Plaintext tokens exist ONLY in client memory for URL creation and URL params.
 * - Only 64-char lowercase SHA-256 token_hash is transmitted to and stored by the database.
 */

import type { FamilyRole } from '@/types'

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'

/** Safe public preview projection returned by get_invitation_by_token */
export interface InvitationPreview {
  id: string
  family_id: string
  family_name: string | null
  person_id: string
  person_name: string | null
  invited_email: string
  role: FamilyRole
  status: InvitationStatus
  expires_at: string
  is_expired: boolean
}

/** Input to create a family invitation */
export interface CreateFamilyInvitationInput {
  familyId: string
  personId: string
  invitedEmail: string
  role: FamilyRole
  /** Optional custom expiration date; defaults to 7 days from now if omitted */
  expiresAt?: string
}

/** Result of successfully creating an invitation client-side */
export interface CreatedInvitationResult {
  id: string
  familyId: string
  personId: string
  invitedEmail: string
  role: FamilyRole
  /** Plaintext token generated client-side for sharing; NEVER stored in DB */
  token: string
  /** Full shareable invitation URL */
  inviteUrl: string
  expiresAt: string
}
