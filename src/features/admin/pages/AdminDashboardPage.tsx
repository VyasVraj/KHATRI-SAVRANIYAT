/**
 * AdminDashboardPage — Central Admin Hub & Platform Metrics Dashboard
 *
 * Route: /admin
 * Guarded by: AdminRoute (SUPER_ADMIN, ADMIN only)
 * Layout: AdminLayout
 *
 * Invariants:
 * - Server-Authoritative: Metrics are fetched directly from security-definer RPC `admin_get_platform_metrics()`.
 * - PERSON != USER:
 *   * Accounts are platform users (public.profiles).
 *   * Census records are human persons (public.persons).
 *   * Visual and structural distinction is maintained throughout the dashboard.
 * - No private census attributes are exposed in aggregate platform metrics.
 */

import { Link } from 'react-router-dom'
import {
  Users,
  UserCheck,
  Home,
  ShieldAlert,
  CheckCircle2,
  Copy,
  RefreshCw,
  AlertCircle,
  Shield,
  ArrowRight,
  Info,
  Clock,
  History,
} from 'lucide-react'
import { ROUTES } from '@/constants/app'
import { Button } from '@/components/forms/Button'
import { usePlatformMetrics } from '../hooks/usePlatformMetrics'
import { cn } from '@/lib/utils'

function formatTimestamp(isoString?: string): string {
  if (!isoString) return 'Just now'
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return isoString
  }
}

