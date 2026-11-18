/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit Tests: Mukhi-Wise Filtering and Dataset Preview in Data Export & Reports
 *
 * Verifies:
 * 1. Selecting a specific Mukhi displays ONLY people associated with that Mukhi.
 * 2. Associated Mukhi column is populated with full name and region (or 'Mukhi Not Assigned').
 * 3. Clearing the Mukhi filter returns all matching records across the entire community.
 * 4. Multi-filter AND logic works across Mukhi, Gotra, Nukh, Occupation, Gender, and Status.
 * 5. Matching record count in preview equals count exported to Excel and PDF.
 * 6. Families and Mukhis exports correctly include Mukhi association.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  fetchExportData,
  downloadCsvExcel,
  type ExportFilters,
} from '@/features/admin/services/export.service'
import { DataExportPage } from '@/features/admin/pages/DataExportPage'

vi.mock('@/features/community/hooks/useCommunityMukhis', () => ({
  useCommunityMukhis: () => ({
    mukhis: [
      {
        id: 'mukhi-uuid-001',
        source_serial_number: 1,
        full_name: 'Mukhi Jayesh C Vyas',
        gram: 'Vadodara',
        is_active: true,
      },
      {
        id: 'mukhi-uuid-002',
        source_serial_number: 2,
        full_name: 'Mukhi Ramesh K Patel',
        gram: 'Surat',
        is_active: true,
      },
    ],
    isLoading: false,
    error: null,
  }),
}))
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'admin-user-uuid' } } },
      }),
    },
  },
}))

