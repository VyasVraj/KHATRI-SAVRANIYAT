/**
 * Community Groups Service (Phase 10 — Subtask 1)
 *
 * Implements strict domain boundaries:
 * - Direct table mutations are guarded; atomic creation and membership lifecycle
 *   route through canonical PostgreSQL RPCs.
 * - PERSON != USER: Group membership links to user accounts (public.profiles),
 *   never census Person records.
 * - FAMILY != GROUP: Civic and cultural groups exist independently of family lineages.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse, AppError } from '@/types'
import {
  createGroupSchema,
  type CreateGroupFormData,
} from '../schemas/group.schemas'
import type {
  Group,
  GroupMember,
  GroupWithMembership,
  GroupFilters,
  CreateGroupInput,
} from '../types'
import { ZodError } from 'zod'

// Helper accessors for untyped client access before remote code generation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const groupsTable = () => (supabase.from as any)('groups')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const groupMembersTable = () => (supabase.from as any)('group_members')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcCall = (name: string, params: Record<string, unknown>) => (supabase.rpc as any)(name, params)

/**
 * Sanitizes PostgreSQL / Supabase errors into safe, user-facing error messages.
 */
export function sanitizeGroupError(
  err: unknown,
  defaultMessage: string = 'An unexpected error occurred. Please try again.'
): string {
  if (!err) return defaultMessage

  const message =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message ?? ''

  if (message.includes('slug is already taken') || message.includes('already exists')) {
    return 'A group with this URL slug already exists. Please choose a different slug.'
  }

  if (message.includes('already a member')) {
    return 'You are already a member of this group.'
  }

  if (message.includes('private group') || message.includes('Cannot directly join')) {
    return 'This is a private group. An invitation or administrator approval is required to join.'
  }

  if (message.includes('Sole group administrator cannot leave')) {
    return 'As the sole administrator, you cannot leave the group. Please designate another administrator first.'
  }

  if (message.includes('archived or deleted group')) {
    return 'This group is no longer active.'
  }

  if (message.includes('Unauthorized') || message.includes('Authentication required')) {
    return 'You do not have permission to perform this action. Please sign in.'
  }

  return message || defaultMessage
}

function makeAppError(message: string, code: string = 'GROUP_ERROR'): AppError {
  return { message, code }
}

/**
 * Lists community groups with membership status and member counts.
 */
export async function listGroups(
  filters?: GroupFilters,
  callerUserId?: string | null
): Promise<ApiResponse<GroupWithMembership[]>> {
  try {
    let query = groupsTable()
      .select('*')
      .is('deleted_at', null)
      .order('is_verified', { ascending: false })
      .order('name', { ascending: true })

    if (filters?.group_type && filters.group_type !== 'ALL') {
      query = query.eq('group_type', filters.group_type)
    }

    if (filters?.is_verified !== undefined) {
      query = query.eq('is_verified', filters.is_verified)
    }

    const { data: rawGroups, error } = await query

    if (error) {
      return { data: null, error: makeAppError(sanitizeGroupError(error)) }
    }

    const groups: Group[] = (rawGroups || []) as unknown as Group[]

    if (groups.length === 0) {
      return { data: [], error: null }
    }

    const groupIds = groups.map((g) => g.id)

    // Fetch memberships for these groups
    const { data: rawMembers, error: membersError } = await groupMembersTable()
      .select('group_id, user_id, role')
      .in('group_id', groupIds)

    if (membersError) {
      return { data: null, error: makeAppError(sanitizeGroupError(membersError)) }
    }

    const members = (rawMembers || []) as unknown as Array<{
      group_id: string
      user_id: string
      role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
    }>

    // Aggregate member counts and caller membership
    const memberCountsByGroup = new Map<string, number>()
    const callerRoleByGroup = new Map<string, 'ADMIN' | 'MODERATOR' | 'MEMBER'>()

    members.forEach((m) => {
      memberCountsByGroup.set(
        m.group_id,
        (memberCountsByGroup.get(m.group_id) || 0) + 1
      )
      if (callerUserId && m.user_id === callerUserId) {
        callerRoleByGroup.set(m.group_id, m.role)
      }
    })

    let enrichedGroups: GroupWithMembership[] = groups.map((group) => {
      const callerRole = callerRoleByGroup.get(group.id) || null
      return {
        ...group,
        member_count: memberCountsByGroup.get(group.id) || 0,
        caller_role: callerRole,
        is_caller_member: callerRole !== null,
      }
    })

    // Search filter (client-side matching on name, description, location)
    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.trim().toLowerCase()
      enrichedGroups = enrichedGroups.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.description && g.description.toLowerCase().includes(q)) ||
          (g.location && g.location.toLowerCase().includes(q))
      )
    }

    // Membership filter (MY_GROUPS)
    if (filters?.membership_filter === 'MY_GROUPS') {
      enrichedGroups = enrichedGroups.filter((g) => g.is_caller_member)
    }

    return { data: enrichedGroups, error: null }
  } catch (err) {
    return { data: null, error: makeAppError(sanitizeGroupError(err)) }
  }
}

/**
 * Retrieves a single community group by slug with membership details.
 */
