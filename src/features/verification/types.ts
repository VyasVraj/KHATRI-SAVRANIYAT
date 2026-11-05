/**
 * Verification Feature Types (Phase 9 — Subtasks 2 & 3)
 *
 * Implements architectural boundaries:
 * - PERSON != USER: Verification attests to census data accuracy, NOT user account linkage.
 * - CLAIM != VERIFICATION: Identity claims link users; verifications validate community records.
 * - VERIFICATION != OWNERSHIP: Verification does not alter created_by or transfer record ownership.
 * - Strictly bounded to PERSON and FAMILY entity types.
 */

export type VerificationEntityType = 'PERSON' | 'FAMILY'

export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

export type VerificationRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface VerificationRequest {
  id: string
  entity_type: VerificationEntityType
  entity_id: string
  requester_id: string
  status: VerificationRequestStatus
  supporting_notes: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface SubmitVerificationRequestInput {
  entityType: VerificationEntityType
  entityId: string
  supportingNotes?: string
}

export interface SubmitVerificationResult {
  requestId: string
  entityType: VerificationEntityType
  entityId: string
  status?: VerificationRequestStatus
}

/**
 * Detailed verification request model including target Person / Family and Requester summaries for moderator review.
 */
export interface VerificationRequestForReview extends VerificationRequest {
  person: {
    id: string
    first_name: string
    middle_name: string | null
    last_name: string
    gender: string | null
    date_of_birth: string | null
    date_of_death: string | null
    birth_place: string | null
    gotra: string | null
    nukh: string | null
    kul: string | null
    status: string
    verification_status: VerificationStatus
  } | null
  family: {
    id: string
    family_name: string
    description: string | null
    gotra: string | null
    nukh: string | null
    kul: string | null
    city: string | null
    state: string | null
    country: string | null
    status: string
    verification_status: VerificationStatus
  } | null
  requester: {
    id: string
    display_name: string | null
    avatar_url: string | null
    email?: string | null
  } | null
  reviewer?: {
    id: string
    display_name: string | null
  } | null
}

export interface ApproveVerificationRequestInput {
  requestId: string
}

export interface RejectVerificationRequestInput {
  requestId: string
  reason: string
}

export interface VerificationReviewFilters {
  status?: VerificationRequestStatus
  entityType?: VerificationEntityType
  search?: string
}
