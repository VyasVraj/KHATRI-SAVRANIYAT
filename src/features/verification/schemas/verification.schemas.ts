/**
 * Verification Feature Validation Schemas (Phase 9 — Subtask 2)
 */

import { z } from 'zod'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'

export const submitVerificationRequestSchema = z.object({
  entityType: z.enum(['PERSON', 'FAMILY'], {
    errorMap: () => ({ message: 'Entity type must be PERSON or FAMILY.' }),
  }),
  entityId: z.string().uuid({ message: 'A valid entity ID (UUID) is required.' }),
  supportingNotes: z
    .string()
    .transform(sanitizeMultilineText)
    .pipe(z.string().max(1000, { message: 'Supporting notes cannot exceed 1000 characters.' }))
    .optional()
    .transform((val) => {
      if (!val) return undefined
      const trimmed = val.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }),
})

export type SubmitVerificationRequestFormData = z.infer<
  typeof submitVerificationRequestSchema
>

export const approveVerificationRequestSchema = z.object({
  requestId: z.string().uuid({ message: 'A valid request ID is required.' }),
})

export type ApproveVerificationRequestFormData = z.infer<
  typeof approveVerificationRequestSchema
>

export const rejectVerificationRequestSchema = z.object({
  requestId: z.string().uuid({ message: 'A valid request ID is required.' }),
  reason: z
    .string()
    .transform(sanitizeText)
    .pipe(
      z
        .string()
        .min(1, { message: 'A rejection reason is required.' })
        .max(1000, { message: 'Rejection reason cannot exceed 1000 characters.' })
    ),
})

export type RejectVerificationRequestFormData = z.infer<
  typeof rejectVerificationRequestSchema
>