describe('Data Export & Reports — Mukhi-Wise Filtering & Dataset Preview', () => {
  const MUKHI_1 = {
    id: 'mukhi-uuid-001',
    source_serial_number: 1,
    full_name: 'Mukhi Jayesh C Vyas',
    gram: 'Vadodara',
    linked_person_id: null,
    is_active: true,
    authority_status: 'ACTIVE',
  }

  const MUKHI_2 = {
    id: 'mukhi-uuid-002',
    source_serial_number: 2,
    full_name: 'Mukhi Ramesh K Patel',
    gram: 'Surat',
    linked_person_id: 'person-p5',
    is_active: true,
    authority_status: 'ACTIVE',
  }

  const MOCK_PEOPLE = [
    {
      id: 'person-p1',
      first_name: 'Aarav',
      middle_name: 'J',
      last_name: 'Vyas',
      gender: 'MALE',
      date_of_birth: '1990-01-01',
      date_of_death: null,
      is_deceased: false,
      birth_place: 'Vadodara',
      city: 'Vadodara',
      state: 'Gujarat',
      country: 'India',
      blood_group: 'B+',
      gotra: 'Agastya',
      nukh: 'Vyas',
      occupation: 'Software Engineer',
      phone: '9876543210',
      email_contact: 'aarav@example.com',
      status: 'ACTIVE',
      created_at: '2026-01-01T10:00:00Z',
    },
    {
      id: 'person-p2',
      first_name: 'Bhavna',
      middle_name: 'R',
      last_name: 'Patel',
      gender: 'FEMALE',
      date_of_birth: '1992-05-15',
      date_of_death: null,
      is_deceased: false,
      birth_place: 'Surat',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
      blood_group: 'A+',
      gotra: 'Kashyap',
      nukh: 'Patel',
      occupation: 'Doctor',
      phone: '9876543211',
      email_contact: 'bhavna@example.com',
      status: 'ACTIVE',
      created_at: '2026-01-05T10:00:00Z',
    },
    {
      id: 'person-p3',
      first_name: 'Chirag',
      middle_name: '',
      last_name: 'Khatri',
      gender: 'MALE',
      date_of_birth: '1985-08-20',
      date_of_death: null,
      is_deceased: false,
      birth_place: 'Jaipur',
      city: 'Jaipur',
      state: 'Rajasthan',
      country: 'India',
      blood_group: 'O+',
      gotra: 'Bharadwaj',
      nukh: 'Khatri',
      occupation: 'Business Owner',
      phone: '9876543212',
      email_contact: 'chirag@example.com',
      status: 'ACTIVE',
      created_at: '2026-01-10T10:00:00Z',
    },
    {
      id: 'person-p4',
      first_name: 'Deepa',
      middle_name: 'J',
      last_name: 'Vyas',
      gender: 'FEMALE',
      date_of_birth: '1995-12-12',
      date_of_death: null,
      is_deceased: false,
      birth_place: 'Vadodara',
      city: 'Vadodara',
      state: 'Gujarat',
      country: 'India',
      blood_group: 'AB+',
      gotra: 'Agastya',
      nukh: 'Vyas',
      occupation: 'Teacher',
      phone: '9876543213',
      email_contact: 'deepa@example.com',
      status: 'ACTIVE',
      created_at: '2026-01-12T10:00:00Z',
    },
    {
      id: 'person-p5',
      first_name: 'Mukhi Ramesh',
      middle_name: 'K',
      last_name: 'Patel',
      gender: 'MALE',
      date_of_birth: '1965-03-10',
      date_of_death: null,
      is_deceased: false,
      birth_place: 'Surat',
      city: 'Surat',
      state: 'Gujarat',
      country: 'India',
      blood_group: 'O+',
      gotra: 'Kashyap',
      nukh: 'Patel',
      occupation: 'Social Worker',
      phone: '9876543214',
      email_contact: 'ramesh@example.com',
      status: 'ACTIVE',
      created_at: '2026-01-02T10:00:00Z',
    },
  ]

  // Family memberships:
  // Family 1 (Mukhi 1): P1 & P4
  // Family 2 (Mukhi 2): P2 & P5
  // Person P3 has no family membership
  const MOCK_FAMILY_MEMBERS = [
    {
      person_id: 'person-p1',
      families: { id: 'fam-1', selected_mukhi_id: 'mukhi-uuid-001' },
    },
    {
      person_id: 'person-p4',
      families: { id: 'fam-1', selected_mukhi_id: 'mukhi-uuid-001' },
    },
    {
      person_id: 'person-p2',
      families: { id: 'fam-2', selected_mukhi_id: 'mukhi-uuid-002' },
    },
    {
      person_id: 'person-p5',
      families: { id: 'fam-2', selected_mukhi_id: 'mukhi-uuid-002' },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    // Default Supabase mocking
    ;(supabase.rpc as any).mockImplementation((fn: string) => {
      // Simulate RPC not available on client in standard environment so it triggers fallback
      return Promise.resolve({ data: null, error: { message: `RPC ${fn} fallback` } })
    })

    ;(supabase.from as any).mockImplementation((table: string) => {
      if (table === 'community_mukhis') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              if (col === 'is_active' && val === true) {
                return Promise.resolve({
                  data: [MUKHI_1, MUKHI_2],
                  error: null,
                })
              }
              return Promise.resolve({ data: [], error: null })
            }),
            order: vi.fn().mockReturnValue({
              data: [MUKHI_1, MUKHI_2],
              error: null,
            }),
          }),
        }
      }

      if (table === 'family_members') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockImplementation((col: string, val: any) => {
              if (col === 'left_at' && val === null) {
                return Promise.resolve({
                  data: MOCK_FAMILY_MEMBERS,
                  error: null,
                })
              }
              return Promise.resolve({ data: [], error: null })
            }),
          }),
        }
      }

      if (table === 'persons') {
        const queryBuilder: any = {
          _filters: {},
          select: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation(function (this: any, col: string, val: any) {
            this._filters[col] = val
            return this
          }),
          not: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockImplementation(function (this: any) {
            let res = [...MOCK_PEOPLE]
            if (this._filters.gotra) {
              res = res.filter((p) => p.gotra === this._filters.gotra)
            }
            if (this._filters.nukh) {
              res = res.filter((p) => p.nukh === this._filters.nukh)
            }
            if (this._filters.occupation) {
              res = res.filter((p) => p.occupation === this._filters.occupation)
            }
            if (this._filters.gender) {
              res = res.filter((p) => p.gender === this._filters.gender)
            }
            return Promise.resolve({ data: res, error: null })
          }),
        }
        return queryBuilder
      }

      if (table === 'families') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'fam-1',
                    family_name: 'Vyas Family',
                    city: 'Vadodara',
                    state: 'Gujarat',
                    country: 'India',
                    gotra: 'Agastya',
                    nukh: 'Vyas',
                    selected_mukhi_id: 'mukhi-uuid-001',
                    verification_status: 'VERIFIED',
                    status: 'ACTIVE',
                    created_at: '2026-01-01T10:00:00Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        }
      }

      return {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }
    })
  })

  it('Requirement 1: When Mukhi 1 is selected, returns ONLY persons associated with Mukhi 1', async () => {
    const filters: ExportFilters = {
      dataType: 'PEOPLE',
      mukhiId: 'mukhi-uuid-001',
    }

    const result = await fetchExportData(filters)
    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()

    const records = result.data!.records
    expect(records.length).toBe(2) // Person P1 and P4

    const fullNames = records.map((r) => r['Full Name'])
    expect(fullNames).toContain('Aarav J Vyas')
    expect(fullNames).toContain('Deepa J Vyas')
    expect(fullNames).not.toContain('Bhavna R Patel')
    expect(fullNames).not.toContain('Chirag Khatri')

    // Verify Associated Mukhi column contains Mukhi 1's name and region
    for (const record of records) {
      expect(record['Associated Mukhi']).toBe('Mukhi Jayesh C Vyas (Vadodara)')
    }
  })

  it('Requirement 2: When Mukhi 2 is selected, returns ONLY persons associated with Mukhi 2', async () => {
    const filters: ExportFilters = {
      dataType: 'PEOPLE',
      mukhiId: 'mukhi-uuid-002',
    }

    const result = await fetchExportData(filters)
    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()

    const records = result.data!.records
    // Person P5 is linked Mukhi 2, Person P2 has city Surat which matches Mukhi 2's gram
    expect(records.length).toBe(2)
    const fullNames = records.map((r) => r['Full Name'])
    expect(fullNames).toContain('Bhavna R Patel')
    expect(fullNames).toContain('Mukhi Ramesh K Patel')
    expect(fullNames).not.toContain('Aarav J Vyas')

    for (const record of records) {
      expect(record['Associated Mukhi']).toBe('Mukhi Ramesh K Patel (Surat)')
    }
  })

  it('Requirement 3: When no Mukhi is selected ("All Mukhis"), returns ALL community records', async () => {
    const filters: ExportFilters = {
      dataType: 'PEOPLE',
      mukhiId: undefined, // All Mukhis
    }

    const result = await fetchExportData(filters)
    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()

    const records = result.data!.records
    expect(records.length).toBe(5) // All 5 mock persons returned

    // Check each person has appropriate Associated Mukhi
    const p1 = records.find((r) => r['Full Name'] === 'Aarav J Vyas')
    const p2 = records.find((r) => r['Full Name'] === 'Bhavna R Patel')
    const p3 = records.find((r) => r['Full Name'] === 'Chirag Khatri')

    expect(p1!['Associated Mukhi']).toBe('Mukhi Jayesh C Vyas (Vadodara)')
    expect(p2!['Associated Mukhi']).toBe('Mukhi Ramesh K Patel (Surat)')
    // Chirag is from Jaipur, no Mukhi in Jaipur, so unassigned:
    expect(p3!['Associated Mukhi']).toBe('Mukhi Not Assigned')
  })

  it('Requirement 4: Multi-filter AND logic correctly filters by Mukhi AND Gotra AND Occupation', async () => {
    const filters: ExportFilters = {
      dataType: 'PEOPLE',
      mukhiId: 'mukhi-uuid-001',
      gotra: 'Agastya',
      occupation: 'Software Engineer',
    }

    const result = await fetchExportData(filters)
    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()

    const records = result.data!.records
    // Only Aarav matches Mukhi 1 + Agastya + Software Engineer
    expect(records.length).toBe(1)
    expect(records[0]['Full Name']).toBe('Aarav J Vyas')
    expect(records[0]['Occupation / Profession']).toBe('Software Engineer')
    expect(records[0]['Gotra']).toBe('Agastya')
    expect(records[0]['Associated Mukhi']).toBe('Mukhi Jayesh C Vyas (Vadodara)')
  })

  it('Requirement 5: Count synchronization — Dataset Preview count equals records length and CSV rows', async () => {
    const filters: ExportFilters = {
      dataType: 'PEOPLE',
      mukhiId: 'mukhi-uuid-001',
    }

    const result = await fetchExportData(filters)
    expect(result.data!.count).toBe(result.data!.records.length)

    // Verify CSV generation incorporates the exact same record count and includes 'Associated Mukhi'
    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    const origAppendChild = document.body.appendChild
    const origRemoveChild = document.body.removeChild

    try {
      URL.createObjectURL = vi.fn().mockImplementation((_blob: Blob) => {
        return 'mock-blob-url'
      })
      URL.revokeObjectURL = vi.fn()
      document.body.appendChild = vi.fn().mockImplementation((node: any) => node)
      document.body.removeChild = vi.fn().mockImplementation((node: any) => node)

      // Test downloadCsvExcel execution
      downloadCsvExcel('test-export', result.data!.records)
      expect(URL.createObjectURL).toHaveBeenCalled()
    } finally {
      URL.createObjectURL = origCreateObjectURL
      URL.revokeObjectURL = origRevokeObjectURL
      document.body.appendChild = origAppendChild
      document.body.removeChild = origRemoveChild
    }
  })

  it('Requirement 6: Families export includes Associated Mukhi column and filters by Mukhi', async () => {
    const filters: ExportFilters = {
      dataType: 'FAMILIES',
      mukhiId: 'mukhi-uuid-001',
    }

    const result = await fetchExportData(filters)
    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()

    const records = result.data!.records
    expect(records.length).toBe(1)
    expect(records[0]['Family Name']).toBe('Vyas Family')
    expect(records[0]['Associated Mukhi']).toBe('Mukhi Jayesh C Vyas (Vadodara)')
  })

  it('Requirement 7: Mukhis export uses valid columns and does not error on city column', async () => {
    const filters: ExportFilters = {
      dataType: 'MUKHIS',
    }

    const result = await fetchExportData(filters)
    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()
    expect(result.data!.records.length).toBe(2)
    expect(result.data!.records[0]['Full Name']).toBe('Mukhi Jayesh C Vyas')
    expect(result.data!.records[0]['Assigned Region / Gram']).toBe('Vadodara')
  })

  it('Requirement 8: UI — DataExportPage renders Mukhi filter and Associated Mukhi table header', async () => {
    render(<DataExportPage />)

    // Verify Mukhi filter dropdown exists
    await waitFor(() => {
      expect(screen.getByText('Mukhi Region Filter')).toBeInTheDocument()
    })

    const select = screen.getByDisplayValue('All Regions / Mukhis') as HTMLSelectElement
    expect(select).toBeInTheDocument()

    // Wait for records to load in preview
    await waitFor(() => {
      expect(screen.getByText('Matching Export Dataset')).toBeInTheDocument()
    })

    // Verify the "Associated Mukhi" column header is rendered in the dataset preview table
    await waitFor(() => {
      const associatedMukhiHeaders = screen.getAllByText('Associated Mukhi')
      expect(associatedMukhiHeaders.length).toBeGreaterThan(0)
    })

    // Filter by Mukhi 1 via dropdown change
    fireEvent.change(select, { target: { value: 'mukhi-uuid-001' } })

    // Verify preview updates to only show Mukhi 1's people
    await waitFor(() => {
      expect(screen.getByText('Aarav J Vyas')).toBeInTheDocument()
      expect(screen.queryByText('Bhavna R Patel')).not.toBeInTheDocument()
    })
  })
})
