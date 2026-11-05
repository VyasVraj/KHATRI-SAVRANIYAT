/**
 * AdminRoute — Route guard restricting access to Platform Administrators (SUPER_ADMIN, ADMIN).
 *
 * Phase 13 — Subtask 1: Admin Authorization Infrastructure, Database RPCs & AdminRoute
 *
 * NOTE: Community Moderators (COMMUNITY_MODERATOR) are NOT permitted in AdminRoute.
 * Route guards provide clean UX and navigation protection.
 * Actual database security and authorization are enforced by PostgreSQL RLS
 * and security-definer RPCs using is_admin().
 */

import { Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { Button } from '@/components/forms/Button'
import { ROUTES, PLATFORM_ADMIN_ROLES } from '@/constants/app'

export function AdminRoute() {
  const { isAuthenticated, profile, isLoading } = useAuthContext()
  const location = useLocation()

  if (isLoading) {
    return <LoadingScreen message="Checking administrator authorization…" />
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to={ROUTES.SIGN_IN}
        state={{ from: location.pathname }}
        replace
      />
    )
  }

  const isAdmin = Boolean(profile?.role && PLATFORM_ADMIN_ROLES.includes(profile.role))

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center" data-testid="admin-unauthorized">
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 shadow-sm">
          <ShieldAlert className="mx-auto h-12 w-12 text-red-500" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-navy-900">Administrator Access Restricted</h1>
          <p className="mt-2 text-sm text-navy-600">
            This section is restricted to Platform Administrators. Community moderators and standard members
            do not have administrative privileges for user management or system audit logs.
          </p>
          <div className="mt-6 flex justify-center">
            <Link to={ROUTES.HOME}>
              <Button variant="secondary" className="text-xs">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Return to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}
