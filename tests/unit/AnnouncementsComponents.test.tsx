/**
 * Unit Tests: Community Announcements UI Components (Phase 10 — Subtask 2)
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnnouncementTypeBadge } from '@/features/community/components/AnnouncementTypeBadge'
import { AnnouncementCard } from '@/features/community/components/AnnouncementCard'
import { AnnouncementFiltersBar } from '@/features/community/components/AnnouncementFiltersBar'
import { AnnouncementDetailModal } from '@/features/community/components/AnnouncementDetailModal'
import { CreateAnnouncementModal } from '@/features/community/components/CreateAnnouncementModal'
import { EditAnnouncementModal } from '@/features/community/components/EditAnnouncementModal'
import type { Announcement, AnnouncementFilters } from '@/features/community/types'

describe('Community Announcements UI Components', () => {
  describe('AnnouncementTypeBadge', () => {
    it('renders human-readable labels for all announcement categories', () => {
      const html1 = renderToStaticMarkup(<AnnouncementTypeBadge type="GENERAL" />)
      expect(html1).toContain('Notice')

      const html2 = renderToStaticMarkup(<AnnouncementTypeBadge type="URGENT" />)
      expect(html2).toContain('Urgent')

      const html3 = renderToStaticMarkup(<AnnouncementTypeBadge type="EVENT" />)
      expect(html3).toContain('Event')

      const html4 = renderToStaticMarkup(<AnnouncementTypeBadge type="BEREAVEMENT" />)
      expect(html4).toContain('Obituary')

      const html5 = renderToStaticMarkup(<AnnouncementTypeBadge type="CELEBRATION" />)
      expect(html5).toContain('Celebration')
    })
  })

  describe('AnnouncementCard', () => {
    const baseAnnouncement: Announcement = {
      id: 'ann-test-1',
      title: 'Community Navratri Utsav 2026',
      content: 'Join us for 9 days of Garba and cultural festivities in Bhuj.',
      announcement_type: 'CELEBRATION',
      status: 'PUBLISHED',
      group_id: 'grp-1',
      group_name: 'Bhuj Youth Wing',
      group_slug: 'bhuj-youth-wing',
      author_id: 'usr-1',
      author_name: 'Bhuj Coordinator',
      author_email: 'coord@example.com',
      author: {
        id: 'usr-1',
        display_name: 'Bhuj Coordinator',
        email: 'coord@example.com',
        avatar_url: null,
      },
      is_pinned: true,
      published_at: '2026-10-07T10:00:00Z',
      created_at: '2026-10-07T10:00:00Z',
      updated_at: '2026-10-07T10:00:00Z',
      deleted_at: null,
    }

    it('renders announcement title, pinned banner, type badge, and group attribution', () => {
      const html = renderToStaticMarkup(
        <AnnouncementCard
          announcement={baseAnnouncement}
          onView={vi.fn()}
        />
      )

      expect(html).toContain('Community Navratri Utsav 2026')
      expect(html).toContain('Pinned')
      expect(html).toContain('Celebration')
      expect(html).toContain('Bhuj Youth Wing')
      expect(html).toContain('Bhuj Coordinator')
    })

    it('renders Community-Wide label when group_id is null', () => {
      const globalAnnouncement: Announcement = {
        ...baseAnnouncement,
        group_id: null,
        group_name: null,
        is_pinned: false,
      }

      const html = renderToStaticMarkup(
        <AnnouncementCard
          announcement={globalAnnouncement}
          onView={vi.fn()}
        />
      )

      expect(html).toContain('Community-Wide')
      expect(html).not.toContain('Pinned')
    })
  })

  describe('AnnouncementFiltersBar', () => {
    it('renders search input, scope toggles, and category filters', () => {
      const filters: AnnouncementFilters = {
        search: 'sneh milan',
        announcement_type: 'EVENT',
        scope: 'GLOBAL',
      }

      const html = renderToStaticMarkup(
        <AnnouncementFiltersBar
          filters={filters}
          onChange={vi.fn()}
          isAuthenticated={true}
        />
      )

      expect(html).toContain('value="sneh milan"')
      expect(html).toContain('Community-Wide')
      expect(html).toContain('My Groups')
      expect(html).toContain('All Notices')
      expect(html).toContain('Events')
    })

    it('hides My Groups scope button when unauthenticated', () => {
      const filters: AnnouncementFilters = { scope: 'ALL' }

      const html = renderToStaticMarkup(
        <AnnouncementFiltersBar
          filters={filters}
          onChange={vi.fn()}
          isAuthenticated={false}
        />
      )

      expect(html).not.toContain('My Groups')
    })
  })

  describe('AnnouncementDetailModal', () => {
    const announcement: Announcement = {
      id: 'ann-detail-1',
      title: 'Full Details of Blood Donation Camp',
      content: 'Detailed medical requirements, venue address, and refreshments.',
      announcement_type: 'URGENT',
      status: 'PUBLISHED',
      group_id: null,
      author_id: 'usr-1',
      author_name: 'Dr. Shah',
      author: {
        id: 'usr-1',
        display_name: 'Dr. Shah',
        email: 'dr@example.com',
        avatar_url: null,
      },
      is_pinned: false,
      published_at: '2026-10-07T08:00:00Z',
      created_at: '2026-10-07T08:00:00Z',
      updated_at: '2026-10-07T08:00:00Z',
      deleted_at: null,
    }

    it('renders full announcement content when open', () => {
      const html = renderToStaticMarkup(
        <AnnouncementDetailModal
          announcement={announcement}
          isOpen={true}
          onClose={vi.fn()}
        />
      )

      expect(html).toContain('Full Details of Blood Donation Camp')
      expect(html).toContain('Detailed medical requirements')
      expect(html).toContain('Dr. Shah')
    })

    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <AnnouncementDetailModal
          announcement={announcement}
          isOpen={false}
          onClose={vi.fn()}
        />
      )

      expect(html).toBe('')
    })
  })

  describe('CreateAnnouncementModal', () => {
    it('renders form inputs and options when open', () => {
      const html = renderToStaticMarkup(
        <CreateAnnouncementModal
          isOpen={true}
          onClose={vi.fn()}
          userManagedGroups={[{ id: 'g-1', name: 'Youth Committee' }]}
          isGlobalModerator={true}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toContain('New Community Announcement')
      expect(html).toContain('Create Announcement')
      expect(html).toContain('Youth Committee')
    })

    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <CreateAnnouncementModal
          isOpen={false}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toBe('')
    })
  })

  describe('EditAnnouncementModal', () => {
    const announcement: Announcement = {
      id: 'ann-edit-1',
      title: 'Existing Notice Title',
      content: 'Existing notice content.',
      announcement_type: 'GENERAL',
      status: 'PUBLISHED',
      group_id: null,
      author_id: 'usr-1',
      is_pinned: false,
      published_at: '2026-10-07T00:00:00Z',
      created_at: '2026-10-07T00:00:00Z',
      updated_at: '2026-10-07T00:00:00Z',
      deleted_at: null,
    }

    it('renders edit modal form when open with announcement', () => {
      const html = renderToStaticMarkup(
        <EditAnnouncementModal
          announcement={announcement}
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toContain('Edit Announcement')
      expect(html).toContain('Save Changes')
    })

    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <EditAnnouncementModal
          announcement={announcement}
          isOpen={false}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toBe('')
    })
  })
})
