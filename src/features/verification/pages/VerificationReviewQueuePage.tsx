/**
 * VerificationReviewQueuePage — Moderator review queue for pending census record verification requests.
 * (Phase 9 — Subtask 3)
 *
 * Route: /admin/verifications
 * Guarded by ModeratorRoute: requires ADMIN_ROLES (SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR).
 *
 * Invariants:
 * - Operates strictly via authoritative database functions approve_verification_request() and reject_verification_request().
 * - Client NEVER mutates persons.verification_status or families.verification_status directly.
 * - Concurrency resilient: if request was already reviewed, surfaces non-destructive feedback and refreshes.
 */

import { useState, useMemo } from 'react'
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileText,
  AlertCircle,
  Search,
  RefreshCw,
  User,
  Users,
  Eye,
  Calendar,
  CopyCheck,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import {
  useVerificationRequestsReview,
  useVerificationReviewMutations,
} from '../hooks/useVerificationReview'
import { VerificationReviewDetailModal } from '../components/VerificationReviewDetailModal'
import { VerificationReviewRejectModal } from '../components/VerificationReviewRejectModal'
import { DuplicateFlagsQueueSection } from '../components/DuplicateFlagsQueueSection'

import type {
  VerificationRequestForReview,
  VerificationRequestStatus,
  VerificationEntityType,
} from '../types'

