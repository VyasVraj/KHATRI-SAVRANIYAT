/**
 * VerificationSubmitModal — Accessible modal dialog to submit a verification request.
 * (Phase 9 — Subtask 2)
 *
 * Implements architectural boundaries:
 * - Directs submission strictly through useSubmitVerificationRequest hook (calling RPC).
 * - Clear disclosure: Verification attests to data accuracy, does not grant ownership.
 */

import { useState, useEffect } from 'react'
import { X, ShieldCheck, AlertCircle } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useLanguage } from '@/features/i18n'
import { useSubmitVerificationRequest } from '../hooks/useVerification'
import type { VerificationEntityType } from '../types'

export interface VerificationSubmitModalProps {
  isOpen: boolean
  onClose: () => void
  entityType: VerificationEntityType
  entityId: string
  entityName: string
  onSuccess?: () => void
}

export function VerificationSubmitModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  onSuccess,
}: VerificationSubmitModalProps) {
  const { t } = useLanguage()
  const [supportingNotes, setSupportingNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const submitMutation = useSubmitVerificationRequest()

  useEffect(() => {
    if (isOpen) {
      setSupportingNotes('')
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

  const isOverLimit = supportingNotes.length > 1000

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    if (isOverLimit) {
      setErrorMsg('Supporting notes cannot exceed 1000 characters.')
      return
    }

    try {
      await submitMutation.mutateAsync({
        entityType,
        entityId,
        supportingNotes: supportingNotes.trim() || undefined,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setErrorMsg(
        (err as { message?: string }).message ??
          'Unable to submit verification request. Please try again later.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verification-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h2 id="verification-modal-title" className="text-lg font-semibold text-navy-900">
              {t('verification.modal_title', 'Request Verification')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg p-2 text-navy-400 hover:bg-navy-50 hover:text-navy-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-lg bg-navy-50/70 p-3.5 text-xs text-navy-700">
            <p className="font-medium text-navy-900">
              Target {entityType === 'PERSON' ? 'Person' : 'Family'}: {entityName}
            </p>
            <p className="mt-1 leading-relaxed text-navy-600">
              Submit this record for community verification. Verification confirms that the
              record has been reviewed by an authorized community moderator. It does not
              transfer ownership or change account access.
            </p>
          </div>

          <div>
            <label
              htmlFor="verification-supporting-notes"
              className="block text-xs font-medium text-navy-700"
            >
              Supporting notes <span className="text-navy-400 font-normal">(optional)</span>
            </label>
            <p className="mt-0.5 text-xs text-navy-500">
              Provide context, genealogical sources, or references to assist moderators in reviewing this record.
            </p>
            <textarea
              id="verification-supporting-notes"
              aria-describedby="notes-counter"
              rows={4}
              value={supportingNotes}
              onChange={(e) => setSupportingNotes(e.target.value)}
              placeholder="e.g. Known community member, head of household in village census records..."
              className={`mt-1.5 w-full rounded-md border p-2.5 text-sm transition-colors focus:outline-none focus:ring-2 ${
                isOverLimit
                  ? 'border-rose-400 focus:ring-rose-200'
                  : 'border-navy-300 focus:border-brand-500 focus:ring-brand-200'
              }`}
            />
            <div id="notes-counter" className="mt-1 flex justify-between text-xs text-navy-400">
              <span>{isOverLimit ? 'Character limit exceeded' : ''}</span>
              <span className={isOverLimit ? 'font-semibold text-rose-600' : ''}>
                {supportingNotes.length} / 1000
              </span>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-rose-50 p-3 text-xs text-rose-700"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitMutation.isPending}
              className="min-h-[44px] min-w-[44px]"
            >
              {t('claims.cancel_btn', 'Cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={submitMutation.isPending}
              disabled={submitMutation.isPending || isOverLimit}
              className="min-h-[44px] min-w-[44px]"
            >
              {submitMutation.isPending
                ? t('verification.submitting_btn', 'Submitting…')
                : t('verification.submit_btn', 'Submit request')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
