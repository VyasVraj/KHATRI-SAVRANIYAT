/**
 * UserManagementPage — Administrative User Accounts Management (/admin/users)
 *
 * Phase 13 — Subtask 3: User Administration & Audit Viewer
 *
 * Architectural & Security Invariants:
 * - PERSON != USER:
 *   * Operates on platform user accounts (public.profiles).
 *   * NEVER mutates or confuses census lineage entities (public.persons).
 *   * Deactivating an account blocks login while preserving historical community genealogy.
 * - Server-Authoritative Mutations:
 *   * Role changes route through `admin_update_user_role`.
 *   * Status changes route through `admin_set_user_status`.
 * - Bounded pagination and sanitized query filters.
 * - Responsive table on desktop, stacked card layout on mobile.
 */

import { useState, useId } from 'react'
import {
  Users,
  Search,
  Filter,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  UserCheck,
  UserX,
  Shield,
  Loader2,
} from 'lucide-react'
import type { UserRole } from '@/types'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import type { AdminUserItem, AdminUserFilterParams } from '../types'
import { ALL_USER_ROLES, ROLE_CONFIG } from '../constants'
import { useAdminUsers } from '../hooks/useAdminUsers'
import { ChangeRoleModal } from '../components/ChangeRoleModal'
import { SetUserStatusModal } from '../components/SetUserStatusModal'

