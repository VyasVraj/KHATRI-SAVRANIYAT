/**
 * OccupationContactRequestsPage Component
 *
 * Dedicated Admin Panel section for managing Occupation Contact Requests:
 * - Summary metric cards: Total, Pending, Under Review, Approved, Rejected, Resolved.
 * - Multi-criteria filters: Status tabs, Search, Channel, Sort.
 * - Comprehensive data table with all required columns.
 * - Detailed modal for reviewing and updating requests with audit notes and feedback.
 * - Deep linking support via ?id=<request_id> query parameter.
 */

import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Eye,
} from 'lucide-react'
import {
  useAdminOccupationContactRequests,
  useOccupationContactCounts,
} from '@/features/people/hooks/useOccupationContactRequests'
import { OccupationContactRequestDetailModal } from '../components/OccupationContactRequestDetailModal'
import type { AdminOccupationContactRequestItem } from '@/features/people/services/public-occupation.service'

export function OccupationContactRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const targetId = searchParams.get('id')

  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  const [channelFilter, setChannelFilter] = useState<string>('ADMIN')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'NEWEST' | 'OLDEST'>('NEWEST')

  const [selectedRequest, setSelectedRequest] =
    useState<AdminOccupationContactRequestItem | null>(null)

  const { data: counts, refetch: refetchCounts } = useOccupationContactCounts(channelFilter)
  const {
    data: requests = [],
    isLoading,
    isFetching,
    error,
    refetch: refetchRequests,
  } = useAdminOccupationContactRequests({
    status: statusFilter,
    channel: channelFilter,
    search: searchQuery,
    sort: sortOrder,
  })

  // Deep-linking: if ?id=<request_id> matches, open modal
  useEffect(() => {
    if (targetId && requests.length > 0) {
      const match = requests.find((r) => r.id === targetId)
      if (match) setSelectedRequest(match)
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
          hour: '2-digit',
          minute: '2-digit',
        })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-700 ring-1 ring-blue-500/30">
              <Mail className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Occupation Contact Requests
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Manage controlled contact inquiries submitted through the Public Profession & Occupation Directory.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isFetching}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition focus:outline-none focus:ring-2 focus:ring-blue-500/20 self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw
            className={`h-4 w-4 ${isFetching ? 'animate-spin text-blue-600' : 'text-slate-500'}`}
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 block">Total Requests</span>
          <div className="mt-1 text-xl font-bold text-slate-900">{counts?.total ?? 0}</div>
        </div>

        {/* Pending */}
        <div
          onClick={() => setStatusFilter('PENDING')}
          className={`rounded-xl border p-3.5 shadow-2xs cursor-pointer transition-all ${
            statusFilter === 'PENDING'
              ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
              : 'border-slate-200 bg-white hover:border-amber-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-amber-800 block">Pending</span>
          <div className="mt-1 text-xl font-bold text-amber-900">{counts?.pending ?? 0}</div>
        </div>

        {/* Under Review */}
        <div
          onClick={() => setStatusFilter('UNDER_REVIEW')}
          className={`rounded-xl border p-3.5 shadow-2xs cursor-pointer transition-all ${
            statusFilter === 'UNDER_REVIEW'
              ? 'border-blue-400 bg-blue-50/50 ring-2 ring-blue-400/20'
              : 'border-slate-200 bg-white hover:border-blue-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-blue-800 block">Under Review</span>
          <div className="mt-1 text-xl font-bold text-blue-900">{counts?.under_review ?? 0}</div>
        </div>

        {/* Approved */}
        <div
          onClick={() => setStatusFilter('APPROVED')}
          className={`rounded-xl border p-3.5 shadow-2xs cursor-pointer transition-all ${
            statusFilter === 'APPROVED'
              ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-400/20'
              : 'border-slate-200 bg-white hover:border-emerald-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-emerald-800 block">Approved</span>
          <div className="mt-1 text-xl font-bold text-emerald-900">{counts?.approved ?? 0}</div>
        </div>

        {/* Rejected */}
        <div
          onClick={() => setStatusFilter('REJECTED')}
          className={`rounded-xl border p-3.5 shadow-2xs cursor-pointer transition-all ${
            statusFilter === 'REJECTED'
              ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-400/20'
              : 'border-slate-200 bg-white hover:border-rose-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-rose-800 block">Rejected</span>
          <div className="mt-1 text-xl font-bold text-rose-900">{counts?.rejected ?? 0}</div>
        </div>

        {/* Resolved */}
        <div
          onClick={() => setStatusFilter('RESOLVED')}
          className={`rounded-xl border p-3.5 shadow-2xs cursor-pointer transition-all ${
            statusFilter === 'RESOLVED'
              ? 'border-purple-400 bg-purple-50/50 ring-2 ring-purple-400/20'
              : 'border-slate-200 bg-white hover:border-purple-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-purple-800 block">Resolved</span>
          <div className="mt-1 text-xl font-bold text-purple-900">{counts?.resolved ?? 0}</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          {[
            { id: 'PENDING', label: 'Pending', count: counts?.pending },
            { id: 'UNDER_REVIEW', label: 'Under Review', count: counts?.under_review },
            { id: 'APPROVED', label: 'Approved', count: counts?.approved },
            { id: 'REJECTED', label: 'Rejected', count: counts?.rejected },
            { id: 'RESOLVED', label: 'Resolved', count: counts?.resolved },
            { id: 'ALL', label: 'All Requests', count: counts?.total },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
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

        {/* Search, Channel, and Sort */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Box */}
          <div className="relative md:col-span-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by requester, person, reason, family, or ID..."
              className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Channel Filter */}
          <div className="md:col-span-3">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Filter by contact channel"
            >
              <option value="ADMIN">Contact Through Admin</option>
              <option value="MUKHI">Contact Through Mukhi</option>
              <option value="ALL">All Contact Channels</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="md:col-span-3">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'NEWEST' | 'OLDEST')}
              className="w-full min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Sort contact requests"
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
            Loading occupation contact requests...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-600">
            Failed to load contact requests: {(error as Error).message}
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Mail className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No contact requests found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              There are no contact requests matching the selected filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Request ID</th>
                  <th className="py-3 px-4">Requester Name</th>
                  <th className="py-3 px-4">Requester Email</th>
                  <th className="py-3 px-4">Selected Person</th>
                  <th className="py-3 px-4">Occupation</th>
                  <th className="py-3 px-4">Associated Family</th>
                  <th className="py-3 px-4">Associated Mukhi</th>
                  <th className="py-3 px-4">Request Reason</th>
                  <th className="py-3 px-4">Submitted Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Request ID */}
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {req.id.slice(0, 8)}...
                    </td>

                    {/* Requester Name */}
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {req.visitor_name}
                    </td>

                    {/* Requester Email */}
                    <td className="py-3 px-4 text-slate-600">
                      {req.visitor_contact}
                    </td>

                    {/* Selected Person */}
                    <td className="py-3 px-4 font-bold text-blue-900">
                      {req.person_name}
                    </td>

                    {/* Occupation */}
                    <td className="py-3 px-4 text-slate-600">
                      <span className="rounded bg-blue-50 px-2 py-0.5 border border-blue-200 text-blue-800 inline-block font-medium">
                        {req.occupation}
                      </span>
                    </td>

                    {/* Associated Family */}
                    <td className="py-3 px-4 text-slate-600">
                      {req.family_name}
                    </td>

                    {/* Associated Mukhi */}
                    <td className="py-3 px-4 text-slate-600">
                      {req.associated_mukhi_name}
                    </td>

                    {/* Request Reason */}
                    <td className="py-3 px-4 text-slate-800 font-medium">
                      {req.purpose}
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
                      {req.status === 'UNDER_REVIEW' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-800 border border-blue-200">
                          <Clock className="h-3 w-3" />
                          Reviewing
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
                      {req.status === 'RESOLVED' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-800 border border-purple-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Resolved
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedRequest(req)}
                        className="min-h-[32px] inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 transition cursor-pointer shadow-2xs"
                        title="View / Manage Request"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Manage</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Details Modal */}
      <OccupationContactRequestDetailModal
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
