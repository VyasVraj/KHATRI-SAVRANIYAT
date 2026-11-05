/**
 * Edit Announcement Modal Component (Phase 10 — Subtask 2)
 */

import React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  updateAnnouncementSchema,
  type UpdateAnnouncementFormData,
} from '../schemas/announcement.schemas'
import type { Announcement, UpdateAnnouncementInput } from '../types'
import { X, AlertCircle } from 'lucide-react'

interface EditAnnouncementModalProps {
  announcement: Announcement | null
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: UpdateAnnouncementInput) => Promise<void>
  isLoading?: boolean
}

export function EditAnnouncementModal({
  announcement,
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: EditAnnouncementModalProps) {
  const [formError, setFormError] = React.useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateAnnouncementFormData>({
    resolver: zodResolver(updateAnnouncementSchema),
  })

  React.useEffect(() => {
    if (isOpen && announcement) {
      reset({
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        announcement_type: announcement.announcement_type,
        status: announcement.status,
        is_pinned: announcement.is_pinned,
      })
      setFormError(null)
    }
  }, [isOpen, announcement, reset])

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

  if (!isOpen || !announcement) return null

  const handleFormSubmit = async (data: UpdateAnnouncementFormData) => {
    try {
      setFormError(null)
      await onSubmit({
        id: data.id,
        title: data.title,
        content: data.content,
        announcement_type: data.announcement_type,
        status: data.status,
        is_pinned: data.is_pinned,
      })
      onClose()
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to update announcement.'
      )
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-announcement-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 id="edit-announcement-title" className="text-lg font-bold text-foreground">
            Edit Announcement
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
          <input type="hidden" {...register('id')} />

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
              className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {errors.content && (
              <p className="mt-1 text-xs text-red-500">{errors.content.message}</p>
            )}
          </div>

          {/* Status & Pin Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-muted/40 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                {...register('is_pinned')}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Pin to top of board</span>
            </label>

            <div>
              <label className="mr-2 text-xs font-medium text-muted-foreground">Status:</label>
              <select
                {...register('status')}
                className="rounded border bg-background px-2 py-1 text-xs shadow-sm"
              >
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
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
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
