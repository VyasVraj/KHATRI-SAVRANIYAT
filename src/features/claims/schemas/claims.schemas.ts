/**
 * Validation schemas for Person Claims (Phase 8)
 */

import { z } from 'zod'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'

export const submitClaimSchema = z.object({
  personId: z.string().uuid({ message: 'A valid person ID is required.' }),
  evidenceNotes: z
    .string()
    .transform(sanitizeMultilineText)
    .pipe(z.string().max(1000, { message: 'Evidence notes cannot exceed 1000 characters.' }))
    .optional(),
})

export type SubmitClaimFormData = z.infer<typeof submitClaimSchema>

export const cancelClaimSchema = z.object({
  claimId: z.string().uuid({ message: 'A valid claim ID is required.' }),
  personId: z.string().uuid({ message: 'A valid person ID is required.' }),
})

export type CancelClaimFormData = z.infer<typeof cancelClaimSchema>

export const approveClaimSchema = z.object({
  claimId: z.string().uuid({ message: 'A valid claim ID is required.' }),
})

export type ApproveClaimFormData = z.infer<typeof approveClaimSchema>

export const rejectClaimSchema = z.object({
  claimId: z.string().uuid({ message: 'A valid claim ID is required.' }),
  reason: z
    .string()
    .transform(sanitizeText)
    .pipe(
      z
        .string()
        .min(1, { message: 'Rejection reason is required.' })
        .max(1000, { message: 'Rejection reason cannot exceed 1000 characters.' })
    ),
})

export type RejectClaimFormData = z.infer<typeof rejectClaimSchema>
