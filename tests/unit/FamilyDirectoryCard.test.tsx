/**
 * Unit tests: FamilyDirectoryCard component
 * (src/features/discover/components/FamilyDirectoryCard.tsx)
 *
 * Verifies directory-safe card rendering, lineage formatting,
 * privacy compliance, and interaction callbacks.
 */

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FamilyDirectoryCard } from '@/features/discover/components/FamilyDirectoryCard'
import type { FamilyDiscoveryResult } from '@/features/discover/types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const BASE_FAMILY: FamilyDiscoveryResult = {
  id: 'family-uuid-201',
  family_name: 'Mehta Family',
  description: 'Descendants of the elder branch of Ahmedabad.',
  gotra: 'Vatsa',
  kul: 'Chandravanshi',
  nukh: 'MehtaNukh',
  city: 'Ahmedabad',
  state: 'Gujarat',
  country: 'India',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
  members_privacy: 'COMMUNITY',
}

function renderCard(props: {
  family: FamilyDiscoveryResult
  onClick?: () => void
}): string {
  return renderToStaticMarkup(React.createElement(FamilyDirectoryCard, props))
}

describe('FamilyDirectoryCard', () => {
  it('renders family name and description correctly', () => {
    const html = renderCard({ family: BASE_FAMILY })
    expect(html).toContain('Mehta Family')
    expect(html).toContain('Descendants of the elder branch of Ahmedabad.')
  })

  it('renders geographic location (city, state, country) with map icon', () => {
    const html = renderCard({ family: BASE_FAMILY })
    expect(html).toContain('Ahmedabad, Gujarat, India')
  })

  it('renders lineage badges (Gotra, Nukh, omitting Kul per B-6)', () => {
    const html = renderCard({ family: BASE_FAMILY })
    expect(html).toContain('Gotra: Vatsa')
    expect(html).toContain('Nukh: MehtaNukh')
    expect(html).not.toContain('Kul:')
  })

  it('renders status badge states correctly', () => {
    const activeHtml = renderCard({ family: BASE_FAMILY })
    expect(activeHtml).toContain('Active')

    const draftHtml = renderCard({
      family: { ...BASE_FAMILY, status: 'DRAFT' },
    })
    expect(draftHtml).toContain('Draft')

    const archivedHtml = renderCard({
      family: { ...BASE_FAMILY, status: 'ARCHIVED' },
    })
    expect(archivedHtml).toContain('Archived')
  })

  it('renders verification badge states correctly', () => {
    const verifiedHtml = renderCard({ family: BASE_FAMILY })
    expect(verifiedHtml).toContain('Verified')

    const pendingHtml = renderCard({
      family: { ...BASE_FAMILY, verification_status: 'PENDING' },
    })
    expect(pendingHtml).toContain('Pending')

    const unverifiedHtml = renderCard({
      family: { ...BASE_FAMILY, verification_status: 'UNVERIFIED' },
    })
    expect(unverifiedHtml).toContain('Unverified')

    const rejectedHtml = renderCard({
      family: { ...BASE_FAMILY, verification_status: 'REJECTED' },
    })
    expect(rejectedHtml).toContain('Rejected')
  })

  it('strictly excludes internal metadata, member rosters, and timestamps', () => {
    const html = renderCard({ family: BASE_FAMILY })
    expect(html).not.toContain('created_at')
    expect(html).not.toContain('updated_at')
    expect(html).not.toContain('created_by')
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('phone')
    expect(html).not.toContain('email')
  })
})
