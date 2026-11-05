/**
 * Types barrel — re-exports all type definitions for convenience.
 *
 * Import from '@/types' for database and common types.
 * Import from '@/types/database.types' for the generated Database type.
 * Import from '@/types/database' for manual row/enum convenience aliases.
 */
export type {
  // Database enum types
  PrivacyLevel,
  UserRole,
  PersonStatus,
  FamilyStatus,
  VerificationStatus,
  Gender,
  FamilyRole,
  AuditAction,
  // Database row types
  ProfileRow,
  PersonRow,
  FamilyRow,
  FamilyMemberRow,
  AuditLogRow,
  PersonProtectedDetails,
  RespectiveMukhiInfo,
  // Database insert/update types
  ProfileInsert,
  ProfileUpdate,
  PersonInsert,
  PersonUpdate,
  FamilyInsert,
  FamilyUpdate,
  FamilyMemberInsert,
  FamilyMemberUpdate,
  AuditLogInsert,
} from './database'

/**
 * Re-export the canonical generated Database type.
 * This is the authoritative type used by the Supabase client.
 * Source: src/types/database.types.ts (generated from remote schema).
 */
export type { Database } from './database.types'

export type {
  // Branded IDs
  UserId,
  PersonId,
  FamilyId,
  FamilyMemberId,
  AuditLogId,
  // API response types
  ApiResponse,
  PaginatedResponse,
  PaginatedError,
  PaginatedResult,
  // Error types
  AppError,
  // Pagination
  PaginationParams,
  SortParams,
  // Async state
  AsyncStatus,
  AsyncState,
  // Search filters
  PersonSearchFilters,
  FamilySearchFilters,
  // Utility types
  Maybe,
  RequireFields,
  DeepReadonly,
} from './common'

// Re-export ID cast functions
export { toUserId, toPersonId, toFamilyId } from './common'
