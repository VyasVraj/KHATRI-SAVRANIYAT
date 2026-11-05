/**
 * Admin Feature Constants
 *
 * Phase 13 — Subtasks 2-3: Admin Hub, Layout, Platform Metrics, User Administration & Audit Logs
 */

import {
  LayoutDashboard,
  Users,
  History,
  ShieldCheck,
  CheckCircle2,
  Copy,
  UploadCloud,
} from 'lucide-react'
import { ROUTES } from '@/constants/app'
import type { UserRole, AuditAction } from '@/types'
import type { AdminNavigationItem, DuplicateFlagStatus, DuplicateConfidence } from './types'

export const ADMIN_NAV_ITEMS: AdminNavigationItem[] = [
  {
    label: 'Overview',
    href: ROUTES.ADMIN,
    icon: LayoutDashboard,
    description: 'Platform KPIs & system status',
    exact: true,
  },
  {
    label: 'Users',
    href: ROUTES.ADMIN_USERS,
    icon: Users,
    description: 'Platform user accounts & roles',
  },
  {
    label: 'Audit Logs',
    href: ROUTES.ADMIN_AUDIT,
    icon: History,
    description: 'Security & administrative audit trail',
  },
  {
    label: 'Claim Reviews',
    href: ROUTES.CLAIM_REVIEW_QUEUE,
    icon: ShieldCheck,
    description: 'Pending census ownership claims',
  },
  {
    label: 'Verification Reviews',
    href: ROUTES.VERIFICATION_REVIEW_QUEUE,
    icon: CheckCircle2,
    description: 'Pending census record verifications',
  },
  {
    label: 'Duplicates',
    href: ROUTES.ADMIN_DUPLICATES,
    icon: Copy,
    description: 'Review potential duplicate records',
  },
  {
    label: 'Data Import',
    href: ROUTES.ADMIN_IMPORT,
    icon: UploadCloud,
    description: 'Staging batches & data migration',
  },
]

/**
 * Display metadata and hierarchy level for user roles.
 */
export const ROLE_CONFIG: Record<
  UserRole,
  {
    label: string
    description: string
    badgeClasses: string
    badgeDotClass: string
  }
> = {
  SUPER_ADMIN: {
    label: 'Super Admin',
    description: 'Full platform administration, role granting, and system configuration.',
    badgeClasses: 'bg-purple-100 text-purple-800 border-purple-200',
    badgeDotClass: 'bg-purple-600',
  },
  ADMIN: {
    label: 'Admin',
    description: 'Platform administration, user status management, and audit log inspection.',
    badgeClasses: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    badgeDotClass: 'bg-indigo-600',
  },
  COMMUNITY_MODERATOR: {
    label: 'Community Moderator',
    description: 'Verification review queue, claims review, and community content moderation.',
    badgeClasses: 'bg-sky-100 text-sky-800 border-sky-200',
    badgeDotClass: 'bg-sky-600',
  },
  COMMITTEE_MEMBER: {
    label: 'Committee Member',
    description: 'Community committee member with heightened event and announcement access.',
    badgeClasses: 'bg-teal-100 text-teal-800 border-teal-200',
    badgeDotClass: 'bg-teal-600',
  },
  FAMILY_HEAD: {
    label: 'Family Head',
    description: 'Head of household with full management privileges over their registered family unit.',
    badgeClasses: 'bg-amber-100 text-amber-800 border-amber-200',
    badgeDotClass: 'bg-amber-600',
  },
  MEMBER: {
    label: 'Member',
    description: 'Standard community member with profile, family, and directory access.',
    badgeClasses: 'bg-slate-100 text-slate-800 border-slate-200',
    badgeDotClass: 'bg-slate-500',
  },
  GUEST: {
    label: 'Guest',
    description: 'Limited read-only preview access to public community records.',
    badgeClasses: 'bg-gray-100 text-gray-700 border-gray-200',
    badgeDotClass: 'bg-gray-400',
  },
}

export const ALL_USER_ROLES: UserRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMMUNITY_MODERATOR',
  'COMMITTEE_MEMBER',
  'FAMILY_HEAD',
  'MEMBER',
  'GUEST',
]

/**
 * Human-readable mapping and styling for audit actions.
 */
export const AUDIT_ACTION_CONFIG: Record<
  AuditAction,
  {
    label: string
    category: 'AUTH' | 'ADMIN' | 'CENSUS' | 'CLAIMS' | 'VERIFICATION' | 'COMMUNITY'
    badgeClasses: string
  }
