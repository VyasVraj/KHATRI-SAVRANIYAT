/**
 * Announcement Card Component (Phase 10 — Subtask 2)
 */

import React from 'react'
import type { Announcement } from '../types'
import { AnnouncementTypeBadge } from './AnnouncementTypeBadge'
import { useLanguage } from '@/features/i18n'
import {
  Pin,
  Globe,
  Users,
  Clock,
  User as UserIcon,
  MoreVertical,
  Archive,
  Trash2,
  Edit,
} from 'lucide-react'

interface AnnouncementCardProps {
  announcement: Announcement
  onView: (announcement: Announcement) => void
  onEdit?: (announcement: Announcement) => void
  onArchive?: (id: string) => void
  onDelete?: (id: string) => void
}

export function AnnouncementCard({
  announcement,
  onView,
  onEdit,
  onArchive,
  onDelete,
}: AnnouncementCardProps) {
  const { t } = useLanguage()
  const [menuOpen, setMenuOpen] = React.useState(false)

  const dateStr = announcement.published_at || announcement.created_at
  const formattedDate = dateStr
    ? new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Recently'

  return (
    <div
      onClick={() => onView(announcement)}
      className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border p-5 shadow-sm transition hover:border-blue-500/50 hover:shadow-md ${
        announcement.is_pinned
          ? 'border-amber-300 bg-amber-50/30 dark:border-amber-700/50 dark:bg-amber-950/20'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
      }`}
    >
      <div>
        {/* Top Header: Pin, Type Badge, Scope Badge, and Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {announcement.is_pinned && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <Pin className="h-3 w-3 fill-amber-600 dark:fill-amber-400" />
                {t('community.pinned_badge', 'Pinned')}
              </span>
            )}
            <AnnouncementTypeBadge type={announcement.announcement_type} />
            {announcement.group_name ? (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Users className="h-3 w-3" />
                {announcement.group_name}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Globe className="h-3 w-3" />
                Community-Wide
              </span>
            )}
          </div>

          {/* Action Menu for Managers */}
          {announcement.can_manage && (
            <div
              className="relative"
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Announcement options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-10 z-20 w-36 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 shadow-lg">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onEdit(announcement)
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  )}
                  {onArchive && announcement.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onArchive(announcement.id)
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false)
                        onDelete(announcement.id)
                      }}
                      className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600">
          {announcement.title}
        </h3>

        {/* Body Snippet */}
        <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
          {announcement.content}
        </p>
      </div>

      {/* Footer Info */}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <UserIcon className="h-3 w-3" />
          {announcement.author?.display_name || 'Community Member'}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formattedDate}
        </span>
      </div>
    </div>
  )
}
