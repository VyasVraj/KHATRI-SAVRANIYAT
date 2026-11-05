/**
 * Zod validation schemas for Community Groups (Phase 10 — Subtask 1)
 */

import { z } from 'zod'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'

export const GROUP_TYPES = [
  'VILLAGE_ASSOCIATION',
  'COMMITTEE',
  'CULTURAL',
  'YOUTH',
  'OTHER',
] as const

export const GROUP_ROLES = ['ADMIN', 'MODERATOR', 'MEMBER'] as const

/**
 * Normalizes and generates a URL-friendly slug from a group title.
 */
export function generateSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

export const createGroupSchema = z.object({
  name: z
    .string()
    .transform(sanitizeText)
    .pipe(
      z
        .string()
        .min(1, 'Group name is required.')
        .max(150, 'Group name must be 150 characters or less.')
    ),
  slug: z
    .string()
    .min(3, 'Slug must be at least 3 characters.')
    .max(100, 'Slug must be 100 characters or less.')
    .regex(
      /^[a-z0-9-]+$/,
      'Slug must contain only lowercase alphanumeric characters and hyphens.'
    ),
  description: z
    .string()
    .transform(sanitizeMultilineText)
    .pipe(z.string().max(2000, 'Description must be 2000 characters or less.'))
    .optional()
    .or(z.literal('')),
  group_type: z.enum(GROUP_TYPES, {
    errorMap: () => ({ message: 'Please select a valid group type.' }),
  }),
  location: z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().max(200, 'Location must be 200 characters or less.'))
    .optional()
    .or(z.literal('')),
  is_private: z.boolean().default(false),
})

export type CreateGroupFormData = z.infer<typeof createGroupSchema>

export const groupFiltersSchema = z.object({
  search: z.string().optional(),
  group_type: z.enum([...GROUP_TYPES, 'ALL']).optional().default('ALL'),
  is_verified: z.boolean().optional(),
  membership_filter: z.enum(['ALL', 'MY_GROUPS']).optional().default('ALL'),
})

export type GroupFiltersFormData = z.infer<typeof groupFiltersSchema>