export function UserManagementPage() {
  const { user: currentUser, profile: currentProfile } = useAuthContext()
  const isSuperAdmin = currentProfile?.role === 'SUPER_ADMIN'

  // Filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRole, setSelectedRole] = useState<UserRole | 'ALL'>('ALL')
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Modal states
  const [roleModalUser, setRoleModalUser] = useState<AdminUserItem | null>(null)
  const [statusModalUser, setStatusModalUser] = useState<AdminUserItem | null>(null)
  const [statusModalTarget, setStatusModalTarget] = useState<boolean>(true)

  const searchInputId = useId()
  const roleSelectId = useId()
  const statusSelectId = useId()

  const queryParams: AdminUserFilterParams = {
    search: searchTerm.trim() || undefined,
    role: selectedRole !== 'ALL' ? selectedRole : undefined,
    status: selectedStatus,
    page,
    pageSize,
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminUsers(queryParams)

  const users = data?.users ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = data?.totalPages ?? 1

  const handleResetFilters = () => {
    setSearchTerm('')
    setSelectedRole('ALL')
    setSelectedStatus('all')
    setPage(1)
  }

  const handleOpenRoleModal = (user: AdminUserItem) => {
    setRoleModalUser(user)
  }

  const handleOpenStatusModal = (user: AdminUserItem, targetStatus: boolean) => {
    setStatusModalUser(user)
    setStatusModalTarget(targetStatus)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-navy-950">
                User Administration
              </h1>
              <p className="text-xs text-navy-500">
                Manage platform accounts, security roles, and authentication states
              </p>
            </div>
          </div>
        </div>

        {/* PERSON != USER architectural badge */}
        <div className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-1.5 shadow-xs text-xs text-navy-600">
          <Shield className="h-4 w-4 text-brand-600 shrink-0" aria-hidden="true" />
          <span>
            <strong className="text-navy-900 font-semibold">PERSON ≠ USER:</strong> Operates on account logins, not community census records.
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Search Input */}
          <div className="relative">
            <label htmlFor={searchInputId} className="sr-only">
              Search by display name or email
            </label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-navy-400">
              <Search className="h-4 w-4" aria-hidden="true" />
            </div>
            <input
              id={searchInputId}
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setPage(1)
              }}
              placeholder="Search by name or email..."
              className="block w-full rounded-lg border border-navy-300 bg-white py-2 pl-9 pr-3 text-sm text-navy-900 placeholder-navy-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Role Filter */}
          <div>
            <label htmlFor={roleSelectId} className="sr-only">
              Filter by platform role
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-navy-400">
                <Filter className="h-4 w-4" aria-hidden="true" />
              </div>
              <select
                id={roleSelectId}
                value={selectedRole}
                onChange={(e) => {
                  setSelectedRole(e.target.value as UserRole | 'ALL')
                  setPage(1)
                }}
                className="block w-full rounded-lg border border-navy-300 bg-white py-2 pl-9 pr-8 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="ALL">All Roles</option>
                {ALL_USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_CONFIG[role].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor={statusSelectId} className="sr-only">
              Filter by account status
            </label>
            <select
              id={statusSelectId}
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as 'all' | 'active' | 'inactive')
                setPage(1)
              }}
              className="block w-full rounded-lg border border-navy-300 bg-white px-3.5 py-2 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
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
              title="Refresh users list"
              className="inline-flex items-center justify-center rounded-lg border border-navy-300 bg-white p-2 text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
            >
              <Loader2
                className={`h-4 w-4 text-navy-600 ${isFetching ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="sr-only">Refresh users list</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-navy-200 bg-white py-16 shadow-xs">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-navy-600">Loading platform users...</p>
        </div>
      ) : isError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-900 shadow-xs"
        >
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" aria-hidden="true" />
          <h2 className="mt-2 text-base font-semibold">Failed to load platform users</h2>
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
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-navy-200 bg-white py-16 text-center shadow-xs">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-100 text-navy-400">
            <Users className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-base font-semibold text-navy-900">No users found</h2>
          <p className="mt-1 text-xs text-navy-500 max-w-sm">
            No platform user accounts matched your search criteria. Try modifying your filters.
          </p>
          {(searchTerm || selectedRole !== 'ALL' || selectedStatus !== 'all') && (
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
                      User
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Role
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Registered
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {users.map((user) => {
                    const isSelf = currentUser?.id === user.id
                    const isTargetSuperAdmin = user.role === 'SUPER_ADMIN'
                    const canEdit = isSuperAdmin || !isTargetSuperAdmin

                    return (
                      <tr key={user.id} className="transition-colors hover:bg-navy-50/50">
                        {/* User Identity */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 text-xs">
                              {(user.display_name || user.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-navy-950 truncate max-w-[200px]">
                                  {user.display_name || 'Unnamed Account'}
                                </span>
                                {isSelf && (
                                  <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 border border-brand-200">
                                    You
                                  </span>
                                )}
                              </div>
                              <span className="block text-xs text-navy-500 truncate max-w-[220px]">
                                {user.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                              ROLE_CONFIG[user.role]?.badgeClasses ?? 'bg-slate-100 text-slate-800 border-slate-200'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                ROLE_CONFIG[user.role]?.badgeDotClass ?? 'bg-slate-500'
                              }`}
                              aria-hidden="true"
                            />
                            {ROLE_CONFIG[user.role]?.label ?? user.role}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          {user.is_active ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden="true" />
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="px-4 py-3 text-xs text-navy-500 whitespace-nowrap">
                          {new Date(user.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenRoleModal(user)}
                              disabled={!canEdit}
                              title={
                                !canEdit
                                  ? 'Super Admin accounts can only be modified by a Super Admin'
                                  : 'Change user role'
                              }
                              className="rounded-lg border border-navy-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Role
                            </button>

                            {user.is_active ? (
                              <button
                                type="button"
                                onClick={() => handleOpenStatusModal(user, false)}
                                disabled={!canEdit || isSelf}
                                title={
                                  isSelf
                                    ? 'You cannot deactivate your own account'
                                    : !canEdit
                                      ? 'Super Admin accounts can only be deactivated by a Super Admin'
                                      : 'Deactivate user account'
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenStatusModal(user, true)}
                                disabled={!canEdit}
                                title={
                                  !canEdit
                                    ? 'Super Admin accounts can only be modified by a Super Admin'
                                    : 'Activate user account'
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Activate
                              </button>
                            )}
                          </div>
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
            {users.map((user) => {
              const isSelf = currentUser?.id === user.id
              const isTargetSuperAdmin = user.role === 'SUPER_ADMIN'
              const canEdit = isSuperAdmin || !isTargetSuperAdmin

              return (
                <div
                  key={user.id}
                  className="rounded-xl border border-navy-200 bg-white p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 text-xs">
                        {(user.display_name || user.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-navy-950 text-sm truncate">
                            {user.display_name || 'Unnamed Account'}
                          </span>
                          {isSelf && (
                            <span className="rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold text-brand-700 border border-brand-200">
                              You
                            </span>
                          )}
                        </div>
                        <span className="block text-xs text-navy-500 truncate">
                          {user.email}
                        </span>
                      </div>
                    </div>

                    {user.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
                        Inactive
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-navy-100 pt-2 text-xs">
                    <div>
                      <span className="text-navy-500 text-[11px]">Role: </span>
                      <span className="font-semibold text-navy-900">
                        {ROLE_CONFIG[user.role]?.label ?? user.role}
                      </span>
                    </div>
                    <span className="text-[11px] text-navy-400">
                      Joined {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-navy-100 pt-3">
                    <button
                      type="button"
                      onClick={() => handleOpenRoleModal(user)}
                      disabled={!canEdit}
                      className="flex-1 rounded-lg border border-navy-300 bg-white py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-40"
                    >
                      Change Role
                    </button>
                    {user.is_active ? (
                      <button
                        type="button"
                        onClick={() => handleOpenStatusModal(user, false)}
                        disabled={!canEdit || isSelf}
                        className="flex-1 rounded-lg border border-red-200 bg-white py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenStatusModal(user, true)}
                        disabled={!canEdit}
                        className="flex-1 rounded-lg border border-emerald-200 bg-white py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                      >
                        Activate
                      </button>
                    )}
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
              <span className="font-semibold text-navy-900">{totalCount}</span> platform users
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

      {/* Role Change Modal */}
      <ChangeRoleModal
        user={roleModalUser}
        isOpen={Boolean(roleModalUser)}
        onClose={() => setRoleModalUser(null)}
      />

      {/* Status Change Modal */}
      <SetUserStatusModal
        user={statusModalUser}
        targetStatus={statusModalTarget}
        isOpen={Boolean(statusModalUser)}
        onClose={() => setStatusModalUser(null)}
      />
    </div>
  )
}
