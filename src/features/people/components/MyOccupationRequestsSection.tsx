/**
 * MyOccupationRequestsSection component
 *
 * Displays the member's occupation request history and active tracking:
 * - Requested Occupation
 * - Current Approved Occupation
 * - Submitted Date
 * - Status badge (Pending / Approved / Rejected)
 * - Reviewed Date & Admin Remarks / Rejection Reason
 * - Prevent duplicate pending request affordance
 */

import { useState } from 'react'
import {
  Clock,
  CheckCircle2,
  XCircle,
  Briefcase,
  AlertCircle,
  Plus,
} from 'lucide-react'
import { useMyOccupationRequests } from '../hooks/useOccupationRequests'
import { RequestOccupationModal } from './RequestOccupationModal'

interface MyOccupationRequestsSectionProps {
  person: {
    id: string
    first_name?: string | null
    middle_name?: string | null
    last_name?: string | null
    occupation?: string | null
  }
  canRequest?: boolean
}

export function MyOccupationRequestsSection({
  person,
  canRequest = true,
}: MyOccupationRequestsSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: requests = [], isLoading, refetch } = useMyOccupationRequests(person.id)

  const pendingRequest = requests.find((r) => r.status === 'PENDING')

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Briefcase className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Occupation Update Requests
            </h4>
            <p className="text-xs text-slate-500">
              Track status of administrative review and occupation modifications
            </p>
          </div>
        </div>

        {canRequest && (
          <div>
            {pendingRequest ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 border border-amber-200">
                <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                <span>Request Pending Admin Review</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Request Occupation Update</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pending Banner if one is active */}
      {pendingRequest && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900">
          <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              Pending Request: "{pendingRequest.requested_occupation}"
            </p>
            <p className="text-amber-800 leading-relaxed text-[11px]">
              Submitted on {formatDate(pendingRequest.created_at)}. Your request is waiting for Admin approval. The currently approved occupation will remain unchanged until reviewed.
            </p>
          </div>
        </div>
      )}

      {/* List of Requests */}
      {isLoading ? (
        <div className="space-y-2 py-2">
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-4 text-xs text-slate-400">
          No occupation update requests submitted for this profile yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {requests.map((req) => (
            <div
              key={req.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-800 text-sm">
                    {req.requested_occupation}
                  </span>
                  {req.status === 'PENDING' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                      <Clock className="h-3 w-3" />
                      Pending
                    </span>
                  )}
                  {req.status === 'APPROVED' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" />
                      Approved
                    </span>
                  )}
                  {req.status === 'REJECTED' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
                      <XCircle className="h-3 w-3" />
                      Rejected
                    </span>
                  )}
                </div>

                <div className="text-slate-500 text-[11px]">
                  Submitted: {formatDate(req.created_at)}
                </div>

                {req.status === 'REJECTED' && req.rejection_reason && (
                  <div className="mt-1 flex items-start gap-1.5 text-rose-800 bg-rose-50/80 p-2 rounded border border-rose-100 text-[11px]">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 mt-0.5" />
                    <span>
                      <strong className="font-semibold">Rejection Reason:</strong> {req.rejection_reason}
                    </span>
                  </div>
                )}
              </div>

              {req.reviewed_at && (
                <div className="text-[11px] text-slate-400 sm:text-right shrink-0">
                  Reviewed: {formatDate(req.reviewed_at)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <RequestOccupationModal
        person={person}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          refetch()
        }}
      />
    </div>
  )
}
