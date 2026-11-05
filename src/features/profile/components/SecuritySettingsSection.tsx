/**
 * Security Settings Section (Screen 41 — ANDROID-12)
 *
 * Implements password management for authenticated users, password strength
 * validation, secure Supabase updateUser integration, and security hygiene advice.
 */

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Key,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Lock,
} from 'lucide-react'
import { resetPasswordSchema, type ResetPasswordInput } from '@/features/auth/schemas/auth.schemas'
import { updatePassword } from '@/features/auth/services/auth.service'
import { PasswordInput } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { useLanguage } from '@/features/i18n'

export function SecuritySettingsSection() {
  const { t } = useLanguage()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  })

  async function onChangePassword(data: ResetPasswordInput) {
    setErrorMessage(null)
    setSuccessMessage(null)

    const result = await updatePassword({
      password: data.password,
      confirmPassword: data.confirmPassword,
    })

    if (result.error) {
      setErrorMessage(result.error.message)
      return
    }

    setSuccessMessage(
      t('profile.password_updated_success', 'Password updated successfully')
    )
    reset()
    setTimeout(() => setSuccessMessage(null), 4000)
  }

  return (
    <div className="space-y-6">
      {/* Change Password Form Card */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-brand-600 shrink-0" aria-hidden="true" />
          <h2 className="text-base font-semibold text-navy-900">
            {t('profile.change_password_title', 'Change Password')}
          </h2>
        </div>

        <p className="text-xs sm:text-sm text-navy-500">
          {t('profile.security_desc', 'Manage your password and protect your account credentials.')}
        </p>

        <form onSubmit={handleSubmit(onChangePassword)} noValidate className="space-y-4 pt-2">
          <PasswordInput
            label={t('profile.new_password', 'New password')}
            autoComplete="new-password"
            required
            error={errors.password?.message}
            {...register('password')}
          />

          <PasswordInput
            label={t('profile.confirm_new_password', 'Confirm new password')}
            autoComplete="new-password"
            required
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />

          <p className="text-xs text-navy-500 flex items-start gap-1.5">
            <Lock className="h-3.5 w-3.5 text-navy-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {t(
                'profile.password_requirements',
                'Password must be at least 8 characters, include an uppercase letter and a number.'
              )}
            </span>
          </p>

          {successMessage && (
            <div
              role="status"
              className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-sm font-medium text-teal-800 flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4 text-teal-600 shrink-0" aria-hidden="true" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center gap-2"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={isSubmitting}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {t('profile.save_changes', 'Update Password')}
          </Button>
        </form>
      </div>

      {/* Security Best Practices */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-navy-900">Security & Session Recommendations</h3>
        </div>

        <ul className="text-xs text-navy-600 space-y-2 list-disc list-inside leading-relaxed">
          <li>Never share your login credentials or OTP links with anyone.</li>
          <li>KHATRI SARVANIYAT administrators will never ask for your password.</li>
          <li>If you suspect unauthorized access, change your password immediately and sign out of all sessions.</li>
        </ul>
      </div>
    </div>
  )
}
