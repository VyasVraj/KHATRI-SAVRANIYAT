/**
 * AddRelationshipModal — Modal dialog to record an interpersonal relationship.
 *
 * Supported Roles:
 * - Parent: Selected person is parent of target person
 * - Child: Selected person is child of target person
 * - Spouse: Symmetric canonical spouse
 * - Sibling: Symmetric canonical sibling
 *
 * CANONICAL MAPPING:
 * - Handled by mapRoleToCanonicalRelationship inside useAddRelationship mutation.
 * - Directional PARENT and lexical ordering (person_a_id < person_b_id) are enforced.
 * - Current person is excluded from the person selector.
 * - Sourced from usePersonList({ limit: 50 }).
 */

import { useState, useEffect } from 'react'
import { X, AlertCircle, HeartHandshake } from 'lucide-react'
import { usePersonList } from '@/features/people/hooks/usePersonList'
import { useAddRelationship } from '../hooks/useRelationshipMutations'
import type { PersonRelativeRole } from '../types'
import { Button } from '@/components/forms/Button'

export interface AddRelationshipModalProps {
  targetPersonId: string
  isOpen: boolean
  onClose: () => void
}

const ROLE_OPTIONS: Array<{ value: PersonRelativeRole; label: string; description: string }> = [
  {
    value: 'parent',
    label: 'Parent',
    description: 'Selected person is the parent of this person',
  },
  {
    value: 'child',
    label: 'Child',
    description: 'Selected person is the child of this person',
  },
  {
    value: 'spouse',
    label: 'Spouse',
    description: 'Spouse or marital partner of this person',
  },
  {
    value: 'sibling',
    label: 'Sibling',
    description: 'Brother or sister of this person',
  },
]

export function AddRelationshipModal({
  targetPersonId,
  isOpen,
  onClose,
}: AddRelationshipModalProps) {
  const { data: persons = [], isLoading: isLoadingPersons } = usePersonList({ limit: 50 })
  const addMutation = useAddRelationship()

  const [relativeRole, setRelativeRole] = useState<PersonRelativeRole>('spouse')
  const [relatedPersonId, setRelatedPersonId] = useState('')
  const [notes, setNotes] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Filter out the target person so self-relationships cannot be selected
  const availablePersons = persons.filter((p) => p.id !== targetPersonId)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setRelativeRole('spouse')
      setRelatedPersonId('')
      setNotes('')
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

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    if (!relatedPersonId) {
      setErrorMessage('Please select a related person.')
      return
    }

    if (relatedPersonId === targetPersonId) {
      setErrorMessage('A person cannot have a relationship with themselves.')
      return
    }

    if (notes.length > 1000) {
      setErrorMessage('Notes cannot exceed 1000 characters.')
      return
    }

    try {
      await addMutation.mutateAsync({
        targetPersonId,
        relatedPersonId,
        relativeRole,
        notes: notes ? notes.trim() : null,
      })
      onClose()
    } catch (err) {
      setErrorMessage(
        (err as { message?: string })?.message ??
          'Could not record this relationship. Please verify your inputs and try again.'
      )
    }
  }

  const selectedRoleMeta = ROLE_OPTIONS.find((r) => r.value === relativeRole)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-relationship-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-4">
          <div className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5 text-teal-600" aria-hidden="true" />
            <h2 id="add-relationship-title" className="text-lg font-semibold text-navy-900">
              Add Relationship
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
          {/* Relationship Role Selector */}
          <div>
            <label htmlFor="rel-role-select" className="block text-sm font-medium text-navy-800">
              Relationship Type <span className="text-red-500">*</span>
            </label>
            <select
              id="rel-role-select"
              value={relativeRole}
              onChange={(e) => setRelativeRole(e.target.value as PersonRelativeRole)}
              className="mt-1 block w-full rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {selectedRoleMeta && (
              <p className="mt-1 text-xs text-navy-500">{selectedRoleMeta.description}</p>
            )}
          </div>

          {/* Related Person Selector */}
          <div>
            <label htmlFor="rel-person-select" className="block text-sm font-medium text-navy-800">
              Related Person <span className="text-red-500">*</span>
            </label>
            {isLoadingPersons ? (
              <p className="mt-1 text-xs text-navy-500">Loading census records…</p>
            ) : (
              <select
                id="rel-person-select"
                value={relatedPersonId}
                onChange={(e) => setRelatedPersonId(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">— Select a person from the census —</option>
                {availablePersons.map((p) => {
                  const name = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
                  const details = p.gender ? ` (${p.gender.toLowerCase()})` : ''
                  return (
                    <option key={p.id} value={p.id}>
                      {name}
                      {details}
                    </option>
                  )
                })}
              </select>
            )}
            <p className="mt-1 text-xs text-navy-400">
              Showing up to 50 census records visible to your account.
            </p>
          </div>

          {/* Optional Notes */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="rel-notes" className="block text-sm font-medium text-navy-800">
                Notes <span className="text-xs font-normal text-navy-500">(Optional)</span>
              </label>
              <span className="text-xs text-navy-400">{notes.length}/1000</span>
            </div>
            <textarea
              id="rel-notes"
              rows={3}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Married in 1985, eldest sibling, etc."
              className="mt-1 block w-full rounded-lg border border-navy-300 p-2.5 text-sm text-navy-900 shadow-sm placeholder:text-navy-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-navy-100">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={addMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={addMutation.isPending}
              disabled={addMutation.isPending || isLoadingPersons || !relatedPersonId}
            >
              Save relationship
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
