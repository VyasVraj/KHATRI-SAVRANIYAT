/**
 * Groups Catalog Component (Phase 10 — Subtask 1)
 */

import React, { useState } from 'react'
import { Plus, Users, AlertCircle, RefreshCw } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useLanguage } from '@/features/i18n'
import {
  useGroups,
  useJoinGroup,
  useLeaveGroup,
  useCreateGroup,
} from '../hooks/useGroups'
import { GroupCard } from './GroupCard'
import { GroupFiltersBar } from './GroupFiltersBar'
import { CreateGroupModal } from './CreateGroupModal'
import type { GroupFilters, CreateGroupInput } from '../types'

export const GroupsCatalog: React.FC = () => {
  const { isAuthenticated } = useAuthContext()
  const { t } = useLanguage()
  const [filters, setFilters] = useState<GroupFilters>({
    search: '',
    group_type: 'ALL',
    membership_filter: 'ALL',
  })

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const {
    data: groups,
    isLoading,
    isError,
    error,
    refetch,
  } = useGroups(filters)

  const joinMutation = useJoinGroup()
  const leaveMutation = useLeaveGroup()
  const createMutation = useCreateGroup()

  const handleJoin = async (groupId: string) => {
    setFeedbackMessage(null)
    try {
      await joinMutation.mutateAsync(groupId)
      setFeedbackMessage({
        type: 'success',
        text: 'Successfully joined the group.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to join group.',
      })
      throw err
    }
  }

  const handleLeave = async (groupId: string) => {
    setFeedbackMessage(null)
    try {
      await leaveMutation.mutateAsync(groupId)
      setFeedbackMessage({
        type: 'success',
        text: 'You have left the group.',
      })
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to leave group.',
      })
      throw err
    }
  }

  const handleCreate = async (input: CreateGroupInput) => {
    setFeedbackMessage(null)
    await createMutation.mutateAsync(input)
    setFeedbackMessage({
      type: 'success',
      text: `Group "${input.name}" created successfully. You are now the Group Administrator.`,
    })
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Community Groups
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Civic associations, village wings, and cultural committees uniting community members.
          </p>
        </div>

        {isAuthenticated && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors shrink-0"
          >
            <Plus className="h-4 w-4" />
            {t('community.create_group', 'Create Group')}
          </button>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`flex items-center justify-between rounded-xl p-3.5 text-xs font-medium border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-slate-400 hover:text-slate-600 ml-3 min-h-[44px] flex items-center px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <GroupFiltersBar
        filters={filters}
        onChange={setFilters}
        isAuthenticated={isAuthenticated}
      />

      {/* Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-50 p-5"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50/50 p-12 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
          <h3 className="text-base font-semibold text-red-900">
            Failed to Load Groups
          </h3>
          <p className="mt-1 text-xs text-red-600 max-w-md">
            {error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : !groups || groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-3">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">
            {t('community.empty_groups', 'No Groups Found')}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm">
            {filters.search || filters.group_type !== 'ALL' || filters.membership_filter === 'MY_GROUPS'
              ? 'No groups match your current filter criteria. Try adjusting your search.'
              : t('community.empty_groups_desc', 'Be the first to create a community group, committee, or village wing.')}
          </p>
          {isAuthenticated && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('community.create_group', 'Create Group')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onJoin={handleJoin}
              onLeave={handleLeave}
              isAuthenticated={isAuthenticated}
            />
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  )
}
