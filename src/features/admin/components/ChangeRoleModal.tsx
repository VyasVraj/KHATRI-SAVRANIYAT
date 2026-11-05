/**
 * ChangeRoleModal — Administrative modal for changing user roles
 *
 * Phase 13 — Subtask 3: User Administration & Audit Viewer
 *
 * Security & UX Invariants:
 * - Mutations route exclusively through `admin_update_user_role`.
 * - UI reflects role hierarchy (e.g. ADMIN cannot grant or edit SUPER_ADMIN).
 * - Self-demotion safeguards clearly communicated.
 * - Accessible modal dialog with focus management and keyboard dismissal.
 */

import React, { useState, useEffect, useRef } from 'react'
import { AlertCircle, Loader2, ShieldAlert, X } from 'lucide-react'
import type { UserRole } from '@/types'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import type { AdminUserItem } from '../types'
import { ALL_USER_ROLES, ROLE_CONFIG } from '../constants'
import { useAdminUserMutations } from '../hooks/useAdminUsers'

export interface ChangeRoleModalProps {
  user: AdminUserItem | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function ChangeRoleModal({
  user,
  isOpen,
  onClose,
  onSuccess,
}: ChangeRoleModalProps) {
  const { user: currentUser, profile: currentProfile } = useAuthContext()
  const callerRole = currentProfile?.role
  const isCallerSuperAdmin = callerRole === 'SUPER_ADMIN'
  const isSelf = currentUser?.id === user?.id
  const isTargetSuperAdmin = user?.role === 'SUPER_ADMIN'

  const [selectedRole, setSelectedRole] = useState<UserRole>(user?.role ?? 'MEMBER')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const { updateRole } = useAdminUserMutations()

  useEffect(() => {
    if (user) {
      setSelectedRole(user.role)
      setErrorMessage(null)
    }
  }, [user])

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

  // Permission checks
  const canModifyTarget = isCallerSuperAdmin || !isTargetSuperAdmin

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (selectedRole === user.role) {
      onClose()
      return
    }

    if (!canModifyTarget) {
      setErrorMessage('Only Super Admins can modify a Super Admin account.')
      return
    }

    if (isSelf && selectedRole !== 'ADMIN' && selectedRole !== 'SUPER_ADMIN') {
      setErrorMessage('Administrators cannot demote themselves to a non-administrative role.')
      return
    }

    try {
      await updateRole.mutateAsync({
        userId: user.id,
        newRole: selectedRole,
      })
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user role.'
      setErrorMessage(msg)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-role-title"
      aria-describedby="change-role-description"
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
          <h2
            id="change-role-title"
            className="text-lg font-bold text-navy-900"
          >
            Change User Role
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div id="change-role-description" className="mt-4 text-sm text-navy-600">
          Modify the platform application role for{' '}
          <strong className="font-semibold text-navy-900">
            {user.display_name || user.email}
          </strong>{' '}
          ({user.email}).
        </div>

        {/* Warning if target is Super Admin and caller is not */}
        {!canModifyTarget && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              This user is a <strong>Super Admin</strong>. Super Admin accounts can only be modified by a Super Admin.
            </span>
          </div>
        )}

        {/* Warning if self-editing */}
        {isSelf && canModifyTarget && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
            <span>
              You are modifying your own account. Administrators cannot demote themselves to non-administrative roles.
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
          <div>
            <label
              htmlFor="target-role-select"
              className="block text-xs font-semibold uppercase tracking-wider text-navy-700"
            >
              Select New Role
            </label>
            <select
              id="target-role-select"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              disabled={!canModifyTarget || updateRole.isPending}
              className="mt-1.5 block w-full rounded-lg border border-navy-300 bg-white px-3.5 py-2.5 text-sm text-navy-900 shadow-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-navy-400"
            >
              {ALL_USER_ROLES.map((role) => {
                const isSuperAdminOption = role === 'SUPER_ADMIN'
                const disabledOption = isSuperAdminOption && !isCallerSuperAdmin
                return (
                  <option
                    key={role}
                    value={role}
                    disabled={disabledOption}
                  >
                    {ROLE_CONFIG[role].label} {disabledOption ? '(Super Admin Only)' : ''}
                  </option>
                )
              })}
            </select>
            <p className="mt-1.5 text-xs text-navy-500">
              {ROLE_CONFIG[selectedRole]?.description}
            </p>
          </div>

          {/* Current vs Proposed Summary */}
          <div className="rounded-lg bg-navy-50 p-3 text-xs text-navy-700">
            <div className="flex justify-between py-0.5">
              <span className="text-navy-500">Current Role:</span>
              <span className="font-semibold text-navy-900">
                {ROLE_CONFIG[user.role]?.label}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-navy-500">Proposed Role:</span>
              <span className="font-bold text-brand-700">
                {ROLE_CONFIG[selectedRole]?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={updateRole.isPending}
              className="rounded-lg border border-navy-300 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                !canModifyTarget ||
                selectedRole === user.role ||
                updateRole.isPending
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:bg-navy-300"
            >
              {updateRole.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Confirm Role Change
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
