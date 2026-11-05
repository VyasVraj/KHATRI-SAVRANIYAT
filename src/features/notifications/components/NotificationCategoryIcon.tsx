/**
 * NotificationCategoryIcon — Visual category badge and icon
 *
 * Phase 12 — Subtask 3: In-App Notification Center, Header Popover & Real-Time Sync
 */

import React from 'react'
import {
  UserPlus,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Users,
  Calendar,
  Heart,
  ShieldAlert,
  Bell,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NotificationCategory } from '../types'

interface NotificationCategoryIconProps {
  category: NotificationCategory
  className?: string
  iconClassName?: string
}

const CATEGORY_STYLES: Record<
  NotificationCategory,
  { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  CONNECTION: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    Icon: UserPlus,
  },
  INVITATION: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-700',
    Icon: Mail,
  },
  CLAIM: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    Icon: ShieldCheck,
  },
  VERIFICATION: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    Icon: CheckCircle2,
  },
  COMMUNITY: {
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    Icon: Users,
  },
  EVENT: {
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    Icon: Calendar,
  },
  FAMILY: {
    bg: 'bg-rose-100',
    text: 'text-rose-700',
    Icon: Heart,
  },
  SECURITY: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    Icon: ShieldAlert,
  },
}

export function NotificationCategoryIcon({
  category,
  className,
  iconClassName,
}: NotificationCategoryIconProps) {
  const style = CATEGORY_STYLES[category] ?? {
    bg: 'bg-navy-100',
    text: 'text-navy-700',
    Icon: Bell,
  }

  const { bg, text, Icon } = style

  return (
    <div
      className={cn(
        'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
        bg,
        text,
        className
      )}
      aria-hidden="true"
    >
      <Icon className={cn('h-4 w-4', iconClassName)} />
    </div>
  )
}
