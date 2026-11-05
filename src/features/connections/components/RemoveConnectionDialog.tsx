/**
 * RemoveConnectionDialog — Confirmation dialog for removing a connection or canceling a request
 * (Phase 7 Subtask 2)
 */

import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { ConnectionWithProfile } from '../types'
import { Button } from '@/components/forms/Button'

export interface RemoveConnectionDialogProps {
  connection: ConnectionWithProfile | null
  isOpen: boolean
  onClose: () => void
  onConfirm: (connectionId: string) => Promise<void>
}

export function RemoveConnectionDialog({
  connection,
  isOpen,
  onClose,
  onConfirm,
}: RemoveConnectionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null)
      setIsSubmitting(false)
    }
  }, [isOpen])

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onClose])

  if (!isOpen || !connection) return null

  const isPendingSent = connection.status === 'PENDING' && connection.is_requester
  const targetName = connection.other_user.display_name?.trim() || 'this user'

  const title = isPendingSent ? 'Cancel Connection Request' : 'Remove Connection'
  const description = isPendingSent
    ? `Are you sure you want to cancel your connection request to ${targetName}?`
    : `Are you sure you want to remove ${targetName} from your connections? You will no longer share connection-level visibility.`
  const actionLabel = isPendingSent ? 'Cancel Request' : 'Remove Connection'

  async function handleConfirm() {
    setErrorMessage(null)
    setIsSubmitting(true)
    try {
      await onConfirm(connection!.id)
      onClose()
    } catch (err) {
      setErrorMessage((err as Error).message || 'Failed to complete action.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-connection-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="remove-connection-title" className="text-base font-semibold text-navy-900">
                {title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4 space-y-3">
          <p className="text-sm text-navy-600">{description}</p>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              {errorMessage}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-navy-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Keep
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={isSubmitting}
            isLoading={isSubmitting}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
