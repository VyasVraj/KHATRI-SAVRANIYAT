/**
 * Types definition for the Claims feature domain (Phase 8)
 *
 * Implements the PERSON != USER boundary:
 * A census Person record can be claimed by an authenticated User.
 * Linkage occurs strictly upon authorized approval by community moderators/admins.
 */

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface PersonClaim {
  id: string
  person_id: string
  claimant_id: string
  status: ClaimStatus
  evidence_notes: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface SubmitClaimInput {
  personId: string
  evidenceNotes?: string
}

export interface CancelClaimInput {
  claimId: string
  personId: string
}

/** Detailed claim model including target person and claimant summaries for moderator review */
export interface ClaimForReview extends PersonClaim {
  person: {
    id: string
    first_name: string
    middle_name: string | null
    last_name: string
    date_of_birth: string | null
    birth_place: string | null
    gotra: string | null
    nukh: string | null
    kul: string | null
    status: string
    verification_status: string
    user_id: string | null
  } | null
  claimant: {
    id: string
    display_name: string | null
    avatar_url: string | null
    email?: string | null
  } | null
}

export interface ApproveClaimInput {
  claimId: string
}

export interface RejectClaimInput {
  claimId: string
  reason: string
}
