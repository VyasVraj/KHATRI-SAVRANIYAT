/**
 * Auth Zod validation schemas
 *
 * Used with React Hook Form + zodResolver on all auth forms.
 * Frontend UX validation — final authorization is always server-side/DB-level.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared field validators
// ---------------------------------------------------------------------------

const emailField = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .max(254, 'Email address is too long')
  .transform((v) => v.toLowerCase().trim())

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must not exceed 72 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

const displayNameField = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters')
  .transform((v) => v.trim())

// ---------------------------------------------------------------------------
// Sign Up
// ---------------------------------------------------------------------------

export const signUpSchema = z
  .object({
    displayName: displayNameField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type SignUpInput = z.infer<typeof signUpSchema>

// ---------------------------------------------------------------------------
// Sign In
// ---------------------------------------------------------------------------

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
})

export type SignInInput = z.infer<typeof signInSchema>

// ---------------------------------------------------------------------------
// Forgot Password
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = z.object({
  email: emailField,
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

// ---------------------------------------------------------------------------
// Reset Password
// ---------------------------------------------------------------------------

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

// ---------------------------------------------------------------------------
// Profile Update
// ---------------------------------------------------------------------------

export const profileUpdateSchema = z.object({
  display_name: displayNameField,
})

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
