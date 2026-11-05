/**
 * ClaimReviewQueuePage — Moderator review queue for pending census record ownership claims.
 * (Phase 8 Subtask 3)
 *
 * Route: /admin/claims
 * Guarded by ModeratorRoute: requires ADMIN_ROLES (SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR).
 *
 * Invariants:
 * - Operates strictly via authoritative database functions approve_person_claim() and reject_person_claim().
 * - Client NEVER mutates persons.user_id directly.
 * - Concurrency resilient: if claim was already reviewed, surfaces non-destructive feedback and refreshes.
 */

import { useState } from 'react'
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  Search,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useLanguage } from '@/features/i18n'
import { usePendingClaimsReview, useReviewClaimMutations } from '../hooks/usePersonClaim'
import { ClaimReviewDetailModal } from '../components/ClaimReviewDetailModal'
import { ClaimReviewRejectModal } from '../components/ClaimReviewRejectModal'
import type { ClaimForReview } from '../types'

export function ClaimReviewQueuePage() {
  const { t } = useLanguage()
  const { data: claims = [], isLoading, error, refetch, isFetching } = usePendingClaimsReview()
  const { approve } = useReviewClaimMutations()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClaim, setSelectedClaim] = useState<ClaimForReview | null>(null)
  const [rejectingClaim, setRejectingClaim] = useState<ClaimForReview | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const filteredClaims = claims.filter((claim) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    const personName = claim.person
      ? [claim.person.first_name, claim.person.middle_name, claim.person.last_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      : ''
    const claimantName = (claim.claimant?.display_name || '').toLowerCase()
    const notes = (claim.evidence_notes || '').toLowerCase()
    return personName.includes(q) || claimantName.includes(q) || notes.includes(q)
  })

  async function handleQuickApprove(claim: ClaimForReview) {
    setStatusMessage(null)
    try {
      await approve.mutateAsync({ claimId: claim.id })
      setStatusMessage({
        type: 'success',
        text: `Claim for "${claim.person?.first_name || 'person'}" was approved and census record linked.`,
      })
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          (err as { message?: string }).message ??
          'Failed to approve claim. The claim may have already been reviewed.',
      })
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Page Title & Context */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-navy-900">{t('claims.queue_title')}</h1>
            <span
              data-testid="claims-pending-count"
              className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
            >
              {claims.length} pending
            </span>
          </div>
          <p className="mt-1 text-sm text-navy-600">
            {t('claims.queue_subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs min-h-[44px] min-w-[44px]"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          role="alert"
          className={`mb-6 flex items-start justify-between gap-2 rounded-lg p-3 text-sm ${
            statusMessage.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-navy-400 hover:text-navy-600 text-xs font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-navy-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by person name, claimant, or evidence…"
            className="w-full rounded-lg border border-navy-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Main Content Areas */}
      {isLoading ? (
        <div data-testid="claims-queue-loading" className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl border border-navy-200 bg-white p-5 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700"
        >
          <AlertCircle className="mx-auto h-8 w-8 text-red-500 mb-2" />
          <p className="font-semibold">Unable to load review queue</p>
          <p className="mt-1 text-xs text-red-600">
            {(error as Error).message ?? 'Please check your moderator permissions and try again.'}
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            className="mt-4 text-xs"
          >
            Try Again
          </Button>
        </div>
      ) : claims.length === 0 ? (
        <div
          data-testid="claims-queue-empty"
          className="rounded-xl border border-navy-200 bg-white p-12 text-center"
        >
          <ShieldCheck className="mx-auto h-12 w-12 text-emerald-500" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-navy-900">Review Queue is Clear</h2>
          <p className="mt-1 text-sm text-navy-500 max-w-md mx-auto">
            There are currently no pending census record ownership claims awaiting moderator
            verification.
          </p>
        </div>
      ) : filteredClaims.length === 0 ? (
        <div className="rounded-xl border border-navy-200 bg-white p-8 text-center text-sm text-navy-500">
          No claims matched your search &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="space-y-4" data-testid="claims-queue-list">
          {filteredClaims.map((claim) => {
            const personName = claim.person
              ? [claim.person.first_name, claim.person.middle_name, claim.person.last_name]
                  .filter(Boolean)
                  .join(' ')
              : 'Unknown Person Record'

            const claimantName = claim.claimant?.display_name || 'Community Member'

            return (
              <div
                key={claim.id}
                data-testid={`claim-card-${claim.id}`}
                className="rounded-xl border border-navy-200 bg-white p-5 shadow-sm hover:border-navy-300 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  {/* Left: Claim & Person Summary */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-base text-navy-900">
                        {personName}
                      </span>
                      <span className="inline-flex items-center rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        Census Record
                      </span>
                      <span className="inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Clock className="h-3 w-3 mr-1" />
                        PENDING
                      </span>
                    </div>

                    <div className="text-xs text-navy-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span>
                        <strong className="text-navy-800">Claimant:</strong> {claimantName}
                        {claim.claimant?.email && ` (${claim.claimant.email})`}
                      </span>
                      <span>
                        <strong className="text-navy-800">Submitted:</strong>{' '}
                        {new Date(claim.created_at).toLocaleDateString()}
                      </span>
                      {claim.person?.gotra && (
                        <span>
                          <strong className="text-navy-800">Gotra:</strong> {claim.person.gotra}
                        </span>
                      )}
                    </div>

                    {claim.evidence_notes && (
                      <div className="mt-2 text-xs text-navy-700 bg-navy-50/70 p-2.5 rounded border border-navy-100/80">
                        <div className="flex items-center gap-1 font-medium text-navy-900 mb-0.5">
                          <FileText className="h-3.5 w-3.5 text-brand-600" />
                          <span>Submitted Evidence:</span>
                        </div>
                        <p className="line-clamp-2 italic text-navy-600">
                          &ldquo;{claim.evidence_notes}&rdquo;
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-navy-100">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setSelectedClaim(claim)}
                      className="text-xs min-h-[44px] min-w-[44px]"
                    >
                      {t('claims.view_details')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setRejectingClaim(claim)}
                      disabled={approve.isPending}
                      className="text-xs text-red-600 border-red-200 hover:bg-red-50 min-h-[44px] min-w-[44px]"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      {t('claims.reject')}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleQuickApprove(claim)}
                      disabled={approve.isPending}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px] min-w-[44px]"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      {t('claims.quick_approve')}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Inspect & Review Modal */}
      <ClaimReviewDetailModal
        claim={selectedClaim}
        isOpen={Boolean(selectedClaim)}
        onClose={() => setSelectedClaim(null)}
        onActionComplete={() => {
          setSelectedClaim(null)
          setStatusMessage({
            type: 'success',
            text: 'Claim decision was successfully processed.',
          })
        }}
      />

      {/* Reject Modal */}
      {rejectingClaim && (
        <ClaimReviewRejectModal
          claimId={rejectingClaim.id}
          personName={
            rejectingClaim.person
              ? [
                  rejectingClaim.person.first_name,
                  rejectingClaim.person.middle_name,
                  rejectingClaim.person.last_name,
                ]
                  .filter(Boolean)
                  .join(' ')
              : 'Census Record'
          }
          claimantName={rejectingClaim.claimant?.display_name || 'Claimant'}
          isOpen={Boolean(rejectingClaim)}
          onClose={() => setRejectingClaim(null)}
          onSuccess={() => {
            setRejectingClaim(null)
            setStatusMessage({
              type: 'success',
              text: 'Claim was rejected with the provided reason.',
            })
          }}
        />
      )}
    </div>
  )
}
