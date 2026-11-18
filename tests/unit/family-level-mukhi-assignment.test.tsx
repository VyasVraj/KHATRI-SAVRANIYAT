/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Comprehensive Unit Tests: Family-Level Mukhi Assignment System
 *
 * Validates the 10 Mandatory Test Scenarios (Section 10 of Implementation Prompt):
 * - Test 1: New family creation (All members added to family display same selected Mukhi)
 * - Test 2: Adding another member (Automatically inherits family Mukhi without individual selection)
 * - Test 3: Family with multiple generations (All relationships/generations have same Mukhi)
 * - Test 4: Change family Mukhi (All members immediately resolve to new Mukhi)
 * - Test 5: Occupation Directory (All family members display same family Mukhi)
 * - Test 6: Normal user view (Person Record and Family Profile show correct Mukhi)
 * - Test 7: Admin/Super Admin view and Export (Exported records show effective family Mukhi)
 * - Test 8: Existing family data (Existing family's selected_mukhi_id is source of truth for all members)
 * - Test 9: Family without Mukhi (All members show 'Mukhi Not Assigned')
 * - Test 10: Inactive or removed Mukhi (Shows inactive authority state; family/members intact)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getEffectivePersonMukhi,
} from '@/features/community/services/community-mukhis.service'
import {
  updateFamilyMukhi,
} from '@/features/families/services/families.service'
import {
  getPublicOccupationDirectory,
} from '@/features/people/services/public-occupation.service'
import {
  fetchExportData,
} from '@/features/admin/services/export.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'test-admin-uuid' } } },
      }),
    },
  },
}))

