/**
 * EditMemberModal — Modal dialog to update an existing family member's role or attributes.
 *
 * Requirements:
 * - Allows updating mutable fields (role, is_head).
 * - Protected fields (id, family_id, person_id, added_by, created_at) are immutable.
 */

import { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
import type { FamilyMemberWithPerson } from '../services/family-members.service'
import { useUpdateFamilyMember } from '../hooks/useFamilyMemberMutations'
import { FAMILY_ROLE_LABELS } from '@/constants/app'
import type { FamilyRole } from '@/types'
import { Button } from '@/components/forms/Button'

export interface EditMemberModalProps {
  member: FamilyMemberWithPerson | null
  familyId: string
  isOpen: boolean
  onClose: () => void
}

export function EditMemberModal({
  member,
  familyId,
  isOpen,
  onClose,
}: EditMemberModalProps) {
  const updateMutation = useUpdateFamilyMember(familyId)

  const [role, setRole] = useState<FamilyRole>(member?.role ?? 'EXTENDED')
  const [isHead, setIsHead] = useState<boolean>(member?.is_head ?? false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (member && isOpen) {
      setRole(member.role)
      setIsHead(member.is_head)
      setErrorMessage(null)
    }
  }, [member, isOpen])

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

  if (!isOpen || !member) return null

  const personName = member.person
    ? `${member.person.first_name} ${member.person.last_name}`
    : 'Family Member'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    if (!member) return

    try {
      await updateMutation.mutateAsync({
        memberId: member.id,
        input: {
          role,
          is_head: isHead,
        },
      })
      onClose()
    } catch (err) {
      setErrorMessage(
        (err as { message?: string }).message ??
          'Could not update member record. Please try again.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-member-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <div>
            <h2 id="edit-member-title" className="text-lg font-semibold text-navy-900">
              Edit Member
            </h2>
            <p className="text-xs text-navy-500">{personName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
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
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Role selector */}
          <div className="space-y-1">
            <label htmlFor="edit-member-role" className="block text-sm font-medium text-navy-700">
              Family Role
            </label>
            <select
              id="edit-member-role"
              value={role}
              onChange={(e) => setRole(e.target.value as FamilyRole)}
              disabled={updateMutation.isPending}
              className="w-full rounded border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              {Object.entries(FAMILY_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Head toggle */}
          <div className="rounded-lg border border-navy-200 bg-navy-50/50 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isHead}
                onChange={(e) => setIsHead(e.target.checked)}
                disabled={updateMutation.isPending}
                className="h-4 w-4 rounded border-navy-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-navy-900">
                Head of Family
              </span>
            </label>
            <p className="mt-1 text-xs text-navy-500">
              Only one active member may be designated as head per family.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="mt-6 flex justify-end gap-2 border-t border-navy-100 pt-4">
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
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
