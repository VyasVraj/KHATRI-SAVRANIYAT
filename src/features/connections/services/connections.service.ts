/**
 * Connections service — User-to-User social connections & graph queries (Phase 7 Subtask 1)
 *
 * All operations use the single typed Supabase client (anon key only).
 * Authorization and access controls are enforced exclusively by PostgreSQL RLS policies.
 *
 * CRITICAL ARCHITECTURAL RULES:
 * - USER ↔ USER: Connections link authenticated users (public.profiles.id), NOT census persons.
 * - ONE ROW PER PAIR: A connection pair is stored in exactly one canonical row.
 * - SENSITIVE DATA EXCLUSION: Projections strictly exclude passwords, tokens, and internal metadata.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import {
  sendConnectionRequestSchema,
  type SendConnectionRequestInput,
} from '../schemas/connections.schemas'
import type {
  ConnectionRow,
  ConnectionWithProfile,
  ConnectionListFilter,
  MutualConnectionsCountResult,
} from '../types'
import { ZodError } from 'zod'

// Helper for dynamic table access while preserving TypeScript types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const connectionsTable = () => (supabase.from as any)('connections')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const profilesTable = () => (supabase.from as any)('profiles')

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Maps raw Supabase / PostgreSQL database errors to safe, user-friendly messages.
 * Prevents raw internal database schemas, constraint names, or PostgREST error details
 * from leaking to user-facing consumers.
 */
function mapConnectionError(message?: string, code?: string): string {
  if (code === '42501') {
    return 'You do not have permission to perform this action.'
  }
  if (code === 'PGRST116') {
    return 'Connection record not found.'
  }
  if (code === '23505') {
    return 'A connection or request already exists between these users.'
  }
  if (code === '23503') {
    return 'Referenced user profile not found.'
  }
  const lower = (message ?? '').toLowerCase()
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  return 'A database error occurred while processing your connection request. Please try again.'
}

/**
 * Sends a connection request from the current authenticated user to another user.
 *
 * Enforces:
 * - Requester must equal current user (callerUserId)
 * - Self-connection is strictly prevented
 * - Target must represent a valid user profile
 * - Initial status is strictly 'PENDING'
 *
 * @param input - Contains addressee_id
 * @param callerUserId - The authenticated user's ID
 */
export async function sendConnectionRequest(
  input: SendConnectionRequestInput,
  callerUserId: string
): Promise<ApiResponse<ConnectionRow>> {
  if (!isValidUuid(callerUserId)) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Valid caller user ID is required' },
    }
  }

  try {
    const validated = sendConnectionRequestSchema.parse(input)

    if (validated.addressee_id === callerUserId) {
      return {
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Users cannot connect with themselves' },
      }
    }

    // Verify addressee exists as an active profile
    const { data: addressee, error: addresseeError } = await profilesTable()
      .select('id, is_active')
      .eq('id', validated.addressee_id)
      .maybeSingle()

    if (addresseeError) {
      return {
        data: null,
        error: {
          code: 'DATABASE_ERROR',
          message: mapConnectionError(addresseeError.message, addresseeError.code),
        },
      }
    }

    if (!addressee || !addressee.is_active) {
      return {
        data: null,
        error: { code: 'NOT_FOUND', message: 'Target user does not exist or is inactive' },
      }
    }

    // Insert new connection row (PENDING)
    const { data, error } = await connectionsTable()
      .insert({
        requester_id: callerUserId,
        addressee_id: validated.addressee_id,
        status: 'PENDING',
      })
      .select('id, requester_id, addressee_id, status, created_at, updated_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        // Unique index violation on canonical pair
        return {
          data: null,
          error: {
            code: 'CONFLICT',
            message: 'A connection or request already exists between these users',
          },
        }
      }
      return {
        data: null,
        error: { code: 'DATABASE_ERROR', message: mapConnectionError(error.message, error.code) },
      }
    }

    return { data: data as ConnectionRow, error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: { code: 'VALIDATION_ERROR', message: err.errors[0]?.message ?? 'Invalid input' },
      }
    }
    return {
      data: null,
      error: { code: 'UNEXPECTED_ERROR', message: (err as Error).message },
    }
  }
}

