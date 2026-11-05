/**
 * Auth Callback page
 *
 * Handles redirects from Supabase Auth emails:
 * - Email confirmation (after sign up)
 * - Magic link sign in (if enabled)
 *
 * Supabase redirects to: /auth/callback?code=<code>
 *
 * This page exchanges the code for a session and redirects to home.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { XCircle } from 'lucide-react'
import { exchangeCodeForSession } from '../services/auth.service'
import { ROUTES } from '@/constants/app'
import { LoadingScreen } from '@/components/common/LoadingScreen'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')

    if (!code) {
      setError('Invalid confirmation link. Please request a new one.')
      return
    }

    exchangeCodeForSession(code).then((result) => {
      if (result.error) {
        setError(result.error.message)
        return
      }

      // Session established — redirect to home or profile
      navigate(ROUTES.HOME, { replace: true })
    })
  }, [searchParams, navigate])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-semibold text-navy-900">Confirmation failed</h1>
          <p className="mt-3 text-sm text-navy-600">{error}</p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              to={ROUTES.SIGN_UP}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Sign up again
            </Link>
            <span className="hidden text-navy-300 sm:inline">·</span>
            <Link
              to={ROUTES.SIGN_IN}
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return <LoadingScreen message="Confirming your account…" />
}
