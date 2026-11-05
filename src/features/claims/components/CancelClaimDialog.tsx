/**
 * CancelClaimDialog — Confirmation dialog to withdraw a pending person claim.
 * (Phase 8 Subtask 2)
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useLanguage } from '@/features/i18n'
import { useClaimMutations } from '../hooks/usePersonClaim'

export interface CancelClaimDialogProps {
  claimId: string
  personId: string
  personName: string
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function CancelClaimDialog({
  claimId,
  personId,
  personName,
  isOpen,
  onClose,
  onSuccess,
}: CancelClaimDialogProps) {
  const { t } = useLanguage()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { cancelClaim } = useClaimMutations()

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null)
    }
  }, [isOpen])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleConfirmCancel() {
    setErrorMsg(null)
    try {
      await cancelClaim.mutateAsync({
        claimId,
        personId,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setErrorMsg(
        (err as { message?: string }).message ??
          'Unable to withdraw claim. Please try again later.'
      )
    }
  }

  const descText = t('claims.withdraw_desc', `Are you sure you want to withdraw your pending claim for ${personName || 'this person'}? You can submit a new claim request later.`)
    .replace('{name}', personName || 'this person')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-claim-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="w-full max-w-md rounded-xl border border-navy-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <h2 id="cancel-claim-title" className="text-lg font-semibold text-navy-900">
              {t('claims.withdraw_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg p-2 text-navy-400 hover:bg-navy-100 hover:text-navy-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 text-sm text-navy-600">
          <p>{descText}</p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {errorMsg}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-navy-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={cancelClaim.isPending}
            className="min-h-[44px] min-w-[44px]"
          >
            {t('claims.cancel_btn')}
          </Button>
          <Button
            type="button"
            isLoading={cancelClaim.isPending}
            disabled={cancelClaim.isPending}
            onClick={handleConfirmCancel}
            className="border-red-400 bg-red-600 text-white hover:bg-red-700 min-h-[44px] min-w-[44px]"
          >
            {t('claims.withdraw_confirm_btn')}
          </Button>
        </div>
      </div>
    </div>
  )
}
