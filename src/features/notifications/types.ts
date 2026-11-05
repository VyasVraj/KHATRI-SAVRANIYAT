/**
 * Notifications Domain Types
 *
 * Phase 12 — Subtask 1: Notification Database Foundation, RLS & Mutation RPCs
 */

export type NotificationCategory =
  | 'CONNECTION'
  | 'INVITATION'
  | 'CLAIM'
  | 'VERIFICATION'
  | 'COMMUNITY'
  | 'EVENT'
  | 'FAMILY'
  | 'SECURITY'

export type NotificationChannel = 'EMAIL' | 'PUSH'

export type NotificationDeliveryStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'DEAD_LETTER'

export interface NotificationItem {
  id: string
  recipient_id: string
  actor_id: string | null
  category: NotificationCategory
  type: string
  title: string
  body: string
  action_url: string | null
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  created_at: string
  deleted_at: string | null
}

export interface NotificationPreferences {
  user_id: string
  in_app_enabled: boolean
  email_enabled: boolean
  email_connections: boolean
  email_invitations: boolean
  email_claims: boolean
  email_verifications: boolean
  email_announcements: boolean
  email_events: boolean
  email_family_media: boolean
  created_at: string
  updated_at: string
}

export interface NotificationOutboxItem {
  id: string
  notification_id: string
  recipient_id: string
  channel: NotificationChannel
  status: NotificationDeliveryStatus
  attempts: number
  last_error: string | null
  scheduled_at: string
  sent_at: string | null
  created_at: string
}

export interface UpdatePreferencesInput {
  in_app_enabled?: boolean
  email_enabled?: boolean
  email_connections?: boolean
  email_invitations?: boolean
  email_claims?: boolean
  email_verifications?: boolean
  email_announcements?: boolean
  email_events?: boolean
  email_family_media?: boolean
}

export type DomainNotificationEventType =
  | 'connection_request'
  | 'connection_accepted'
  | 'claim_approved'
  | 'claim_rejected'
  | 'invitation_accepted'
  | 'verification_approved'
  | 'verification_rejected'
  | 'group_role_updated'
  | 'event_cancelled'
  | 'event_rsvp'
  | 'family_photo_added'
  | 'family_story_added'

export interface NotificationMetadata {
  event_key?: string
  [key: string]: unknown
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'CONNECTION',
  'INVITATION',
  'CLAIM',
  'VERIFICATION',
  'COMMUNITY',
  'EVENT',
  'FAMILY',
  'SECURITY',
] as const

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  CONNECTION: 'Connections',
  INVITATION: 'Invitations',
  CLAIM: 'Claims',
  VERIFICATION: 'Verifications',
  COMMUNITY: 'Community',
  EVENT: 'Events',
  FAMILY: 'Family',
  SECURITY: 'Security',
}

export type NotificationTabKey = 'ALL' | 'UNREAD' | 'FAMILY' | 'SYSTEM' | 'UPDATES'

export interface NotificationTabDefinition {
  key: NotificationTabKey
  label: string
  categories?: NotificationCategory[]
  unreadOnly?: boolean
}

export const NOTIFICATION_TABS: NotificationTabDefinition[] = [
  { key: 'ALL', label: 'All' },
  { key: 'UNREAD', label: 'Unread', unreadOnly: true },
  { key: 'FAMILY', label: 'Family', categories: ['FAMILY'] },
  { key: 'SYSTEM', label: 'System', categories: ['SECURITY', 'CLAIM', 'VERIFICATION'] },
  { key: 'UPDATES', label: 'Updates', categories: ['COMMUNITY', 'EVENT', 'INVITATION', 'CONNECTION'] },
]
