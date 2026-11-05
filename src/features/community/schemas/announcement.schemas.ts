/**
 * Community Announcements Zod Schemas (Phase 10 — Subtask 2)
 */

import { z } from 'zod'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'

export const ANNOUNCEMENT_TYPES = [
  'GENERAL',
  'URGENT',
  'EVENT',
  'BEREAVEMENT',
  'CELEBRATION',
] as const

export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const

export const announcementTypeEnum = z.enum(ANNOUNCEMENT_TYPES)

export const announcementStatusEnum = z.enum(ANNOUNCEMENT_STATUSES)

export const createAnnouncementSchema = z.object({
  title: z
    .string()
    .transform(sanitizeText)
    .pipe(
      z
        .string()
        .min(1, 'Title is required')
        .max(200, 'Title must not exceed 200 characters')
    ),
  content: z
    .string()
    .transform(sanitizeMultilineText)
    .pipe(
      z
        .string()
        .min(1, 'Content is required')
        .max(10000, 'Content must not exceed 10,000 characters')
    ),
  announcement_type: announcementTypeEnum,
  group_id: z.string().uuid('Invalid group ID').nullable().optional().default(null),
  status: announcementStatusEnum.default('PUBLISHED'),
  is_pinned: z.boolean().default(false),
})

export const updateAnnouncementSchema = z.object({
  id: z.string().uuid('Invalid announcement ID'),
  title: z
    .string()
    .transform(sanitizeText)
    .pipe(
      z
        .string()
        .min(1, 'Title is required')
        .max(200, 'Title must not exceed 200 characters')
    ),
  content: z
    .string()
    .transform(sanitizeMultilineText)
    .pipe(
      z
        .string()
        .min(1, 'Content is required')
        .max(10000, 'Content must not exceed 10,000 characters')
    ),
  announcement_type: announcementTypeEnum,
  status: announcementStatusEnum,
  is_pinned: z.boolean(),
})

export const announcementFiltersSchema = z.object({
  search: z.string().trim().optional(),
  announcement_type: z
    .enum(['ALL', ...ANNOUNCEMENT_TYPES])
    .default('ALL'),
  scope: z.enum(['ALL', 'GLOBAL', 'MY_GROUPS']).default('ALL'),
  group_id: z.string().nullable().optional(),
  status: z.enum(['ALL', ...ANNOUNCEMENT_STATUSES]).default('ALL'),
})

export type CreateAnnouncementFormData = z.infer<typeof createAnnouncementSchema>
export type UpdateAnnouncementFormData = z.infer<typeof updateAnnouncementSchema>
