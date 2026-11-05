/**
 * Zod validation schemas for family invitations (Phase 8 — Subtask 4B)
 */

import { z } from 'zod'
import { FAMILY_ROLES } from '@/constants/app'
import type { FamilyRole } from '@/types'

const roleValues = Object.values(FAMILY_ROLES) as [FamilyRole, ...FamilyRole[]]

export const createFamilyInvitationSchema = z.object({
  familyId: z.string().uuid({ message: 'Valid family ID is required.' }),
  personId: z.string().uuid({ message: 'Valid person ID is required.' }),
  invitedEmail: z
    .string()
    .trim()
    .min(3, { message: 'Email address is too short.' })
    .email({ message: 'A valid recipient email address is required.' })
    .max(255, { message: 'Email address must not exceed 255 characters.' }),
  role: z.enum(roleValues, {
    errorMap: () => ({ message: 'Please select a valid family role.' }),
  }),
  expiresAt: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true
        const parsed = new Date(val)
        return !isNaN(parsed.getTime()) && parsed.getTime() > Date.now()
      },
      { message: 'Expiration date must be in the future.' }
    ),
})

export type CreateFamilyInvitationFormData = z.infer<typeof createFamilyInvitationSchema>

export const acceptInvitationSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, { message: 'Invitation token is required.' }),
})

export type AcceptInvitationFormData = z.infer<typeof acceptInvitationSchema>
