/**
 * RouteErrorPage
 *
 * Dedicated route-level error component for React Router's `errorElement`.
 * Catches route navigation, loader failures, and unexpected route-level render errors.
 *
 * Security & Privacy Invariants:
 * 1. Distinguishes 404/not-found responses from unexpected 500/runtime errors.
 * 2. NEVER displays raw error messages, stack traces, database schema details, or network payloads.
 * 3. Provides clean navigation options back to safety without trapping the user.
 */

import { useEffect, useState } from 'react'
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { AlertCircle, HelpCircle, Home, RefreshCw } from 'lucide-react'
import { ROUTES } from '@/constants/app'
import { captureException } from '@/lib/observability'

export function RouteErrorPage() {
  const error = useRouteError()
  const [correlationId, setCorrelationId] = useState<string | null>(null)

  const is404 = isRouteErrorResponse(error) && error.status === 404

  useEffect(() => {
    if (!is404 && error) {
      const ref = captureException(error, {
        context: 'RouteErrorPage',
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      })
      setCorrelationId(ref)
    }
  }, [is404, error])

  const handleReload = () => {
    window.location.reload()
  }

  if (is404) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-12"
      >
        <div className="w-full max-w-md rounded-lg border border-navy-200 bg-white p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <HelpCircle className="h-6 w-6" aria-hidden="true" />
          </div>

          <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-brand-600">
            Error 404
          </p>

          <h1 className="mb-2 text-xl font-bold text-navy-950 sm:text-2xl">
            Page Not Found
          </h1>

          <p className="mb-6 text-sm text-navy-600 sm:text-base leading-relaxed">
            The page you are looking for does not exist, has been removed, or is temporarily unavailable.
          </p>

          <div className="flex justify-center">
            <Link
              to={ROUTES.HOME}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Return Home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-12"
    >
      <div className="w-full max-w-md rounded-lg border border-navy-200 bg-white p-6 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="mb-2 text-xl font-bold text-navy-950 sm:text-2xl">
          Unable to Load Page
        </h1>

        <p className="mb-6 text-sm text-navy-600 sm:text-base leading-relaxed">
          An unexpected problem occurred while loading this section. Please try refreshing the page or navigate back to the home screen.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload Page
          </button>

          <Link
            to={ROUTES.HOME}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-navy-300 bg-white px-4 py-2.5 text-sm font-medium text-navy-700 shadow-sm transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Return Home
          </Link>
        </div>

        {correlationId && (
          <p className="mt-5 text-xs text-navy-400 font-mono">
            Reference: {correlationId}
          </p>
        )}
      </div>
    </div>
  )
}
