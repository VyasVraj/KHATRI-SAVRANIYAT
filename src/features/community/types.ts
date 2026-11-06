/**
 * Community Domain Types (Phase 10 — Subtasks 1 & 2)
 *
 * Enforces fundamental invariants:
 * - PERSON != USER: Group membership and announcement authorship link strictly
 *   to interactive user accounts (public.profiles / auth.users).
 * - FAMILY != GROUP: Community groups and announcements represent civic or cultural
 *   associations, distinct from genealogical families.
 */

export type GroupType =
  | 'VILLAGE_ASSOCIATION'
  | 'COMMITTEE'
  | 'CULTURAL'
  | 'YOUTH'
  | 'OTHER'

export type GroupRole = 'ADMIN' | 'MODERATOR' | 'MEMBER'

export interface Group {
  id: string
  name: string
  slug: string
  description: string | null
  group_type: GroupType
  location: string | null
  is_verified: boolean
  is_private: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface GroupMemberProfile {
  id: string
  display_name: string | null
  email: string
  avatar_url: string | null
}

export interface GroupMember {
  id: string
  group_id: string
  user_id: string
  role: GroupRole
  joined_at: string
  profile?: GroupMemberProfile
}

export interface GroupWithMembership extends Group {
  member_count: number
  caller_role: GroupRole | null
  is_caller_member: boolean
}

export interface CreateGroupInput {
  name: string
  slug: string
  description?: string | null
  group_type: GroupType
  location?: string | null
  is_private?: boolean
}

export interface GroupFilters {
  search?: string
  group_type?: GroupType | 'ALL'
  is_verified?: boolean
  membership_filter?: 'ALL' | 'MY_GROUPS'
}

// -----------------------------------------------------------------------------
// Announcements Domain Types (Phase 10 — Subtask 2)
// -----------------------------------------------------------------------------

export type AnnouncementType =
  | 'GENERAL'
  | 'URGENT'
  | 'EVENT'
  | 'BEREAVEMENT'
  | 'CELEBRATION'

export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export interface AnnouncementAuthorProfile {
  id: string
  display_name: string | null
  email: string
  avatar_url: string | null
}

export interface Announcement {
  id: string
  title: string
  content: string
  announcement_type: AnnouncementType
  status: AnnouncementStatus
  group_id: string | null
  group_name?: string | null
  group_slug?: string | null
  author_id: string
  author_name?: string | null
  author_email?: string | null
  author_avatar?: string | null
  is_pinned: boolean
  published_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  author?: AnnouncementAuthorProfile
  can_manage?: boolean
}

export interface CreateAnnouncementInput {
  title: string
  content: string
  announcement_type: AnnouncementType
  group_id?: string | null
  status?: AnnouncementStatus
  is_pinned?: boolean
}

export interface UpdateAnnouncementInput {
  id: string
  title: string
  content: string
  announcement_type: AnnouncementType
  status: AnnouncementStatus
  is_pinned: boolean
}

export interface AnnouncementFilters {
  search?: string
  announcement_type?: AnnouncementType | 'ALL'
  group_id?: string | null | 'ALL'
  scope?: 'ALL' | 'GLOBAL' | 'MY_GROUPS'
  status?: AnnouncementStatus | 'ALL'
}

// -----------------------------------------------------------------------------
// Events & RSVP Domain Types (Phase 10 — Subtask 3)
// -----------------------------------------------------------------------------

export type EventType =
  | 'GENERAL'
  | 'FESTIVAL'
  | 'MEETING'
  | 'SPORTS'
  | 'YOUTH'
  | 'CULTURAL'
  | 'WORKSHOP'
  | 'OTHER'

export type EventStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'ARCHIVED'

export type EventRsvpStatus = 'GOING' | 'MAYBE' | 'NOT_GOING'

export interface EventOrganizerProfile {
  id: string
  display_name: string | null
  email: string
  avatar_url: string | null
}

export interface CommunityEvent {
  id: string
  title: string
  description: string | null
  event_type: EventType
  status: EventStatus
  start_time: string
  end_time: string | null
  location: string | null
  location_url: string | null
  group_id: string | null
  group_name?: string | null
  group_slug?: string | null
  creator_id: string
  creator_name?: string | null
  creator_email?: string | null
  creator_avatar?: string | null
  is_pinned: boolean
  capacity: number | null
  published_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  creator?: EventOrganizerProfile
  rsvp_count_going: number
  rsvp_count_maybe: number
  my_rsvp_status: EventRsvpStatus | null
  my_guest_count: number
  my_notes: string | null
  can_manage?: boolean
}

export interface EventRsvp {
  id: string
  event_id: string
  user_id: string
  status: EventRsvpStatus
  guest_count: number
  notes: string | null
  created_at: string
  updated_at: string
  user_display_name?: string | null
  user_email?: string | null
  user_avatar?: string | null
}

export interface CreateEventInput {
  title: string
  description?: string | null
  event_type: EventType
  start_time: string
  end_time?: string | null
  location?: string | null
  location_url?: string | null
  group_id?: string | null
  capacity?: number | null
  status?: EventStatus
  is_pinned?: boolean
}

export interface UpdateEventInput {
  id: string
  title: string
  description?: string | null
  event_type: EventType
  start_time: string
  end_time?: string | null
  location?: string | null
  location_url?: string | null
  capacity?: number | null
  status?: EventStatus
  is_pinned?: boolean
}

export interface CancelEventInput {
  id: string
  cancellation_reason?: string | null
}

export interface SetEventRsvpInput {
  event_id: string
  status: EventRsvpStatus
  guest_count?: number
  notes?: string | null
}

export interface EventFilters {
  search?: string
  event_type?: EventType | 'ALL'
  group_id?: string | null | 'ALL'
  scope?: 'ALL' | 'GLOBAL' | 'MY_GROUPS'
  timeframe?: 'UPCOMING' | 'PAST' | 'ALL'
  status?: EventStatus | 'ALL'
}

// -----------------------------------------------------------------------------
// Birthdays Domain Types (Android Screen 05, 25-27 — ANDROID-9)
// -----------------------------------------------------------------------------

export interface BirthdayItem {
  id: string
  person_id: string
  first_name: string
  last_name: string
  middle_name: string | null
  avatar_url: string | null
  birth_month: number // 1-12
  birth_day: number // 1-31
  formatted_date: string // e.g., "12 Nov"
  days_until: number // 0 = today, 1 = tomorrow
  is_today: boolean
  is_tomorrow: boolean
  is_this_week: boolean
  is_this_month: boolean
  target_date: string // ISO string for the upcoming celebration
  is_living: boolean
}

export type BirthdayFilterType = 'ALL' | 'TODAY' | 'THIS_MONTH'

export interface BirthdayFilters {
  search?: string
  filter?: BirthdayFilterType
  month?: number
}

export interface BirthdayGroup {
  group_key: 'today' | 'this_week' | 'this_month' | 'upcoming'
  title_key: string
  items: BirthdayItem[]
}

// -----------------------------------------------------------------------------
// Sindhi Panchang / Lunar Calendar Types (Screens 29-32 — ANDROID-10)
// -----------------------------------------------------------------------------

export type SindhiMonth =
  | 'CHET'
  | 'VAISAKH'
  | 'JETH'
  | 'AKHAR'
  | 'SAWAN'
  | 'BADHO'
  | 'ASU'
  | 'KATTI'
  | 'NAHRI'
  | 'POH'
  | 'MANGH'
  | 'PHAGUN'

export type PakshaType = 'SHUKLA' | 'KRISHNA'

export type TithiType =
  | 'EKAM'
  | 'BEEJ'
  | 'TEEJ'
  | 'CHAUTH'
  | 'PANCHAMI'
  | 'CHHATH'
  | 'SATAM'
  | 'ASHTAMI'
  | 'NAVAMI'
  | 'DASAM'
  | 'EKADASHI'
  | 'DWADASHI'
  | 'TERAS'
  | 'CHAUDAS'
  | 'POONAM'
  | 'AMAVAS'

export type ObservanceType =
  | 'CHAND'
  | 'EKADASHI'
  | 'POONAM'
  | 'AMAVAS'
  | 'FESTIVAL'
  | 'VRAT'

export type PanchangDataStatus =
  | 'VERIFIED_OBSERVANCE'
  | 'CALCULATED_CALENDAR'
  | 'ASTRONOMICAL_PENDING'

export interface PanchangObservance {
  id: string
  type: ObservanceType
  title: string
  description?: string
  is_major?: boolean
}

export interface PanchangDayInfo {
  date_string: string // "YYYY-MM-DD"
  day_number: number // 1-31
  month_number: number // 1-12
  year: number
  day_of_week: number // 0 = Sun, 1 = Mon, ..., 6 = Sat
  formatted_gregorian: string // "1 Nov 2026"
  is_current_month: boolean
  is_today: boolean
  is_selected: boolean
  sindhi_month: SindhiMonth | null
  sindhi_month_name: string
  paksha: PakshaType | null
  paksha_name: string
  tithi: TithiType | null
  tithi_name: string
  observances: PanchangObservance[]
  has_chand: boolean
  has_ekadashi: boolean
  has_poonam: boolean
  has_amavas: boolean
  has_festival: boolean
  data_status: PanchangDataStatus
}

export type PanchangFilterType = 'ALL' | 'OBSERVANCES' | 'FESTIVALS'

// -----------------------------------------------------------------------------
// Mukhi Leadership Directory Domain Types (ANDROID-11)
// -----------------------------------------------------------------------------

export interface MukhiLeaderItem {
  id: string
  mukhi_unique_id?: string | null
  gram?: string | null
  official_email?: string | null
  authority_status?: 'ACTIVE' | 'INACTIVE' | 'REVOKED' | string
  account_linking_status?: 'NOT_REGISTERED' | 'LINKED' | 'UNLINKED' | string
  person_id: string | null
  user_id: string | null
  name: string
  display_name?: string | null
  avatar_url?: string | null
  designation: string
  role: 'MUKHI' | 'COMMUNITY_MODERATOR' | 'ADMIN' | 'SUPER_ADMIN' | string
  gotra?: string | null
  nukh?: string | null
  kul?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  birth_place?: string | null
  family_name?: string | null
  family_id?: string | null
  is_verified: boolean
  is_active: boolean
  status: string
  profile_privacy: 'PRIVATE' | 'FAMILY' | 'CONNECTIONS' | 'COMMUNITY' | 'PUBLIC'
  contact_privacy?: 'PRIVATE' | 'FAMILY' | 'CONNECTIONS' | 'COMMUNITY' | 'PUBLIC'
  phone?: string | null
  bio?: string | null
}

export interface MukhiDirectoryFilters {
  search?: string
  state?: string
  city?: string
  nukh?: string
  gotra?: string
  status?: 'ALL' | 'ACTIVE'
}

export interface MukhiDirectoryOptions {
  filters?: MukhiDirectoryFilters
  page?: number
  pageSize?: number
  currentUserId?: string | null
  isModerator?: boolean
}

export interface MukhiDirectoryResponse {
  items: MukhiLeaderItem[]
  totalCount: number
  page: number
  pageSize: number
  hasNextPage: boolean
  availableStates: string[]
  availableCities: string[]
  availableNukhs: string[]
}

// -----------------------------------------------------------------------------
// Committees Domain Types (Screens 44-45 — ANDROID-13)
// -----------------------------------------------------------------------------

export type CommitteeCategory =
  | 'ALL'
  | 'GOVERNANCE'
  | 'CENSUS'
  | 'WELFARE'
  | 'YOUTH_SPORTS'
  | 'WOMEN_CULTURAL'
  | 'EDUCATION'
  | 'HEALTH'

export interface CommitteeMember {
  id: string
  person_id: string | null
  user_id: string | null
  name: string
  display_name?: string | null
  designation: string
  role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
  order_rank: number
  city?: string | null
  state?: string | null
  gotra?: string | null
  nukh?: string | null
  phone?: string | null
  email?: string | null
  contact_privacy: 'PRIVATE' | 'COMMUNITY' | 'PUBLIC'
  avatar_url?: string | null
  is_active: boolean
  tenure?: string | null
}

export interface Committee {
  id: string
  slug: string
  name: string
  native_name?: string
  category: CommitteeCategory
  type: GroupType
  description: string
  objectives?: string[]
  location?: string | null
  headquarters?: string | null
  meeting_schedule?: string | null
  established_year?: number
  is_verified: boolean
  is_active: boolean
  member_count: number
  leadership_summary: {
    head_name: string
    head_designation: string
    secretary_name?: string
  }
  members?: CommitteeMember[]
}

export interface CommitteeFilters {
  search?: string
  category?: CommitteeCategory
  status?: 'ALL' | 'ACTIVE'
}

export interface CommitteeDirectoryResponse {
  items: Committee[]
  totalCount: number
  availableCategories: CommitteeCategory[]
}

// -----------------------------------------------------------------------------
// Panchayat Leadership Directory Types (Screen 46 — ANDROID-13)
// -----------------------------------------------------------------------------

export type PanchayatSection = 'ALL' | 'EXECUTIVE' | 'ZONAL' | 'ADVISORY'

export interface PanchayatLeaderItem {
  id: string
  person_id: string | null
  user_id: string | null
  name: string
  display_name?: string | null
  designation: string
  section: 'EXECUTIVE' | 'ZONAL' | 'ADVISORY'
  role: 'COMMUNITY_MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'
  zone: string
  city: string
  state: string
  gotra?: string | null
  nukh?: string | null
  kul?: string | null
  avatar_url?: string | null
  is_verified: boolean
  is_active: boolean
  status: 'ACTIVE'
  profile_privacy: 'COMMUNITY' | 'PUBLIC'
  contact_privacy: 'PRIVATE' | 'COMMUNITY' | 'PUBLIC'
  phone?: string | null
  bio?: string | null
  term?: string | null
}

export interface PanchayatFilters {
  search?: string
  section?: PanchayatSection
  zone?: string
  status?: 'ALL' | 'ACTIVE'
}

export interface PanchayatDirectoryResponse {
  items: PanchayatLeaderItem[]
  totalCount: number
  availableZones: string[]
  availableSections: PanchayatSection[]
}

// -----------------------------------------------------------------------------
// Circulars / Official Notices Domain Types (Screens 47-48 — ANDROID-13)
// -----------------------------------------------------------------------------

export type CircularCategory =
  | 'ALL'
  | 'GENERAL'
  | 'URGENT'
  | 'CENSUS'
  | 'ELECTION'
  | 'WELFARE'
  | 'GOVERNANCE'

export interface CircularItem {
  id: string
  circular_number: string
  title: string
  summary: string
  content: string
  category: Exclude<CircularCategory, 'ALL'>
  issuing_authority: string
  signatory_name: string
  signatory_title: string
  issue_date: string
  formatted_date: string
  is_pinned: boolean
  status: 'PUBLISHED'
  committee_id?: string | null
  committee_name?: string | null
  announcement_id?: string | null
  official_seal_text?: string
}

export interface CircularFilters {
  search?: string
  category?: CircularCategory
  issuer?: string
  status?: 'ALL' | 'PUBLISHED'
}

export interface CircularDirectoryResponse {
  items: CircularItem[]
  totalCount: number
  availableCategories: CircularCategory[]
  availableIssuers: string[]
}


