/**
 * Community Announcements Service (Phase 10 — Subtask 2)
 *
 * Implements strict domain boundaries:
 * - Direct table mutations are guarded; announcement creation and lifecycle updates
 *   route strictly through canonical PostgreSQL RPCs.
 * - PERSON != USER: Announcement author links to user account (public.profiles / auth.users).
 * - FAMILY != GROUP: Announcements are community or group broadcasts, independent of family lineages.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse, AppError } from '@/types'
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from '../schemas/announcement.schemas'
import type {
  Announcement,
  AnnouncementFilters,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from '../types'
import { ZodError } from 'zod'

// Helper accessors for untyped client access before remote code generation
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const announcementsTable = () => (supabase.from as any)('announcements')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const groupMembersTable = () => (supabase.from as any)('group_members')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpcCall = (name: string, params: Record<string, unknown>) => (supabase.rpc as any)(name, params)

/**
 * Sanitizes PostgreSQL / Supabase errors into safe, user-facing error messages.
 */
export function sanitizeAnnouncementError(
  err: unknown,
  defaultMessage: string = 'An unexpected error occurred. Please try again.'
): string {
  if (!err) return defaultMessage

  const message =
    typeof err === 'string'
      ? err
      : (err as { message?: string })?.message ?? ''

  if (message.includes('global community announcements')) {
    return 'Only community moderators can post or modify global community announcements.'
  }
  if (
    message.includes('group administrators') ||
    message.includes('group managers')
  ) {
    return 'Only group administrators or community moderators can post or modify announcements for this group.'
  }
  if (message.includes('Unauthorized') || message.includes('42501')) {
    return 'You do not have permission to perform this action.'
  }

  if (message.includes('does not exist') || message.includes('P0002')) {
    return 'The requested announcement or target group could not be found.'
  }

  if (message.includes('Title must not exceed') || message.includes('Content must not exceed')) {
    return message
  }

  return defaultMessage
}

/**
 * Lists announcements with optional filters.
 */
