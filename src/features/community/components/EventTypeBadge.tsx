/**
 * Event Type Badge Component (Phase 10 — Subtask 3)
 */

import React from 'react'
import type { EventType } from '../types'
import {
  Calendar,
  Sparkles,
  Users,
  Trophy,
  GraduationCap,
  Music,
  BookOpen,
  Tag,
} from 'lucide-react'

interface EventTypeBadgeProps {
  type: EventType
  className?: string
}

const TYPE_CONFIG: Record<
  EventType,
  { label: string; icon: React.ComponentType<{ className?: string }>; style: string }
> = {
  GENERAL: {
    label: 'General',
    icon: Calendar,
    style:
      'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
  },
  FESTIVAL: {
    label: 'Festival',
    icon: Sparkles,
    style:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  MEETING: {
    label: 'Meeting',
    icon: Users,
    style:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  SPORTS: {
    label: 'Sports',
    icon: Trophy,
    style:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  YOUTH: {
    label: 'Youth',
    icon: GraduationCap,
    style:
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
  },
  CULTURAL: {
    label: 'Cultural',
    icon: Music,
    style:
      'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  },
  WORKSHOP: {
    label: 'Workshop',
    icon: BookOpen,
    style:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  OTHER: {
    label: 'Other',
    icon: Tag,
    style:
      'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700',
  },
}

export function EventTypeBadge({ type, className = '' }: EventTypeBadgeProps) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.GENERAL
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${config.style} ${className}`}
    >
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </span>
  )
}