export function AdminDashboardPage() {
  const { data: metrics, isLoading, isError, error, refetch, isFetching } = usePlatformMetrics()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Dashboard Top Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">
              Platform Administration
            </h1>
            <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
              Admin Hub
            </span>
          </div>
          <p className="mt-1.5 text-sm text-navy-600">
            Real-time platform overview, community census statistics, and moderation queues.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {metrics?.generated_at && (
            <div className="hidden text-right text-xs text-navy-500 sm:block">
              <span className="block font-medium">Last updated</span>
              <span className="text-navy-400">{formatTimestamp(metrics.generated_at)}</span>
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            aria-label="Refresh platform metrics"
            className="flex items-center gap-1.5"
          >
            <RefreshCw
              className={cn('h-4 w-4 text-navy-600', (isLoading || isFetching) && 'animate-spin')}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* PERSON != USER Architectural Notice */}
      <div
        role="region"
        aria-label="Architectural Invariant"
        className="mb-8 rounded-xl border border-brand-200 bg-brand-50/70 p-4 sm:p-5 shadow-xs"
      >
        <div className="flex items-start gap-3.5">
          <Info className="h-5 w-5 text-brand-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="text-xs sm:text-sm text-brand-900">
            <span className="font-bold">Architectural Principle: PERSON ≠ USER.</span>{' '}
            <span className="text-brand-800">
              User accounts represent authentication identities capable of logging in. Persons represent historical
              and living human beings in the community census. Account management and permissions do not modify
              genealogical relationships or census records.
            </span>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-testid="metrics-loading"
        >
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse rounded-xl border border-navy-200 bg-white p-5 shadow-xs"
            >
              <div className="h-4 w-24 bg-navy-200 rounded" />
              <div className="mt-4 h-8 w-16 bg-navy-300 rounded" />
              <div className="mt-2 h-3 w-32 bg-navy-100 rounded" />
            </div>
          ))}
          <span className="sr-only">Loading platform metrics…</span>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-red-200 bg-red-50 p-6 text-center"
          data-testid="metrics-error"
        >
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-navy-900">Failed to Load Platform Metrics</h2>
          <p className="mt-1 text-sm text-red-700">
            {error?.message || 'An unexpected error occurred while communicating with the database RPC.'}
          </p>
          <div className="mt-5 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Retry</span>
            </Button>
          </div>
        </div>
      )}

      {/* Metrics Content (Success State) */}
      {!isLoading && !isError && metrics && (
        <div className="space-y-8" data-testid="metrics-content">
          {/* Section: Platform Overview Metrics */}
          <div>
            <h2 className="text-base font-bold text-navy-900 mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Platform Overview
            </h2>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {/* Card 1: User Accounts (auth) */}
              <div
                className="relative overflow-hidden rounded-xl border border-navy-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm"
                data-testid="metric-users"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    User Accounts
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-navy-900" data-testid="total-users-value">
                    {metrics.total_users.toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {metrics.active_users} active
                  </span>
                </div>
                <p className="mt-2 text-xs text-navy-500">
                  Authentication identities registered on the platform.
                </p>
                <div className="mt-3 pt-2 border-t border-navy-100 flex justify-between items-center">
                  <Link
                    to={ROUTES.ADMIN_USERS}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 focus-visible:outline-none focus-visible:underline"
                  >
                    <span>Manage Users</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Card 2: Census Persons (public.persons) */}
              <div
                className="relative overflow-hidden rounded-xl border border-navy-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm"
                data-testid="metric-persons"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    Census Persons
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <UserCheck className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-navy-900" data-testid="total-persons-value">
                    {metrics.total_persons.toLocaleString()}
                  </span>
                  <span className="text-xs text-navy-500">records</span>
                </div>
                <p className="mt-2 text-xs text-navy-500">
                  Individual census entities in the community registry.
                </p>
              </div>

              {/* Card 3: Census Families (public.families) */}
              <div
                className="relative overflow-hidden rounded-xl border border-navy-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm"
                data-testid="metric-families"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    Census Families
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                    <Home className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-navy-900" data-testid="total-families-value">
                    {metrics.total_families.toLocaleString()}
                  </span>
                  <span className="text-xs text-navy-500">units</span>
                </div>
                <p className="mt-2 text-xs text-navy-500">
                  Family households and lineage trees registered.
                </p>
              </div>

              {/* Card 4: Pending Claims */}
              <div
                className={cn(
                  'relative overflow-hidden rounded-xl border p-5 shadow-xs transition-shadow hover:shadow-sm',
                  metrics.pending_claims > 0
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-navy-200 bg-white'
                )}
                data-testid="metric-claims"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    Pending Claims
                  </span>
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      metrics.pending_claims > 0 ? 'bg-amber-100 text-amber-700' : 'bg-navy-50 text-navy-600'
                    )}
                  >
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-navy-900" data-testid="pending-claims-value">
                    {metrics.pending_claims}
                  </span>
                  <span className="text-xs text-navy-500">
                    {metrics.pending_claims === 1 ? 'awaiting review' : 'awaiting review'}
                  </span>
                </div>
                <div className="mt-3 pt-2 border-t border-navy-100 flex justify-between items-center">
                  <Link
                    to={ROUTES.CLAIM_REVIEW_QUEUE}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 focus-visible:outline-none focus-visible:underline"
                  >
                    <span>Open Queue</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Card 5: Pending Verifications */}
              <div
                className={cn(
                  'relative overflow-hidden rounded-xl border p-5 shadow-xs transition-shadow hover:shadow-sm',
                  metrics.pending_verifications > 0
                    ? 'border-indigo-300 bg-indigo-50/40'
                    : 'border-navy-200 bg-white'
                )}
                data-testid="metric-verifications"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    Pending Verifications
                  </span>
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      metrics.pending_verifications > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-navy-50 text-navy-600'
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-navy-900" data-testid="pending-verifications-value">
                    {metrics.pending_verifications}
                  </span>
                  <span className="text-xs text-navy-500">
                    {metrics.pending_verifications === 1 ? 'awaiting review' : 'awaiting review'}
                  </span>
                </div>
                <div className="mt-3 pt-2 border-t border-navy-100 flex justify-between items-center">
                  <Link
                    to={ROUTES.VERIFICATION_REVIEW_QUEUE}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 focus-visible:outline-none focus-visible:underline"
                  >
                    <span>Open Queue</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Card 6: Open Duplicates */}
              <div
                className="relative overflow-hidden rounded-xl border border-navy-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm"
                data-testid="metric-duplicates"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    Open Duplicate Flags
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-navy-900" data-testid="open-duplicates-value">
                    {metrics.open_duplicates}
                  </span>
                  <span className="text-xs text-navy-500">flagged items</span>
                </div>
                <p className="mt-2 text-xs text-navy-500">
                  Potential duplicate census records awaiting resolution.
                </p>
                <div className="mt-3 pt-2 border-t border-navy-100 flex justify-between items-center">
                  <Link
                    to={ROUTES.ADMIN_DUPLICATES}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 focus-visible:outline-none focus-visible:underline"
                  >
                    <span>Open Queue</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Operational Moderation Workflows */}
          <div>
            <h2 className="text-base font-bold text-navy-900 mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Administrative & Moderation Queues
            </h2>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {/* Workflow Card 1: Claim Review Queue */}
              <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                      <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-navy-900">Claim Review Queue</h3>
                      <p className="text-xs text-navy-500">
                        {metrics.pending_claims === 1
                          ? '1 pending record claim'
                          : `${metrics.pending_claims} pending record claims`}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-navy-600">
                    Review and verify requests from community users claiming ownership of historical or existing
                    census person records. Ensures account-to-person links are authenticated and verified.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-navy-100 flex items-center justify-between">
                  <span className="text-xs text-navy-400">Moderator & Admin Authorization</span>
                  <Link to={ROUTES.CLAIM_REVIEW_QUEUE}>
                    <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                      <span>Access Queue</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Workflow Card 2: Verification Review Queue */}
              <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-navy-900">Verification Review Queue</h3>
                      <p className="text-xs text-navy-500">
                        {metrics.pending_verifications === 1
                          ? '1 pending verification'
                          : `${metrics.pending_verifications} pending verifications`}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-navy-600">
                    Inspect census data quality and confirm relationship verification requests submitted by community
                    members or family heads to maintain data veracity across lineages.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-navy-100 flex items-center justify-between">
                  <span className="text-xs text-navy-400">Moderator & Admin Authorization</span>
                  <Link to={ROUTES.VERIFICATION_REVIEW_QUEUE}>
                    <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                      <span>Access Queue</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Workflow Card 3: User Administration */}
              <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                      <Users className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-navy-900">User Administration</h3>
                      <p className="text-xs text-navy-500">
                        {metrics.total_users} registered account{metrics.total_users === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-navy-600">
                    Manage platform user logins, role promotions, and account deactivations. Protected by strict role hierarchy and lockout prevention rules.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-navy-100 flex items-center justify-between">
                  <span className="text-xs text-navy-400">Admin & Super Admin Authorization</span>
                  <Link to={ROUTES.ADMIN_USERS}>
                    <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                      <span>Manage Users</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Workflow Card 4: Security Audit Trail */}
              <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
                      <History className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-navy-900">Security Audit Trail</h3>
                      <p className="text-xs text-navy-500">
                        Immutable administrative history
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-navy-600">
                    Inspect security and administrative events, role modifications, status toggles, and verification decisions with actor attribution.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-navy-100 flex items-center justify-between">
                  <span className="text-xs text-navy-400">Admin & Super Admin Authorization</span>
                  <Link to={ROUTES.ADMIN_AUDIT}>
                    <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                      <span>View Audit Trail</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Workflow Card 5: Duplicate Review Queue */}
              <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700 border border-rose-200">
                      <Copy className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-navy-900">Duplicate Review Queue</h3>
                      <p className="text-xs text-navy-500">
                        {metrics.open_duplicates === 1
                          ? '1 flagged duplicate record'
                          : `${metrics.open_duplicates} flagged duplicate records`}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-navy-600">
                    Inspect similarity between flagged census records. Confirm duplicates or mark non-duplicates without destructive merges.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-navy-100 flex items-center justify-between">
                  <span className="text-xs text-navy-400">Admin & Super Admin Authorization</span>
                  <Link to={ROUTES.ADMIN_DUPLICATES}>
                    <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
                      <span>Review Duplicates</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
