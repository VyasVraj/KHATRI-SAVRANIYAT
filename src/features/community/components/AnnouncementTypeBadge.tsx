/**
 * Announcement Type Badge (Phase 10 — Subtask 2)
 */

import type { AnnouncementType } from '../types'
import {
  Bell,
  AlertTriangle,
  Calendar,
  Heart,
  Sparkles,
} from 'lucide-react'

interface AnnouncementTypeBadgeProps {
  type: AnnouncementType
  className?: string
}

export function AnnouncementTypeBadge({
  type,
  className = '',
}: AnnouncementTypeBadgeProps) {
  switch (type) {
    case 'URGENT':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-300 ${className}`}
        >
          <AlertTriangle className="h-3 w-3" />
          Urgent
        </span>
      )
    case 'EVENT':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 ${className}`}
        >
          <Calendar className="h-3 w-3" />
          Event
        </span>
      )
    case 'BEREAVEMENT':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-300 ${className}`}
        >
          <Heart className="h-3 w-3" />
          Obituary / Besnu
        </span>
      )
    case 'CELEBRATION':
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 ${className}`}
        >
          <Sparkles className="h-3 w-3" />
          Celebration
        </span>
      )
    case 'GENERAL':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 ${className}`}
        >
          <Bell className="h-3 w-3" />
          Notice
        </span>
      )
  }
}
