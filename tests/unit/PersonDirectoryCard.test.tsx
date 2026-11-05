/**
 * Unit tests: PersonDirectoryCard component
 * (src/features/discover/components/PersonDirectoryCard.tsx)
 *
 * Verifies directory-safe card rendering, lifespan formatting,
 * privacy compliance, and interaction callbacks.
 */

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PersonDirectoryCard } from '@/features/discover/components/PersonDirectoryCard'
import type { PersonDiscoveryResult } from '@/features/discover/types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

const BASE_PERSON: PersonDiscoveryResult = {
  id: 'person-uuid-101',
  first_name: 'Vikram',
  middle_name: null,
  last_name: 'Mehta',
  maiden_name: null,
  gender: 'MALE',
  date_of_birth: '1975-04-12',
  date_of_death: null,
  birth_place: 'Ahmedabad',
  gotra: 'Vatsa',
  kul: 'Chandravanshi',
  nukh: 'MehtaNukh',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  profile_privacy: 'COMMUNITY',
}

function renderCard(props: {
  person: PersonDiscoveryResult
  onClick?: () => void
}): string {
  return renderToStaticMarkup(React.createElement(PersonDirectoryCard, props))
}

describe('PersonDirectoryCard', () => {
  it('renders full name and initials avatar correctly', () => {
    const html = renderCard({ person: BASE_PERSON })
    expect(html).toContain('Vikram Mehta')
    expect(html).toContain('VM') // Initials
  })

  it('renders maiden name when present', () => {
    const personWithMaiden: PersonDiscoveryResult = {
      ...BASE_PERSON,
      first_name: 'Anjali',
      last_name: 'Shah',
      maiden_name: 'Parikh',
    }
    const html = renderCard({ person: personWithMaiden })
    expect(html).toContain('Anjali Shah')
    expect(html).toContain('née Parikh')
  })

  it('does not render maiden name prefix when maiden_name is null', () => {
    const html = renderCard({ person: BASE_PERSON })
    expect(html).not.toContain('née')
  })

  it('renders birth place with location marker', () => {
    const html = renderCard({ person: BASE_PERSON })
    expect(html).toContain('Ahmedabad')
  })

  it('renders lineage tags (Gotra, Nukh, omitting Kul per B-6)', () => {
    const html = renderCard({ person: BASE_PERSON })
    expect(html).toContain('Gotra: Vatsa')
    expect(html).toContain('Nukh: MehtaNukh')
    expect(html).not.toContain('Kul:')
  })

  it('formats lifespan correctly for active person with birth year', () => {
    const html = renderCard({ person: BASE_PERSON })
    expect(html).toContain('b. 1975')
  })

  it('formats lifespan correctly for deceased person with both birth and death year', () => {
    const deceased: PersonDiscoveryResult = {
      ...BASE_PERSON,
      date_of_birth: '1920-01-01',
      date_of_death: '1995-10-15',
      status: 'DECEASED',
    }
    const html = renderCard({ person: deceased })
    expect(html).toContain('1920 – 1995')
    expect(html).toContain('Deceased')
  })

  it('formats lifespan correctly for deceased person with only birth year', () => {
    const deceasedBirthOnly: PersonDiscoveryResult = {
      ...BASE_PERSON,
      date_of_birth: '1930-05-20',
      date_of_death: null,
      status: 'DECEASED',
    }
    const html = renderCard({ person: deceasedBirthOnly })
    expect(html).toContain('b. 1930 (Deceased)')
  })

  it('formats lifespan correctly for deceased person with only death year', () => {
    const deceasedDeathOnly: PersonDiscoveryResult = {
      ...BASE_PERSON,
      date_of_birth: null,
      date_of_death: '2010-03-08',
      status: 'DECEASED',
    }
    const html = renderCard({ person: deceasedDeathOnly })
    expect(html).toContain('d. 2010')
  })

  it('renders verification badge states correctly', () => {
    const verifiedHtml = renderCard({ person: BASE_PERSON })
    expect(verifiedHtml).toContain('Verified')

    const pendingHtml = renderCard({
      person: { ...BASE_PERSON, verification_status: 'PENDING' },
    })
    expect(pendingHtml).toContain('Pending')

    const unverifiedHtml = renderCard({
      person: { ...BASE_PERSON, verification_status: 'UNVERIFIED' },
    })
    expect(unverifiedHtml).toContain('Unverified')

    const rejectedHtml = renderCard({
      person: { ...BASE_PERSON, verification_status: 'REJECTED' },
    })
    expect(rejectedHtml).toContain('Rejected')
  })

  it('strictly excludes private contact and system metadata from output', () => {
    const html = renderCard({ person: BASE_PERSON })
    // No contact labels
    expect(html).not.toContain('phone')
    expect(html).not.toContain('email')
    // No system timestamp labels
    expect(html).not.toContain('created_at')
    expect(html).not.toContain('updated_at')
    expect(html).not.toContain('user_id')
  })
})
