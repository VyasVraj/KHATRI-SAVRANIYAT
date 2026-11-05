import { describe, it, expect } from 'vitest'
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  announcementFiltersSchema,
  ANNOUNCEMENT_TYPES,
  ANNOUNCEMENT_STATUSES,
} from '@/features/community/schemas/announcement.schemas'

describe('announcement.schemas', () => {
  describe('constants', () => {
    it('defines expected announcement types', () => {
      expect(ANNOUNCEMENT_TYPES).toEqual([
        'GENERAL',
        'URGENT',
        'EVENT',
        'BEREAVEMENT',
        'CELEBRATION',
      ])
    })

    it('defines expected announcement statuses', () => {
      expect(ANNOUNCEMENT_STATUSES).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
    })
  })

  describe('createAnnouncementSchema', () => {
    it('accepts valid global announcement payload', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Community Annual Gathering 2026',
        content: 'Please join us for the annual community celebration in December.',
        announcement_type: 'EVENT',
        group_id: null,
        status: 'PUBLISHED',
        is_pinned: false,
      })
      expect(result.success).toBe(true)
    })

    it('accepts valid group announcement payload with UUID group_id', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Youth Sports Day Registration Open',
        content: 'Register your teams before October 31.',
        announcement_type: 'GENERAL',
        group_id: '123e4567-e89b-12d3-a456-426614174000',
        status: 'PUBLISHED',
        is_pinned: true,
      })
      expect(result.success).toBe(true)
    })

    it('defaults status to PUBLISHED and is_pinned to false if omitted', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Important Notice',
        content: 'Details here.',
        announcement_type: 'URGENT',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.status).toBe('PUBLISHED')
        expect(result.data.is_pinned).toBe(false)
        expect(result.data.group_id).toBeNull()
      }
    })

    it('rejects empty or whitespace-only title', () => {
      const result = createAnnouncementSchema.safeParse({
        title: '   ',
        content: 'Some content.',
        announcement_type: 'GENERAL',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0]?.message).toMatch(
          /Title is required|cannot be empty/i
        )
      }
    })

    it('rejects title longer than 200 characters', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'A'.repeat(201),
        content: 'Some content.',
        announcement_type: 'GENERAL',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0]?.message).toMatch(
          /Title must not exceed 200 characters/i
        )
      }
    })

    it('rejects empty or whitespace-only content', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Valid Title',
        content: '  \n  ',
        announcement_type: 'GENERAL',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0]?.message).toMatch(
          /Content is required|cannot be empty/i
        )
      }
    })

    it('rejects content longer than 10000 characters', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Valid Title',
        content: 'A'.repeat(10001),
        announcement_type: 'GENERAL',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0]?.message).toMatch(
          /Content must not exceed 10,?000 characters/i
        )
      }
    })

    it('rejects invalid announcement type', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Valid Title',
        content: 'Valid content.',
        announcement_type: 'INVALID_CATEGORY',
      })
      expect(result.success).toBe(false)
    })

    it('rejects non-UUID group_id string', () => {
      const result = createAnnouncementSchema.safeParse({
        title: 'Valid Title',
        content: 'Valid content.',
        announcement_type: 'GENERAL',
        group_id: 'not-a-uuid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.errors[0]?.message).toMatch(/Invalid group ID/i)
      }
    })
  })

  describe('updateAnnouncementSchema', () => {
    it('accepts valid update input', () => {
      const result = updateAnnouncementSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Updated Title',
        content: 'Updated content here.',
        announcement_type: 'URGENT',
        status: 'PUBLISHED',
        is_pinned: true,
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid UUID in update schema', () => {
      const result = updateAnnouncementSchema.safeParse({
        id: 'bad-id',
        title: 'Updated Title',
        content: 'Updated content here.',
        announcement_type: 'URGENT',
        status: 'PUBLISHED',
        is_pinned: false,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('announcementFiltersSchema', () => {
    it('accepts valid filters', () => {
      const result = announcementFiltersSchema.safeParse({
        search: 'festival',
        announcement_type: 'CELEBRATION',
        scope: 'GLOBAL',
        status: 'PUBLISHED',
      })
      expect(result.success).toBe(true)
    })

    it('accepts ALL for announcement_type and status', () => {
      const result = announcementFiltersSchema.safeParse({
        announcement_type: 'ALL',
        status: 'ALL',
        scope: 'ALL',
      })
      expect(result.success).toBe(true)
    })

    it('rejects invalid scope string', () => {
      const result = announcementFiltersSchema.safeParse({
        scope: 'INVALID_SCOPE',
      })
      expect(result.success).toBe(false)
    })
  })
})
