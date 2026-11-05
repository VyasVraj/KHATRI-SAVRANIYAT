/**
 * PersonVerificationSection — UI section rendered on PersonDetail to display verification state
 * and allow authorized community members to submit verification requests.
 * (Phase 9 — Subtask 2)
 *
 * Eligibility rules:
 * - Inactive or soft-deleted records are completely ineligible (returns null).
 * - Deceased records (date_of_death set) are restricted at the UI/application level
 *   from requesting live member verification and display an informational message.
 *   (UX eligibility rule; not a database/RPC constraint).
 */

import { useState } from 'react'
import { Shield, ShieldCheck, Clock, AlertCircle } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useLanguage } from '@/features/i18n'
import { VerificationBadge } from './VerificationBadge'
import { VerificationSubmitModal } from './VerificationSubmitModal'
import { DataQualityIndicator } from './DataQualityIndicator'
import { Button } from '@/components/forms/Button'
import type { PersonRow } from '@/types'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/app'

export interface PersonVerificationSectionProps {
  person: PersonRow
}

export function PersonVerificationSection({ person }: PersonVerificationSectionProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthContext()
  const { t } = useLanguage()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Inactive or soft-deleted records are ineligible for verification
  if (person.deleted_at || person.status !== 'ACTIVE') {
    return null
  }

  const personName = [person.first_name, person.last_name].filter(Boolean).join(' ')
  const status = person.verification_status ?? 'UNVERIFIED'
  const isDeceased = Boolean(person.date_of_death)

  const getStatusDesc = () => {
    switch (status) {
      case 'VERIFIED':
        return t('verification.desc_verified', 'This person record has been reviewed and verified by an authorized community moderator.')
      case 'PENDING':
        return t('verification.desc_pending', 'A verification request is pending review by community moderators.')
      case 'REJECTED':
        return t('verification.desc_rejected', 'A previous verification request was rejected. You may submit a new request with updated supporting notes.')
      case 'UNVERIFIED':
      default:
        return isDeceased
          ? t('verification.desc_deceased', 'Deceased records cannot be submitted for live member verification.')
          : t('verification.desc_unverified', 'This record is unverified. Community members can submit records to be verified for accuracy.')
    }
  }

  return (
    <div
      data-testid="person-verification-section"
      className="rounded-lg border border-navy-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-navy-50 p-2 text-brand-600 shrink-0">
            {status === 'VERIFIED' ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            ) : status === 'PENDING' ? (
              <Clock className="h-5 w-5 text-amber-600" aria-hidden="true" />
            ) : status === 'REJECTED' ? (
              <AlertCircle className="h-5 w-5 text-rose-600" aria-hidden="true" />
            ) : (
              <Shield className="h-5 w-5 text-navy-400" aria-hidden="true" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-navy-900">
                {t('verification.title', 'Community verification')}
              </h3>
              <VerificationBadge status={status} size="sm" />
            </div>

            <p className="mt-1 text-xs text-navy-600">
              {getStatusDesc()}
            </p>
          </div>
        </div>

        {/* Action Button: only when UNVERIFIED or REJECTED, and living */}
        {(status === 'UNVERIFIED' || status === 'REJECTED') && !isDeceased && (
          <div className="sm:self-center shrink-0">
            {!isAuthLoading && !isAuthenticated ? (
              <Link
                to={ROUTES.SIGN_IN}
                className="text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline min-h-[44px] inline-flex items-center"
              >
                {t('verification.sign_in_to_request', 'Sign in to request verification')}
              </Link>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsModalOpen(true)}
                className="min-h-[44px] min-w-[44px]"
              >
                {t('verification.request_btn', 'Request verification')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-navy-100">
        <DataQualityIndicator person={person} />
      </div>

      {isModalOpen && (
        <VerificationSubmitModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          entityType="PERSON"
          entityId={person.id}
          entityName={personName}
        />
      )}
    </div>
  )
}