describe('Family-Level Mukhi Assignment System', () => {
  const MUKHI_GHANSHYAM = {
    id: 'mukhi-ghanshyam-uuid',
    source_serial_number: 10,
    mukhi_unique_id: 'MUK-0010',
    full_name: 'Mukhi Ghanshyam Khemchand Khuhha',
    gram: 'Vadodara',
    mobile_number: '9825100000',
    gotra: 'Agastya',
    nukh: 'Khuha',
    is_active: true,
    authority_status: 'ACTIVE',
  }

  const MUKHI_REPLACEMENT = {
    id: 'mukhi-replacement-uuid',
    source_serial_number: 25,
    mukhi_unique_id: 'MUK-0025',
    full_name: 'Mukhi Ramesh Chandra Vyas',
    gram: 'Surat',
    mobile_number: '9825200000',
    gotra: 'Krishna',
    nukh: 'Vyas',
    is_active: true,
    authority_status: 'ACTIVE',
  }

  const MUKHI_INACTIVE = {
    id: 'mukhi-inactive-uuid',
    source_serial_number: 99,
    mukhi_unique_id: 'MUK-0099',
    full_name: 'Mukhi Former Member',
    gram: 'Ahmedabad',
    mobile_number: '9825300000',
    gotra: 'Sudarshan',
    nukh: 'Patel',
    is_active: false,
    authority_status: 'REMOVED',
  }

  // 10 members of the multi-generational Vyas Family
  const VYAS_FAMILY_MEMBERS = [
    { id: 'm1', person_id: 'p-jayesh', name: 'Jayesh Chandrakant Vyas', role: 'Head' },
    { id: 'm2', person_id: 'p-jignasha', name: 'Jignasha Jayesh Vyas', role: 'Wife' },
    { id: 'm3', person_id: 'p-vraj', name: 'Vraj Jayeshbhai Vyas', role: 'Son' },
    { id: 'm4', person_id: 'p-dhruv', name: 'Dhruv Jayeshbhai Vyas', role: 'Son' },
    { id: 'm5', person_id: 'p-chandrakant', name: 'Chandrakant V Vyas', role: 'Father' },
    { id: 'm6', person_id: 'p-devila', name: 'Devila Chandrakant Vyas', role: 'Mother' },
    { id: 'm7', person_id: 'p-tushar', name: 'Tushar Chandrakant Vyas', role: 'Brother' },
    { id: 'm8', person_id: 'p-maya', name: 'Maya Tushar Vyas', role: 'Brother Wife' },
    { id: 'm9', person_id: 'p-harsh', name: 'Harsh Tushar Vyas', role: 'Nephew' },
    { id: 'm10', person_id: 'p-rajvi', name: 'Rajvi Harsh Vyas', role: 'Nephew Wife' },
  ]

  let familyState: any = {
    id: 'family-vyas-uuid',
    family_name: 'Vyas Family',
    selected_mukhi_id: 'mukhi-ghanshyam-uuid',
    city: 'Vadodara',
    deleted_at: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset family state
    familyState = {
      id: 'family-vyas-uuid',
      family_name: 'Vyas Family',
      selected_mukhi_id: 'mukhi-ghanshyam-uuid',
      city: 'Vadodara',
      deleted_at: null,
    }

    // Default supabase RPC mock
    ;(supabase.rpc as any).mockImplementation((_fn: string, _args: any) => {
      // Simulate RPC fallback to test standard client/PostgREST path
      return Promise.resolve({ data: null, error: { message: 'RPC fallback' } })
    })

    // Mock tables
    ;(supabase.from as any).mockImplementation((table: string) => {
      if (table === 'community_mukhis') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              if (col === 'id') {
                let found: any = null
                if (val === MUKHI_GHANSHYAM.id) found = MUKHI_GHANSHYAM
                else if (val === MUKHI_REPLACEMENT.id) found = MUKHI_REPLACEMENT
                else if (val === MUKHI_INACTIVE.id) found = MUKHI_INACTIVE

                return {
                  maybeSingle: vi.fn().mockResolvedValue({ data: found, error: null }),
                  single: vi.fn().mockResolvedValue({ data: found, error: null }),
                }
              }
              if (col === 'is_active' && val === true) {
                return Promise.resolve({
                  data: [MUKHI_GHANSHYAM, MUKHI_REPLACEMENT],
                  error: null,
                })
              }
              return Promise.resolve({ data: [], error: null })
            }),
            order: vi.fn().mockResolvedValue({
              data: [MUKHI_GHANSHYAM, MUKHI_REPLACEMENT],
              error: null,
            }),
          }),
        }
      }

      if (table === 'family_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col: string, val: any) => {
              if (col === 'person_id') {
                const found = VYAS_FAMILY_MEMBERS.find((m) => m.person_id === val)
                if (found) {
                  return {
                    is: vi.fn().mockReturnValue({
                      order: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue({
                          data: [
                            {
                              family_id: familyState.id,
                              families: familyState,
                            },
                          ],
                          error: null,
                        }),
                      }),
                    }),
                  }
                }
                // Unknown person / no family
                return {
                  is: vi.fn().mockReturnValue({
                    order: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue({
                        data: [],
                        error: null,
                      }),
                    }),
                  }),
                }
              }
              return Promise.resolve({ data: [], error: null })
            }),
            is: vi.fn().mockImplementation((col: string, val: any) => {
              if (col === 'left_at' && val === null) {
                return Promise.resolve({
                  data: VYAS_FAMILY_MEMBERS.map((m) => ({
                    person_id: m.person_id,
                    families: familyState,
                  })),
                  error: null,
                })
              }
              return Promise.resolve({ data: [], error: null })
            }),
          }),
        }
      }

      if (table === 'families') {
        return {
          update: vi.fn().mockImplementation((updates: any) => {
            if (updates.selected_mukhi_id !== undefined) {
              familyState.selected_mukhi_id = updates.selected_mukhi_id
            }
            return {
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { ...familyState },
                      error: null,
                    }),
                  }),
                }),
              }),
            }
          }),
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ ...familyState }],
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'persons') {
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: VYAS_FAMILY_MEMBERS.map((m) => ({
                  id: m.person_id,
                  first_name: m.name.split(' ')[0],
                  middle_name: m.name.split(' ')[1] || '',
                  last_name: m.name.split(' ')[2] || 'Vyas',
                  occupation: 'Professional',
                  status: 'ACTIVE',
                  created_at: '2026-01-01T10:00:00Z',
                })),
                error: null,
              }),
            }),
          }),
        }
      }

      if (table === 'public_occupation_directory') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: VYAS_FAMILY_MEMBERS.map((m) => ({
                person_id: m.person_id,
                full_name: m.name,
                occupation: 'Professional',
                associated_mukhi_name: MUKHI_GHANSHYAM.full_name,
                associated_mukhi_region: MUKHI_GHANSHYAM.gram,
                associated_mukhi_id: MUKHI_GHANSHYAM.id,
              })),
              error: null,
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

  it('Test 1 & 2: New Family Creation & Adding Members automatically inherits family Mukhi', async () => {
    // Member Jayesh (Head)
    const resHead = await getEffectivePersonMukhi('p-jayesh')
    expect(resHead.data?.status).toBe('ASSIGNED')
    expect(resHead.data?.mukhi?.full_name).toBe('Mukhi Ghanshyam Khemchand Khuhha')
    expect(resHead.data?.displayText).toBe('Mukhi Ghanshyam Khemchand Khuhha (Vadodara)')

    // Member Harsh (Added to existing family)
    const resNewMember = await getEffectivePersonMukhi('p-harsh')
    expect(resNewMember.data?.status).toBe('ASSIGNED')
    expect(resNewMember.data?.mukhi?.full_name).toBe('Mukhi Ghanshyam Khemchand Khuhha')
    expect(resNewMember.data?.displayText).toBe('Mukhi Ghanshyam Khemchand Khuhha (Vadodara)')
  })

  it('Test 3: Multiple Generations all resolve to the exact same family-selected Mukhi', async () => {
    // Verify each member across all 3 generations
    for (const member of VYAS_FAMILY_MEMBERS) {
      const res = await getEffectivePersonMukhi(member.person_id)
      expect(res.data?.status).toBe('ASSIGNED')
      expect(res.data?.mukhi?.id).toBe(MUKHI_GHANSHYAM.id)
      expect(res.data?.mukhi?.full_name).toBe('Mukhi Ghanshyam Khemchand Khuhha')
      expect(res.data?.displayText).toBe('Mukhi Ghanshyam Khemchand Khuhha (Vadodara)')
    }
  })

  it('Test 4: Change Family Mukhi updates all family members automatically', async () => {
    // Verify initial Mukhi for Jayesh and Harsh
    let resJayesh = await getEffectivePersonMukhi('p-jayesh')
    let resHarsh = await getEffectivePersonMukhi('p-harsh')
    expect(resJayesh.data?.mukhi?.full_name).toBe('Mukhi Ghanshyam Khemchand Khuhha')
    expect(resHarsh.data?.mukhi?.full_name).toBe('Mukhi Ghanshyam Khemchand Khuhha')

    // Change family Mukhi to Ramesh Chandra Vyas
    const updateRes = await updateFamilyMukhi(familyState.id, MUKHI_REPLACEMENT.id)
    expect(updateRes.error).toBeNull()
    expect(familyState.selected_mukhi_id).toBe(MUKHI_REPLACEMENT.id)

    // Verify both immediately reflect the new Mukhi without editing individual records
    resJayesh = await getEffectivePersonMukhi('p-jayesh')
    resHarsh = await getEffectivePersonMukhi('p-harsh')

    expect(resJayesh.data?.mukhi?.id).toBe(MUKHI_REPLACEMENT.id)
    expect(resJayesh.data?.mukhi?.full_name).toBe('Mukhi Ramesh Chandra Vyas')
    expect(resJayesh.data?.displayText).toBe('Mukhi Ramesh Chandra Vyas (Surat)')

    expect(resHarsh.data?.mukhi?.id).toBe(MUKHI_REPLACEMENT.id)
    expect(resHarsh.data?.mukhi?.full_name).toBe('Mukhi Ramesh Chandra Vyas')
    expect(resHarsh.data?.displayText).toBe('Mukhi Ramesh Chandra Vyas (Surat)')
  })

  it('Test 5: Occupation Directory displays same family-selected Mukhi for all members', async () => {
    const dirResult = await getPublicOccupationDirectory()
    expect(dirResult.error).toBeNull()
    expect(dirResult.data.length).toBe(10)

    for (const item of dirResult.data) {
      expect(item.associated_mukhi_name).toBe('Mukhi Ghanshyam Khemchand Khuhha')
      expect(item.associated_mukhi_region).toBe('Vadodara')
      expect(item.associated_mukhi_id).toBe('mukhi-ghanshyam-uuid')
    }
  })

  it('Test 6 & 7: Admin Export displays effective family-selected Mukhi for all members', async () => {
    const exportResult = await fetchExportData({ dataType: 'PEOPLE' })
    expect(exportResult.error).toBeNull()
    expect(exportResult.data).toBeDefined()

    const records = exportResult.data!.records
    expect(records.length).toBe(10)

    for (const r of records) {
      expect(r['Associated Mukhi']).toBe('Mukhi Ghanshyam Khemchand Khuhha (Vadodara)')
    }
  })

  it('Test 8: Existing family data serves as single source of truth for all members', async () => {
    // Existing family has MUKHI_GHANSHYAM selected
    const resVraj = await getEffectivePersonMukhi('p-vraj')
    const resDhruv = await getEffectivePersonMukhi('p-dhruv')

    expect(resVraj.data?.mukhi?.id).toBe('mukhi-ghanshyam-uuid')
    expect(resDhruv.data?.mukhi?.id).toBe('mukhi-ghanshyam-uuid')
  })

  it('Test 9: Family without Mukhi displays "Mukhi Not Assigned" without guessing', async () => {
    // Clear family Mukhi
    familyState.selected_mukhi_id = null

    const resJayesh = await getEffectivePersonMukhi('p-jayesh')
    expect(resJayesh.data?.status).toBe('UNASSIGNED')
    expect(resJayesh.data?.mukhi).toBeNull()
    expect(resJayesh.data?.displayText).toBe('Mukhi Not Assigned')

    // Person without family
    const resNoFam = await getEffectivePersonMukhi('p-unknown-external')
    expect(resNoFam.data?.status).toBe('NO_FAMILY')
    expect(resNoFam.data?.mukhi).toBeNull()
    expect(resNoFam.data?.displayText).toBe('Mukhi Not Assigned')
  })

  it('Test 10: Inactive or removed Mukhi displays inactive authority state; family/members intact', async () => {
    // Set family Mukhi to inactive Mukhi
    familyState.selected_mukhi_id = MUKHI_INACTIVE.id

    const resJayesh = await getEffectivePersonMukhi('p-jayesh')
    expect(resJayesh.data?.status).toBe('INACTIVE_AUTHORITY')
    expect(resJayesh.data?.mukhi).toBeNull() // Not an active authority
    expect(resJayesh.data?.displayText).toBe('Mukhi Authority Inactive')

    // Ensure family and member records remain completely intact
    expect(familyState.id).toBe('family-vyas-uuid')
    expect(familyState.family_name).toBe('Vyas Family')
    expect(VYAS_FAMILY_MEMBERS.length).toBe(10)
  })
})
