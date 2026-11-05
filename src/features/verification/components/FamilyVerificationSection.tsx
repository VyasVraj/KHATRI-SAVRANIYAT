/**
 * FamilyVerificationSection — UI section rendered on FamilyDetail to display verification state
 * and allow authorized community members to submit verification requests.
 * (Phase 9 — Subtask 2)
 */

import { useState } from 'react'
import { Shield, ShieldCheck, Clock, AlertCircle } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { VerificationBadge } from './VerificationBadge'
import { VerificationSubmitModal } from './VerificationSubmitModal'
import { DataQualityIndicator } from './DataQualityIndicator'
import { Button } from '@/components/forms/Button'
import type { FamilyRow } from '@/types'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/app'

export interface FamilyVerificationSectionProps {
  family: FamilyRow
}

export function FamilyVerificationSection({ family }: FamilyVerificationSectionProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthContext()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Soft-deleted families are ineligible for verification
  if (family.deleted_at) {
    return null
  }

  const status = family.verification_status ?? 'UNVERIFIED'

  return (
    <div
      data-testid="family-verification-section"
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
                Community verification
              </h3>
              <VerificationBadge status={status} size="sm" />
            </div>

            <p className="mt-1 text-xs text-navy-600">
              {status === 'VERIFIED' &&
                'This family record has been reviewed and verified by an authorized community moderator.'}
              {status === 'PENDING' &&
                'A verification request is pending review by community moderators.'}
              {status === 'REJECTED' &&
                'A previous verification request was rejected. You may submit a new request with updated supporting notes.'}
              {status === 'UNVERIFIED' &&
                'This family record is unverified. Community members can submit records to be verified for accuracy.'}
            </p>
          </div>
        </div>

        {/* Action Button: only when UNVERIFIED or REJECTED */}
        {(status === 'UNVERIFIED' || status === 'REJECTED') && (
          <div className="sm:self-center shrink-0">
            {!isAuthLoading && !isAuthenticated ? (
              <Link
                to={ROUTES.SIGN_IN}
                className="text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline"
              >
                Sign in to request verification
              </Link>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsModalOpen(true)}
              >
                Request verification
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-navy-100">
        <DataQualityIndicator family={family} />
      </div>

      {isModalOpen && (
        <VerificationSubmitModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          entityType="FAMILY"
          entityId={family.id}
          entityName={family.family_name}
        />
      )}
    </div>
  )
}

