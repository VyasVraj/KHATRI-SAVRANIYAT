/**
 * Profile domain types (ANDROID-12 — Screens 37–43)
 */

import type { PrivacyLevel } from '@/types'

/** Profile tab identifiers matching Android reference screens */
export type ProfileTab =
  | 'overview'       // Screen 37: Profile overview & display name
  | 'completeness'   // Screen 38: Completeness & missing fields
  | 'account'        // Screen 40 & 42: Account details & account deletion
  | 'security'       // Screen 41: Password & session security
  | 'settings'       // Screen 39: Language, app tour & notifications
  | 'privacy'        // Screen 43: Privacy levels & community governance

/** Actionable missing field item for census record completeness */
export interface ActionableMissingField {
  id: string
  label: string
  description: string
  category: 'core' | 'vital' | 'lineage' | 'contact'
  actionLabel: string
  actionUrl?: string
  actionType: 'navigate' | 'photo'
}

/** Form inputs for changing password (Screen 41) */
export interface ChangePasswordInput {
  password: string
  confirmPassword: string
}

/** Form inputs for updating linked person privacy (Screen 43 — authorized roles only) */
export interface UpdatePrivacyInput {
  profile_privacy: PrivacyLevel
  contact_privacy: PrivacyLevel
  dob_privacy: PrivacyLevel
}