export function VerificationReviewQueuePage() {
  const [mainTab, setMainTab] = useState<'VERIFICATIONS' | 'DUPLICATES'>('VERIFICATIONS')
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'ALL' | 'APPROVED' | 'REJECTED'>('PENDING')
  const [entityFilter, setEntityFilter] = useState<'ALL' | VerificationEntityType>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Selected modals
  const [selectedRequest, setSelectedRequest] = useState<VerificationRequestForReview | null>(null)
  const [rejectingRequest, setRejectingRequest] = useState<VerificationRequestForReview | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fetch queue with query
  const queryFilters = useMemo(() => {
    return {
      status: statusFilter === 'ALL' ? undefined : (statusFilter as VerificationRequestStatus),
      entityType: entityFilter === 'ALL' ? undefined : entityFilter,
      search: searchQuery.trim() || undefined,
    }
  }, [statusFilter, entityFilter, searchQuery])

  const {
    data: requests = [],
    isLoading,
    error,
    refetch,
    isFetching,
  } = useVerificationRequestsReview(queryFilters)

  const { approve } = useVerificationReviewMutations()

  // Calculate pending count from full query or current list
  const pendingCount = useMemo(() => {
    if (statusFilter === 'PENDING') return requests.length
    return requests.filter((r) => r.status === 'PENDING').length
  }, [requests, statusFilter])

  async function handleQuickApprove(req: VerificationRequestForReview) {
    setStatusMessage(null)
    const targetName = req.entity_type === 'PERSON'
      ? req.person ? `${req.person.first_name} ${req.person.last_name}` : 'Person'
      : req.family ? req.family.family_name : 'Family'

    try {
      await approve.mutateAsync({ requestId: req.id })
      setStatusMessage({
        type: 'success',
        text: `Verification request for "${targetName}" was approved.`,
      })
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          (err as { message?: string }).message ??
          'Failed to approve verification request. It may have already been reviewed.',
      })
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Page Title & Context */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-navy-900">Verification Review Queue</h1>
            <span
              data-testid="verifications-pending-count"
              className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
            >
              {pendingCount} pending
            </span>
          </div>
          <p className="mt-1 text-sm text-navy-600">
            Review community verification requests for Person and Family records. Approvals attest
            to census authenticity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status feedback banner */}
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
            className="text-xs font-medium hover:underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Navigation Tabs */}
      <div className="mb-6 flex items-center gap-4 border-b border-navy-200">
        <button
          type="button"
          data-testid="tab-verifications"
          onClick={() => setMainTab('VERIFICATIONS')}
          className={`flex items-center gap-2 pb-3 px-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
            mainTab === 'VERIFICATIONS'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-navy-500 hover:text-navy-800'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Verification Requests</span>
          <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs text-navy-700">
            {pendingCount}
          </span>
        </button>

        <button
          type="button"
          data-testid="tab-duplicates"
          onClick={() => setMainTab('DUPLICATES')}
          className={`flex items-center gap-2 pb-3 px-2 text-sm font-medium border-b-2 transition-colors min-h-[44px] ${
            mainTab === 'DUPLICATES'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-navy-500 hover:text-navy-800'
          }`}
        >
          <CopyCheck className="h-4 w-4" />
          <span>Duplicate Record Flags</span>
        </button>
      </div>

      {mainTab === 'DUPLICATES' ? (
        <DuplicateFlagsQueueSection />
      ) : (
        <>
          {/* Filter and Search Bar */}
          <div className="mb-6 space-y-3 rounded-xl border border-navy-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">

          {/* Status Tabs */}
          <div className="flex items-center gap-1 rounded-lg bg-navy-50 p-1 text-xs">
            {(
              [
                { label: 'Pending', value: 'PENDING' },
                { label: 'All Requests', value: 'ALL' },
                { label: 'Approved', value: 'APPROVED' },
                { label: 'Rejected', value: 'REJECTED' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  statusFilter === tab.value
                    ? 'bg-white text-navy-900 shadow-sm font-semibold'
                    : 'text-navy-600 hover:text-navy-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Entity Type Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-navy-500 font-medium">Entity:</span>
            {(
              [
                { label: 'All', value: 'ALL' },
                { label: 'Persons', value: 'PERSON' },
                { label: 'Families', value: 'FAMILY' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEntityFilter(opt.value)}
                className={`rounded px-2.5 py-1 transition-colors ${
                  entityFilter === opt.value
                    ? 'bg-brand-600 text-white font-medium'
                    : 'bg-navy-100 text-navy-700 hover:bg-navy-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-navy-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by person/family name, requester, or notes..."
            className="w-full rounded-lg border border-navy-200 bg-navy-50/50 pl-9 pr-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Main Review Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-navy-100 bg-navy-50/50 p-6"
            />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800"
        >
          <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
          <h3 className="mt-2 text-sm font-semibold">Failed to load verification review queue</h3>
          <p className="mt-1 text-xs text-red-600">{(error as Error).message}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            className="mt-4 text-xs"
          >
            Try Again
          </Button>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-navy-200 bg-white p-12 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-navy-300" />
          <h3 className="mt-3 text-base font-semibold text-navy-900">
            {statusFilter === 'PENDING'
              ? 'No pending verification requests'
              : 'No verification requests found'}
          </h3>
          <p className="mt-1 text-sm text-navy-500 max-w-md mx-auto">
            {statusFilter === 'PENDING'
              ? 'All submitted verification requests for persons and families have been processed.'
              : 'Try adjusting your filters or search keywords to view other verification requests.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4" data-testid="verification-review-list">
          {requests.map((req) => {
            const isPerson = req.entity_type === 'PERSON'
            const targetName = isPerson
              ? req.person
                ? [req.person.first_name, req.person.middle_name, req.person.last_name]
                    .filter(Boolean)
                    .join(' ')
                : 'Unknown Person Record'
              : req.family?.family_name || 'Unknown Family Record'

            const requesterName = req.requester?.display_name || 'Community Member'
            const isPending = req.status === 'PENDING'

            return (
              <div
                key={req.id}
                data-testid={`verification-item-${req.id}`}
                className="rounded-xl border border-navy-200 bg-white p-5 shadow-sm transition hover:border-navy-300"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  {/* Entity and Target details */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        isPerson ? 'bg-brand-50 text-brand-600' : 'bg-purple-50 text-purple-600'
                      }`}
                    >
                      {isPerson ? <User className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-navy-900">{targetName}</h3>
                        <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700">
                          {req.entity_type}
                        </span>
                        {req.status === 'PENDING' ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            PENDING REVIEW
                          </span>
                        ) : req.status === 'APPROVED' ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            APPROVED
                          </span>
                        ) : req.status === 'REJECTED' ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                            REJECTED
                          </span>
                        ) : (
                          <span className="rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-bold text-navy-600">
                            {req.status}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
                        <span>
                          Requested by: <strong className="text-navy-700">{requesterName}</strong>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(req.created_at).toLocaleDateString()}
                        </span>
                        {isPerson && req.person?.gotra && (
                          <span>Gotra: {req.person.gotra}</span>
                        )}
                        {!isPerson && req.family?.city && (
                          <span>Location: {req.family.city}</span>
                        )}
                      </div>

                      {req.supporting_notes && (
                        <div className="mt-2.5 flex items-start gap-1.5 rounded-md bg-navy-50 p-2.5 text-xs text-navy-700">
                          <FileText className="h-3.5 w-3.5 text-navy-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{req.supporting_notes}</span>
                        </div>
                      )}

                      {req.status === 'REJECTED' && req.rejection_reason && (
                        <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700 border border-red-200">
                          <strong>Rejection reason:</strong> {req.rejection_reason}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-navy-100">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setSelectedRequest(req)}
                      className="text-xs min-h-[44px] min-w-[44px]"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View Details
                    </Button>

                    {isPending && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => setRejectingRequest(req)}
                          disabled={approve.isPending}
                          className="text-xs px-2.5 py-1 min-h-[44px] min-w-[44px]"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => handleQuickApprove(req)}
                          disabled={approve.isPending}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1 min-h-[44px] min-w-[44px]"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
        </>
      )}

      {/* Inspect Detail Modal */}

      <VerificationReviewDetailModal
        request={selectedRequest}
        isOpen={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
        onActionComplete={() => {
          setSelectedRequest(null)
          refetch()
        }}
      />

      {/* Reject Modal */}
      {rejectingRequest && (
        <VerificationReviewRejectModal
          requestId={rejectingRequest.id}
          targetName={
            rejectingRequest.entity_type === 'PERSON'
              ? rejectingRequest.person
                ? `${rejectingRequest.person.first_name} ${rejectingRequest.person.last_name}`
                : 'Person'
              : rejectingRequest.family?.family_name || 'Family'
          }
          entityType={rejectingRequest.entity_type}
          requesterName={rejectingRequest.requester?.display_name || 'Community Member'}
          isOpen={Boolean(rejectingRequest)}
          onClose={() => setRejectingRequest(null)}
          onSuccess={() => {
            setRejectingRequest(null)
            setStatusMessage({
              type: 'success',
              text: 'Verification request was rejected.',
            })
            refetch()
          }}
        />
      )}
    </div>
  )
}
