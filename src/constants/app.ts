/**
 * Application constants
 *
 * Centralized location for all application-level constants.
 * Do NOT put secrets or sensitive values here.
 */

export const APP_NAME = import.meta.env.VITE_APP_NAME ?? 'KHATRI SARVANIYAT'
export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.1.0'
export const APP_ENV = import.meta.env.VITE_APP_ENV ?? 'development'

export const IS_DEVELOPMENT = APP_ENV === 'development'
export const IS_PRODUCTION = APP_ENV === 'production'

/** Route paths — single source of truth for navigation */
export const ROUTES = {
  HOME: '/',
  DISCOVER: '/discover',
  FAMILY: '/family',
  COMMUNITY: '/community',
  COMMITTEES: '/committees',
  PANCHAYAT: '/panchayat',
  CIRCULARS: '/circulars',
  MUKHI: '/mukhi',
  PANCHANG: '/panchang',
  CONNECTIONS: '/connections',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  // Auth
  SIGN_IN: '/auth/sign-in',
  SIGN_UP: '/auth/sign-up',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password',
  AUTH_CALLBACK: '/auth/callback',
  // People (Phase 3)
  PEOPLE: '/people',
  PERSON_CREATE: '/people/new',
  PERSON_DETAIL: (id: string) => `/people/${id}`,
  PERSON_EDIT: (id: string) => `/people/${id}/edit`,
  PERSON_TREE: (id: string) => `/people/${id}/tree`,
  // Families (Phase 3)
  FAMILIES: '/families',
  FAMILY_CREATE: '/families/new',
  FAMILY_DETAIL: (id: string) => `/families/${id}`,
  FAMILY_EDIT: (id: string) => `/families/${id}/edit`,
  // Admin & Moderation (Phase 8 Subtask 3, Phase 9 Subtask 3, Phase 13 Subtasks 2-4)
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_AUDIT: '/admin/audit',
  ADMIN_DUPLICATES: '/admin/duplicates',
  ADMIN_IMPORT: '/admin/import',
  CLAIM_REVIEW_QUEUE: '/admin/claims',
  VERIFICATION_REVIEW_QUEUE: '/admin/verifications',
  // Invitations (Phase 8 Subtask 4B)
  INVITATION_REDEMPTION: (token: string) => `/invite/${token}`,
  // Notifications (Phase 12)
  NOTIFICATIONS: '/notifications',
  NOTIFICATION_PREFERENCES: '/settings/notifications',
  // Misc
  NOT_FOUND: '/404',
} as const

/** Privacy level definitions — matches the database enum (public.privacy_level) */
export const PRIVACY_LEVELS = {
  PRIVATE: 'PRIVATE',
  FAMILY: 'FAMILY',
  CONNECTIONS: 'CONNECTIONS',
  COMMUNITY: 'COMMUNITY',
  PUBLIC: 'PUBLIC',
} as const satisfies Record<string, import('@/types').PrivacyLevel>

/** Human-readable labels for privacy levels */
export const PRIVACY_LEVEL_LABELS: Record<import('@/types').PrivacyLevel, string> = {
  PRIVATE: 'Only me',
  FAMILY: 'Family members',
  CONNECTIONS: 'Connections',
  COMMUNITY: 'Community members',
  PUBLIC: 'Everyone',
}

/** User role definitions — matches the database enum (public.user_role) */
export const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  COMMUNITY_MODERATOR: 'COMMUNITY_MODERATOR',
  COMMITTEE_MEMBER: 'COMMITTEE_MEMBER',
  FAMILY_HEAD: 'FAMILY_HEAD',
  MEMBER: 'MEMBER',
  GUEST: 'GUEST',
} as const satisfies Record<string, import('@/types').UserRole>

/** Administrative roles (can access claims & verification moderation features) */
export const ADMIN_ROLES: ReadonlyArray<import('@/types').UserRole> = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMMUNITY_MODERATOR',
]

/** Full Platform Administrator roles (can access Admin Hub / admin RPCs) */
export const PLATFORM_ADMIN_ROLES: ReadonlyArray<import('@/types').UserRole> = [
  'SUPER_ADMIN',
  'ADMIN',
]

/**
 * Roles authorized to view and modify privacy settings.
 * ANDROID-2: Normal users must NOT be able to view or modify profile/privacy-setting controls.
 * COMMUNITY_MODERATOR acts as the temporary Mukhi-equivalent.
 */
export const PRIVACY_MANAGEMENT_ROLES: ReadonlyArray<import('@/types').UserRole> = [
  'SUPER_ADMIN',
  'ADMIN',
  'COMMUNITY_MODERATOR',
]

/**
 * Check if a role is authorized to view or manage privacy settings.
 */
export function canManagePrivacy(role?: string | null): boolean {
  if (!role) return false
  return PRIVACY_MANAGEMENT_ROLES.includes(role as import('@/types').UserRole)
}

/** Family member role definitions — matches the database enum (public.family_role) */
export const FAMILY_ROLES = {
  HEAD: 'HEAD',
  SPOUSE: 'SPOUSE',
  CHILD: 'CHILD',
  PARENT: 'PARENT',
  SIBLING: 'SIBLING',
  GRANDPARENT: 'GRANDPARENT',
  GRANDCHILD: 'GRANDCHILD',
  EXTENDED: 'EXTENDED',
} as const satisfies Record<string, import('@/types').FamilyRole>

/** Human-readable labels for family member roles */
export const FAMILY_ROLE_LABELS: Record<import('@/types').FamilyRole, string> = {
  HEAD: 'Head of Family',
  SPOUSE: 'Spouse',
  CHILD: 'Child',
  PARENT: 'Parent',
  SIBLING: 'Sibling',
  GRANDPARENT: 'Grandparent',
  GRANDCHILD: 'Grandchild',
  EXTENDED: 'Extended Family',
}

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const

/** File upload limits */
export const UPLOAD = {
  MAX_AVATAR_SIZE_BYTES: 5 * 1024 * 1024, // 5 MB
  MAX_DOCUMENT_SIZE_BYTES: 20 * 1024 * 1024, // 20 MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  ALLOWED_DOCUMENT_TYPES: ['application/pdf'] as const,
} as const
