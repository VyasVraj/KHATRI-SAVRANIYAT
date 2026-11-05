/**
 * AuditLogPage — Administrative Security & System Audit Trail (/admin/audit)
 *
 * Phase 13 — Subtask 3: User Administration & Audit Viewer
 *
 * Security & Architectural Invariants:
 * - Queries strictly via server-authoritative RPC `admin_get_audit_logs`.
 * - Direct table queries against `public.audit_logs` are blocked.
 * - Human-oriented readable format (avoids raw unformatted JSON dumps).
 * - Bounded server-side pagination (clamped 1-50 on server).
 * - Responsive table on desktop, stacked card layout on mobile.
 */

import { useState, useId } from 'react'
import {
  History,
  Filter,
  RotateCcw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Eye,
  ShieldCheck,
  Loader2,
} from 'lucide-react'
import type { AuditAction } from '@/types'
import type { AdminAuditFilterParams, AdminAuditLogItem } from '../types'
import { AUDIT_ACTIONS_LIST, AUDIT_ACTION_CONFIG } from '../constants'
import { useAuditLogs } from '../hooks/useAuditLogs'
import { AuditDetailsModal } from '../components/AuditDetailsModal'

export function AuditLogPage() {
  const [selectedAction, setSelectedAction] = useState<AuditAction | 'ALL'>('ALL')
  const [targetType, setTargetType] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const [activeLogForDetails, setActiveLogForDetails] = useState<AdminAuditLogItem | null>(null)

  const actionSelectId = useId()
  const targetTypeId = useId()
  const startDateId = useId()
  const endDateId = useId()

  const queryParams: AdminAuditFilterParams = {
    action: selectedAction !== 'ALL' ? selectedAction : undefined,
    target_type: targetType.trim() || undefined,
    start_date: startDate ? `${startDate}T00:00:00.000Z` : undefined,
    end_date: endDate ? `${endDate}T23:59:59.999Z` : undefined,
    page,
    pageSize,
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useAuditLogs(queryParams)

  const logs = data?.logs ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1

  const handleResetFilters = () => {
    setSelectedAction('ALL')
    setTargetType('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
              <History className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-navy-950">
                Security & Audit Trail
              </h1>
              <p className="text-xs text-navy-500">
                Immutable record of administrative actions, authentication changes, and moderation decisions
              </p>
            </div>
          </div>
        </div>

        {/* Security badge */}
        <div className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-1.5 shadow-xs text-xs text-navy-600">
          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
          <span>
            <strong className="text-navy-900 font-semibold">Authoritative Log:</strong> Verified via database-level triggers and security RPCs.
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Action Filter */}
          <div>
            <label htmlFor={actionSelectId} className="sr-only">
              Filter by audit action
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-navy-400">
                <Filter className="h-4 w-4" aria-hidden="true" />
              </div>
              <select
                id={actionSelectId}
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value as AuditAction | 'ALL')
                  setPage(1)
                }}
                className="block w-full rounded-lg border border-navy-300 bg-white py-2 pl-9 pr-8 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="ALL">All Actions</option>
                {AUDIT_ACTIONS_LIST.map((action) => (
                  <option key={action} value={action}>
                    {AUDIT_ACTION_CONFIG[action]?.label ?? action}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Target Type Filter */}
          <div>
            <label htmlFor={targetTypeId} className="sr-only">
              Filter by target type
            </label>
            <input
              id={targetTypeId}
              type="text"
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value)
                setPage(1)
              }}
              placeholder="Target entity (e.g. profile, claim)..."
              className="block w-full rounded-lg border border-navy-300 bg-white px-3.5 py-2 text-sm text-navy-900 placeholder-navy-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Start Date */}
          <div className="relative">
            <label htmlFor={startDateId} className="sr-only">
              From date
            </label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-navy-400">
              <Calendar className="h-4 w-4" aria-hidden="true" />
            </div>
            <input
              id={startDateId}
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPage(1)
              }}
              className="block w-full rounded-lg border border-navy-300 bg-white py-2 pl-9 pr-3 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* End Date */}
          <div className="relative">
            <label htmlFor={endDateId} className="sr-only">
              To date
            </label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-navy-400">
              <Calendar className="h-4 w-4" aria-hidden="true" />
            </div>
            <input
              id={endDateId}
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(1)
              }}
              className="block w-full rounded-lg border border-navy-300 bg-white py-2 pl-9 pr-3 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Reset Filters & Refresh */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <RotateCcw className="h-4 w-4 text-navy-400" aria-hidden="true" />
              Reset
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh audit logs"
              className="inline-flex items-center justify-center rounded-lg border border-navy-300 bg-white p-2 text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
            >
              <Loader2
                className={`h-4 w-4 text-navy-600 ${isFetching ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="sr-only">Refresh audit logs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-navy-200 bg-white py-16 shadow-xs">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-navy-600">Loading audit trail...</p>
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-900 shadow-xs"
        >
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
          <h2 className="mt-2 text-base font-semibold">Failed to load audit logs</h2>
          <p className="mt-1 text-xs text-red-700">
            {error instanceof Error ? error.message : 'An error occurred while connecting to the server.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-navy-200 bg-white py-16 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-100 text-navy-400">
            <History className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-base font-semibold text-navy-900">No audit events found</h2>
          <p className="mt-1 text-xs text-navy-500 max-w-sm">
            No audit records matched your filter criteria. Try clearing or expanding your date range.
          </p>
          {(selectedAction !== 'ALL' || targetType || startDate || endDate) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 rounded-lg border border-navy-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-xl border border-navy-200 bg-white shadow-xs md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-navy-700">
                <thead className="border-b border-navy-200 bg-navy-50/75 text-[11px] font-bold uppercase tracking-wider text-navy-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Timestamp
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Action
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Actor
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Target Entity
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {logs.map((log) => {
                    const actionMeta = AUDIT_ACTION_CONFIG[log.action] ?? {
                      label: log.action,
                      category: 'ADMIN',
                      badgeClasses: 'bg-navy-100 text-navy-800 border-navy-200',
                    }

                    return (
                      <tr key={log.id} className="transition-colors hover:bg-navy-50/50">
                        {/* Timestamp */}
                        <td className="px-4 py-3 text-xs text-navy-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>

                        {/* Action Badge */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${actionMeta.badgeClasses}`}
                          >
                            {actionMeta.label}
                          </span>
                        </td>

                        {/* Actor */}
                        <td className="px-4 py-3 text-xs">
                          <div className="font-medium text-navy-900 truncate max-w-[180px]">
                            {log.actor_name || log.actor_email || 'System Automated'}
                          </div>
                          {log.actor_name && log.actor_email && (
                            <span className="block text-[11px] text-navy-500 truncate max-w-[180px]">
                              {log.actor_email}
                            </span>
                          )}
                        </td>

                        {/* Target Entity */}
                        <td className="px-4 py-3 text-xs">
                          <div className="flex items-center gap-1.5 font-medium text-navy-800">
                            <span className="font-semibold text-brand-700">
                              {log.target_type ?? 'N/A'}
                            </span>
                            {log.target_id && (
                              <code className="text-[11px] text-navy-500 font-mono">
                                ({log.target_id.slice(0, 8)}...)
                              </code>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setActiveLogForDetails(log)}
                            aria-label={`View details for ${actionMeta.label}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-2.5 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Stacked Cards */}
          <div className="space-y-3 md:hidden">
            {logs.map((log) => {
              const actionMeta = AUDIT_ACTION_CONFIG[log.action] ?? {
                label: log.action,
                category: 'ADMIN',
                badgeClasses: 'bg-navy-100 text-navy-800 border-navy-200',
              }

              return (
                <div
                  key={log.id}
                  className="rounded-xl border border-navy-200 bg-white p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${actionMeta.badgeClasses}`}
                    >
                      {actionMeta.label}
                    </span>
                    <span className="text-[11px] text-navy-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs border-t border-navy-100 pt-2">
                    <div>
                      <span className="block text-[10px] uppercase font-semibold text-navy-400">
                        Actor
                      </span>
                      <span className="font-medium text-navy-900 truncate block">
                        {log.actor_name || log.actor_email || 'System'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase font-semibold text-navy-400">
                        Target
                      </span>
                      <span className="font-medium text-navy-900 truncate block">
                        {log.target_type ?? 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-navy-100 pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setActiveLogForDetails(log)}
                      className="inline-flex items-center gap-1 rounded-lg border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      View Details
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-navy-200 bg-white px-4 py-3 rounded-xl shadow-xs sm:flex-row">
            <div className="text-xs text-navy-600">
              Showing <span className="font-semibold text-navy-900">{(page - 1) * pageSize + 1}</span> to{' '}
              <span className="font-semibold text-navy-900">{Math.min(page * pageSize, totalCount)}</span> of{' '}
              <span className="font-semibold text-navy-900">{totalCount}</span> audit records
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous page"
                className="inline-flex items-center gap-1 rounded-lg border border-navy-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>

              <span className="px-2 text-xs font-semibold text-navy-800">
                Page {page} of {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next page"
                className="inline-flex items-center gap-1 rounded-lg border border-navy-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      <AuditDetailsModal
        log={activeLogForDetails}
        isOpen={Boolean(activeLogForDetails)}
        onClose={() => setActiveLogForDetails(null)}
      />
    </div>
  )
}