/**
 * Accepts a pending connection request. Only the addressee can accept.
 *
 * @param connectionId - UUID of the connection
 * @param callerUserId - The authenticated user's ID
 */
export async function acceptConnectionRequest(
  connectionId: string,
  callerUserId: string
): Promise<ApiResponse<ConnectionRow>> {
  if (!isValidUuid(connectionId) || !isValidUuid(callerUserId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid UUID parameters required' },
    }
  }

  // Fetch current state
  const { data: current, error: fetchError } = await connectionsTable()
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .eq('id', connectionId)
    .maybeSingle()

  if (fetchError) {
    return {
      data: null,
      error: {
        code: 'DATABASE_ERROR',
        message: mapConnectionError(fetchError.message, fetchError.code),
      },
    }
  }

  if (!current) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Connection record not found' } }
  }

  // Enforce that only the addressee can accept
  if (current.addressee_id !== callerUserId) {
    return {
      data: null,
      error: { code: 'FORBIDDEN', message: 'Only the recipient of a connection request can accept it' },
    }
  }

  if (current.status !== 'PENDING') {
    return {
      data: null,
      error: { code: 'BAD_REQUEST', message: `Cannot accept connection with status ${current.status}` },
    }
  }

  const { data, error } = await connectionsTable()
    .update({ status: 'ACCEPTED' })
    .eq('id', connectionId)
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .single()

  if (error) {
    return {
      data: null,
      error: { code: 'DATABASE_ERROR', message: mapConnectionError(error.message, error.code) },
    }
  }

  return { data: data as ConnectionRow, error: null }
}

/**
 * Rejects a pending connection request. Only the addressee can reject.
 *
 * @param connectionId - UUID of the connection
 * @param callerUserId - The authenticated user's ID
 */
export async function rejectConnectionRequest(
  connectionId: string,
  callerUserId: string
): Promise<ApiResponse<ConnectionRow>> {
  if (!isValidUuid(connectionId) || !isValidUuid(callerUserId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid UUID parameters required' },
    }
  }

  const { data: current, error: fetchError } = await connectionsTable()
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .eq('id', connectionId)
    .maybeSingle()

  if (fetchError) {
    return {
      data: null,
      error: {
        code: 'DATABASE_ERROR',
        message: mapConnectionError(fetchError.message, fetchError.code),
      },
    }
  }

  if (!current) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Connection record not found' } }
  }

  // Enforce that only the addressee can reject
  if (current.addressee_id !== callerUserId) {
    return {
      data: null,
      error: { code: 'FORBIDDEN', message: 'Only the recipient of a connection request can reject it' },
    }
  }

  if (current.status !== 'PENDING') {
    return {
      data: null,
      error: { code: 'BAD_REQUEST', message: `Cannot reject connection with status ${current.status}` },
    }
  }

  const { data, error } = await connectionsTable()
    .update({ status: 'REJECTED' })
    .eq('id', connectionId)
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .single()

  if (error) {
    return {
      data: null,
      error: { code: 'DATABASE_ERROR', message: mapConnectionError(error.message, error.code) },
    }
  }

  return { data: data as ConnectionRow, error: null }
}

/**
 * Removes an existing connection or cancels a pending request.
 * Participants can remove PENDING, ACCEPTED, or REJECTED connections.
 * Participants cannot delete BLOCKED connections (moderation only).
 *
 * @param connectionId - UUID of the connection
 * @param callerUserId - The authenticated user's ID
 */
export async function removeConnection(
  connectionId: string,
  callerUserId: string
): Promise<ApiResponse<{ success: boolean }>> {
  if (!isValidUuid(connectionId) || !isValidUuid(callerUserId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid UUID parameters required' },
    }
  }

  const { data: current, error: fetchError } = await connectionsTable()
    .select('id, requester_id, addressee_id, status')
    .eq('id', connectionId)
    .maybeSingle()

  if (fetchError) {
    return { data: null, error: { code: 'DATABASE_ERROR', message: fetchError.message } }
  }

  if (!current) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Connection record not found' } }
  }

  if (current.requester_id !== callerUserId && current.addressee_id !== callerUserId) {
    return {
      data: null,
      error: { code: 'FORBIDDEN', message: 'You are not a participant in this connection' },
    }
  }

  if (current.status === 'BLOCKED') {
    return {
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Blocked connections cannot be deleted by participants',
      },
    }
  }

  const { error } = await connectionsTable().delete().eq('id', connectionId)

  if (error) {
    return {
      data: null,
      error: { code: 'DATABASE_ERROR', message: mapConnectionError(error.message, error.code) },
    }
  }

  return { data: { success: true }, error: null }
}

