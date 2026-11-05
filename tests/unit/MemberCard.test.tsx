/**
 * Unit tests for MemberCard component
 *
 * Tests the component's logical behaviour without DOM rendering,
 * consistent with tests/unit/FamilyCard.test.tsx and PersonCard.test.tsx.
 */

import { describe, it, expect, vi } from 'vitest'
import { MemberCard } from '@/features/family-members/components/MemberCard'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_PERSON: PersonRow = {
  id: 'person-1111',
  first_name: 'Aarav',
  last_name: 'Sharma',
  middle_name: null,
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1985-05-15',
  birth_place: 'Jaipur',
  date_of_death: null,
  gotra: 'Kashyap',
  kul: null,
  nukh: null,
  phone: null,
  phone_secondary: null,
  email_contact: null,
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'COMMUNITY',
  dob_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  user_id: null,
  created_by: 'user-creator',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const ACTIVE_HEAD_MEMBER: FamilyMemberWithPerson = {
  id: 'member-001',
  family_id: 'family-001',
  person_id: 'person-1111',
  role: 'HEAD',
  is_head: true,
  joined_at: '2020-01-01T00:00:00Z',
  left_at: null,
  added_by: 'user-creator',
  created_at: '2020-01-01T00:00:00Z',
  person: MOCK_PERSON,
}

const ACTIVE_CHILD_MEMBER: FamilyMemberWithPerson = {
  id: 'member-002',
  family_id: 'family-001',
  person_id: 'person-2222',
  role: 'CHILD',
  is_head: false,
  joined_at: '2022-06-10T00:00:00Z',
  left_at: null,
  added_by: 'user-creator',
  created_at: '2022-06-10T00:00:00Z',
  person: {
    ...MOCK_PERSON,
    id: 'person-2222',
    first_name: 'Priya',
    last_name: 'Sharma',
    gender: 'FEMALE',
  },
}

const FORMER_MEMBER: FamilyMemberWithPerson = {
  id: 'member-003',
  family_id: 'family-001',
  person_id: 'person-3333',
  role: 'EXTENDED',
  is_head: false,
  joined_at: '2019-01-01T00:00:00Z',
  left_at: '2024-05-01T00:00:00Z',
  added_by: 'user-creator',
  created_at: '2019-01-01T00:00:00Z',
  person: {
    ...MOCK_PERSON,
    id: 'person-3333',
    first_name: 'Rohan',
    last_name: 'Sharma',
  },
}

// ---------------------------------------------------------------------------
// Helper: extract all text from a React element tree recursively
// ---------------------------------------------------------------------------

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  if (typeof node === 'object') {
    const el = node as { props?: { children?: unknown } }
    if (el.props) return collectText(el.props.children)
  }
  return ''
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MemberCard Component', () => {
  describe('person identity rendering', () => {
    it('renders person full name', () => {
      const element = MemberCard({ member: ACTIVE_HEAD_MEMBER })
      const text = collectText(element)
      expect(text).toContain('Aarav Sharma')
    })

    it('renders fallback when person is null', () => {
      const element = MemberCard({
        member: { ...ACTIVE_HEAD_MEMBER, person: null },
      })
      const text = collectText(element)
      expect(text).toContain('Unknown Person')
    })
  })

  describe('role and head status rendering', () => {
    it('renders Head of Family badge and label when member is head', () => {
      const element = MemberCard({ member: ACTIVE_HEAD_MEMBER })
      const text = collectText(element)
      expect(text).toContain('Head of Family')
    })

    it('renders Child role label for child member', () => {
      const element = MemberCard({ member: ACTIVE_CHILD_MEMBER })
      const text = collectText(element)
      expect(text).toContain('Child')
      expect(text).not.toContain('Head of Family')
    })

    it('renders Extended Family role label for extended member', () => {
      const element = MemberCard({ member: FORMER_MEMBER })
      const text = collectText(element)
      expect(text).toContain('Extended Family')
    })
  })

  describe('former / departed member rendering', () => {
    it('renders Departed / Former badge for departed member', () => {
      const element = MemberCard({ member: FORMER_MEMBER })
      const text = collectText(element)
      expect(text).toContain('Departed / Former')
    })

    it('does not render Departed / Former badge for active member', () => {
      const element = MemberCard({ member: ACTIVE_CHILD_MEMBER })
      const text = collectText(element)
      expect(text).not.toContain('Departed / Former')
    })
  })

  describe('management action controls', () => {
    it('renders management buttons when canManageMembers is true for active member', () => {
      const onEdit = vi.fn()
      const onRemove = vi.fn()
      const onTransferHead = vi.fn()

      const element = MemberCard({
        member: ACTIVE_CHILD_MEMBER,
        canManageMembers: true,
        onEdit,
        onRemove,
        onTransferHead,
      })
      const text = collectText(element)
      expect(text).toContain('Make Head')
      expect(text).toContain('Edit')
      expect(text).toContain('Remove')
    })

    it('does NOT render Make Head button when member is already head', () => {
      const onTransferHead = vi.fn()
      const element = MemberCard({
        member: ACTIVE_HEAD_MEMBER,
        canManageMembers: true,
        onTransferHead,
      })
      const text = collectText(element)
      expect(text).not.toContain('Make Head')
    })

    it('does NOT render management buttons when canManageMembers is false', () => {
      const onEdit = vi.fn()
      const onRemove = vi.fn()
      const element = MemberCard({
        member: ACTIVE_CHILD_MEMBER,
        canManageMembers: false,
        onEdit,
        onRemove,
      })
      const text = collectText(element)
      expect(text).not.toContain('Edit')
      expect(text).not.toContain('Remove')
      expect(text).not.toContain('Make Head')
    })

    it('does NOT render management buttons for former members even if canManageMembers is true', () => {
      const onEdit = vi.fn()
      const onRemove = vi.fn()
      const element = MemberCard({
        member: FORMER_MEMBER,
        canManageMembers: true,
        onEdit,
        onRemove,
      })
      const text = collectText(element)
      expect(text).not.toContain('Edit')
      expect(text).not.toContain('Remove')
    })
  })
})
