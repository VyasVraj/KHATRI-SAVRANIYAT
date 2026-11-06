/**
 * Sign In page
 *
 * Features:
 * - Email + password form (React Hook Form + Zod)
 * - Error display with user-friendly messages
 * - "Forgot password" link
 * - "Don't have an account? Sign up" link
 * - Redirects to previous page (or home) on success
 */

import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signInSchema, type SignInInput } from '../schemas/auth.schemas'
import { signIn } from '../services/auth.service'
import { ROUTES } from '@/constants/app'
import { BrandLogo } from '@/components/common/BrandLogo'
import { Input, PasswordInput } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'

export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)

  // Redirect destination: either where user came from, or home
  const from =
    (location.state as { from?: string } | null)?.from ?? ROUTES.HOME

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  })

  async function onSubmit(data: SignInInput) {
    setServerError(null)
    const result = await signIn(data)

    if (result.error) {
      setServerError(result.error.message)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center flex flex-col items-center">
          <Link to={ROUTES.HOME} className="inline-flex flex-col items-center gap-3 group">
            <div className="p-2 rounded-xl bg-[#081B55] border border-[#D9A62E]/60 shadow-md group-hover:scale-105 transition-transform">
              <BrandLogo size="md" alt="KHATRI SARVANIYAT" priority />
            </div>
            <span className="text-2xl font-bold tracking-tight text-navy-950">KHATRI SARVANIYAT</span>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-navy-900">
            Sign in to your account
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Welcome back to your community
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-navy-200 bg-white p-8 shadow-sm">
          {/* Server error banner */}
          {serverError && (
            <div
              role="alert"
              className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              error={errors.email?.message}
              {...register('email')}
            />

            <div>
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                placeholder="••••••••"
                required
                error={errors.password?.message}
                {...register('password')}
              />
              <div className="mt-1 text-right">
                <Link
                  to={ROUTES.FORGOT_PASSWORD}
                  className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              fullWidth
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-navy-500">
          Don&apos;t have an account?{' '}
          <Link
            to={ROUTES.SIGN_UP}
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
