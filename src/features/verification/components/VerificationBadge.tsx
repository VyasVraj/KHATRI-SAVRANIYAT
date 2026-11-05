/**
 * VerificationBadge — Accessible badge displaying census verification status.
 * (Phase 9 — Subtask 2)
 */

import { CheckCircle2, Clock, AlertCircle, Shield } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { VerificationStatus } from '../types'

export interface VerificationBadgeProps {
  status: VerificationStatus | string | null | undefined
  size?: 'sm' | 'md'
  className?: string
}

export function VerificationBadge({
  status,
  size = 'md',
  className = '',
}: VerificationBadgeProps) {
  const { t } = useLanguage()
  const normStatus = (status || 'UNVERIFIED').toUpperCase() as VerificationStatus
  const isSm = size === 'sm'

  const iconClasses = isSm ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'
  const textClasses = isSm ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1'

  switch (normStatus) {
    case 'VERIFIED':
      return (
        <span
          data-testid="verification-badge-verified"
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ${textClasses} ${className}`}
        >
          <CheckCircle2 className={`${iconClasses} text-emerald-600`} aria-hidden="true" />
          <span>{t('verification.badge_verified', 'Verified')}</span>
        </span>
      )

    case 'PENDING':
      return (
        <span
          data-testid="verification-badge-pending"
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200 ${textClasses} ${className}`}
        >
          <Clock className={`${iconClasses} text-amber-600`} aria-hidden="true" />
          <span>{t('verification.badge_pending', 'Verification Pending')}</span>
        </span>
      )

    case 'REJECTED':
      return (
        <span
          data-testid="verification-badge-rejected"
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-rose-50 text-rose-700 border border-rose-200 ${textClasses} ${className}`}
        >
          <AlertCircle className={`${iconClasses} text-rose-600`} aria-hidden="true" />
          <span>{t('verification.badge_rejected', 'Rejected')}</span>
        </span>
      )

    case 'UNVERIFIED':
    default:
      return (
        <span
          data-testid="verification-badge-unverified"
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-navy-50 text-navy-600 border border-navy-200 ${textClasses} ${className}`}
        >
          <Shield className={`${iconClasses} text-navy-400`} aria-hidden="true" />
          <span>{t('verification.badge_unverified', 'Unverified')}</span>
        </span>
      )
  }
}
