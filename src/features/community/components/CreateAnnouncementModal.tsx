/**
 * Create Announcement Modal Component (Phase 10 — Subtask 2)
 */

import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createAnnouncementSchema,
  type CreateAnnouncementFormData,
} from '../schemas/announcement.schemas'
import type { CreateAnnouncementInput } from '../types'
import { X, AlertCircle } from 'lucide-react'

interface CreateAnnouncementModalProps {
  isOpen: boolean
  onClose: () => void
  userManagedGroups?: Array<{ id: string; name: string }>
  isGlobalModerator?: boolean
  defaultGroupId?: string | null
  onSubmit: (input: CreateAnnouncementInput) => Promise<void>
  isLoading?: boolean
}

export function CreateAnnouncementModal({
  isOpen,
  onClose,
  userManagedGroups = [],
  isGlobalModerator = false,
  defaultGroupId = null,
  onSubmit,
  isLoading = false,
}: CreateAnnouncementModalProps) {
  const [formError, setFormError] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateAnnouncementFormData>({
    resolver: zodResolver(createAnnouncementSchema),
    defaultValues: {
      title: '',
      content: '',
      announcement_type: 'GENERAL',
      group_id: defaultGroupId,
      status: 'PUBLISHED',
      is_pinned: false,
    },
  })

  React.useEffect(() => {
    if (isOpen) {
      reset({
        title: '',
        content: '',
        announcement_type: 'GENERAL',
        group_id: defaultGroupId,
        status: 'PUBLISHED',
        is_pinned: false,
      })
      setFormError(null)
    }
  }, [isOpen, defaultGroupId, reset])

  // Close on Escape key
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleFormSubmit = async (data: CreateAnnouncementFormData) => {
    try {
      setFormError(null)
      await onSubmit({
        title: data.title,
        content: data.content,
        announcement_type: data.announcement_type,
        group_id: data.group_id || null,
        status: data.status,
        is_pinned: data.is_pinned,
      })
      onClose()
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to publish announcement.'
      )
    }
  }

  const selectedGroupId = watch('group_id')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-announcement-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 id="create-announcement-title" className="text-lg font-bold text-foreground">
            New Community Announcement
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {formError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(handleFormSubmit)} className="mt-4 space-y-4">
          {/* Target Scope */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Posting Destination
            </label>
            <select
              {...register('group_id')}
              className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {isGlobalModerator && (
                <option value="">Community-Wide Notice (Global)</option>
              )}
              {userManagedGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} (Group)
                </option>
              ))}
              {!isGlobalModerator && userManagedGroups.length === 0 && (
                <option value="" disabled>
                  No groups available for posting
                </option>
              )}
            </select>
            {!selectedGroupId && !isGlobalModerator && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                You must select a group you manage to publish announcements.
              </p>
            )}
          </div>

          {/* Announcement Type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Announcement Category
            </label>
            <select
              {...register('announcement_type')}
              className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="GENERAL">Notice / General Circular</option>
              <option value="URGENT">Urgent Advisory / Alert</option>
              <option value="EVENT">Event / Gathering Notice</option>
              <option value="BEREAVEMENT">Obituary / Besnu / Shraddhanjali</option>
              <option value="CELEBRATION">Celebration / Achievement / Felicitation</option>
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              {...register('title')}
              placeholder="e.g. Annual Panchayat Meeting Notice"
              className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>
            )}
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notice Content
            </label>
            <textarea
              rows={5}
              {...register('content')}
              placeholder="Write the full details of this announcement here..."
              className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.content && (
              <p className="mt-1 text-xs text-red-500">{errors.content.message}</p>
            )}
          </div>

          {/* Pin & Status Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted/40 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                {...register('is_pinned')}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Pin to top of board</span>
            </label>

            <div className="flex items-center gap-2 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  value="PUBLISHED"
                  {...register('status')}
                  className="text-primary focus:ring-primary"
                />
                <span>Publish</span>
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  value="DRAFT"
                  {...register('status')}
                  className="text-primary focus:ring-primary"
                />
                <span>Draft</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? 'Publishing...' : 'Create Announcement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
