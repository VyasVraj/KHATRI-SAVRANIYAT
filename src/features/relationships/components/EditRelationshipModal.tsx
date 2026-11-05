/**
 * EditRelationshipModal — Modal dialog to update relationship notes.
 *
 * Normal UI editing is restricted to `notes` only.
 * Endpoints and relationship type remain immutable to preserve integrity.
 */

import { useState, useEffect } from 'react'
import { X, AlertCircle, Pencil } from 'lucide-react'
import { useUpdateRelationship } from '../hooks/useRelationshipMutations'
import type { PersonRelationshipItem } from '../types'
import { Button } from '@/components/forms/Button'

export interface EditRelationshipModalProps {
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

export function EditRelationshipModal({
  item,
  isOpen,
  onClose,
}: EditRelationshipModalProps) {
  const updateMutation = useUpdateRelationship()
  const [notes, setNotes] = useState(item?.relationship.notes ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Pre-populate notes from current item
  useEffect(() => {
    if (item && isOpen) {
      setNotes(item.relationship.notes ?? '')
      setErrorMessage(null)
    }
  }, [item, isOpen])

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
    : 'Unavailable Record'
  const roleLabel = ROLE_LABELS[role] ?? role

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    if (notes.length > 1000) {
      setErrorMessage('Notes cannot exceed 1000 characters.')
      return
    }

    try {
      await updateMutation.mutateAsync({
        id: relationship.id,
        notes: notes ? notes.trim() : null,
      })
      onClose()
    } catch (err) {
      setErrorMessage(
        (err as { message?: string })?.message ??
          'Could not update relationship notes. Please try again.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-relationship-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-4">
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-teal-600" aria-hidden="true" />
            <h2 id="edit-relationship-title" className="text-lg font-semibold text-navy-900">
              Edit Relationship Notes
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

        {/* Error alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Read-only Context Summary */}
          <div className="rounded-lg bg-navy-50 p-3 text-xs text-navy-700">
            <p>
              <span className="font-semibold text-navy-900">Relationship:</span> {roleLabel} with{' '}
              <span className="font-semibold text-navy-900">{personName}</span>
            </p>
            <p className="mt-1 text-navy-500">
              Relationship endpoints and types are immutable to preserve genealogical integrity.
            </p>
          </div>

          {/* Editable Notes */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="edit-rel-notes" className="block text-sm font-medium text-navy-800">
                Notes
              </label>
              <span className="text-xs text-navy-400">{notes.length}/1000</span>
            </div>
            <textarea
              id="edit-rel-notes"
              rows={4}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add relationship notes or context..."
              className="mt-1 block w-full rounded-lg border border-navy-300 p-2.5 text-sm text-navy-900 shadow-sm placeholder:text-navy-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-navy-100">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              Save changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
