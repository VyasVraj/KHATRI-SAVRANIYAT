import { describe, it, expect } from 'vitest'
import {
  createGroupSchema,
  groupFiltersSchema,
  generateSlugFromName,
} from '@/features/community/schemas/group.schemas'

describe('group.schemas', () => {
  describe('generateSlugFromName', () => {
    it('converts title to clean lowercase slug', () => {
      expect(generateSlugFromName('Kutch Khatri Youth Wing')).toBe(
        'kutch-khatri-youth-wing'
      )
    })

    it('strips special characters and trims spaces', () => {
      expect(generateSlugFromName('  Shri Mandir Committee (Regd.)!  ')).toBe(
        'shri-mandir-committee-regd'
      )
    })

    it('collapses multiple hyphens and whitespace', () => {
      expect(generateSlugFromName('Youth---Wing    Council')).toBe(
        'youth-wing-council'
      )
    })

    it('truncates at 100 characters', () => {
      const longName = 'A'.repeat(120)
      const slug = generateSlugFromName(longName)
      expect(slug.length).toBeLessThanOrEqual(100)
    })
  })

  describe('createGroupSchema', () => {
    it('accepts valid group input', () => {
      const result = createGroupSchema.safeParse({
        name: 'Ahmedabad Mahila Mandal',
        slug: 'ahmedabad-mahila-mandal',
        group_type: 'CULTURAL',
        location: 'Ahmedabad, Gujarat',
        description: 'Community cultural group organizing gatherings.',
        is_private: false,
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty group name', () => {
      const result = createGroupSchema.safeParse({
        name: '   ',
        slug: 'valid-slug',
        group_type: 'OTHER',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0]?.message).toMatch(
          /Group name is required|cannot be empty/i
        )
      }
    })

    it('rejects name exceeding 150 characters', () => {
      const result = createGroupSchema.safeParse({
        name: 'X'.repeat(151),
        slug: 'valid-slug',
        group_type: 'OTHER',
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid slug format', () => {
      const invalidSlugs = ['Invalid Slug', 'slug_with_underscores', 'slug!', 'ab']
      invalidSlugs.forEach((slug) => {
        const result = createGroupSchema.safeParse({
          name: 'Valid Name',
          slug,
          group_type: 'OTHER',
        })
        expect(result.success).toBe(false)
      })
    })

    it('rejects invalid group type', () => {
      const result = createGroupSchema.safeParse({
        name: 'Valid Name',
        slug: 'valid-slug',
        group_type: 'NOT_A_TYPE',
      })
      expect(result.success).toBe(false)
    })

    it('rejects description exceeding 2000 characters', () => {
      const result = createGroupSchema.safeParse({
        name: 'Valid Name',
        slug: 'valid-slug',
        group_type: 'OTHER',
        description: 'D'.repeat(2001),
      })
      expect(result.success).toBe(false)
    })

    it('rejects location exceeding 200 characters', () => {
      const result = createGroupSchema.safeParse({
        name: 'Valid Name',
        slug: 'valid-slug',
        group_type: 'OTHER',
        location: 'L'.repeat(201),
      })
      expect(result.success).toBe(false)
    })

    it('defaults is_private to false when omitted', () => {
      const result = createGroupSchema.parse({
        name: 'Open Group',
        slug: 'open-group',
        group_type: 'VILLAGE_ASSOCIATION',
      })
      expect(result.is_private).toBe(false)
    })
  })

  describe('groupFiltersSchema', () => {
    it('accepts empty filters and applies defaults', () => {
      const result = groupFiltersSchema.parse({})
      expect(result.group_type).toBe('ALL')
      expect(result.membership_filter).toBe('ALL')
    })

    it('accepts valid filter combinations', () => {
      const result = groupFiltersSchema.parse({
        search: 'Youth',
        group_type: 'YOUTH',
        is_verified: true,
        membership_filter: 'MY_GROUPS',
      })
      expect(result.search).toBe('Youth')
      expect(result.group_type).toBe('YOUTH')
      expect(result.is_verified).toBe(true)
      expect(result.membership_filter).toBe('MY_GROUPS')
    })
  })
})
