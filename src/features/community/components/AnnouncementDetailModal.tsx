/**
 * Announcement Detail Modal Component (Phase 10 — Subtask 2)
 */

import { useEffect } from 'react'
import type { Announcement } from '../types'
import { AnnouncementTypeBadge } from './AnnouncementTypeBadge'
import { useLanguage } from '@/features/i18n'
import {
  X,
  Pin,
  Globe,
  Users,
  Clock,
  User as UserIcon,
} from 'lucide-react'

interface AnnouncementDetailModalProps {
  announcement: Announcement | null
  isOpen: boolean
  onClose: () => void
}

export function AnnouncementDetailModal({
  announcement,
  isOpen,
  onClose,
}: AnnouncementDetailModalProps) {
  const { t } = useLanguage()

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !announcement) return null

  const publishedDateStr = announcement.published_at || announcement.created_at
  const formattedPublished = publishedDateStr
    ? new Date(publishedDateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not published'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-detail-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-2xl rounded-xl border bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {announcement.is_pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  <Pin className="h-3 w-3 fill-amber-600 dark:fill-amber-400" />
                  {t('community.pinned_badge', 'Pinned')}
                </span>
              )}
              <AnnouncementTypeBadge type={announcement.announcement_type} />
              {announcement.group_name ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {announcement.group_name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3" />
                  Community-Wide Notice
                </span>
              )}
            </div>

            <h2 id="announcement-detail-title" className="mt-3 text-xl font-bold text-foreground">
              {announcement.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="my-6 max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {announcement.content}
        </div>

        {/* Footer Meta */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <UserIcon className="h-3.5 w-3.5" />
            <span>
              Posted by{' '}
              <strong className="text-foreground">
                {announcement.author?.display_name || 'Community Member'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>{formattedPublished}</span>
          </div>
        </div>

        {/* Close button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
