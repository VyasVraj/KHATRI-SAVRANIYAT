/**
 * Announcements Feed Component (Phase 10 — Subtask 2)
 */

import React, { useState } from 'react'
import { Plus, Bell, AlertCircle, RefreshCw } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useLanguage } from '@/features/i18n'
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useArchiveAnnouncement,
  useDeleteAnnouncement,
} from '../hooks/useAnnouncements'
import { useGroups } from '../hooks/useGroups'
import { AnnouncementCard } from './AnnouncementCard'
import { AnnouncementFiltersBar } from './AnnouncementFiltersBar'
import { AnnouncementDetailModal } from './AnnouncementDetailModal'
import { CreateAnnouncementModal } from './CreateAnnouncementModal'
import { EditAnnouncementModal } from './EditAnnouncementModal'
import type {
  Announcement,
  AnnouncementFilters,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from '../types'

export const AnnouncementsFeed: React.FC = () => {
  const { user, isAuthenticated } = useAuthContext()
  const { t } = useLanguage()

  const [filters, setFilters] = useState<AnnouncementFilters>({
    search: '',
    announcement_type: 'ALL',
    scope: 'ALL',
  })

  // Modals state
  const [selectedAnnouncementForDetail, setSelectedAnnouncementForDetail] =
    useState<Announcement | null>(null)
  const [selectedAnnouncementForEdit, setSelectedAnnouncementForEdit] =
    useState<Announcement | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // Status feedback
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Fetch announcements
  const {
    data: announcements,
    isLoading,
    isError,
    error,
    refetch,
  } = useAnnouncements(filters)

  // Fetch groups where user has membership / admin access for creation dialog
  const { data: myGroups = [] } = useGroups(
    isAuthenticated ? { membership_filter: 'MY_GROUPS' } : undefined
  )

  const userManagedGroups = myGroups
    .filter(
      (g) => g.caller_role === 'ADMIN' || g.caller_role === 'MODERATOR'
    )
    .map((g) => ({ id: g.id, name: g.name }))

  // Check if current user is global moderator
  const isGlobalModerator =
    user?.role === 'admin' || user?.role === 'moderator'

  // Mutations
  const createMutation = useCreateAnnouncement()
  const updateMutation = useUpdateAnnouncement()
  const archiveMutation = useArchiveAnnouncement()
  const deleteMutation = useDeleteAnnouncement()

  const handleCreateSubmit = async (input: CreateAnnouncementInput) => {
    setFeedbackMessage(null)
    try {
      await createMutation.mutateAsync(input)
      setIsCreateModalOpen(false)
      setFeedbackMessage({
        type: 'success',
        text: 'Notice published successfully.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create notice.',
      })
      throw err
    }
  }

  const handleEditSubmit = async (input: UpdateAnnouncementInput) => {
    setFeedbackMessage(null)
    try {
      await updateMutation.mutateAsync(input)
      setSelectedAnnouncementForEdit(null)
      // If detail modal was open for the same item, update it
      if (selectedAnnouncementForDetail?.id === input.id) {
        setSelectedAnnouncementForDetail((prev) =>
          prev
            ? {
                ...prev,
                title: input.title,
                content: input.content,
                announcement_type: input.announcement_type,
                status: input.status,
                is_pinned: input.is_pinned,
              }
            : null
        )
      }
      setFeedbackMessage({
        type: 'success',
        text: 'Notice updated successfully.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update notice.',
      })
      throw err
    }
  }

  const handleArchive = async (id: string) => {
    setFeedbackMessage(null)
    try {
      await archiveMutation.mutateAsync(id)
      setFeedbackMessage({
        type: 'success',
        text: 'Notice moved to archive.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to archive notice.',
      })
    }
  }

  const handleDelete = async (id: string) => {
    setFeedbackMessage(null)
    try {
      await deleteMutation.mutateAsync(id)
      setFeedbackMessage({
        type: 'success',
        text: 'Notice deleted successfully.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to delete notice.',
      })
    }
  }

  const canManageAnnouncement = (item: Announcement): boolean => {
    if (!isAuthenticated || !user) return false
    if (isGlobalModerator) return true
    if (item.author_id === user.id) return true
    if (item.group_id) {
      const groupMatch = myGroups.find((g) => g.id === item.group_id)
      if (
        groupMatch?.caller_role === 'ADMIN' ||
        groupMatch?.caller_role === 'MODERATOR'
      ) {
        return true
      }
    }
    return false
  }

  return (
    <div className="space-y-6">
      {/* Feed Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Community Notice Board
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Official announcements, urgent alerts, event broadcasts, and community updates.
          </p>
        </div>

        {isAuthenticated && (isGlobalModerator || userManagedGroups.length > 0) && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>{t('community.post_notice', 'Post Notice')}</span>
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-lg p-3 text-sm ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-xs font-semibold underline hover:opacity-80 min-h-[44px] flex items-center px-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters Bar */}
      <AnnouncementFiltersBar
        filters={filters}
        onChange={setFilters}
        isAuthenticated={isAuthenticated}
      />

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, idx) => (
            <div
              key={idx}
              className="h-44 rounded-xl border border-slate-200 bg-white p-5 shadow-xs animate-pulse"
            >
              <div className="h-4 w-24 bg-slate-200 rounded-full mb-3" />
              <div className="h-5 w-3/4 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-full bg-slate-100 rounded mb-1" />
              <div className="h-3 w-5/6 bg-slate-100 rounded mb-4" />
              <div className="h-3 w-1/3 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-500 mb-2" />
          <h3 className="text-base font-semibold">Failed to load notices</h3>
          <p className="mt-1 text-sm text-rose-600">
            {error instanceof Error
              ? error.message
              : 'An unexpected error occurred while loading community announcements.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && announcements && announcements.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
          <Bell className="mx-auto h-10 w-10 text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-900">
            {t('community.empty_announcements', 'No notices found')}
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            {filters.search || filters.announcement_type !== 'ALL' || filters.scope !== 'ALL'
              ? 'No announcements match your search or filter criteria. Try adjusting your filters.'
              : t('community.empty_announcements_desc', 'There are currently no announcements posted on the notice board.')}
          </p>
        </div>
      )}

      {/* Grid of Announcements */}
      {!isLoading && !isError && announcements && announcements.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {announcements.map((item) => {
            const manageable = canManageAnnouncement(item)
            return (
              <AnnouncementCard
                key={item.id}
                announcement={item}
                onView={(ann) => setSelectedAnnouncementForDetail(ann)}
                onEdit={manageable ? (ann) => setSelectedAnnouncementForEdit(ann) : undefined}
                onArchive={manageable ? handleArchive : undefined}
                onDelete={manageable ? handleDelete : undefined}
              />
            )
          })}
        </div>
      )}

      {/* Detail Modal */}
      <AnnouncementDetailModal
        announcement={selectedAnnouncementForDetail}
        isOpen={Boolean(selectedAnnouncementForDetail)}
        onClose={() => setSelectedAnnouncementForDetail(null)}
      />

      {/* Create Modal */}
      <CreateAnnouncementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        userManagedGroups={userManagedGroups}
        isGlobalModerator={isGlobalModerator}
        onSubmit={handleCreateSubmit}
        isLoading={createMutation.isPending}
      />

      {/* Edit Modal */}
      <EditAnnouncementModal
        announcement={selectedAnnouncementForEdit}
        isOpen={Boolean(selectedAnnouncementForEdit)}
        onClose={() => setSelectedAnnouncementForEdit(null)}
        onSubmit={handleEditSubmit}
        isLoading={updateMutation.isPending}
      />
    </div>
  )
}
