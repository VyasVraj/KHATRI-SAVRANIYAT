/**
 * Announcement Detail Modal Component (Phase 10 — Subtask 2)
 *
 * Provides a clean, accessible, opaque modal dialog displaying full announcement details
 * adhering to the Khatri Sarvaniyat community design system.
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="announcement-detail-title"
    >
      {/* Backdrop with soft blur and dimming */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
      />

      {/* Solid Opaque Modal Container */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-2xl z-10 flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {announcement.is_pinned && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50">
                  <Pin className="h-3 w-3 fill-amber-600 dark:fill-amber-400" />
                  {t('community.pinned_badge', 'Pinned')}
                </span>
              )}
              <AnnouncementTypeBadge type={announcement.announcement_type} />
              {announcement.group_name ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Users className="h-3 w-3" />
                  {announcement.group_name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/40 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40">
                  <Globe className="h-3 w-3" />
                  Community-Wide Notice
                </span>
              )}
            </div>

            <h2
              id="announcement-detail-title"
              className="mt-3 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white break-words"
            >
              {announcement.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="my-6 max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200">
          {announcement.content}
        </div>

        {/* Footer Metadata */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <UserIcon className="h-3.5 w-3.5 text-slate-400" />
            <span>
              Posted by{' '}
              <strong className="text-slate-800 dark:text-slate-200 font-semibold">
                {announcement.author?.display_name || 'Community Member'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>{formattedPublished}</span>
          </div>
        </div>

        {/* Close Action Button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-6 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 transition focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
