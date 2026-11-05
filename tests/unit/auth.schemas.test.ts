/**
 * Unit tests for Auth Zod validation schemas
 */

import { describe, it, expect } from 'vitest'
import {
  signUpSchema,
  signInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  profileUpdateSchema,
} from '@/features/auth/schemas/auth.schemas'

describe('signUpSchema', () => {
  const validSignUp = {
    displayName: 'John Doe',
    email: 'john.doe@example.com',
    password: 'Password123',
    confirmPassword: 'Password123',
  }

  it('accepts valid signup input', () => {
    const result = signUpSchema.safeParse(validSignUp)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('john.doe@example.com')
      expect(result.data.displayName).toBe('John Doe')
    }
  })

  it('normalizes email to lowercase', () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      email: 'JOHN.DOE@Example.COM',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('john.doe@example.com')
    }
  })

  it('rejects invalid email formats', () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      email: 'not-an-email',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Please enter a valid email address')
    }
  })

  it('rejects passwords shorter than 8 characters', () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      password: 'Pass1',
      confirmPassword: 'Pass1',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('at least 8 characters'))).toBe(true)
    }
  })

  it('rejects passwords without an uppercase letter', () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      password: 'password123',
      confirmPassword: 'password123',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('uppercase letter'))).toBe(true)
    }
  })

  it('rejects passwords without a number', () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      password: 'PasswordLetters',
      confirmPassword: 'PasswordLetters',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('at least one number'))).toBe(true)
    }
  })

  it('rejects mismatched passwords', () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      confirmPassword: 'DifferentPassword123',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Passwords do not match')
      expect(result.error.issues[0].path).toContain('confirmPassword')
    }
  })

  it('rejects displayName shorter than 2 characters', () => {
    const result = signUpSchema.safeParse({
      ...validSignUp,
      displayName: 'J',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('at least 2 characters'))).toBe(true)
    }
  })
})

describe('signInSchema', () => {
  it('accepts valid email and password', () => {
    const result = signInSchema.safeParse({
      email: 'user@example.com',
      password: 'anypassword',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty password', () => {
    const result = signInSchema.safeParse({
      email: 'user@example.com',
      password: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email', () => {
    const result = signInSchema.safeParse({
      email: 'bad-email',
      password: 'password123',
    })
    expect(result.success).toBe(false)
  })
})

describe('forgotPasswordSchema', () => {
  it('accepts valid email', () => {
    const result = forgotPasswordSchema.safeParse({
      email: 'user@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = forgotPasswordSchema.safeParse({
      email: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  it('accepts valid matching new passwords meeting complexity', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'NewPassword123',
      confirmPassword: 'NewPassword123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects mismatched new passwords', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'NewPassword123',
      confirmPassword: 'WrongPassword123',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Passwords do not match')
    }
  })
})

describe('profileUpdateSchema', () => {
  it('accepts valid display name and trims whitespace', () => {
    const result = profileUpdateSchema.safeParse({
      display_name: '  Jane Doe  ',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.display_name).toBe('Jane Doe')
    }
  })

  it('rejects empty or whitespace-only display name', () => {
    const result = profileUpdateSchema.safeParse({
      display_name: ' ',
    })
    expect(result.success).toBe(false)
  })
})
