/**
 * Circulars & Official Notices View (Screens 47-49 — ANDROID-13 Parity)
 */

import React, { useState } from 'react'
import { FileText, Plus, AlertCircle, RefreshCw, Info } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useLanguage } from '@/features/i18n'
import { useCirculars } from '../hooks/useCirculars'
import { useGroups } from '../hooks/useGroups'
import { useCreateAnnouncement } from '../hooks/useAnnouncements'
import { CircularCard } from './CircularCard'
import { CircularFiltersBar } from './CircularFiltersBar'
import { CircularDetailModal } from './CircularDetailModal'
import { CreateAnnouncementModal } from './CreateAnnouncementModal'
import type { CircularItem, CircularFilters, CreateAnnouncementInput } from '../types'

export const CircularsView: React.FC = () => {
  const { user, profile, isAuthenticated } = useAuthContext()
  const { t } = useLanguage()

  const [filters, setFilters] = useState<CircularFilters>({
    search: '',
    category: 'ALL',
    issuer: 'ALL',
    status: 'PUBLISHED',
  })

  const [selectedCircular, setSelectedCircular] = useState<CircularItem | null>(
    null
  )
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const {
    data: circulars,
    totalCount,
    availableIssuers,
    isLoading,
    isError,
    error,
    refetch,
  } = useCirculars(filters)

  // Groups for creation modal
  const { data: myGroups = [] } = useGroups(
    isAuthenticated ? { membership_filter: 'MY_GROUPS' } : undefined
  )

  const userManagedGroups = myGroups
    .filter((g) => g.caller_role === 'ADMIN' || g.caller_role === 'MODERATOR')
    .map((g) => ({ id: g.id, name: g.name }))

  // Check if current user is authorized to issue/publish circulars
  // Authorized roles: SUPER_ADMIN, ADMIN, COMMUNITY_MODERATOR, or COMMITTEE_MEMBER
  const userRole =
    profile?.role ??
    (user as unknown as { role?: string })?.role ??
    (user?.user_metadata?.role as string | undefined) ??
    (user?.app_metadata?.role as string | undefined)

  const isAuthorizedPublisher =
    userRole === 'SUPER_ADMIN' ||
    userRole === 'ADMIN' ||
    userRole === 'COMMUNITY_MODERATOR' ||
    userRole === 'COMMITTEE_MEMBER' ||
    userRole === 'admin' ||
    userRole === 'moderator' ||
    userManagedGroups.length > 0

  const createMutation = useCreateAnnouncement()

  const handleResetFilters = () => {
    setFilters({
      search: '',
      category: 'ALL',
      issuer: 'ALL',
      status: 'PUBLISHED',
    })
  }

  const handleCreateNotice = async (input: CreateAnnouncementInput) => {
    try {
      await createMutation.mutateAsync(input)
      setIsPublishModalOpen(false)
      setFeedbackMessage({
        type: 'success',
        text: t('circular.published_success', 'Notice published successfully to Community Notice Board.'),
      })
      setTimeout(() => setFeedbackMessage(null), 5000)
    } catch (err: unknown) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to publish notice.',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 p-5 sm:p-6 text-white shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-xs">
                <FileText className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold sm:text-2xl">
                {t('circular.directory_title', 'Panchayat Circulars & Official Directives')}
              </h2>
            </div>
            <p className="text-sm text-slate-300 max-w-2xl">
              {t(
                'circular.directory_subtitle',
                'Official resolutions, census notices, welfare directives, and constitutional announcements issued by the Panchayat Secretariat and Committee Commissions.'
              )}
            </p>
          </div>

          {/* Screen 49: Role-gated Publish Action */}
          {isAuthorizedPublisher && (
            <button
              type="button"
              onClick={() => setIsPublishModalOpen(true)}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition shrink-0"
              aria-label={t('circular.action_publish', 'Issue Official Notice')}
            >
              <Plus className="h-4 w-4" />
              <span>{t('circular.action_publish', 'Issue Official Notice')}</span>
            </button>
          )}
        </div>

        {/* Read-only Member Information Shield */}
        {!isAuthorizedPublisher && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs text-slate-300 border border-white/10">
            <Info className="h-4 w-4 shrink-0 text-blue-400" />
            <span>
              {t(
                'circular.read_only_notice',
                'Official circulars are published by authorized Panchayat Secretariat and Committee Moderators.'
              )}
            </span>
          </div>
        )}
      </div>

      {/* Feedback Message */}
      {feedbackMessage && (
        <div
          role="status"
          className={`rounded-xl p-4 text-sm font-medium border ${
            feedbackMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300'
          }`}
        >
          {feedbackMessage.text}
        </div>
      )}

      {/* Filters Bar */}
      <CircularFiltersBar
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
        totalCount={totalCount}
        availableIssuers={availableIssuers}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="min-h-[220px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs animate-pulse space-y-4"
            >
              <div className="h-5 w-24 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-6 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-16 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
              <div className="h-10 w-full rounded bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-6 text-center space-y-3">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
          <h3 className="text-base font-semibold text-red-900 dark:text-red-200">
            {t('circular.error_title', 'Failed to load circulars')}
          </h3>
          <p className="text-sm text-red-600 dark:text-red-300 max-w-md mx-auto">
            {error instanceof Error ? error.message : 'Please check your connection.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-red-700 transition"
          >
            <RefreshCw className="h-4 w-4" />
            <span>{t('circular.retry', 'Retry')}</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && circulars.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center space-y-3">
          <FileText className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('circular.empty_title', 'No circulars found')}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto">
            {t(
              'circular.empty_desc',
              'No official circulars matched your current filter criteria.'
            )}
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 transition"
          >
            {t('circular.reset_filters', 'Reset Filters')}
          </button>
        </div>
      )}

      {/* Circulars Grid */}
      {!isLoading && !isError && circulars.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {circulars.map((circular) => (
            <CircularCard
              key={circular.id}
              circular={circular}
              onView={setSelectedCircular}
            />
          ))}
        </div>
      )}

      {/* Detail Modal (Screen 48) */}
      <CircularDetailModal
        circular={selectedCircular}
        isOpen={Boolean(selectedCircular)}
        onClose={() => setSelectedCircular(null)}
      />

      {/* Screen 49: Publish Modal for authorized roles */}
      {isAuthorizedPublisher && (
        <CreateAnnouncementModal
          isOpen={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          onSubmit={handleCreateNotice}
          isLoading={createMutation.isPending}
          userManagedGroups={userManagedGroups}
          isGlobalModerator={
            user?.role === 'SUPER_ADMIN' ||
            user?.role === 'ADMIN' ||
            user?.role === 'COMMUNITY_MODERATOR' ||
            user?.role === 'admin' ||
            user?.role === 'moderator'
          }
        />
      )}
    </div>
  )
}
