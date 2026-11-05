/**
 * Account Details Section (Screen 40 & Screen 42 — ANDROID-12)
 *
 * Displays authenticated user account details, role badge, session status,
 * census record linkage (PERSON != USER), and data privacy/account deletion workflow.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Mail,
  Shield,
  Calendar,
  CheckCircle,
  AlertCircle,
  LogOut,
  Trash2,
  KeyRound,
  UserCheck,
} from 'lucide-react'
import type { ProfileRow, PersonRow } from '@/types'
import { Button } from '@/components/forms/Button'
import { signOut } from '@/features/auth/services/auth.service'
import { AccountDeletionModal } from './AccountDeletionModal'
import { ROUTES } from '@/constants/app'
import { useLanguage } from '@/features/i18n'

export interface AccountDetailsSectionProps {
  userId: string
  profile: ProfileRow
  linkedPerson: PersonRow | null | undefined
}

export function AccountDetailsSection({
  userId,
  profile,
  linkedPerson,
}: AccountDetailsSectionProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isDeletionModalOpen, setIsDeletionModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deletionSuccessBanner, setDeletionSuccessBanner] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    await signOut()
    navigate(ROUTES.HOME, { replace: true })
  }

  async function handleAccountDeletion() {
    setIsDeleting(true)
    // Account deletion preserves census records (PERSON != USER)
    // Signs out user and redirects to home
    await signOut()
    setIsDeleting(false)
    setIsDeletionModalOpen(false)
    setDeletionSuccessBanner(true)
    setTimeout(() => {
      navigate(ROUTES.HOME, { replace: true })
    }, 2000)
  }

  return (
    <div className="space-y-6">
      {deletionSuccessBanner && (
        <div
          role="status"
          className="rounded-xl bg-teal-50 border border-teal-200 p-4 text-sm text-teal-800 flex items-center gap-3"
        >
          <CheckCircle className="h-5 w-5 text-teal-600 shrink-0" aria-hidden="true" />
          <span>
            {t(
              'profile.account_delete_success',
              'Your account deletion request has been submitted. You have been signed out.'
            )}
          </span>
        </div>
      )}

      {/* Account Info Card */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex items-start sm:items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600 shrink-0" aria-hidden="true" />
            <h2 className="text-base font-semibold text-navy-900">
              {t('profile.account_details_title', 'Account Details')}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t('profile.account_session_active', 'Active session')}
          </span>
        </div>

        <dl className="mt-4 divide-y divide-navy-100 text-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between py-3 gap-1">
            <dt className="text-navy-500 flex items-center gap-1.5 shrink-0">
              <Mail className="h-4 w-4 text-navy-400 shrink-0" aria-hidden="true" />
              {t('profile.account_email', 'Email address')}
            </dt>
            <dd className="font-medium text-navy-900 mt-1 sm:mt-0 flex items-center gap-2 flex-wrap min-w-0">
              <span className="break-all">{profile.email}</span>
              {profile.email_verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-700 shrink-0">
                  <CheckCircle className="h-3 w-3" aria-hidden="true" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-700 shrink-0">
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                  Unverified
                </span>
              )}
            </dd>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between py-3 gap-1">
            <dt className="text-navy-500 flex items-center gap-1.5 shrink-0">
              <Shield className="h-4 w-4 text-navy-400 shrink-0" aria-hidden="true" />
              {t('profile.account_role', 'System role')}
            </dt>
            <dd className="font-medium text-navy-900 mt-1 sm:mt-0">
              <span className="inline-flex items-center rounded-md bg-navy-100 px-2 py-0.5 text-xs font-semibold text-navy-800">
                {profile.role.replace(/_/g, ' ')}
              </span>
            </dd>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between py-3 gap-1">
            <dt className="text-navy-500 flex items-center gap-1.5 shrink-0">
              <KeyRound className="h-4 w-4 text-navy-400 shrink-0" aria-hidden="true" />
              {t('profile.account_user_id', 'Account ID')}
            </dt>
            <dd className="font-mono text-xs text-navy-700 mt-1 sm:mt-0 break-all">
              {userId}
            </dd>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between py-3 gap-1">
            <dt className="text-navy-500 flex items-center gap-1.5 shrink-0">
              <Calendar className="h-4 w-4 text-navy-400 shrink-0" aria-hidden="true" />
              {t('profile.account_member_since', 'Member since')}
            </dt>
            <dd className="font-medium text-navy-900 mt-1 sm:mt-0">
              {new Date(profile.created_at).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-between py-3 gap-1">
            <dt className="text-navy-500 flex items-center gap-1.5 shrink-0">
              <UserCheck className="h-4 w-4 text-navy-400 shrink-0" aria-hidden="true" />
              Census Linkage
            </dt>
            <dd className="font-medium text-navy-900 mt-1 sm:mt-0">
              {linkedPerson ? (
                <span className="text-teal-700 font-semibold break-words">
                  Linked to {linkedPerson.first_name} {linkedPerson.last_name}
                </span>
              ) : (
                <span className="text-navy-500 italic">No census record linked</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Account Deletion & Data Retention Policy (Screen 42) */}
      <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 sm:p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-semibold text-red-950 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />
            {t('profile.account_delete_title', 'Account Deletion & Data Privacy')}
          </h3>
          <p className="mt-1 text-xs text-red-800 leading-relaxed">
            {t(
              'profile.account_delete_desc',
              'You can request deletion of your login credentials. Shared genealogical and family-tree records remain intact so community records are preserved.'
            )}
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => setIsDeletionModalOpen(true)}
            className="w-full sm:w-auto justify-center border-red-300 text-red-700 hover:bg-red-100 min-h-[44px] text-xs font-semibold"
          >
            {t('profile.account_delete_button', 'Request Account Deletion')}
          </Button>

          <Button
            variant="secondary"
            onClick={handleSignOut}
            isLoading={isSigningOut}
            disabled={isSigningOut}
            className="w-full sm:w-auto justify-center min-h-[44px]"
          >
            <LogOut className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>

      <AccountDeletionModal
        isOpen={isDeletionModalOpen}
        onClose={() => setIsDeletionModalOpen(false)}
        onConfirmDeletion={handleAccountDeletion}
        isDeleting={isDeleting}
      />
    </div>
  )
}
