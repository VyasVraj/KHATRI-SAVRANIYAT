/**
 * Family Claims Service — Complete Family Management Access Claims (Feature 2)
 *
 * Implements backend-controlled workflow for claiming and managing existing complete families:
 * - Authenticated users submit a claim with relationship, reason, and supporting information.
 * - Mukhis (region-scoped), Admins, and Super Admins review, approve, or reject.
 * - Approval safely grants management access without duplicating records or changing Family Head.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'

export interface FamilyClaim {
  id: string
  family_id: string
  requested_by_user_id: string
  requested_by_person_id: string | null
  requested_relationship: string
  reason: string
  supporting_document_reference: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  reviewed_by: string | null
  reviewed_by_role: string | null
  reviewer_comments: string | null
  created_at: string
  reviewed_at: string | null
  updated_at: string
  family?: {
    id: string
    family_name: string
    city: string | null
    state: string | null
    gotra: string | null
    nukh: string | null
    head?: {
      first_name: string
      last_name: string
    } | null
  } | null
  requester?: {
    id: string
    display_name: string | null
    email: string | null
  } | null
}

export interface SubmitFamilyClaimInput {
  family_id: string
  requested_relationship: string
  reason: string
  supporting_document_reference?: string | null
}

/**
 * Submits a new claim request for an existing complete family.
 */
export async function submitFamilyClaim(
  input: SubmitFamilyClaimInput
): Promise<ApiResponse<{ claim_id: string; message: string }>> {
  try {
    const { data: session } = await supabase.auth.getSession()
    if (!session?.session?.user) {
      return {
        data: null,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Please log in to submit a claim for this family.',
        },
      }
    }

    // Call atomic RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('submit_family_claim', {
      p_family_id: input.family_id,
      p_relationship: input.requested_relationship,
      p_reason: input.reason,
      p_supporting_doc: input.supporting_document_reference || null,
    })

    if (error) {
      // Fallback insert if RPC not yet deployed
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insertData, error: insertError } = await (supabase.from as any)('family_claims')
          .insert({
            family_id: input.family_id,
            requested_by_user_id: session.session.user.id,
            requested_relationship: input.requested_relationship,
            reason: input.reason,
            supporting_document_reference: input.supporting_document_reference || null,
            status: 'PENDING',
          })
          .select('id')
          .single()

        if (insertError) {
          return { data: null, error: { code: insertError.code, message: insertError.message } }
        }

        return {
          data: {
            claim_id: insertData.id,
            message: 'Family claim submitted successfully. Awaiting reviewer approval.',
          },
          error: null,
        }
      }

      return {
        data: null,
        error: {
          code: error.code || 'CLAIM_SUBMISSION_ERROR',
          message: error.message || 'Failed to submit family claim.',
        },
      }
    }

    return {
      data: {
        claim_id: data.claim_id,
        message: data.message || 'Family claim submitted successfully.',
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err instanceof Error ? err.message : 'An unexpected error occurred.',
      },
    }
  }
}

/**
 * Fetches claims submitted by the current authenticated user.
 */
export async function getMyFamilyClaims(): Promise<ApiResponse<FamilyClaim[]>> {
  try {
    const { data: session } = await supabase.auth.getSession()
    if (!session?.session?.user) {
      return { data: [], error: null }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from as any)('family_claims')
      .select('*, family:families(id, family_name, city, state, gotra, nukh)')
      .eq('requested_by_user_id', session.session.user.id)
      .order('created_at', { ascending: false })

    if (error) {
      // Return empty array gracefully if table not yet created
      return { data: [], error: null }
    }

    return { data: (data as FamilyClaim[]) || [], error: null }
  } catch {
    return { data: [], error: null }
  }
}

/**
 * Fetches all family claims for review by Mukhis or Admins.
 */
export async function getFamilyClaimsForReview(status?: string): Promise<ApiResponse<FamilyClaim[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from as any)('family_claims')
      .select('*, family:families(id, family_name, city, state, gotra, nukh), requester:profiles(id, display_name, email)')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      return { data: [], error: null }
    }

    return { data: (data as FamilyClaim[]) || [], error: null }
  } catch {
    return { data: [], error: null }
  }
}

/**
 * Approves a family claim.
 */
export async function approveFamilyClaim(
  claimId: string,
  reviewerComments?: string
): Promise<ApiResponse<{ message: string }>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('approve_family_claim', {
      p_claim_id: claimId,
      p_reviewer_comments: reviewerComments || null,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'APPROVAL_ERROR',
          message: error.message || 'Failed to approve family claim.',
        },
      }
    }

    return {
      data: {
        message: data?.message || 'Family claim approved successfully.',
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err instanceof Error ? err.message : 'An error occurred during approval.',
      },
    }
  }
}

/**
 * Rejects a family claim.
 */
export async function rejectFamilyClaim(
  claimId: string,
  rejectionReason: string
): Promise<ApiResponse<{ message: string }>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('reject_family_claim', {
      p_claim_id: claimId,
      p_rejection_reason: rejectionReason,
    })

    if (error) {
      return {
        data: null,
        error: {
          code: error.code || 'REJECTION_ERROR',
          message: error.message || 'Failed to reject family claim.',
        },
      }
    }

    return {
      data: {
        message: data?.message || 'Family claim rejected successfully.',
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: err instanceof Error ? err.message : 'An error occurred during rejection.',
      },
    }
  }
}
