/**
 * TransferHeadModal — Confirmation modal for transferring Head of Family designation.
 *
 * Requirements:
 * - Shows current active head and proposed new head.
 * - Explicitly explains the sequential demotion/promotion process.
 * - Prevents double submission while mutation is pending.
 * - Displays sanitized error messages.
 * - Acknowledges client-orchestrated non-atomic nature.
 */

import { useState, useEffect } from 'react'
import { X, Crown, AlertTriangle, AlertCircle } from 'lucide-react'
import type { FamilyMemberWithPerson } from '../services/family-members.service'
import { useTransferFamilyHead } from '../hooks/useFamilyMemberMutations'
import { Button } from '@/components/forms/Button'

export interface TransferHeadModalProps {
  familyId: string
  newHeadMember: FamilyMemberWithPerson | null
  currentHeadMember: FamilyMemberWithPerson | null
  isOpen: boolean
  onClose: () => void
}

export function TransferHeadModal({
  familyId,
  newHeadMember,
  currentHeadMember,
  isOpen,
  onClose,
}: TransferHeadModalProps) {
  const transferMutation = useTransferFamilyHead(familyId)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  if (!isOpen || !newHeadMember) return null

  const newHeadName = newHeadMember.person
    ? `${newHeadMember.person.first_name} ${newHeadMember.person.last_name}`
    : 'Selected Member'

  const currentHeadName = currentHeadMember?.person
    ? `${currentHeadMember.person.first_name} ${currentHeadMember.person.last_name}`
    : 'None (no current active head)'

  async function handleConfirm() {
    if (!newHeadMember) return
    setErrorMessage(null)

    try {
      await transferMutation.mutateAsync(newHeadMember.id)
      onClose()
    } catch (err) {
      setErrorMessage(
        (err as { message?: string }).message ??
          'Failed to transfer head of family. Previous state was restored where possible.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-head-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-amber-100 p-2 text-amber-700">
              <Crown className="h-5 w-5" />
            </div>
            <h2 id="transfer-head-title" className="text-lg font-semibold text-navy-900">
              Transfer Head of Family
            </h2>
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

        <div className="mt-4 space-y-4">
          {/* Transfer summary */}
          <div className="rounded-lg border border-navy-200 bg-navy-50/50 p-3 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-navy-500">Current Head:</span>
              <span className="font-medium text-navy-800">{currentHeadName}</span>
            </div>
            <div className="flex justify-between border-t border-navy-200/60 pt-2">
              <span className="text-navy-500">Proposed New Head:</span>
              <span className="font-semibold text-amber-800">{newHeadName}</span>
            </div>
          </div>

          {/* Process explanation */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <p>
              Designating <strong>{newHeadName}</strong> will automatically demote the current head.
              This client-orchestrated operation executes sequentially; if promotion fails, the previous
              head designation is automatically restored.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="mt-6 flex justify-end gap-2 border-t border-navy-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={transferMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              isLoading={transferMutation.isPending}
              disabled={transferMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
            >
              Confirm Transfer
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
