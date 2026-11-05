/**
 * RemoveRelationshipDialog — Confirmation dialog for soft-deleting an interpersonal relationship.
 *
 * Requirements:
 * - Calls softDeleteRelationship (stamps deleted_at timestamp).
 * - Physical DELETE is strictly prohibited across the application.
 * - Requires explicit user confirmation.
 * - Informs the user that history is preserved without permanent destruction.
 */

import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useSoftDeleteRelationship } from '../hooks/useRelationshipMutations'
import type { PersonRelationshipItem } from '../types'
import { Button } from '@/components/forms/Button'

export interface RemoveRelationshipDialogProps {
  item: PersonRelationshipItem | null
  isOpen: boolean
  onClose: () => void
}

const ROLE_LABELS: Record<PersonRelationshipItem['role'], string> = {
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse',
  sibling: 'Sibling',
}

export function RemoveRelationshipDialog({
  item,
  isOpen,
  onClose,
}: RemoveRelationshipDialogProps) {
  const softDeleteMutation = useSoftDeleteRelationship()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Reset errors when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null)
    }
  }, [isOpen])

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !item) return null

  const { relatedPerson, role, relationship } = item
  const personName = relatedPerson
    ? `${relatedPerson.first_name} ${relatedPerson.last_name}`
    : 'this person'
  const roleLabel = ROLE_LABELS[role] ?? role

  async function handleConfirm() {
    setErrorMessage(null)
    try {
      await softDeleteMutation.mutateAsync(relationship.id)
      onClose()
    } catch (err) {
      setErrorMessage(
        (err as { message?: string })?.message ??
          'Could not remove this relationship. Please try again.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-relationship-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 id="remove-relationship-title" className="text-base font-semibold text-navy-900">
              Remove Relationship
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Description */}
        <div className="mt-4 text-sm text-navy-600">
          <p>
            Are you sure you want to remove the <span className="font-semibold text-navy-900">{roleLabel}</span>{' '}
            relationship with <span className="font-semibold text-navy-900">{personName}</span>?
          </p>
          <p className="mt-2 text-xs text-navy-500">
            This will soft-delete the relationship from active records. Genealogical data integrity is
            preserved.
          </p>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            {errorMessage}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={softDeleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            isLoading={softDeleteMutation.isPending}
            disabled={softDeleteMutation.isPending}
            className="border-red-600 bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
          >
            Confirm remove
          </Button>
        </div>
      </div>
    </div>
  )
}
