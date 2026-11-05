/**
 * Group Type Badge Component (Phase 10 — Subtask 1)
 */

import React from 'react'
import type { GroupType } from '../types'

interface GroupTypeBadgeProps {
  type: GroupType
  className?: string
}

const TYPE_CONFIG: Record<
  GroupType,
  { label: string; bg: string; text: string; border: string }
> = {
  VILLAGE_ASSOCIATION: {
    label: 'Village / Watan',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  COMMITTEE: {
    label: 'Committee',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  CULTURAL: {
    label: 'Cultural',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  YOUTH: {
    label: 'Youth Wing',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  OTHER: {
    label: 'Community Group',
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
  },
}

export const GroupTypeBadge: React.FC<GroupTypeBadgeProps> = ({
  type,
  className = '',
}) => {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.OTHER

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      {config.label}
    </span>
  )
}
