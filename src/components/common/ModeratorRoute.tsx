/**
 * ModeratorRoute — Route guard restricting access to Community Moderators and Administrators.
 * (Phase 8 Subtask 3)
 *
 * NOTE: Route guards provide clean UX and navigation protection.
 * Actual database security and authorization are enforced by PostgreSQL RLS
 * and the security-definer function `is_community_moderator()`.
 */

import { Navigate, Outlet, useLocation, Link } from 'react-router-dom'
import { ShieldAlert, ArrowLeft } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { Button } from '@/components/forms/Button'
import { ROUTES, ADMIN_ROLES } from '@/constants/app'

export function ModeratorRoute() {
  const { isAuthenticated, profile, isLoading } = useAuthContext()
  const location = useLocation()

  if (isLoading) {
    return <LoadingScreen message="Checking moderator authorization…" />
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

  const isModerator = Boolean(profile?.role && ADMIN_ROLES.includes(profile.role))

  if (!isModerator) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center" data-testid="moderator-unauthorized">
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 shadow-sm">
          <ShieldAlert className="mx-auto h-12 w-12 text-red-500" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold text-navy-900">Access Restricted</h1>
          <p className="mt-2 text-sm text-navy-600">
            You do not have permission to access the Claim Review Queue. This section is restricted to
            authorized community moderators and platform administrators.
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
