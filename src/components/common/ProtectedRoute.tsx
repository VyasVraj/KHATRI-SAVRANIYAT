/**
 * ProtectedRoute — route guard for authenticated-only routes
 *
 * Usage in router.tsx:
 *   { element: <ProtectedRoute />, children: [...] }
 *
 * Behaviour:
 * - While loading: renders LoadingScreen
 * - If not authenticated: redirects to /auth/sign-in with `?from=<currentPath>`
 * - If authenticated: renders <Outlet />
 *
 * NOTE: This is a UX guard only.
 * Real authorization is enforced at the database/RLS level.
 * Do NOT rely on this component alone for security.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { ROUTES } from '@/constants/app'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuthContext()
  const location = useLocation()

  if (isLoading) {
    return <LoadingScreen message="Checking authentication…" />
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

  return <Outlet />
}

/**
 * GuestOnlyRoute — redirects authenticated users away from auth pages
 *
 * Usage: wraps sign-in, sign-up routes so authenticated users
 * don't see them (they'd be redirected to home).
 */
export function GuestOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuthContext()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isAuthenticated) {
    return <Navigate to={ROUTES.HOME} replace />
  }

  return <Outlet />
}
