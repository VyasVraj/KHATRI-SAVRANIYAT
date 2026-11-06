/**
 * Forgot Password page
 *
 * Sends a password reset email via Supabase Auth.
 * Shows a confirmation message after the email is sent.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail } from 'lucide-react'
import { forgotPasswordSchema, type ForgotPasswordInput } from '../schemas/auth.schemas'
import { sendPasswordReset } from '../services/auth.service'
import { ROUTES } from '@/constants/app'
import { BrandLogo } from '@/components/common/BrandLogo'
import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'

export function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit(data: ForgotPasswordInput) {
    setServerError(null)
    const result = await sendPasswordReset(data)

    if (result.error) {
      setServerError(result.error.message)
      return
    }

    setEmailSent(true)
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100">
            <Mail className="h-8 w-8 text-brand-600" />
          </div>
          <h1 className="text-2xl font-semibold text-navy-900">Reset link sent</h1>
          <p className="mt-3 text-sm text-navy-600">
            If an account exists for that email, you&apos;ll receive a password reset
            link shortly.
          </p>
          <p className="mt-4 text-xs text-navy-400">
            Check your spam folder if you don&apos;t see it within a few minutes.
          </p>
          <div className="mt-8">
            <Link
              to={ROUTES.SIGN_IN}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center flex flex-col items-center">
          <Link to={ROUTES.HOME} className="inline-flex flex-col items-center gap-3 group">
            <div className="p-2 rounded-xl bg-[#081B55] border border-[#D9A62E]/60 shadow-md group-hover:scale-105 transition-transform">
              <BrandLogo size="md" alt="KHATRI SARVANIYAT" priority />
            </div>
            <span className="text-2xl font-bold tracking-tight text-navy-950">KHATRI SARVANIYAT</span>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-navy-900">
            Reset your password
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Enter your email and we&apos;ll send you a reset link
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
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              error={errors.email?.message}
              {...register('email')}
            />

            <Button
              type="submit"
              fullWidth
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-navy-500">
          Remembered your password?{' '}
          <Link
            to={ROUTES.SIGN_IN}
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
