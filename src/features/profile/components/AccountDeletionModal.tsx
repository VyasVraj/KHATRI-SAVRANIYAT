/**
 * Account Deletion Modal (Screen 42 — ANDROID-12)
 *
 * Implements privacy-compliant account deletion request workflow
 * preserving shared genealogical census records in accordance with
 * PERSON != USER community governance.
 */

import { useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'
import { useLanguage } from '@/features/i18n'

export interface AccountDeletionModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirmDeletion: () => Promise<void>
  isDeleting: boolean
}

export function AccountDeletionModal({
  isOpen,
  onClose,
  onConfirmDeletion,
  isDeleting,
}: AccountDeletionModalProps) {
  const { t } = useLanguage()
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const isConfirmed = confirmText.trim().toUpperCase() === 'DELETE'

  async function handleConfirm() {
    if (!isConfirmed) return
    setError(null)
    try {
      await onConfirmDeletion()
    } catch (err) {
      setError(
        (err as { message?: string })?.message ??
          'Failed to process account deletion. Please try again.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deletion-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy-950/60 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-4 sm:p-6 shadow-xl border border-navy-200 animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          disabled={isDeleting}
          aria-label="Close modal"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 rounded-lg p-2 text-navy-400 hover:text-navy-600 hover:bg-navy-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="flex items-start gap-3 sm:gap-4 pr-8">
          <div className="rounded-full bg-red-100 p-2.5 sm:p-3 text-red-600 shrink-0">
            <AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
          </div>

          <div className="space-y-1.5 sm:space-y-2 min-w-0">
            <h3 id="deletion-modal-title" className="text-base sm:text-lg font-bold text-navy-900 leading-snug">
              {t('profile.account_delete_modal_title', 'Confirm Account Deletion Request')}
            </h3>

            <p className="text-xs text-navy-600 leading-relaxed">
              {t(
                'profile.account_delete_modal_warning',
                'This action will terminate your login account and private credentials. In accordance with community rules (PERSON != USER), your census record will remain in the community registry as an unlinked genealogical record.'
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 sm:mt-5 rounded-lg border border-red-200 bg-red-50/50 p-3.5 sm:p-4 space-y-2.5 sm:space-y-3">
          <p className="text-xs font-semibold text-red-900">
            {t('profile.account_delete_confirm_prompt', 'Please type DELETE to confirm')}
          </p>

          <Input
            label=""
            type="text"
            placeholder="DELETE"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={isDeleting}
            className="bg-white"
          />

          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="mt-5 sm:mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 sm:gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:w-auto min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isConfirmed || isDeleting}
            isLoading={isDeleting}
            className="w-full sm:w-auto bg-red-600 text-white hover:bg-red-700 border-red-600 min-h-[44px]"
          >
            <Trash2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {t('profile.account_delete_confirm_action', 'Permanently Delete Account')}
          </Button>
        </div>
      </div>
    </div>
  )
}
