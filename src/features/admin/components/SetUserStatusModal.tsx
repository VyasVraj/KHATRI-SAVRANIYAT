/**
 * SetUserStatusModal — Modal for activating or deactivating user accounts
 *
 * Phase 13 — Subtask 3: User Administration & Audit Viewer
 *
 * Security & UX Invariants:
 * - Mutations route exclusively through `admin_set_user_status`.
 * - Deactivation strictly mandates a non-empty reason (up to 500 chars).
 * - Self-deactivation blocked in UI for UX clarity.
 * - ADMIN cannot deactivate SUPER_ADMIN.
 * - Accessible modal dialog with focus management and keyboard dismissal.
 */

import React, { useState, useEffect, useRef } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle, Loader2, ShieldAlert, X } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import type { AdminUserItem } from '../types'
import { useAdminUserMutations } from '../hooks/useAdminUsers'

export interface SetUserStatusModalProps {
  user: AdminUserItem | null
  targetStatus: boolean // true = activate, false = deactivate
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function SetUserStatusModal({
  user,
  targetStatus,
  isOpen,
  onClose,
  onSuccess,
}: SetUserStatusModalProps) {
  const { user: currentUser, profile: currentProfile } = useAuthContext()
  const callerRole = currentProfile?.role
  const isCallerSuperAdmin = callerRole === 'SUPER_ADMIN'
  const isSelf = currentUser?.id === user?.id
  const isTargetSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [reason, setReason] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const { setStatus } = useAdminUserMutations()

  useEffect(() => {
    setReason('')
    setErrorMessage(null)
  }, [user, targetStatus, isOpen])

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !user) {
    return null
  }

  const isDeactivating = !targetStatus
  const canModifyTarget = isCallerSuperAdmin || !isTargetSuperAdmin
  const isSelfDeactivation = isDeactivating && isSelf

  const isSubmitDisabled =
    setStatus.isPending ||
    !canModifyTarget ||
    isSelfDeactivation ||
    (isDeactivating && !reason.trim())

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (isDeactivating && !reason.trim()) {
      setErrorMessage('A reason is required to deactivate an account.')
      return
    }

    if (isSelfDeactivation) {
      setErrorMessage('Administrators cannot deactivate their own account.')
      return
    }

    if (!canModifyTarget) {
      setErrorMessage('Super Admin accounts can only be deactivated by a Super Admin.')
      return
    }

    try {
      await setStatus.mutateAsync({
        userId: user.id,
        isActive: targetStatus,
        reason: reason.trim() || undefined,
      })
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update account status.'
      setErrorMessage(msg)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
      aria-describedby="status-modal-description"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-navy-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-2xl transition-all"
      >
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <div className="flex items-center gap-2.5">
            {isDeactivating ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <CheckCircle className="h-5 w-5" aria-hidden="true" />
              </div>
            )}
            <h2
              id="status-modal-title"
              className="text-lg font-bold text-navy-900"
            >
              {isDeactivating ? 'Deactivate User Account' : 'Activate User Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div id="status-modal-description" className="mt-4 text-sm text-navy-600">
          {isDeactivating ? (
            <span>
              Are you sure you want to deactivate the account for{' '}
              <strong className="font-semibold text-navy-900">
                {user.display_name || user.email}
              </strong>{' '}
              ({user.email})? The user will immediately be prevented from signing in.
            </span>
          ) : (
            <span>
              Activate the account for{' '}
              <strong className="font-semibold text-navy-900">
                {user.display_name || user.email}
              </strong>{' '}
              ({user.email})? The user will be permitted to sign in to the platform.
            </span>
          )}
        </div>

        {/* Self-deactivation warning */}
        {isSelfDeactivation && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>
              <strong>Action Blocked:</strong> Administrators cannot deactivate their own account. Another administrator must perform this action.
            </span>
          </div>
        )}

        {/* Super admin protection warning */}
        {!canModifyTarget && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              This user is a <strong>Super Admin</strong>. Super Admin accounts can only be modified or deactivated by another Super Admin.
            </span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {isDeactivating && (
            <div>
              <label
                htmlFor="deactivation-reason"
                className="block text-xs font-semibold uppercase tracking-wider text-navy-700"
              >
                Reason for Deactivation <span className="text-red-500">*</span>
              </label>
              <textarea
                id="deactivation-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                required
                placeholder="Specify administrative reason (e.g., account suspended pending verification, user request, terms violation)..."
                disabled={!canModifyTarget || isSelfDeactivation || setStatus.isPending}
                className="mt-1.5 block w-full rounded-lg border border-navy-300 bg-white p-3 text-sm text-navy-900 shadow-xs focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:cursor-not-allowed disabled:bg-navy-50"
              />
              <div className="mt-1 flex justify-between text-[11px] text-navy-500">
                <span>Reason will be logged in the immutable security audit trail.</span>
                <span>{reason.length}/500</span>
              </div>
            </div>
          )}

          {!isDeactivating && (
            <div>
              <label
                htmlFor="activation-note"
                className="block text-xs font-semibold uppercase tracking-wider text-navy-700"
              >
                Optional Note / Reason
              </label>
              <input
                id="activation-note"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="Optional note for the audit log..."
                disabled={!canModifyTarget || setStatus.isPending}
                className="mt-1.5 block w-full rounded-lg border border-navy-300 bg-white px-3.5 py-2 text-sm text-navy-900 shadow-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-navy-50"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={setStatus.isPending}
              className="rounded-lg border border-navy-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-xs focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed ${
                isDeactivating
                  ? 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-500 disabled:bg-red-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500 disabled:bg-emerald-300'
              }`}
            >
              {setStatus.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              {isDeactivating ? 'Deactivate Account' : 'Activate Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
