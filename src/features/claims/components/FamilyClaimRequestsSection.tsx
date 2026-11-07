/**
 * FamilyClaimRequestsSection — Head of Family Claim Requests Review Dashboard
 * (Master Requirement: Part 9 — Family Head Claim Approval System)
 *
 * Implements:
 * - 9.1 Family Head review interface for claims targeting their family members.
 * - 9.2 Displays Claimant Name, Claimed Person, Request Date, Status, Actions.
 * - 9.3 Atomic Approve action invoking `approve_person_claim` RPC.
 * - 9.4 Reject action with mandatory rationale invoking `reject_person_claim` RPC.
 * - Instant query cache invalidation to update the family roster immediately upon approval.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X, Clock, ShieldCheck, AlertCircle, UserCheck } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { supabase } from '@/lib/supabase'

export interface FamilyClaimRequestsSectionProps {
  familyId: string
  familyName: string
  isHeadOrManager: boolean
}

interface ClaimRecord {
  id: string
  person_id: string
  claimant_id: string
  family_id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  evidence_notes?: string | null
  rejection_reason?: string | null
  created_at: string
  reviewed_at?: string | null
  target_person?: {
    id: string
    first_name: string
    middle_name?: string | null
    last_name: string
  } | null
  claimant?: {
    id: string
    display_name?: string | null
  } | null
}

export function FamilyClaimRequestsSection({
  familyId,
  familyName,
  isHeadOrManager,
}: FamilyClaimRequestsSectionProps) {
  const queryClient = useQueryClient()
  const [rejectingClaimId, setRejectingClaimId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Fetch claims for this family
  const { data: claims = [], isLoading } = useQuery({
    queryKey: ['family-claims', familyId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('person_claims')
        .select(`
          id,
          person_id,
          claimant_id,
          family_id,
          status,
          evidence_notes,
          rejection_reason,
          created_at,
          reviewed_at,
          target_person:persons(id, first_name, middle_name, last_name),
          claimant:profiles(id, display_name)
        `)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })

      if (error) {
        return []
      }
      return (data as unknown as ClaimRecord[]) || []
    },
    enabled: Boolean(familyId && isHeadOrManager),
  })

  // Approve claim mutation
  const approveMutation = useMutation({
    mutationFn: async (claimId: string) => {
      setActionError(null)
      setActionSuccess(null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('approve_person_claim', {
        p_claim_id: claimId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setActionSuccess('Profile claim approved! The person record has been linked to the claimant account.')
      queryClient.invalidateQueries({ queryKey: ['family-claims', familyId] })
      queryClient.invalidateQueries({ queryKey: ['family-members', familyId] })
      queryClient.invalidateQueries({ queryKey: ['family', familyId] })
      queryClient.invalidateQueries({ queryKey: ['families'] })
      queryClient.invalidateQueries({ queryKey: ['my-family-ids'] })
      queryClient.invalidateQueries({ queryKey: ['persons'] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
    },
    onError: (err: { message?: string }) => {
      setActionError(err.message || 'Failed to approve claim. Please try again.')
    },
  })

  // Reject claim mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ claimId, reason }: { claimId: string; reason: string }) => {
      setActionError(null)
      setActionSuccess(null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('reject_person_claim', {
        p_claim_id: claimId,
        p_reason: reason.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setActionSuccess('Claim request rejected.')
      setRejectingClaimId(null)
      setRejectionReason('')
      queryClient.invalidateQueries({ queryKey: ['family-claims', familyId] })
    },
    onError: (err: { message?: string }) => {
      setActionError(err.message || 'Failed to reject claim. Please try again.')
    },
  })

  if (!isHeadOrManager || (claims.length === 0 && !isLoading)) {
    return null
  }

  const pendingCount = claims.filter((c) => c.status === 'PENDING').length

  return (
    <div className="mt-8 rounded-2xl border border-navy-200 bg-white p-6 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-navy-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <UserCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-navy-900">Profile Claim Requests</h2>
            <p className="text-xs text-navy-500">
              Review requests to claim member profiles in {familyName}
            </p>
          </div>
        </div>

        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            <Clock className="h-3 w-3" />
            {pendingCount} Pending Review
          </span>
        )}
      </div>

      {/* Notifications / Alerts */}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Requests List */}
      <div className="divide-y divide-navy-100">
        {claims.map((claim) => {
          const targetName = claim.target_person
            ? [claim.target_person.first_name, claim.target_person.middle_name, claim.target_person.last_name]
                .filter(Boolean)
                .join(' ')
            : 'Member Profile'

          const claimantName = claim.claimant?.display_name || 'Community Member'
          const dateStr = new Date(claim.created_at).toLocaleDateString()

          return (
            <div key={claim.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-navy-900">{claimantName}</span>
                  <span className="text-xs text-navy-400">requested to claim</span>
                  <span className="font-semibold text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    {targetName}
                  </span>
                </div>

                <div className="text-xs text-navy-500 flex items-center gap-3">
                  <span>Submitted: {dateStr}</span>
                  {claim.evidence_notes && (
                    <span className="italic text-navy-600 truncate max-w-xs">
                      &ldquo;{claim.evidence_notes}&rdquo;
                    </span>
                  )}
                </div>

                {claim.status === 'REJECTED' && claim.rejection_reason && (
                  <p className="text-xs text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200 max-w-md">
                    Reason: {claim.rejection_reason}
                  </p>
                )}
              </div>

              {/* Status & Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {claim.status === 'PENDING' ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => approveMutation.mutate(claim.id)}
                      isLoading={approveMutation.isPending}
                      className="min-h-[40px] text-xs bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1 text-white"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setRejectingClaimId(claim.id)
                        setRejectionReason('')
                      }}
                      className="min-h-[40px] text-xs text-rose-700 border-rose-200 hover:bg-rose-50 flex items-center gap-1"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </>
                ) : claim.status === 'APPROVED' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    <Check className="h-3 w-3" />
                    Approved
                  </span>
                ) : claim.status === 'REJECTED' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                    <X className="h-3 w-3" />
                    Rejected
                  </span>
                ) : (
                  <span className="text-xs text-navy-400">Cancelled</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Rejection Modal Dialog */}
      {rejectingClaimId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-navy-200 bg-white p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-navy-900">Reject Profile Claim</h3>
            <p className="text-xs text-navy-600">
              Please provide a clear reason for the claimant explaining why this request cannot be approved.
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="E.g., The name does not match our family member records."
              className="w-full rounded-lg border border-navy-300 p-2.5 text-xs text-navy-900 focus:border-brand-500 focus:outline-none"
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRejectingClaimId(null)}
                className="text-xs min-h-[40px]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!rejectionReason.trim()) {
                    setActionError('Rejection reason cannot be empty.')
                    return
                  }
                  rejectMutation.mutate({ claimId: rejectingClaimId, reason: rejectionReason })
                }}
                isLoading={rejectMutation.isPending}
                className="text-xs min-h-[40px] bg-rose-600 hover:bg-rose-700 text-white"
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
