/**
 * Unit tests for PersonCard component
 *
 * Tests the component's logical behaviour without DOM rendering,
 * consistent with the project's established testing pattern
 * (see tests/unit/ProtectedRoute.test.tsx).
 *
 * @testing-library/dom is not installed; we call component functions
 * directly and verify returned React element structure.
 */

import { describe, it, expect, vi } from 'vitest'
import { PersonCard } from '@/features/people/components/PersonCard'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_PERSON: PersonRow = {
  id: 'person-uuid-001',
  first_name: 'Arjun',
  last_name: 'Sharma',
  middle_name: null,
  maiden_name: null,
  gender: null,
  date_of_birth: null,
  date_of_death: null,
  birth_place: null,
  gotra: null,
  kul: null,
  nukh: null,
  email_contact: null,
  phone: null,
  phone_secondary: null,
  profile_privacy: 'COMMUNITY',
  contact_privacy: 'COMMUNITY',
  dob_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  user_id: null,
  created_by: 'user-123',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const FULL_PERSON: PersonRow = {
  ...BASE_PERSON,
  id: 'person-uuid-002',
  first_name: 'Priya',
  last_name: 'Patel',
  middle_name: 'Rani',
  maiden_name: 'Desai',
  gender: 'FEMALE',
  gotra: 'Kashyap',
  kul: 'SomeKul',
  nukh: 'SomeNukh',
}

// ---------------------------------------------------------------------------
// Helper: extract all text from a React element tree recursively
// ---------------------------------------------------------------------------

function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join('')
  if (typeof node === 'object') {
    const el = node as { props?: { children?: unknown } }
    if (el.props) return collectText(el.props.children)
  }
  return ''
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PersonCard', () => {
  describe('name rendering', () => {
    it('renders first and last name', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      expect(text).toContain('Arjun')
      expect(text).toContain('Sharma')
    })

    it('renders full name including middle name', () => {
      const element = PersonCard({ person: FULL_PERSON })
      const text = collectText(element)
      expect(text).toContain('Priya')
      expect(text).toContain('Rani')
      expect(text).toContain('Patel')
    })

    it('renders maiden name when present', () => {
      const element = PersonCard({ person: FULL_PERSON })
      const text = collectText(element)
      expect(text).toContain('Desai')
    })

    it('does not render "née" text when maiden_name is null', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      expect(text).not.toContain('née')
    })
  })

  describe('initials avatar', () => {
    it('generates initials from first and last name', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      // Should contain AS (Arjun Sharma initials)
      expect(text).toContain('AS')
    })
  })

  describe('gender', () => {
    it('renders gender label when gender is provided', () => {
      const element = PersonCard({ person: FULL_PERSON })
      const text = collectText(element)
      expect(text).toContain('Female')
    })

    it('does not render gender label when gender is null', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      expect(text).not.toContain('Male')
      expect(text).not.toContain('Female')
    })
  })

  describe('community identity', () => {
    it('renders gotra when present', () => {
      const element = PersonCard({ person: FULL_PERSON })
      const text = collectText(element)
      expect(text).toContain('Kashyap')
    })

    it('does not render kul per B-6 specification', () => {
      const element = PersonCard({ person: FULL_PERSON })
      const text = collectText(element)
      expect(text).not.toContain('SomeKul')
    })

    it('renders nukh when present', () => {
      const element = PersonCard({ person: FULL_PERSON })
      const text = collectText(element)
      expect(text).toContain('SomeNukh')
    })

    it('does not render community identity section when all null', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      // separator character only appears with community identity
      expect(text).not.toContain(' · ')
    })
  })

  describe('interactive behaviour', () => {
    it('does not throw when onClick is not provided', () => {
      expect(() => PersonCard({ person: BASE_PERSON })).not.toThrow()
    })

    it('does not throw when onClick is provided', () => {
      const onClick = vi.fn()
      expect(() => PersonCard({ person: BASE_PERSON, onClick })).not.toThrow()
    })

    it('returns a button role when onClick is provided', () => {
      const element = PersonCard({ person: BASE_PERSON, onClick: vi.fn() }) as {
        props?: { role?: string }
      }
      expect(element.props?.role).toBe('button')
    })

    it('returns no button role when onClick is not provided', () => {
      const element = PersonCard({ person: BASE_PERSON }) as {
        props?: { role?: string }
      }
      expect(element.props?.role).toBeUndefined()
    })
  })

  describe('security — system fields not exposed', () => {
    it('does not render person id in text', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      expect(text).not.toContain('person-uuid-001')
    })

    it('does not render created_by in text', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      expect(text).not.toContain('user-123')
    })

    it('does not render status in text', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      // 'ACTIVE' from status enum must not appear
      expect(text).not.toContain('ACTIVE')
    })

    it('does not render verification_status in text', () => {
      const element = PersonCard({ person: BASE_PERSON })
      const text = collectText(element)
      expect(text).not.toContain('UNVERIFIED')
    })
  })
})