/**
 * Blocks a target user or sets an existing connection between them to 'BLOCKED'.
 * Either participant can initiate a block.
 *
 * @param targetUserId - UUID of the user to block
 * @param callerUserId - The authenticated user's ID
 */
export async function blockUser(
  targetUserId: string,
  callerUserId: string
): Promise<ApiResponse<ConnectionRow>> {
  if (!isValidUuid(targetUserId) || !isValidUuid(callerUserId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid UUID parameters required' },
    }
  }

  if (targetUserId === callerUserId) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Users cannot block themselves' },
    }
  }

  // Check if a connection row already exists for this pair
  const { data: existing, error: checkError } = await connectionsTable()
    .select('id, requester_id, addressee_id, status')
    .or(
      `and(requester_id.eq.${callerUserId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${callerUserId})`
    )
    .maybeSingle()

  if (checkError) {
    return {
      data: null,
      error: {
        code: 'DATABASE_ERROR',
        message: mapConnectionError(checkError.message, checkError.code),
      },
    }
  }

  if (existing) {
    if (existing.status === 'BLOCKED') {
      return { data: existing as ConnectionRow, error: null }
    }
    // Transition existing row to BLOCKED
    const { data, error } = await connectionsTable()
      .update({ status: 'BLOCKED' })
      .eq('id', existing.id)
      .select('id, requester_id, addressee_id, status, created_at, updated_at')
      .single()

    if (error) {
      return {
        data: null,
        error: { code: 'DATABASE_ERROR', message: mapConnectionError(error.message, error.code) },
      }
    }
    return { data: data as ConnectionRow, error: null }
  }

  // Create a new BLOCKED row
  const { data, error } = await connectionsTable()
    .insert({
      requester_id: callerUserId,
      addressee_id: targetUserId,
      status: 'BLOCKED',
    })
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .single()

  if (error) {
    return {
      data: null,
      error: { code: 'DATABASE_ERROR', message: mapConnectionError(error.message, error.code) },
    }
  }

  return { data: data as ConnectionRow, error: null }
}

/**
 * Lists connections for the specified user, mapped relative to the caller.
 *
 * @param callerUserId - Authenticated user UUID
 * @param filter - Optional filter state ('ALL', 'ACCEPTED', 'PENDING_SENT', 'PENDING_RECEIVED', 'BLOCKED')
 */
export async function listConnections(
  callerUserId: string,
  filter: ConnectionListFilter = 'ACCEPTED'
): Promise<ApiResponse<ConnectionWithProfile[]>> {
  if (!isValidUuid(callerUserId)) {
    return {
      data: null,
      error: { code: 'UNAUTHORIZED', message: 'Valid caller user ID is required' },
    }
  }

  let query = connectionsTable()
    .select(`
      id,
      requester_id,
      addressee_id,
      status,
      created_at,
      updated_at
    `)
    .or(`requester_id.eq.${callerUserId},addressee_id.eq.${callerUserId}`)

  if (filter === 'ACCEPTED') {
    query = query.eq('status', 'ACCEPTED')
  } else if (filter === 'PENDING_SENT') {
    query = query.eq('status', 'PENDING').eq('requester_id', callerUserId)
  } else if (filter === 'PENDING_RECEIVED') {
    query = query.eq('status', 'PENDING').eq('addressee_id', callerUserId)
  } else if (filter === 'BLOCKED') {
    query = query.eq('status', 'BLOCKED')
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    return {
      data: null,
      error: { code: 'DATABASE_ERROR', message: mapConnectionError(error.message, error.code) },
    }
  }

  const rows = (data ?? []) as ConnectionRow[]

  // Collect other user IDs
  const otherUserIds = Array.from(
    new Set(
      rows.map((r) => (r.requester_id === callerUserId ? r.addressee_id : r.requester_id))
    )
  )

  if (otherUserIds.length === 0) {
    return { data: [], error: null }
  }

  // Fetch safe profile summaries for other users
  const { data: profiles, error: profileError } = await profilesTable()
    .select('id, display_name, avatar_url')
    .in('id', otherUserIds)

  if (profileError) {
    return {
      data: null,
      error: {
        code: 'DATABASE_ERROR',
        message: mapConnectionError(profileError.message, profileError.code),
      },
    }
  }

  const profileMap = new Map<string, { id: string; display_name: string | null; avatar_url: string | null }>()
  for (const p of profiles ?? []) {
    profileMap.set(p.id, p)
  }

  const results: ConnectionWithProfile[] = rows.map((r) => {
    const isRequester = r.requester_id === callerUserId
    const otherId = isRequester ? r.addressee_id : r.requester_id
    const otherProfile = profileMap.get(otherId) ?? {
      id: otherId,
      display_name: null,
      avatar_url: null,
    }

    return {
      ...r,
      is_requester: isRequester,
      other_user: otherProfile,
    }
  })

  return { data: results, error: null }
}

