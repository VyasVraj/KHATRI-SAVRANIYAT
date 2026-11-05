/**
 * Supabase Database Type Definitions
 *
 * This file is manually maintained to match the current SQL schema.
 * In production, regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/types/database.ts
 *
 * DO NOT hand-edit generated sections if using codegen.
 * Current status: Phase 1 — manually authored to match migration files.
 *
 * Schema: public
 * Last updated: Phase 1 — Architecture & Database Foundation
 */

// ---------------------------------------------------------------------------
// Enum Types (mirroring PostgreSQL enums in supabase/migrations/)
// ---------------------------------------------------------------------------

/** Controls visibility of records across the platform. Enforced in RLS. */
export type PrivacyLevel = 'PRIVATE' | 'FAMILY' | 'CONNECTIONS' | 'COMMUNITY' | 'PUBLIC'

/** Application RBAC roles. Changes must go through admin workflow. */
export type UserRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'COMMUNITY_MODERATOR'
  | 'COMMUNITY_MUKHI'
  | 'ASSISTANT_MUKHI'
  | 'COMMITTEE_MEMBER'
  | 'FAMILY_HEAD'
  | 'FAMILY_MANAGER'
  | 'FAMILY_MEMBER'
  | 'COMMUNITY_MEMBER'
  | 'MEMBER'
  | 'GUEST'

/** Lifecycle status of a person record. */
export type PersonStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'DECEASED'

/** Lifecycle status of a family record. */
export type FamilyStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

/** Verification workflow state for persons and families. */
export type VerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

/** Gender attribute of a person. Always stored at PRIVATE privacy by default. */
export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY'

/** Role a person holds within a specific family. */
export type FamilyRole =
  | 'HEAD'
  | 'SPOUSE'
  | 'CHILD'
  | 'PARENT'
  | 'SIBLING'
  | 'GRANDPARENT'
  | 'GRANDCHILD'
  | 'EXTENDED'

/** Auditable actions logged in audit_logs. */
export type AuditAction =
  | 'USER_REGISTERED'
  | 'USER_ROLE_CHANGED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'PROFILE_UPDATED'
  | 'PERSON_CREATED'
  | 'PERSON_UPDATED'
  | 'PERSON_DELETED'
  | 'PERSON_CLAIMED'
  | 'PERSON_CLAIM_APPROVED'
  | 'PERSON_CLAIM_REJECTED'
  | 'PERSON_VERIFIED'
  | 'PERSON_VERIFICATION_REJECTED'
  | 'FAMILY_CREATED'
  | 'FAMILY_UPDATED'
  | 'FAMILY_DELETED'
  | 'FAMILY_MEMBER_ADDED'
  | 'FAMILY_MEMBER_REMOVED'
  | 'FAMILY_HEAD_CHANGED'
  | 'PRIVACY_CHANGED'
  | 'ADMIN_ACTION'

// ---------------------------------------------------------------------------
// Row Types (one per table; mirror the database column names exactly)
// ---------------------------------------------------------------------------

/**
 * public.profiles
 * One-to-one extension of auth.users. NOT a person record.
 * Created automatically on user registration via DB trigger.
 *
 * DOMAIN RULE: This is the USER. See public.persons for the PERSON.
 */
export interface ProfileRow {
  /** FK to auth.users.id — enforces 1:1 relationship */
  id: string
  /** Kept in sync with auth.users.email via trigger */
  email: string
  /** Display name shown in UI (may differ from person's legal name) */
  display_name: string | null
  /** URL to avatar image in Supabase Storage */
  avatar_url: string | null
  /** Application RBAC role. Not changeable by the user themselves. */
  role: UserRole
  /** FALSE = suspended or deactivated account */
  is_active: boolean
  /** TRUE after email confirmation by Supabase Auth */
  email_verified: boolean
  created_at: string
  updated_at: string
}

/**
 * public.persons
 * Community census record for an individual human being.
 *
 * DOMAIN RULE: PERSON != USER.
 * - Exists independently of auth (user_id is nullable).
 * - user_id is set only after the claim workflow (Phase 8).
 * - Soft-deleted via deleted_at (never hard-deleted).
 */
