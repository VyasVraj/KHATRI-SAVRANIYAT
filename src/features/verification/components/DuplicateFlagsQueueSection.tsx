/**
 * DuplicateFlagsQueueSection — Moderator management queue for potential duplicate flags (Phase 9 — Subtask 4)
 *
 * Provides filtering, summary listing, and launches the DuplicateReviewModal.
 */

import { useState } from 'react'
import { AlertCircle, Users, Home, Eye, Filter } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { DuplicateReviewModal } from './DuplicateReviewModal'
import { useDuplicateFlags } from '../hooks/useDuplicateDetection'
import type {
  DuplicateEntityType,
  DuplicateFlagStatus,
  EnrichedDuplicateFlag,
} from '../types/duplicate.types'
import type { PersonRow, FamilyRow } from '@/types'

export function DuplicateFlagsQueueSection() {
  const [statusFilter, setStatusFilter] = useState<DuplicateFlagStatus | 'ALL'>('OPEN')
  const [typeFilter, setTypeFilter] = useState<DuplicateEntityType | 'ALL'>('ALL')
  const [selectedFlag, setSelectedFlag] = useState<EnrichedDuplicateFlag | null>(null)

  const {
    data: flags = [],
    isLoading,
    error,
    refetch,
  } = useDuplicateFlags({
    status: statusFilter,
    entityType: typeFilter,
  })

  const getRecordLabel = (flag: EnrichedDuplicateFlag, record: PersonRow | FamilyRow | null | undefined, fallbackId: string) => {
    if (!record) return `Record #${fallbackId.slice(0, 8)}`
    if (flag.entity_type === 'PERSON') {
      const p = record as PersonRow
      return [p.first_name, p.last_name].filter(Boolean).join(' ') || `Person #${fallbackId.slice(0, 8)}`
    } else {
      const f = record as FamilyRow
      return f.family_name || `Family #${fallbackId.slice(0, 8)}`
    }
  }

  return (
    <div data-testid="duplicate-flags-queue-section" className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 rounded-lg border border-navy-200 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-navy-700">
          <Filter className="h-4 w-4 text-navy-400" />
          <span>Filter Flags:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-navy-500">Status:</span>
            <select
              data-testid="duplicate-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as DuplicateFlagStatus | 'ALL')}
              className="rounded-md border border-navy-300 py-1 px-2 text-xs text-navy-800 bg-white"
            >
              <option value="OPEN">Open Only</option>
              <option value="CONFIRMED_DUPLICATE">Confirmed Duplicate</option>
              <option value="NOT_DUPLICATE">Dismissed (Not Duplicate)</option>
              <option value="ALL">All Statuses</option>
            </select>
          </div>

          {/* Entity Type Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-navy-500">Type:</span>
            <select
              data-testid="duplicate-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as DuplicateEntityType | 'ALL')}
              className="rounded-md border border-navy-300 py-1 px-2 text-xs text-navy-800 bg-white"
            >
              <option value="ALL">All Types</option>
              <option value="PERSON">Person</option>
              <option value="FAMILY">Family</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="p-8 text-center text-xs text-navy-500 bg-white rounded-lg border border-navy-200">
          Loading duplicate flags...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error.message || 'Failed to load duplicate flags.'}</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && flags.length === 0 && (
        <div
          data-testid="duplicate-flags-empty"
          className="p-8 text-center text-xs text-navy-500 bg-white rounded-lg border border-navy-200 shadow-sm"
        >
          No duplicate flags found matching the selected criteria.
        </div>
      )}

      {/* Flags List */}
      {!isLoading && !error && flags.length > 0 && (
        <div className="bg-white rounded-lg border border-navy-200 shadow-sm overflow-hidden">
          <ul className="divide-y divide-navy-100">
            {flags.map((flag) => {
              const labelA = getRecordLabel(flag, flag.recordA, flag.record_a_id)
              const labelB = getRecordLabel(flag, flag.recordB, flag.record_b_id)

              return (
                <li
                  key={flag.id}
                  data-testid={`duplicate-flag-item-${flag.id}`}
                  className="p-4 hover:bg-navy-50/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-navy-100 text-navy-700">
                        {flag.entity_type === 'PERSON' ? (
                          <Users className="h-3 w-3" />
                        ) : (
                          <Home className="h-3 w-3" />
                        )}
                        {flag.entity_type}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          flag.confidence === 'STRONG'
                            ? 'bg-rose-100 text-rose-700'
                            : flag.confidence === 'POSSIBLE'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {flag.confidence} CONFIDENCE
                      </span>

                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-navy-50 text-navy-600 border border-navy-200">
                        {flag.status}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-navy-900">
                      {labelA} <span className="text-navy-400 font-normal">vs</span> {labelB}
                    </div>

                    {flag.match_reasons.length > 0 && (
                      <div className="text-[11px] text-navy-500">
                        Signals: {flag.match_reasons.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 self-end sm:self-center">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedFlag(flag)}
                      data-testid={`review-duplicate-btn-${flag.id}`}
                      className="inline-flex items-center gap-1.5 text-xs min-h-[44px] min-w-[44px]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Review Pair</span>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Review Modal */}
      {selectedFlag && (
        <DuplicateReviewModal
          isOpen={Boolean(selectedFlag)}
          onClose={() => setSelectedFlag(null)}
          flag={selectedFlag}
          onResolved={() => {
            refetch()
          }}
        />
      )}
    </div>
  )
}