/**
 * Calculates the number of mutual connections between two users.
 * Does NOT expose the full connection graph or private user details.
 *
 * @param userAId - First user UUID
 * @param userBId - Second user UUID
 */
export async function getMutualConnectionsCount(
  userAId: string,
  userBId: string
): Promise<ApiResponse<MutualConnectionsCountResult>> {
  if (!isValidUuid(userAId) || !isValidUuid(userBId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid user UUIDs required' },
    }
  }

  if (userAId === userBId) {
    return {
      data: { user_a_id: userAId, user_b_id: userBId, mutual_count: 0 },
      error: null,
    }
  }

  // Fetch accepted connections for user A
  const { data: connectionsA, error: errA } = await connectionsTable()
    .select('requester_id, addressee_id')
    .eq('status', 'ACCEPTED')
    .or(`requester_id.eq.${userAId},addressee_id.eq.${userAId}`)

  if (errA) {
    return {
      data: null,
      error: { code: 'DATABASE_ERROR', message: mapConnectionError(errA.message, errA.code) },
    }
  }

  // Fetch accepted connections for user B
  const { data: connectionsB, error: errB } = await connectionsTable()
    .select('requester_id, addressee_id')
    .eq('status', 'ACCEPTED')
    .or(`requester_id.eq.${userBId},addressee_id.eq.${userBId}`)

  if (errB) {
    return {
      data: null,
      error: { code: 'DATABASE_ERROR', message: mapConnectionError(errB.message, errB.code) },
    }
  }

  // Set of friends of user A (excluding user B)
  const friendsA = new Set<string>()
  for (const c of connectionsA ?? []) {
    const friendId = c.requester_id === userAId ? c.addressee_id : c.requester_id
    if (friendId !== userBId) {
      friendsA.add(friendId)
    }
  }

  // Count mutual friends in connections of user B
  let mutualCount = 0
  for (const c of connectionsB ?? []) {
    const friendId = c.requester_id === userBId ? c.addressee_id : c.requester_id
    if (friendsA.has(friendId)) {
      mutualCount++
    }
  }

  return {
    data: {
      user_a_id: userAId,
      user_b_id: userBId,
      mutual_count: mutualCount,
    },
    error: null,
  }
}

/**
 * Retrieves the connection record between the caller and a specific target user, if one exists.
 *
 * @param callerUserId - Authenticated user UUID
 * @param targetUserId - Target user UUID
 */
export async function getConnectionWithUser(
  callerUserId: string,
  targetUserId: string
): Promise<ApiResponse<ConnectionRow | null>> {
  if (!isValidUuid(callerUserId) || !isValidUuid(targetUserId)) {
    return {
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Valid user UUIDs required' },
    }
  }

  if (callerUserId === targetUserId) {
    return { data: null, error: null }
  }

  const { data, error } = await connectionsTable()
    .select('id, requester_id, addressee_id, status, created_at, updated_at')
    .or(
      `and(requester_id.eq.${callerUserId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${callerUserId})`
    )
    .maybeSingle()

  if (error) {
    return {
      data: null,
      error: { code: 'DATABASE_ERROR', message: mapConnectionError(error.message, error.code) },
    }
  }

  return { data: (data as ConnectionRow) ?? null, error: null }
}

