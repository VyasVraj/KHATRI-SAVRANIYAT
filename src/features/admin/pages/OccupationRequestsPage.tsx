/**
 * OccupationRequestsPage component
 *
 * Dedicated Admin Panel section for managing Member Occupation Update Requests:
 * - Summary metric cards: Total, Pending, Approved, Rejected.
 * - Multi-criteria filters: Status tabs (Pending, Approved, Rejected, All),
 *   Search (Person name, Family name, Request ID), Category filter, Sort (Newest, Oldest).
 * - Data table with all requested columns and review actions.
 * - Deep linking support via ?id=<request_id> query parameter for notification clicks.
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Briefcase,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Eye,
  Check,
  X,
  FileText,
} from 'lucide-react'
import {
  useAdminOccupationRequests,
  useOccupationRequestCounts,
} from '@/features/people/hooks/useOccupationRequests'
import { OCCUPATION_CATEGORIES } from '@/constants/occupations'
import { OccupationRequestReviewModal } from '../components/OccupationRequestReviewModal'
import type { OccupationUpdateRequest } from '@/features/people/services/occupation-request.service'

export function OccupationRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const targetId = searchParams.get('id')

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>(
    'PENDING'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sortOrder, setSortOrder] = useState<'NEWEST' | 'OLDEST'>('NEWEST')

  const [selectedRequest, setSelectedRequest] = useState<OccupationUpdateRequest | null>(null)

  const { data: counts, refetch: refetchCounts } = useOccupationRequestCounts()
  const {
    data: requests = [],
    isLoading,
    isFetching,
    error,
    refetch: refetchRequests,
  } = useAdminOccupationRequests({
    status: statusFilter,
    search: searchQuery,
    category: categoryFilter,
    sort: sortOrder,
  })

  // Deep linking: If ?id is passed in query parameters, automatically select and open review modal
  useEffect(() => {
    if (targetId && requests.length > 0) {
      const match = requests.find((r) => r.id === targetId)
      if (match) {
        setSelectedRequest(match)
      }
    }
  }, [targetId, requests])

  const handleRefresh = () => {
    refetchCounts()
    refetchRequests()
  }

  const handleModalClose = () => {
    setSelectedRequest(null)
    if (targetId) {
      searchParams.delete('id')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-700 ring-1 ring-indigo-500/30">
              <Briefcase className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Occupation Requests
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Review and approve member occupation update requests to keep the census and public directory verified.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isFetching}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Requests */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Requests</span>
            <FileText className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {counts?.total ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">All historical requests</p>
        </div>

        {/* Pending Requests */}
        <div
          onClick={() => setStatusFilter('PENDING')}
          className={`rounded-xl border p-4 shadow-2xs cursor-pointer transition-all ${
            statusFilter === 'PENDING'
              ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
              : 'border-slate-200 bg-white hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
            <span>Pending Requests</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-900">
            {counts?.pending ?? 0}
          </div>
          <p className="text-[11px] text-amber-700 mt-0.5">Awaiting Admin action</p>
        </div>

        {/* Approved Requests */}
        <div
          onClick={() => setStatusFilter('APPROVED')}
          className={`rounded-xl border p-4 shadow-2xs cursor-pointer transition-all ${
            statusFilter === 'APPROVED'
              ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-400/20'
              : 'border-slate-200 bg-white hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
            <span>Approved Requests</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-900">
            {counts?.approved ?? 0}
          </div>
          <p className="text-[11px] text-emerald-700 mt-0.5">Verified & updated in DB</p>
        </div>

        {/* Rejected Requests */}
        <div
          onClick={() => setStatusFilter('REJECTED')}
          className={`rounded-xl border p-4 shadow-2xs cursor-pointer transition-all ${
            statusFilter === 'REJECTED'
              ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-400/20'
              : 'border-slate-200 bg-white hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-rose-800">
            <span>Rejected Requests</span>
            <XCircle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-900">
            {counts?.rejected ?? 0}
          </div>
          <p className="text-[11px] text-rose-700 mt-0.5">Rejected with reasons</p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          {[
            { id: 'PENDING', label: 'Pending', count: counts?.pending },
            { id: 'APPROVED', label: 'Approved', count: counts?.approved },
            { id: 'REJECTED', label: 'Rejected', count: counts?.rejected },
            { id: 'ALL', label: 'All Requests', count: counts?.total },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
              className={`min-h-[36px] inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    statusFilter === tab.id
                      ? 'bg-slate-700 text-amber-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search, Category, and Sort Row */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Box */}
          <div className="relative md:col-span-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by person name, family, or request ID..."
              className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Category Filter */}
          <div className="md:col-span-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Filter by occupation category"
            >
              <option value="">All 30 Categories</option>
              {OCCUPATION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order */}
          <div className="md:col-span-3">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'NEWEST' | 'OLDEST')}
              className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Sort requests"
            >
              <option value="NEWEST">Newest First</option>
              <option value="OLDEST">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-slate-300" />
            Loading occupation requests...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-600">
            Failed to load requests: {(error as Error).message}
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Briefcase className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No requests found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no occupation update requests matching the selected filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Request ID</th>
                  <th className="py-3 px-4">Person Name</th>
                  <th className="py-3 px-4">Family Name</th>
                  <th className="py-3 px-4">Current Occupation</th>
                  <th className="py-3 px-4">Requested Occupation</th>
                  <th className="py-3 px-4">Submitted By</th>
                  <th className="py-3 px-4">Submitted Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <tr
                    key={req.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Request ID */}
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {req.id.slice(0, 8)}...
                    </td>

                    {/* Person Name */}
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {req.person_name}
                    </td>

                    {/* Family Name */}
                    <td className="py-3 px-4 text-slate-600">
                      {req.family_name}
                    </td>

                    {/* Current Occupation */}
                    <td className="py-3 px-4 text-slate-500">
                      {req.current_occupation}
                    </td>

                    {/* Requested Occupation */}
                    <td className="py-3 px-4 font-semibold text-blue-800">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 border border-blue-200/70 inline-block">
                        {req.requested_occupation}
                      </span>
                    </td>

                    {/* Submitted By */}
                    <td className="py-3 px-4 text-slate-600">
                      <div>{req.submitted_by_name}</div>
                      {req.submitted_by_email && (
                        <div className="text-[10px] text-slate-400">{req.submitted_by_email}</div>
                      )}
                    </td>

                    {/* Submitted Date */}
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {formatDate(req.created_at)}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {req.status === 'PENDING' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                          <Clock className="h-3 w-3" />
                          Pending
                        </span>
                      )}
                      {req.status === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Approved
                        </span>
                      )}
                      {req.status === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 border border-rose-200">
                          <XCircle className="h-3 w-3" />
                          Rejected
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedRequest(req)}
                          className="min-h-[32px] inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition cursor-pointer shadow-2xs"
                          title="View / Review Request"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <span>View</span>
                        </button>

                        {req.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedRequest(req)}
                              className="min-h-[32px] inline-flex items-center justify-center rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition cursor-pointer shadow-2xs"
                              title="Approve Request"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedRequest(req)}
                              className="min-h-[32px] inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition cursor-pointer shadow-2xs"
                              title="Reject Request"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      <OccupationRequestReviewModal
        request={selectedRequest}
        isOpen={Boolean(selectedRequest)}
        onClose={handleModalClose}
        onSuccess={() => {
          handleRefresh()
        }}
      />
    </div>
  )
}
