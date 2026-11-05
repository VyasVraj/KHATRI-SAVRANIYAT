/**
 * Not Found Page (404)
 *
 * Displayed when a route is not matched.
 */

import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'
import { ROUTES } from '@/constants/app'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="text-center">
        <p className="mb-2 text-6xl font-bold text-brand-500" aria-hidden="true">
          404
        </p>
        <h1 className="mb-3 text-2xl font-semibold text-navy-900">Page Not Found</h1>
        <p className="mb-8 text-navy-500">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          to={ROUTES.HOME}
          className="inline-flex items-center gap-2 rounded bg-brand-600 px-6 py-3 font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Back to Home
        </Link>
      </div>
    </div>
  )
}