export async function getGroupBySlug(
  slug: string,
  callerUserId?: string | null
): Promise<ApiResponse<GroupWithMembership>> {
  try {
    const { data: rawGroup, error } = await groupsTable()
      .select('*')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()

    if (error || !rawGroup) {
      return {
        data: null,
        error: makeAppError(
          error ? sanitizeGroupError(error) : 'Group not found.',
          'NOT_FOUND'
        ),
      }
    }

    const group = rawGroup as unknown as Group

    // Fetch members for this group
    const { data: rawMembers, error: membersError } = await groupMembersTable()
      .select('group_id, user_id, role')
      .eq('group_id', group.id)

    if (membersError) {
      return { data: null, error: makeAppError(sanitizeGroupError(membersError)) }
    }

    const members = (rawMembers || []) as unknown as Array<{
      group_id: string
      user_id: string
      role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
    }>

    let callerRole: 'ADMIN' | 'MODERATOR' | 'MEMBER' | null = null
    if (callerUserId) {
      const callerMembership = members.find((m) => m.user_id === callerUserId)
      if (callerMembership) {
        callerRole = callerMembership.role
      }
    }

    const enriched: GroupWithMembership = {
      ...group,
      member_count: members.length,
      caller_role: callerRole,
      is_caller_member: callerRole !== null,
    }

    return { data: enriched, error: null }
  } catch (err) {
    return { data: null, error: makeAppError(sanitizeGroupError(err)) }
  }
}

/**
 * Atomically creates a community group using the authoritative create_community_group RPC.
 */
export async function createGroup(
  input: CreateGroupInput,
  callerUserId?: string | null
): Promise<ApiResponse<string>> {
  if (!callerUserId) {
    return {
      data: null,
      error: makeAppError('You must be signed in to create a community group.', 'UNAUTHORIZED'),
    }
  }

  try {
    const validated: CreateGroupFormData = createGroupSchema.parse(input)

    const { data, error } = await rpcCall(
      'create_community_group',
      {
        p_name: validated.name.trim(),
        p_slug: validated.slug.trim().toLowerCase(),
        p_description: validated.description?.trim() || null,
        p_group_type: validated.group_type,
        p_location: validated.location?.trim() || null,
        p_is_private: validated.is_private ?? false,
      }
    )

    if (error) {
      return { data: null, error: makeAppError(sanitizeGroupError(error)) }
    }

    return { data: data as string, error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        data: null,
        error: makeAppError(err.errors[0]?.message ?? 'Invalid input.', 'VALIDATION_ERROR'),
      }
    }
    return { data: null, error: makeAppError(sanitizeGroupError(err)) }
  }
}

/**
 * Joins a public community group using the join_community_group RPC.
 */
export async function joinGroup(
  groupId: string,
  callerUserId?: string | null
): Promise<ApiResponse<string>> {
  if (!callerUserId) {
    return {
      data: null,
      error: makeAppError('You must be signed in to join a group.', 'UNAUTHORIZED'),
    }
  }

  try {
    const { data, error } = await rpcCall(
      'join_community_group',
      {
        p_group_id: groupId,
      }
    )

    if (error) {
      return { data: null, error: makeAppError(sanitizeGroupError(error)) }
    }

    return { data: data as string, error: null }
  } catch (err) {
    return { data: null, error: makeAppError(sanitizeGroupError(err)) }
  }
}

/**
 * Leaves a community group using the leave_community_group RPC.
 */
export async function leaveGroup(
  groupId: string,
  callerUserId?: string | null
): Promise<ApiResponse<boolean>> {
  if (!callerUserId) {
    return {
      data: null,
      error: makeAppError('You must be signed in to leave a group.', 'UNAUTHORIZED'),
    }
  }

  try {
    const { data, error } = await rpcCall(
      'leave_community_group',
      {
        p_group_id: groupId,
      }
    )

    if (error) {
      return { data: null, error: makeAppError(sanitizeGroupError(error)) }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    return { data: null, error: makeAppError(sanitizeGroupError(err)) }
  }
}

interface RawGroupMemberRecord {
  id: string
  group_id: string
  user_id: string
  role: 'ADMIN' | 'MODERATOR' | 'MEMBER'
  joined_at: string
  profiles: {
    id: string
    display_name: string | null
    email: string
    avatar_url: string | null
  } | null
}

/**
 * Retrieves members of a specific community group.
 */
export async function getGroupMembers(
  groupId: string
): Promise<ApiResponse<GroupMember[]>> {
  try {
    const { data, error } = await groupMembersTable()
      .select(
        `
        id,
        group_id,
        user_id,
        role,
        joined_at,
        profiles:user_id (
          id,
          display_name,
          email,
          avatar_url
        )
      `
      )
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })

    if (error) {
      return { data: null, error: makeAppError(sanitizeGroupError(error)) }
    }

    const members: GroupMember[] = ((data as unknown as RawGroupMemberRecord[]) || []).map((row) => ({
      id: row.id,
      group_id: row.group_id,
      user_id: row.user_id,
      role: row.role,
      joined_at: row.joined_at,
      profile: row.profiles
        ? {
            id: row.profiles.id,
            display_name: row.profiles.display_name,
            email: row.profiles.email,
            avatar_url: row.profiles.avatar_url,
          }
        : undefined,
    }))

    return { data: members, error: null }
  } catch (err) {
    return { data: null, error: makeAppError(sanitizeGroupError(err)) }
  }
}