> = {
  USER_REGISTERED: {
    label: 'User Registered',
    category: 'AUTH',
    badgeClasses: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  USER_ROLE_CHANGED: {
    label: 'Role Changed',
    category: 'ADMIN',
    badgeClasses: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  USER_DEACTIVATED: {
    label: 'User Deactivated',
    category: 'ADMIN',
    badgeClasses: 'bg-red-50 text-red-700 border-red-200',
  },
  USER_REACTIVATED: {
    label: 'User Reactivated',
    category: 'ADMIN',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  PROFILE_UPDATED: {
    label: 'Profile Updated',
    category: 'AUTH',
    badgeClasses: 'bg-slate-50 text-slate-700 border-slate-200',
  },
  PERSON_CREATED: {
    label: 'Person Created',
    category: 'CENSUS',
    badgeClasses: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  PERSON_UPDATED: {
    label: 'Person Updated',
    category: 'CENSUS',
    badgeClasses: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  PERSON_DELETED: {
    label: 'Person Deleted',
    category: 'CENSUS',
    badgeClasses: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  PERSON_CLAIMED: {
    label: 'Claim Submitted',
    category: 'CLAIMS',
    badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  PERSON_CLAIM_APPROVED: {
    label: 'Claim Approved',
    category: 'CLAIMS',
    badgeClasses: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  PERSON_CLAIM_REJECTED: {
    label: 'Claim Rejected',
    category: 'CLAIMS',
    badgeClasses: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  PERSON_VERIFIED: {
    label: 'Record Verified',
    category: 'VERIFICATION',
    badgeClasses: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  PERSON_VERIFICATION_REJECTED: {
    label: 'Verification Rejected',
    category: 'VERIFICATION',
    badgeClasses: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  FAMILY_CREATED: {
    label: 'Family Created',
    category: 'CENSUS',
    badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  FAMILY_UPDATED: {
    label: 'Family Updated',
    category: 'CENSUS',
    badgeClasses: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  FAMILY_DELETED: {
    label: 'Family Deleted',
    category: 'CENSUS',
    badgeClasses: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  FAMILY_MEMBER_ADDED: {
    label: 'Member Added',
    category: 'CENSUS',
    badgeClasses: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  FAMILY_MEMBER_REMOVED: {
    label: 'Member Removed',
    category: 'CENSUS',
    badgeClasses: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  FAMILY_HEAD_CHANGED: {
    label: 'Family Head Changed',
    category: 'CENSUS',
    badgeClasses: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  PRIVACY_CHANGED: {
    label: 'Privacy Changed',
    category: 'ADMIN',
    badgeClasses: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  ADMIN_ACTION: {
    label: 'Administrative Action',
    category: 'ADMIN',
    badgeClasses: 'bg-violet-50 text-violet-700 border-violet-200',
  },
}

export const AUDIT_ACTIONS_LIST: AuditAction[] = Object.keys(AUDIT_ACTION_CONFIG) as AuditAction[]

/**
 * Visual styling and metadata for duplicate flag statuses.
 */
export const DUPLICATE_STATUS_CONFIG: Record<
  DuplicateFlagStatus,
  {
    label: string
    badgeClasses: string
    badgeDotClass: string
  }
> = {
  OPEN: {
    label: 'Open for Review',
    badgeClasses: 'bg-amber-100 text-amber-800 border-amber-200',
    badgeDotClass: 'bg-amber-500',
  },
  CONFIRMED_DUPLICATE: {
    label: 'Confirmed Duplicate',
    badgeClasses: 'bg-rose-100 text-rose-800 border-rose-200',
    badgeDotClass: 'bg-rose-600',
  },
  NOT_DUPLICATE: {
    label: 'Not a Duplicate',
    badgeClasses: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    badgeDotClass: 'bg-emerald-600',
  },
}

/**
 * Visual styling and metadata for duplicate match confidence levels.
 */
export const DUPLICATE_CONFIDENCE_CONFIG: Record<
  DuplicateConfidence,
  {
    label: string
    badgeClasses: string
  }
> = {
  STRONG: {
    label: 'Strong',
    badgeClasses: 'bg-red-100 text-red-800 border-red-200',
  },
  POSSIBLE: {
    label: 'Possible',
    badgeClasses: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  WEAK: {
    label: 'Weak',
    badgeClasses: 'bg-slate-100 text-slate-800 border-slate-200',
  },
}
