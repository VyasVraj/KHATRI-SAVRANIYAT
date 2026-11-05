/**
 * Unit tests for FamilyCard component
 *
 * Tests the component's logical behaviour without DOM rendering,
 * consistent with the project's established testing pattern
 * (see tests/unit/PersonCard.test.tsx and tests/unit/ProtectedRoute.test.tsx).
 *
 * @testing-library/dom is not installed; we call component functions
 * directly and verify returned React element structure and collected text.
 */

import { describe, it, expect, vi } from 'vitest'
import { FamilyCard } from '@/features/families/components/FamilyCard'
import type { Tables } from '@/types/database.types'

type FamilyRow = Tables<'families'>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_FAMILY: FamilyRow = {
  id: 'family-uuid-001',
  family_name: 'Sharma Family',
  description: null,
  city: null,
  state: null,
  country: null,
  gotra: null,
  kul: null,
  nukh: null,
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
  status: 'ACTIVE',
  verification_status: 'UNVERIFIED',
  created_by: 'user-123',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  deleted_at: null,
}

const FULL_FAMILY: FamilyRow = {
  ...BASE_FAMILY,
  id: 'family-uuid-002',
  family_name: 'Patel Household',
  description: 'A multigenerational family with roots in Gujarat, now based in Mumbai.',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  gotra: 'Kashyap',
  kul: 'PatelKul',
  nukh: 'PatelNukh',
  profile_privacy: 'PUBLIC',
  members_privacy: 'FAMILY',
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

describe('FamilyCard', () => {
  describe('name rendering', () => {
    it('renders family name', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).toContain('Sharma Family')
    })

    it('renders full family name for full record', () => {
      const element = FamilyCard({ family: FULL_FAMILY })
      const text = collectText(element)
      expect(text).toContain('Patel Household')
    })
  })

  describe('privacy indicator', () => {
    it('renders profile privacy label for COMMUNITY', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).toContain('Community members')
    })

    it('renders profile privacy label for PUBLIC', () => {
      const element = FamilyCard({ family: FULL_FAMILY })
      const text = collectText(element)
      expect(text).toContain('Everyone')
    })
  })

  describe('location rendering', () => {
    it('renders city, state, country when present', () => {
      const element = FamilyCard({ family: FULL_FAMILY })
      const text = collectText(element)
      expect(text).toContain('Mumbai, Maharashtra, India')
    })

    it('does not render location when all location fields are null', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).not.toContain('Mumbai')
      expect(text).not.toContain('Maharashtra')
    })
  })

  describe('community identity rendering', () => {
    it('renders gotra, nukh when present (omitting kul per B-6)', () => {
      const element = FamilyCard({ family: FULL_FAMILY })
      const text = collectText(element)
      expect(text).toContain('Kashyap · PatelNukh')
      expect(text).not.toContain('PatelKul')
    })

    it('does not render community identity when fields are null', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).not.toContain('Kashyap')
    })
  })

  describe('description rendering', () => {
    it('renders description preview when present', () => {
      const element = FamilyCard({ family: FULL_FAMILY })
      const text = collectText(element)
      expect(text).toContain('A multigenerational family with roots in Gujarat')
    })

    it('does not render description section when null', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).not.toContain('multigenerational')
    })
  })

  describe('interactive behaviour', () => {
    it('does not throw when onClick is not provided', () => {
      expect(() => FamilyCard({ family: BASE_FAMILY })).not.toThrow()
    })

    it('does not throw when onClick is provided', () => {
      const onClick = vi.fn()
      expect(() => FamilyCard({ family: BASE_FAMILY, onClick })).not.toThrow()
    })

    it('returns a button role when onClick is provided', () => {
      const element = FamilyCard({ family: BASE_FAMILY, onClick: vi.fn() }) as {
        props?: { role?: string }
      }
      expect(element.props?.role).toBe('button')
    })

    it('returns no button role when onClick is not provided', () => {
      const element = FamilyCard({ family: BASE_FAMILY }) as {
        props?: { role?: string }
      }
      expect(element.props?.role).toBeUndefined()
    })
  })

  describe('security — system and protected fields not exposed', () => {
    it('does not render family id in text', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).not.toContain('family-uuid-001')
    })

    it('does not render created_by in text', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).not.toContain('user-123')
    })

    it('does not render status in text', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).not.toContain('ACTIVE')
    })

    it('does not render verification_status in text', () => {
      const element = FamilyCard({ family: BASE_FAMILY })
      const text = collectText(element)
      expect(text).not.toContain('UNVERIFIED')
    })

    it('has zero family_members references', () => {
      const element = FamilyCard({ family: FULL_FAMILY })
      const text = collectText(element)
      expect(text).not.toContain('family_members')
      expect(text).not.toContain('members count')
    })
  })
})
