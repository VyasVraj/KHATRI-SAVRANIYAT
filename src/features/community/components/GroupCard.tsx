/**
 * Community Group Card Component (Phase 10 — Subtask 1)
 */

import React, { useState } from 'react'
import {
  Users,
  MapPin,
  CheckCircle,
  Lock,
  Shield,
  LogIn,
  LogOut,
  Loader2,
} from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import { GroupTypeBadge } from './GroupTypeBadge'
import type { GroupWithMembership } from '../types'

interface GroupCardProps {
  group: GroupWithMembership
  onJoin: (groupId: string) => Promise<void>
  onLeave: (groupId: string) => Promise<void>
  isAuthenticated: boolean
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  onJoin,
  onLeave,
  isAuthenticated,
}) => {
  const { t } = useLanguage()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleJoin = async () => {
    setActionError(null)
    setIsSubmitting(true)
    try {
      await onJoin(group.id)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to join group.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLeave = async () => {
    if (
      !window.confirm(
        `Are you sure you want to leave ${group.name}?`
      )
    ) {
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      await onLeave(group.id)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to leave group.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div>
        {/* Top Badges */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <GroupTypeBadge type={group.group_type} />
          <div className="flex items-center gap-1.5">
            {group.is_verified && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200"
                title="Verified Community Group"
              >
                <CheckCircle className="h-3 w-3" />
                {t('community.verified_badge', 'Verified')}
              </span>
            )}
            {group.is_private && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200"
                title="Private Group"
              >
                <Lock className="h-3 w-3" />
                {t('community.group_private', 'Private')}
              </span>
            )}
          </div>
        </div>

        {/* Group Name & Slug */}
        <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600">
          {group.name}
        </h3>

        {/* Location & Members metadata */}
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          {group.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              <span>{group.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span>
              {group.member_count}{' '}
              {group.member_count === 1 ? 'member' : 'members'}
            </span>
          </div>
        </div>

        {/* Description */}
        {group.description && (
          <p className="mt-3 line-clamp-3 text-sm text-slate-600">
            {group.description}
          </p>
        )}

        {actionError && (
          <div className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-600 border border-red-200">
            {actionError}
          </div>
        )}
      </div>

      {/* Footer / Membership Actions */}
      <div className="mt-5 border-t border-slate-100 pt-4 flex items-center justify-between">
        {/* Caller Role Badge */}
        <div>
          {group.is_caller_member ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {group.caller_role === 'ADMIN' && (
                <Shield className="h-3 w-3 text-amber-600" />
              )}
              {group.caller_role === 'ADMIN'
                ? 'Admin'
                : group.caller_role === 'MODERATOR'
                ? 'Moderator'
                : 'Member'}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Not joined</span>
          )}
        </div>

        {/* Action Button */}
        <div>
          {isAuthenticated && (
            <>
              {group.is_caller_member ? (
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={isSubmitting}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5 text-slate-500" />
                  )}
                  {t('community.group_leave', 'Leave')}
                </button>
              ) : group.is_private ? (
                <span className="text-xs italic text-slate-400">
                  {t('community.group_private', 'Private Group')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={isSubmitting}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogIn className="h-3.5 w-3.5" />
                  )}
                  {t('community.group_join', 'Join Group')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
