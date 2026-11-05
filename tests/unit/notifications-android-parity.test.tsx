/**
 * Unit Tests: Android-4 Notification UX & Parity
 *
 * Validates:
 * - NotificationFilterTabs category grouping (All, Unread, Family, System, Updates)
 * - NotificationFilterTabs subcategory navigation and unread badge count
 * - NotificationDetailModal (Android Screen 09 parity):
 *   - From / Sender attribution
 *   - Audience and category badges
 *   - "Your deliveries" section
 *   - Safe relative action navigation
 *   - Open-redirect suppression for malicious URLs
 * - NotificationItemRow tour data-attribute and onSelect hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NotificationFilterTabs } from '@/features/notifications/components/NotificationFilterTabs'
import { NotificationDetailModal } from '@/features/notifications/components/NotificationDetailModal'
import { NotificationItemRow } from '@/features/notifications/components/NotificationItemRow'
import type { NotificationItem } from '@/features/notifications/types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const BASE_ITEM: NotificationItem = {
  id: 'notif-101',
  recipient_id: 'user-1',
  actor_id: null,
  category: 'EVENT',
  type: 'event_announcement',
  title: 'Community Holi Celebration',
  body: 'Join the community celebration this Sunday at 10 AM.',
  action_url: '/events/101',
  entity_type: 'events',
  entity_id: 'event-101',
  metadata: {
    sender_name: 'KhatriSetu Community Team',
    audience: 'all',
  },
  read_at: null,
  created_at: '2026-10-20T10:00:00Z',
  deleted_at: null,
}

describe('ANDROID-4: Notification Parity & UX', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('NotificationFilterTabs (Android Screens 07 & 08)', () => {
    it('renders all 5 primary category pill tabs with proper roles', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationFilterTabs, {
          activeTab: 'ALL',
          onSelectTab: vi.fn(),
        })
      )

      expect(html).toContain('role="tablist"')
      expect(html).toContain('All')
      expect(html).toContain('Unread')
      expect(html).toContain('Family')
      expect(html).toContain('System')
      expect(html).toContain('Updates')
      expect(html).toContain('data-tour-target="notification-filter-tabs"')
    })

    it('renders unread count badge when unread tab has unread notifications', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationFilterTabs, {
          activeTab: 'UNREAD',
          onSelectTab: vi.fn(),
          unreadCount: 7,
        })
      )

      expect(html).toContain('7')
      expect(html).toContain('aria-selected="true"')
    })

    it('renders subcategory filter pills when SYSTEM group tab is selected', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationFilterTabs, {
          activeTab: 'SYSTEM',
          onSelectTab: vi.fn(),
          selectedSubCategory: 'ALL',
          onSelectSubCategory: vi.fn(),
        })
      )

      expect(html).toContain('Category:')
      expect(html).toContain('All System')
      expect(html).toContain('Security')
      expect(html).toContain('Claims')
      expect(html).toContain('Verifications')
    })

    it('renders subcategory filter pills when UPDATES group tab is selected', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationFilterTabs, {
          activeTab: 'UPDATES',
          onSelectTab: vi.fn(),
          selectedSubCategory: 'ALL',
          onSelectSubCategory: vi.fn(),
        })
      )

      expect(html).toContain('All Updates')
      expect(html).toContain('Community')
      expect(html).toContain('Events')
      expect(html).toContain('Invitations')
      expect(html).toContain('Connections')
    })
  })

  describe('NotificationDetailModal (Android Screen 09 Parity)', () => {
    it('returns null when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationDetailModal, {
          notification: BASE_ITEM,
          isOpen: false,
          onClose: vi.fn(),
        })
      )

      expect(html).toBe('')
    })

    it('renders full notice detail with sender attribution, audience, and deliveries', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationDetailModal, {
          notification: BASE_ITEM,
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      expect(html).toContain('role="dialog"')
      expect(html).toContain('From')
      expect(html).toContain('KhatriSetu Community Team')
      expect(html).toContain('Audience: all')
      expect(html).toContain('Community Holi Celebration')
      expect(html).toContain('Your deliveries')
      expect(html).toContain('In-app notification delivered (pending view)')
      expect(html).toContain('Open Calendar')
      expect(html).toContain('Close')
    })

    it('does NOT render action button for unsafe or external URLs (open redirect protection)', () => {
      const unsafeItem: NotificationItem = {
        ...BASE_ITEM,
        action_url: 'https://malicious-external-site.com/steal-creds',
      }

      const html = renderToStaticMarkup(
        React.createElement(NotificationDetailModal, {
          notification: unsafeItem,
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      // Button should not be rendered
      expect(html).not.toContain('Open Calendar')
      expect(html).not.toContain('https://malicious-external-site.com')
    })

    it('displays viewed delivery status for read notification', () => {
      const readItem: NotificationItem = {
        ...BASE_ITEM,
        read_at: '2026-10-21T08:00:00Z',
      }

      const html = renderToStaticMarkup(
        React.createElement(NotificationDetailModal, {
          notification: readItem,
          isOpen: true,
          onClose: vi.fn(),
        })
      )

      expect(html).toContain('In-app notification delivered (viewed)')
      expect(html).toContain('Read')
    })
  })

  describe('NotificationItemRow Tour Target & Interaction', () => {
    it('includes data-tour-target attribute on regular row', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationItemRow, {
          notification: BASE_ITEM,
          onSelect: vi.fn(),
        })
      )

      expect(html).toContain('data-tour-target="notification-card-item"')
      expect(html).toContain('Community Holi Celebration')
    })

    it('omits tour target attribute in compact mode', () => {
      const html = renderToStaticMarkup(
        React.createElement(NotificationItemRow, {
          notification: BASE_ITEM,
          compact: true,
        })
      )

      expect(html).not.toContain('data-tour-target="notification-card-item"')
    })
  })
})
