/**
 * Shared application-level types and utilities.
 *
 * These are NOT database types (those are in database.ts).
 * These are the application layer's domain types, API types, and utility types.
 */

// ---------------------------------------------------------------------------
// Branded UUID types — type-safe IDs
// These prevent accidentally passing a PersonId where a FamilyId is expected.
// ---------------------------------------------------------------------------

declare const __brand: unique symbol
type Brand<T, B> = T & { [__brand]: B }

export type UserId = Brand<string, 'UserId'>
export type PersonId = Brand<string, 'PersonId'>
export type FamilyId = Brand<string, 'FamilyId'>
export type FamilyMemberId = Brand<string, 'FamilyMemberId'>
export type AuditLogId = Brand<string, 'AuditLogId'>

/** Cast a plain string to a typed ID. Use only at data ingestion boundaries. */
export const toUserId = (id: string): UserId => id as UserId
export const toPersonId = (id: string): PersonId => id as PersonId
export const toFamilyId = (id: string): FamilyId => id as FamilyId

// ---------------------------------------------------------------------------
// API response envelope types
// All service functions return these types for consistent error handling.
// ---------------------------------------------------------------------------

/** Standard success/error wrapper for all service function returns. */
export type ApiResponse<T> =
  | { data: T; error: null }
  | { data: null; error: AppError }

/** Paginated list response */
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  error: null
}

/** Paginated error response */
export interface PaginatedError {
  data: null
  total: 0
  page: number
  pageSize: number
  hasMore: false
  error: AppError
}

export type PaginatedResult<T> = PaginatedResponse<T> | PaginatedError

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Standardised application error. Never expose raw Supabase/DB errors to users. */
export interface AppError {
  /** User-safe error message */
  message: string
  /** Internal error code for debugging (not shown to users) */
  code?: string
  /** HTTP-equivalent status (useful for UI feedback) */
  status?: number
  /** Original error for logging (do not render to users) */
  cause?: unknown
}

// ---------------------------------------------------------------------------
// Pagination and sorting
// ---------------------------------------------------------------------------

export interface PaginationParams {
  page: number      // 1-indexed
  pageSize: number  // Max 100 (enforced in services)
}

export interface SortParams<T extends string = string> {
  field: T
  direction: 'asc' | 'desc'
}

// ---------------------------------------------------------------------------
// Async state
// Used by custom hooks for tracking loading/error state
// ---------------------------------------------------------------------------

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export interface AsyncState<T> {
  data: T | null
  status: AsyncStatus
  error: AppError | null
}

// ---------------------------------------------------------------------------
// Search / filter types (used in discovery and directory)
// ---------------------------------------------------------------------------

export interface PersonSearchFilters {
  query?: string          // Name search
  gotra?: string          // Community identity filter
  nukh?: string
  kul?: string
  city?: string
  state?: string
  country?: string
}

export interface FamilySearchFilters {
  query?: string          // Name search
  gotra?: string
  nukh?: string
  kul?: string
  city?: string
  state?: string
  country?: string
}

// ---------------------------------------------------------------------------
// UI utility types
// ---------------------------------------------------------------------------

/** For components that can accept either a PersonId or render a skeleton */
export type Maybe<T> = T | null | undefined

/** Utility: make specific fields required on an otherwise partial type */
export type RequireFields<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

/** Utility: read-only deep freeze */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}
