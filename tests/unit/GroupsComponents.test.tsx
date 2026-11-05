/**
 * Unit Tests: Community Groups UI Components (Phase 10 — Subtask 1)
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GroupTypeBadge } from '@/features/community/components/GroupTypeBadge'
import { GroupCard } from '@/features/community/components/GroupCard'
import { GroupFiltersBar } from '@/features/community/components/GroupFiltersBar'
import { CreateGroupModal } from '@/features/community/components/CreateGroupModal'
import type { GroupWithMembership, GroupFilters } from '@/features/community/types'

describe('Community Groups UI Components', () => {
  describe('GroupTypeBadge', () => {
    it('renders human-readable labels for group categories', () => {
      const html1 = renderToStaticMarkup(
        <GroupTypeBadge type="VILLAGE_ASSOCIATION" />
      )
      expect(html1).toContain('Village / Watan')

      const html2 = renderToStaticMarkup(<GroupTypeBadge type="COMMITTEE" />)
      expect(html2).toContain('Committee')

      const html3 = renderToStaticMarkup(<GroupTypeBadge type="CULTURAL" />)
      expect(html3).toContain('Cultural')

      const html4 = renderToStaticMarkup(<GroupTypeBadge type="YOUTH" />)
      expect(html4).toContain('Youth Wing')

      const html5 = renderToStaticMarkup(<GroupTypeBadge type="OTHER" />)
      expect(html5).toContain('Community Group')
    })
  })

  describe('GroupCard', () => {
    const baseGroup: GroupWithMembership = {
      id: 'g-test-1',
      name: 'Bhuj Youth Circle',
      slug: 'bhuj-youth-circle',
      description: 'Active youth body organizing community sports.',
      group_type: 'YOUTH',
      location: 'Bhuj, Kutch',
      is_verified: true,
      is_private: false,
      created_by: 'creator-1',
      created_at: '2026-10-07T00:00:00Z',
      updated_at: '2026-10-07T00:00:00Z',
      deleted_at: null,
      member_count: 42,
      caller_role: null,
      is_caller_member: false,
    }

    it('renders group metadata, badges, and Join button for non-members', () => {
      const html = renderToStaticMarkup(
        <GroupCard
          group={baseGroup}
          onJoin={vi.fn()}
          onLeave={vi.fn()}
          isAuthenticated={true}
        />
      )

      expect(html).toContain('Bhuj Youth Circle')
      expect(html).toContain('Bhuj, Kutch')
      expect(html).toContain('42 members')
      expect(html).toContain('Verified')
      expect(html).toContain('Join Group')
      expect(html).toContain('Not joined')
    })

    it('renders Leave button and role badge when caller is a member', () => {
      const memberGroup: GroupWithMembership = {
        ...baseGroup,
        is_caller_member: true,
        caller_role: 'ADMIN',
      }

      const html = renderToStaticMarkup(
        <GroupCard
          group={memberGroup}
          onJoin={vi.fn()}
          onLeave={vi.fn()}
          isAuthenticated={true}
        />
      )

      expect(html).toContain('Leave')
      expect(html).toContain('Admin')
      expect(html).not.toContain('Join Group')
    })

    it('renders private indicator for private groups', () => {
      const privateGroup: GroupWithMembership = {
        ...baseGroup,
        is_private: true,
        is_caller_member: false,
      }

      const html = renderToStaticMarkup(
        <GroupCard
          group={privateGroup}
          onJoin={vi.fn()}
          onLeave={vi.fn()}
          isAuthenticated={true}
        />
      )

      expect(html).toContain('Private')
      expect(html).toContain('Private Group')
      expect(html).not.toContain('Join Group')
    })
  })

  describe('GroupFiltersBar', () => {
    it('renders search input and type filter chips', () => {
      const filters: GroupFilters = {
        search: 'Ahmedabad',
        group_type: 'ALL',
        membership_filter: 'ALL',
      }

      const html = renderToStaticMarkup(
        <GroupFiltersBar
          filters={filters}
          onChange={vi.fn()}
          isAuthenticated={true}
        />
      )

      expect(html).toContain('Ahmedabad')
      expect(html).toContain('All Types')
      expect(html).toContain('Village / Watan')
      expect(html).toContain('My Groups')
      expect(html).toContain('Verified Only')
    })
  })

  describe('CreateGroupModal', () => {
    it('renders modal dialog when isOpen is true', () => {
      const html = renderToStaticMarkup(
        <CreateGroupModal
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toContain('Create Community Group')
      expect(html).toContain('Group Name')
      expect(html).toContain('URL Slug')
      expect(html).toContain('Group Type')
      expect(html).toContain('Private Group')
      expect(html).toContain('Group Administrator')
    })

    it('renders nothing when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <CreateGroupModal
          isOpen={false}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
        />
      )

      expect(html).toBe('')
    })
  })
})