export interface PersonRow {
  id: string
  // Identity
  first_name: string
  middle_name: string | null
  last_name: string
  maiden_name: string | null
  // Demographics
  gender: Gender | null
  date_of_birth: string | null  // ISO date string YYYY-MM-DD
  dob_year?: number | null      // Generated public birth year (YYYY)
  age?: number | null           // Calculated age in years
  date_of_death: string | null
  birth_place: string | null
  // Community Identity
  gotra: string | null
  nukh: string | null
  kul: string | null
  // Contact (access controlled by contact_privacy + RLS)
  phone: string | null
  phone_secondary: string | null
  email_contact: string | null
  // Status
  status: PersonStatus
  verification_status: VerificationStatus
  // Privacy configuration
  profile_privacy: PrivacyLevel
  dob_privacy: PrivacyLevel
  contact_privacy: PrivacyLevel
  // User link (PERSON != USER — nullable until claimed)
  user_id: string | null
  // Media / Avatar (Phase 11)
  avatar_url?: string | null
  // Provenance
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * Protected personal details returned only by authorized RPC
 * get_person_protected_details.
 */
export interface PersonProtectedDetails {
  date_of_birth: string | null
  phone: string | null
  phone_secondary: string | null
  email_contact: string | null
  is_owner: boolean
  is_moderator: boolean
}

/**
 * Respective regional Mukhi association for a person or family.
 */
export interface RespectiveMukhiInfo {
  id: string
  name: string
  display_name: string
  designation: string
  city: string
  state: string
  can_contact_directly: boolean
  phone: string | null
  email: string | null
}

/**
 * public.families
 * Family unit in the community census.
 * Membership is tracked via public.family_members.
 */
export interface FamilyRow {
  id: string
  family_name: string
  description: string | null
  // Media / Avatar (Phase 11)
  avatar_url?: string | null
  // Community identity
  gotra: string | null
  nukh: string | null
  kul: string | null
  // Location (freeform in Phase 1)
  city: string | null
  state: string | null
  country: string | null
  // Status
  status: FamilyStatus
  verification_status: VerificationStatus
  // Privacy
  profile_privacy: PrivacyLevel
  members_privacy: PrivacyLevel
  // Provenance
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * public.family_members
 * Junction table linking persons to families with a role.
 * Supports temporal history via left_at.
 */
export interface FamilyMemberRow {
  id: string
  family_id: string
  person_id: string
  role: FamilyRole
  /** TRUE = this person is the current head of this family. At most one per family. */
  is_head: boolean
  joined_at: string
  /** NULL = active member. Non-null = former member. */
  left_at: string | null
  added_by: string | null
  created_at: string
}

/** Media type for family media items */
export type FamilyMediaType = 'PHOTO' | 'DOCUMENT' | 'HISTORICAL_RECORD'

/**
 * public.family_albums
 * Photo albums belonging to a family.
 */
export interface FamilyAlbumRow {
  id: string
  family_id: string
  title: string
  description: string | null
  privacy_level: PrivacyLevel
  cover_media_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * public.family_media
 * Individual media metadata files belonging to a family.
 */
export interface FamilyMediaRow {
  id: string
  family_id: string
  album_id: string | null
  storage_object_path: string
  media_type: FamilyMediaType
  original_filename: string
  mime_type: string
  file_size: number
  caption: string | null
  description: string | null
  display_order: number
  uploaded_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * public.family_stories
 * Narrative history and memoirs belonging to a family.
 */
export interface FamilyStoryRow {
  id: string
  family_id: string
  title: string
  content: string
  summary: string | null
  author_id: string | null
  privacy_level: PrivacyLevel
  featured_media_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/**
 * public.audit_logs
 * Append-only security and compliance audit log.
 * SELECT restricted to admins. No UPDATE or DELETE via RLS.
 */
export interface AuditLogRow {
  id: string
  action: AuditAction
  actor_id: string | null
  target_type: string | null
  target_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Insert Types (for INSERT operations — omit auto-generated fields)
// ---------------------------------------------------------------------------

export type ProfileInsert = Omit<ProfileRow, 'created_at' | 'updated_at'>

export type PersonInsert = Omit<
  PersonRow,
  'id' | 'created_at' | 'updated_at' | 'verification_status'
> & {
  id?: string
  verification_status?: VerificationStatus
}

export type FamilyInsert = Omit<
  FamilyRow,
  'id' | 'created_at' | 'updated_at' | 'verification_status'
> & {
  id?: string
  verification_status?: VerificationStatus
}

export type FamilyMemberInsert = Omit<FamilyMemberRow, 'id' | 'created_at'>

export type AuditLogInsert = Omit<AuditLogRow, 'id' | 'created_at'>

// ---------------------------------------------------------------------------

// Update Types (for UPDATE operations — all fields optional except id)
// Defined as explicit interfaces (not Partial<Omit<...>>) to match the exact
// format that Supabase JS v2 expects for .update() calls.
// ---------------------------------------------------------------------------

export interface ProfileUpdate {
  display_name?: string | null
  avatar_url?: string | null
  role?: UserRole
  is_active?: boolean
  email_verified?: boolean
  updated_at?: string
}

export interface PersonUpdate {
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  maiden_name?: string | null
  gender?: Gender | null
  date_of_birth?: string | null
  date_of_death?: string | null
  gotra?: string | null
  nukh?: string | null
  kul?: string | null
  phone?: string | null
  email?: string | null
  bio?: string | null
  occupation?: string | null
  education?: string | null
  birth_place?: string | null
  residence_place?: string | null
  profile_privacy?: PrivacyLevel
  dob_privacy?: PrivacyLevel
  contact_privacy?: PrivacyLevel
  avatar_url?: string | null
  status?: PersonStatus
  verification_status?: VerificationStatus
  deleted_at?: string | null
  updated_at?: string
}

export interface FamilyUpdate {
  family_name?: string | null
  avatar_url?: string | null
  gotra?: string | null
  nukh?: string | null
  kul?: string | null
  village_of_origin?: string | null
  current_location?: string | null
  profile_privacy?: PrivacyLevel
  members_privacy?: PrivacyLevel
  status?: FamilyStatus
  deleted_at?: string | null
  updated_at?: string
}

export interface FamilyMemberUpdate {
  role?: FamilyRole | null
  is_head?: boolean
  left_at?: string | null
}


// ---------------------------------------------------------------------------
// Database type (Supabase client generic)
// This structure mirrors the format expected by createClient<Database>()
// When using codegen, this entire structure is auto-generated.
// ---------------------------------------------------------------------------
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: ProfileInsert
        Update: ProfileUpdate
      }
      persons: {
        Row: PersonRow
        Insert: PersonInsert
        Update: PersonUpdate
      }
      families: {
        Row: FamilyRow
        Insert: FamilyInsert
        Update: FamilyUpdate
      }
      family_members: {
        Row: FamilyMemberRow
        Insert: FamilyMemberInsert
        Update: FamilyMemberUpdate
      }
      audit_logs: {
        Row: AuditLogRow
        Insert: AuditLogInsert
        Update: never  // Audit logs are append-only — no updates allowed
      }
    }
    Views: {
      [_ in never]: never
    }

    Functions: {
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_community_moderator: {
        Args: Record<string, never>
        Returns: boolean
      }
      get_my_role: {
        Args: Record<string, never>
        Returns: string
      }
      log_audit_event: {
        Args: {
          p_action: AuditAction
          p_target_type?: string
          p_target_id?: string
          p_old_data?: Record<string, unknown>
          p_new_data?: Record<string, unknown>
          p_metadata?: Record<string, unknown>
        }
        Returns: string
      }
    }
    Enums: {
      privacy_level: PrivacyLevel
      user_role: UserRole
      person_status: PersonStatus
      family_status: FamilyStatus
      verification_status: VerificationStatus
      gender: Gender
      family_role: FamilyRole
      audit_action: AuditAction
    }
  }
}
