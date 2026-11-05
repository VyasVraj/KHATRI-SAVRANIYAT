/**
 * Reset Password page
 *
 * Handles the password reset flow after the user clicks the email link.
 * Supabase sends the user to this page with a `code` query parameter.
 *
 * Flow:
 * 1. Page loads → extracts `code` from URL params
 * 2. Exchanges code for a session (authenticates the user temporarily)
 * 3. Shows new password form
 * 4. On submit: calls updateUser({ password }) → redirects to home
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, XCircle } from 'lucide-react'
import { resetPasswordSchema, type ResetPasswordInput } from '../schemas/auth.schemas'
import { updatePassword, exchangeCodeForSession } from '../services/auth.service'
import { ROUTES } from '@/constants/app'
import { PasswordInput } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { LoadingScreen } from '@/components/common/LoadingScreen'

type PageState = 'loading' | 'ready' | 'invalid' | 'success'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [pageState, setPageState] = useState<PageState>('loading')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
  })

  // Exchange the code for a session on mount
  useEffect(() => {
    const code = searchParams.get('code')

    if (!code) {
      setPageState('invalid')
      return
    }

    exchangeCodeForSession(code).then((result) => {
      if (result.error) {
        setPageState('invalid')
      } else {
        setPageState('ready')
      }
    })
  }, [searchParams])

  async function onSubmit(data: ResetPasswordInput) {
    setServerError(null)
    const result = await updatePassword(data)

    if (result.error) {
      setServerError(result.error.message)
      return
    }

    setPageState('success')
    // Redirect to home after a brief moment
    setTimeout(() => navigate(ROUTES.HOME, { replace: true }), 2000)
  }

  if (pageState === 'loading') {
    return <LoadingScreen message="Verifying reset link…" />
  }

  if (pageState === 'invalid') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-semibold text-navy-900">Link expired or invalid</h1>
          <p className="mt-3 text-sm text-navy-600">
            This password reset link has expired or already been used.
            <br />
            Please request a new one.
          </p>
          <div className="mt-8">
            <Link
              to={ROUTES.FORGOT_PASSWORD}
              className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (pageState === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
            <CheckCircle className="h-8 w-8 text-teal-600" />
          </div>
          <h1 className="text-2xl font-semibold text-navy-900">Password updated!</h1>
          <p className="mt-3 text-sm text-navy-600">
            Your password has been updated. Redirecting you…
          </p>
        </div>
      </div>
    )
  }

  // pageState === 'ready'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to={ROUTES.HOME} className="inline-block">
            <span className="text-2xl font-bold text-brand-600">KHATRI SARVANIYAT</span>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-navy-900">
            Choose a new password
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Must be at least 8 characters with an uppercase letter and number
          </p>
        </div>

        <div className="rounded-lg border border-navy-200 bg-white p-8 shadow-sm">
          {serverError && (
            <div
              role="alert"
              className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <PasswordInput
              label="New password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              error={errors.password?.message}
              {...register('password')}
            />

            <PasswordInput
              label="Confirm new password"
              autoComplete="new-password"
              placeholder="Repeat your new password"
              required
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button
              type="submit"
              fullWidth
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Updating password…' : 'Update password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
