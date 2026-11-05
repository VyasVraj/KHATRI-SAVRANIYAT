/**
 * Event Status Badge Component (Phase 10 — Subtask 3)
 */

import React from 'react'
import type { EventStatus } from '../types'
import { CheckCircle2, AlertCircle, Archive, Clock, FileEdit } from 'lucide-react'

interface EventStatusBadgeProps {
  status: EventStatus
  className?: string
}

const STATUS_CONFIG: Record<
  EventStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; style: string }
> = {
  PUBLISHED: {
    label: 'Open for RSVP',
    icon: CheckCircle2,
    style:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  CANCELLED: {
    label: 'Cancelled',
    icon: AlertCircle,
    style:
      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
  },
  COMPLETED: {
    label: 'Concluded',
    icon: Clock,
    style:
      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  DRAFT: {
    label: 'Draft',
    icon: FileEdit,
    style:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  ARCHIVED: {
    label: 'Archived',
    icon: Archive,
    style:
      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  },
}

export function EventStatusBadge({ status, className = '' }: EventStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PUBLISHED
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.style} ${className}`}
    >
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </span>
  )
}