export async function listAnnouncements(
  filters?: AnnouncementFilters,
  callerUserId?: string
): Promise<ApiResponse<Announcement[]>> {
  try {
    let query = announcementsTable()
      .select(`
        id,
        title,
        content,
        announcement_type,
        status,
        group_id,
        author_id,
        is_pinned,
        published_at,
        created_at,
        updated_at,
        deleted_at,
        author:profiles!author_id (
          id,
          display_name,
          email,
          avatar_url
        ),
        group:groups (
          id,
          name,
          slug
        )
      `)
      .is('deleted_at', null)

    // Filter by type
    if (filters?.announcement_type && filters.announcement_type !== 'ALL') {
      query = query.eq('announcement_type', filters.announcement_type)
    }

    // Filter by status (defaults to PUBLISHED for standard views)
    if (filters?.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status)
    } else if (!filters?.status) {
      query = query.eq('status', 'PUBLISHED')
    }

    // Filter by specific group
    if (filters?.group_id && filters.group_id !== 'ALL') {
      query = query.eq('group_id', filters.group_id)
    }

    // Scope filter: GLOBAL vs MY_GROUPS
    if (filters?.scope === 'GLOBAL') {
      query = query.is('group_id', null)
    } else if (filters?.scope === 'MY_GROUPS' && callerUserId) {
      const { data: myMemberships } = await groupMembersTable()
        .select('group_id')
        .eq('user_id', callerUserId)

      const myGroupIds = (myMemberships || []).map(
        (m: { group_id: string }) => m.group_id
      )

      if (myGroupIds.length > 0) {
        query = query.in('group_id', myGroupIds)
      } else {
        // User is not in any groups
        return { data: [], error: null }
      }
    }

    // Ordering: pinned first, then newest published
    query = query
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      const appErr: AppError = {
        code: error.code || 'ANNOUNCEMENTS_QUERY_ERROR',
        message: sanitizeAnnouncementError(error),
      }
      return { data: null, error: appErr }
    }

    // Client-side text search if specified
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let items: Announcement[] = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      announcement_type: row.announcement_type,
      status: row.status,
      group_id: row.group_id,
      group_name: row.group?.name || null,
      group_slug: row.group?.slug || null,
      author_id: row.author_id,
      author_name: row.author?.display_name || null,
      author_email: row.author?.email || null,
      author_avatar: row.author?.avatar_url || null,
      is_pinned: row.is_pinned,
      published_at: row.published_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      author: row.author
        ? {
            id: row.author.id,
            display_name: row.author.display_name,
            email: row.author.email,
            avatar_url: row.author.avatar_url,
          }
        : undefined,
      can_manage: callerUserId ? row.author_id === callerUserId : false,
    }))

    if (filters?.search && filters.search.trim().length > 0) {
      const q = filters.search.toLowerCase().trim()
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q) ||
          (item.group_name && item.group_name.toLowerCase().includes(q))
      )
    }

    return { data: items, error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'ANNOUNCEMENTS_FETCH_ERROR',
      message: sanitizeAnnouncementError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Retrieves a single announcement by ID.
 */
export async function getAnnouncementById(
  id: string,
  callerUserId?: string
): Promise<ApiResponse<Announcement>> {
  try {
    const { data, error } = await announcementsTable()
      .select(`
        id,
        title,
        content,
        announcement_type,
        status,
        group_id,
        author_id,
        is_pinned,
        published_at,
        created_at,
        updated_at,
        deleted_at,
        author:profiles!author_id (
          id,
          display_name,
          email,
          avatar_url
        ),
        group:groups (
          id,
          name,
          slug
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      const appErr: AppError = {
        code: error.code || 'ANNOUNCEMENT_FETCH_ERROR',
        message: sanitizeAnnouncementError(error),
      }
      return { data: null, error: appErr }
    }

    if (!data) {
      const appErr: AppError = {
        code: 'ANNOUNCEMENT_NOT_FOUND',
        message: 'The requested announcement could not be found.',
      }
      return { data: null, error: appErr }
    }

    const announcement: Announcement = {
      id: data.id,
      title: data.title,
      content: data.content,
      announcement_type: data.announcement_type,
      status: data.status,
      group_id: data.group_id,
      group_name: data.group?.name || null,
      group_slug: data.group?.slug || null,
      author_id: data.author_id,
      author_name: data.author?.display_name || null,
      author_email: data.author?.email || null,
      author_avatar: data.author?.avatar_url || null,
      is_pinned: data.is_pinned,
      published_at: data.published_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
      deleted_at: data.deleted_at,
      author: data.author
        ? {
            id: data.author.id,
            display_name: data.author.display_name,
            email: data.author.email,
            avatar_url: data.author.avatar_url,
          }
        : undefined,
      can_manage: callerUserId ? data.author_id === callerUserId : false,
    }

    return { data: announcement, error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'ANNOUNCEMENT_FETCH_ERROR',
      message: sanitizeAnnouncementError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Creates an announcement authoritatively via create_community_announcement RPC.
 */
export async function createAnnouncement(
  input: CreateAnnouncementInput
): Promise<ApiResponse<string>> {
  try {
    const validated = createAnnouncementSchema.parse(input)

    const { data, error } = await rpcCall('create_community_announcement', {
      p_title: validated.title,
      p_content: validated.content,
      p_announcement_type: validated.announcement_type,
      p_group_id: validated.group_id || null,
      p_status: validated.status,
      p_is_pinned: validated.is_pinned,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'ANNOUNCEMENT_CREATE_ERROR',
        message: sanitizeAnnouncementError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: data as string, error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      const appErr: AppError = {
        code: 'VALIDATION_ERROR',
        message: err.errors[0]?.message || 'Invalid announcement data.',
      }
      return { data: null, error: appErr }
    }

    const appErr: AppError = {
      code: 'ANNOUNCEMENT_CREATE_ERROR',
      message: sanitizeAnnouncementError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Updates an announcement authoritatively via update_community_announcement RPC.
 */
export async function updateAnnouncement(
  input: UpdateAnnouncementInput
): Promise<ApiResponse<boolean>> {
  try {
    const validated = updateAnnouncementSchema.parse(input)

    const { data, error } = await rpcCall('update_community_announcement', {
      p_announcement_id: validated.id,
      p_title: validated.title,
      p_content: validated.content,
      p_announcement_type: validated.announcement_type,
      p_status: validated.status,
      p_is_pinned: validated.is_pinned,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'ANNOUNCEMENT_UPDATE_ERROR',
        message: sanitizeAnnouncementError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    if (err instanceof ZodError) {
      const appErr: AppError = {
        code: 'VALIDATION_ERROR',
        message: err.errors[0]?.message || 'Invalid announcement data.',
      }
      return { data: null, error: appErr }
    }

    const appErr: AppError = {
      code: 'ANNOUNCEMENT_UPDATE_ERROR',
      message: sanitizeAnnouncementError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Archives an announcement authoritatively via archive_community_announcement RPC.
 */
export async function archiveAnnouncement(
  id: string
): Promise<ApiResponse<boolean>> {
  try {
    const { data, error } = await rpcCall('archive_community_announcement', {
      p_announcement_id: id,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'ANNOUNCEMENT_ARCHIVE_ERROR',
        message: sanitizeAnnouncementError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'ANNOUNCEMENT_ARCHIVE_ERROR',
      message: sanitizeAnnouncementError(err),
    }
    return { data: null, error: appErr }
  }
}

/**
 * Soft-deletes an announcement authoritatively via delete_community_announcement RPC.
 */
export async function deleteAnnouncement(
  id: string
): Promise<ApiResponse<boolean>> {
  try {
    const { data, error } = await rpcCall('delete_community_announcement', {
      p_announcement_id: id,
    })

    if (error) {
      const appErr: AppError = {
        code: error.code || 'ANNOUNCEMENT_DELETE_ERROR',
        message: sanitizeAnnouncementError(error),
      }
      return { data: null, error: appErr }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    const appErr: AppError = {
      code: 'ANNOUNCEMENT_DELETE_ERROR',
      message: sanitizeAnnouncementError(err),
    }
    return { data: null, error: appErr }
  }
}
