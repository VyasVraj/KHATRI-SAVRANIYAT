/**
 * Unit tests for Discovery Zod Schemas
 *
 * Validates:
 * - Person discovery filters (field bounds, normalization, unsupported field rejection)
 * - Family discovery filters (field bounds, normalization, unsupported field rejection)
 * - Discovery pagination bounds (page >= 1, 1 <= pageSize <= 50, extra fields rejection)
 */

import { describe, it, expect } from 'vitest'
import {
  personDiscoveryFilterSchema,
  familyDiscoveryFilterSchema,
  discoveryPaginationSchema,
} from '@/features/discover/schemas/discovery.schemas'

// ---------------------------------------------------------------------------
// Person Discovery Filter Schema Tests
// ---------------------------------------------------------------------------

describe('Discovery Schemas — personDiscoveryFilterSchema', () => {
  it('accepts valid person discovery filters', () => {
    const input = {
      search: 'Arjun',
      gotra: 'Kashyap',
      kul: 'Aditya',
      nukh: 'Varun',
      birth_place: 'Bhuj',
      status: 'ACTIVE' as const,
      verification_status: 'VERIFIED' as const,
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        search: 'Arjun',
        gotra: 'Kashyap',
        kul: 'Aditya',
        nukh: 'Varun',
        birth_place: 'Bhuj',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      })
    }
  })

  it('accepts empty filter object and normalizes to undefined values', () => {
    const result = personDiscoveryFilterSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        search: undefined,
        gotra: undefined,
        kul: undefined,
        nukh: undefined,
        birth_place: undefined,
        status: undefined,
        verification_status: undefined,
      })
    }
  })

  it('trims whitespace and converts empty strings to undefined', () => {
    const input = {
      search: '   ',
      gotra: '  Kashyap  ',
      nukh: '',
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.search).toBeUndefined()
      expect(result.data.gotra).toBe('Kashyap')
      expect(result.data.nukh).toBeUndefined()
    }
  })

  it('maps query alias to search when search is omitted', () => {
    const input = {
      query: 'Ramesh',
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.search).toBe('Ramesh')
    }
  })

  it('prefers search over query if both are provided', () => {
    const input = {
      search: 'PrimarySearch',
      query: 'FallbackQuery',
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.search).toBe('PrimarySearch')
    }
  })

  it('rejects invalid person status enum value', () => {
    const input = {
      status: 'NON_EXISTENT_STATUS' as never,
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Invalid person status')
    }
  })

  it('rejects invalid verification status enum value', () => {
    const input = {
      verification_status: 'UNKNOWN' as never,
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Invalid verification status')
    }
  })

  it('rejects filter strings longer than 100 characters', () => {
    const input = {
      gotra: 'A'.repeat(101),
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects unsupported city field on persons', () => {
    const input = {
      city: 'Mumbai',
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('unrecognized_keys')
    }
  })

  it('rejects unsupported state and country fields on persons', () => {
    const input = {
      state: 'Gujarat',
      country: 'India',
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects unsupported native_place field on persons', () => {
    const input = {
      native_place: 'Anjar',
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects unsupported mukhi field on persons', () => {
    const input = {
      mukhi: 'Zone-1',
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects arbitrary unrecognized keys', () => {
    const input = {
      random_column_attack: 'DROP TABLE',
    }

    const result = personDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Family Discovery Filter Schema Tests
// ---------------------------------------------------------------------------

describe('Discovery Schemas — familyDiscoveryFilterSchema', () => {
  it('accepts valid family discovery filters', () => {
    const input = {
      search: 'Vardhan',
      family_name: 'Vardhan Family',
      gotra: 'Gautam',
      kul: 'Surya',
      nukh: 'Chauhan',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      status: 'ACTIVE' as const,
      verification_status: 'VERIFIED' as const,
    }

    const result = familyDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        search: 'Vardhan',
        family_name: 'Vardhan Family',
        gotra: 'Gautam',
        kul: 'Surya',
        nukh: 'Chauhan',
        city: 'Pune',
        state: 'Maharashtra',
        country: 'India',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      })
    }
  })

  it('accepts empty family filter object and normalizes to undefined', () => {
    const result = familyDiscoveryFilterSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.family_name).toBeUndefined()
      expect(result.data.city).toBeUndefined()
    }
  })

  it('trims whitespace and converts empty strings to undefined', () => {
    const input = {
      family_name: '   ',
      city: '  Ahmedabad  ',
    }

    const result = familyDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.family_name).toBeUndefined()
      expect(result.data.city).toBe('Ahmedabad')
    }
  })

  it('rejects invalid family status enum value', () => {
    const input = {
      status: 'DECEASED' as never, // DECEASED is person_status, not family_status
    }

    const result = familyDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Invalid family status')
    }
  })

  it('rejects unsupported native_place field on families', () => {
    const input = {
      native_place: 'Mandvi',
    }

    const result = familyDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('unrecognized_keys')
    }
  })

  it('rejects unsupported mukhi field on families', () => {
    const input = {
      mukhi: 'Leader-5',
    }

    const result = familyDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('rejects arbitrary unrecognized keys', () => {
    const input = {
      custom_sql: 'SELECT 1',
    }

    const result = familyDiscoveryFilterSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Discovery Pagination Schema Tests
// ---------------------------------------------------------------------------

describe('Discovery Schemas — discoveryPaginationSchema', () => {
  it('applies default page (1) and pageSize (20)', () => {
    const result = discoveryPaginationSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(20)
    }
  })

  it('accepts custom valid page and pageSize', () => {
    const result = discoveryPaginationSchema.safeParse({ page: 3, pageSize: 50 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
      expect(result.data.pageSize).toBe(50)
    }
  })

  it('rejects page < 1', () => {
    const result = discoveryPaginationSchema.safeParse({ page: 0 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Page must be at least 1')
    }
  })

  it('rejects negative page', () => {
    const result = discoveryPaginationSchema.safeParse({ page: -5 })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer page', () => {
    const result = discoveryPaginationSchema.safeParse({ page: 1.5 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Page must be an integer')
    }
  })

  it('rejects pageSize < 1', () => {
    const result = discoveryPaginationSchema.safeParse({ pageSize: 0 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Page size must be at least 1')
    }
  })

  it('rejects pageSize > 50 (anti-scraping maximum ceiling)', () => {
    const result = discoveryPaginationSchema.safeParse({ pageSize: 51 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Page size cannot exceed 50')
    }
  })

  it('rejects non-integer pageSize', () => {
    const result = discoveryPaginationSchema.safeParse({ pageSize: 25.5 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Page size must be an integer')
    }
  })

  it('rejects extra unrecognized fields in pagination', () => {
    const result = discoveryPaginationSchema.safeParse({
      page: 1,
      pageSize: 20,
      orderBy: 'arbitrary_column',
    })
    expect(result.success).toBe(false)
  })
})
