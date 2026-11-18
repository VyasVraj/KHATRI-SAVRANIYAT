/**
 * Unit Test: Occupation Directory Display & Approval Status Mapping
 *
 * Verifies all criteria from prompt:
 * 1. Approved occupation: Displays the actual occupation name (not 'Occupation Pending').
 * 2. Pending request: Displays 'Occupation Pending'.
 * 3. No occupation: Displays 'Occupation Not Provided'.
 * 4. Rejected request: Displays 'Occupation Rejected'.
 * 5. Reapproval workflow: Preserves the approved occupation while an update request is pending.
 * 6. Multi-member family: Each member has their own distinct occupation and Mukhi assignment.
 * 7. Category normalization: Resolves case variations, codes, and official 30 categories.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PublicOccupationDirectoryPage } from '@/features/people/pages/PublicOccupationDirectoryPage'
import * as publicOccupationService from '@/features/people/services/public-occupation.service'
import {
  resolveOccupationDisplay,
  type PublicOccupationItem,
} from '@/features/people/services/public-occupation.service'

describe('1. resolveOccupationDisplay Pure Logic', () => {
  it('displays the actual approved occupation for approved records', () => {
    const res = resolveOccupationDisplay('Information Technology', null)
    expect(res.occupation).toBe('Information Technology')
    expect(res.status).toBe('APPROVED')
  })

  it('normalizes case variations and codes to official 30 categories', () => {
    const res1 = resolveOccupationDisplay('information technology', null)
    expect(res1.occupation).toBe('Information Technology')
    expect(res1.status).toBe('APPROVED')

    const res2 = resolveOccupationDisplay('HEALTHCARE', null)
    expect(res2.occupation).toBe('Healthcare')
    expect(res2.status).toBe('APPROVED')

    const res3 = resolveOccupationDisplay('BUSINESS_AND_ENTREPRENEURSHIP', null)
    expect(res3.occupation).toBe('Business and Entrepreneurship')
    expect(res3.status).toBe('APPROVED')
  })

  it('displays "Occupation Pending" when request is awaiting admin approval', () => {
    const res = resolveOccupationDisplay('Occupation Pending', {
      status: 'PENDING',
      requested_occupation: 'Healthcare',
    })
    expect(res.occupation).toBe('Occupation Pending')
    expect(res.status).toBe('PENDING')
  })

  it('displays "Occupation Not Provided" when no occupation is selected', () => {
    const res1 = resolveOccupationDisplay(null, null)
    expect(res1.occupation).toBe('Occupation Not Provided')
    expect(res1.status).toBe('NOT_PROVIDED')

    const res2 = resolveOccupationDisplay('', null)
    expect(res2.occupation).toBe('Occupation Not Provided')
    expect(res2.status).toBe('NOT_PROVIDED')

    const res3 = resolveOccupationDisplay('Occupation Not Available', null)
    expect(res3.occupation).toBe('Occupation Not Provided')
    expect(res3.status).toBe('NOT_PROVIDED')
  })

  it('displays "Occupation Rejected" when latest request was rejected and no approved occupation exists', () => {
    const res = resolveOccupationDisplay('Occupation Pending', {
      status: 'REJECTED',
      requested_occupation: 'Media and Journalism',
    })
    expect(res.occupation).toBe('Occupation Rejected')
    expect(res.status).toBe('REJECTED')
  })

  it('preserves existing approved occupation when an update request is pending reapproval', () => {
    // Member was already approved as 'Engineering', then requested 'Information Technology'
    const res = resolveOccupationDisplay('Engineering', {
      status: 'PENDING',
      requested_occupation: 'Information Technology',
    })
    // Do not overwrite approved occupation with pending
    expect(res.occupation).toBe('Engineering')
    expect(res.status).toBe('APPROVED')
  })

  it('updates to newly approved occupation once admin approves request', () => {
    const res = resolveOccupationDisplay('Engineering', {
      status: 'APPROVED',
      requested_occupation: 'Information Technology',
    })
    expect(res.occupation).toBe('Information Technology')
    expect(res.status).toBe('APPROVED')
  })
})

describe('2. Public Occupation Directory UI Rendering with Status Badges', () => {
  let queryClient: QueryClient

  const mockFamilyMembers: PublicOccupationItem[] = [
    {
      person_id: 'p-dhruv',
      full_name: 'Dhruv Jayesh Vyas',
      occupation: 'Information Technology',
      occupation_status: 'APPROVED',
      associated_mukhi_name: 'Mukhi Ghanshyamdas Khemchand Khuha',
      associated_mukhi_region: 'Anand',
      associated_mukhi_id: 'mukhi-anand',
    },
    {
      person_id: 'p-jayesh',
      full_name: 'Jayesh C Vyas',
      occupation: 'Business and Entrepreneurship',
      occupation_status: 'APPROVED',
      associated_mukhi_name: 'Mukhi Ghanshyamdas Khemchand Khuha',
      associated_mukhi_region: 'Anand',
      associated_mukhi_id: 'mukhi-anand',
    },
    {
      person_id: 'p-jignasha',
      full_name: 'Jignasha Jayesh Vyas',
      occupation: 'Occupation Pending',
      occupation_status: 'PENDING',
      associated_mukhi_name: 'Mukhi Ghanshyamdas Khemchand Khuha',
      associated_mukhi_region: 'Anand',
      associated_mukhi_id: 'mukhi-anand',
    },
    {
      person_id: 'p-vraj',
      full_name: 'Vraj Jayesh Vyas',
      occupation: 'Engineering',
      occupation_status: 'APPROVED',
      associated_mukhi_name: 'Mukhi Ghanshyamdas Khemchand Khuha',
      associated_mukhi_region: 'Anand',
      associated_mukhi_id: 'mukhi-anand',
    },
    {
      person_id: 'p-no-occ',
      full_name: 'Ramesh Sundar Khatri',
      occupation: 'Occupation Not Provided',
      occupation_status: 'NOT_PROVIDED',
      associated_mukhi_name: 'Mukhi Ghanshyamdas Khemchand Khuha',
      associated_mukhi_region: 'Anand',
      associated_mukhi_id: 'mukhi-anand',
    },
    {
      person_id: 'p-rejected',
      full_name: 'Ketan Mohan Khatri',
      occupation: 'Occupation Rejected',
      occupation_status: 'REJECTED',
      associated_mukhi_name: 'Mukhi Ghanshyamdas Khemchand Khuha',
      associated_mukhi_region: 'Anand',
      associated_mukhi_id: 'mukhi-anand',
    },
  ]

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    vi.spyOn(publicOccupationService, 'getPublicOccupationDirectory').mockResolvedValue({
      data: mockFamilyMembers,
      error: null,
    })
  })

  it('renders actual approved occupation names for members with approved occupations', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Dhruv Jayesh Vyas')).toBeInTheDocument()
    })

    // Dhruv: Information Technology (NOT Occupation Pending)
    const dhruvMatches = screen.getAllByText('Information Technology')
    expect(dhruvMatches.length).toBeGreaterThanOrEqual(1)

    // Jayesh: Business and Entrepreneurship (NOT Occupation Pending)
    const jayeshMatches = screen.getAllByText('Business and Entrepreneurship')
    expect(jayeshMatches.length).toBeGreaterThanOrEqual(1)

    // Vraj: Engineering (NOT Occupation Pending)
    const vrajMatches = screen.getAllByText('Engineering')
    expect(vrajMatches.length).toBeGreaterThanOrEqual(1)

    // Jignasha: Occupation Pending (status is PENDING)
    expect(screen.getByText('Jignasha Jayesh Vyas')).toBeInTheDocument()
    const pendingBadges = screen.getAllByText('Occupation Pending')
    expect(pendingBadges.length).toBe(1) // Only Jignasha

    // Ramesh: Occupation Not Provided
    expect(screen.getByText('Occupation Not Provided')).toBeInTheDocument()

    // Ketan: Occupation Rejected
    expect(screen.getByText('Occupation Rejected')).toBeInTheDocument()
  })

  it('verifies that each family member has their own independent occupation', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Dhruv Jayesh Vyas')).toBeInTheDocument()
    })

    const rows = screen.getAllByRole('row')
    // Table header + 6 rows = 7 rows
    expect(rows.length).toBe(7)

    // Dhruv's row contains Information Technology
    const dhruvRow = rows.find((r) => r.textContent?.includes('Dhruv Jayesh Vyas'))
    expect(dhruvRow?.textContent).toContain('Information Technology')
    expect(dhruvRow?.textContent).not.toContain('Business and Entrepreneurship')

    // Jayesh's row contains Business and Entrepreneurship
    const jayeshRow = rows.find((r) => r.textContent?.includes('Jayesh C Vyas'))
    expect(jayeshRow?.textContent).toContain('Business and Entrepreneurship')
    expect(jayeshRow?.textContent).not.toContain('Information Technology')

    // All members share common family Mukhi
    expect(dhruvRow?.textContent).toContain('Mukhi Ghanshyamdas Khemchand Khuha')
    expect(jayeshRow?.textContent).toContain('Mukhi Ghanshyamdas Khemchand Khuha')
  })
})
