/**
 * MyOccupationRequestsSection component
 *
 * Displays the member's current occupation and provides a direct, accessible
 * affordance to update or set their occupation / profession immediately
 * without requiring administrative approval.
 */

import { useState } from 'react'
import {
  CheckCircle2,
  Briefcase,
  Pencil,
} from 'lucide-react'
import { useMyOccupationRequests } from '../hooks/useOccupationRequests'
import { UpdateOccupationModal } from './UpdateOccupationModal'
import type { PersonRow } from '@/types'

interface MyOccupationRequestsSectionProps {
  person: {
    id: string
    first_name?: string | null
    middle_name?: string | null
    last_name?: string | null
    occupation?: string | null
    occupation_category?: string | null
    custom_occupation?: string | null
  }
  canRequest?: boolean
}

export function MyOccupationRequestsSection({
  person,
  canRequest = true,
}: MyOccupationRequestsSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { data: requests = [], refetch } = useMyOccupationRequests(person.id)

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

  const rawOcc = (person.occupation || '').trim()
  const isPlaceholder =
    !rawOcc ||
    rawOcc === 'Occupation Pending' ||
    rawOcc === 'Occupation Not Provided' ||
    rawOcc === 'Occupation Not Available' ||
    rawOcc === 'Occupation Rejected'

  const displayOccupation = isPlaceholder
    ? ((person.custom_occupation || person.occupation_category || '').trim() || null)
    : rawOcc

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
              Occupation / Profession
            </h4>
            <p className="text-xs text-slate-500">
              Directly choose and update your profession in the community directory
            </p>
          </div>
        </div>

        {canRequest && (
          <div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>{displayOccupation ? 'Change Occupation' : 'Set Occupation'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Current Active Occupation Badge */}
      <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 p-3.5">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 block">
            Active Community Occupation
          </span>
          <span className="text-sm font-bold text-slate-900 mt-0.5 block">
            {displayOccupation || 'Occupation Not Provided'}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Direct Update Enabled</span>
        </span>
      </div>

      {/* Historical Requests if any exist */}
      {requests.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Past Modifications
          </h5>
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white p-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">
                    {req.requested_occupation}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    {formatDate(req.created_at)}
                  </span>
                </div>
                {req.status === 'APPROVED' && (
                  <span className="text-emerald-700 font-medium">Approved</span>
                )}
                {req.status === 'REJECTED' && (
                  <span className="text-rose-700 font-medium">Archived</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Direct Update Modal */}
      {isModalOpen && (
        <UpdateOccupationModal
          person={person as PersonRow}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            refetch()
          }}
        />
      )}
    </div>
  )
}
