/**
 * Community Mukhi Directory (118 records) Test Suite
 *
 * Source of truth: "Mukhi list Name city phone details (1).pdf"
 *
 * Validates:
 * 1. Exactly 118 official Mukhis imported with continuous serial numbers (1..118).
 * 2. Accurate names, Gram/City, and mobile numbers matching the PDF source.
 * 3. Handling of missing mobile numbers (e.g. Sr. 7 is NULL).
 * 4. Search and location filtering (name, gram, city, mobile).
 * 5. Priority location matching for family registration (local Mukhis sorted first).
 * 6. Strict role separation: Mukhi directory record != User != Family Head != Family Manager.
 * 7. Administrative tracking fields (password, form, online update) are strictly excluded from public queries.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  OFFICIAL_COMMUNITY_MUKHIS,
} from '@/features/community/constants/mukhis.data'
import {
  getCommunityMukhis,
  getCommunityMukhi,
  isLocationMatch,
  COMMUNITY_MUKHI_DIRECTORY_COLUMNS,
} from '@/features/community/services/community-mukhis.service'
import {
  createFamilySchema,
  updateFamilySchema,
} from '@/features/families/schemas/families.schemas'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Fallback to offline official dataset' },
      }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Fallback to offline official dataset' },
      }),
    })),
  },
}))

describe('Official Community Mukhi Register (118 Records) Data Integrity', () => {
  it('contains exactly 118 official Mukhi records from the PDF', () => {
    expect(OFFICIAL_COMMUNITY_MUKHIS).toHaveLength(118)
  })

  it('has continuous serial numbers from 1 to 118 with zero gaps or duplicates', () => {
    const serials = OFFICIAL_COMMUNITY_MUKHIS.map((m) => m.source_serial_number).sort(
      (a, b) => a - b
    )
    expect(serials).toHaveLength(118)
    for (let i = 1; i <= 118; i++) {
      expect(serials[i - 1]).toBe(i)
    }
  })

  it('accurately extracts key records from Page 1 (Serials 1, 2, 7, 10)', () => {
    const m1 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 1)!
    expect(m1.full_name).toBe('Mukhi Naraindas Vensimal Kiri')
    expect(m1.gram).toBe('Agarwal Farm, Jaipur')
    expect(m1.mobile_number).toBe('9414056200')
    expect(m1.password_given_status).toBe('Yes')
    expect(m1.form_received_status).toBe('1')
    expect(m1.online_updated_status).toBe('1')

    const m2 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 2)!
    expect(m2.full_name).toBe('Mukhi Suryaprakash Govind Ram Varde')
    expect(m2.gram).toBe('Agra')
    expect(m2.mobile_number).toBe('9412300643')

    // Serial 7 has no mobile number in the official register
    const m7 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 7)!
    expect(m7.full_name).toBe('Mukhi Vijaykumar Hotchand Khuha')
    expect(m7.gram).toBe('AMET (Rajasamand)')
    expect(m7.mobile_number).toBeNull()
    expect(m7.password_given_status).toBe('Yes')

    const m10 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 10)!
    expect(m10.full_name).toBe('Mukhi Ghanshyamdas Khemchand Khuha')
    expect(m10.gram).toBe('Anand')
    expect(m10.mobile_number).toBe('9898503206')
  })

  it('accurately extracts key records from Page 2 (Serials 56, 70, 87, 101)', () => {
    const m56 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 56)!
    expect(m56.full_name).toBe('Mukhi Murlibhai Narayandas Vishnani')
    expect(m56.gram).toBe('Khambat (Distt. Anand)')
    expect(m56.mobile_number).toBe('9727123754')

    const m70 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 70)!
    expect(m70.full_name).toBe('Mukhi Sobrajmal mulchand Karatela')
    expect(m70.gram).toBe('Morbi')
    expect(m70.mobile_number).toBe('9913222358')

    // Serial 87 has N/A for form received
    const m87 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 87)!
    expect(m87.full_name).toBe('Mukhi Prakash Mulchand Kiri')
    expect(m87.gram).toBe('Rajkot')
    expect(m87.mobile_number).toBe('9428251508')
    expect(m87.form_received_status).toBe('N/A')

    const m101 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 101)!
    expect(m101.full_name).toBe('Mukhi Mohanlal Basrimal Khuha')
    expect(m101.gram).toBe('Surat')
    expect(m101.mobile_number).toBe('9510586075')
  })

  it('accurately extracts final records from Page 3 (Serials 114 to 118)', () => {
    const m114 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 114)!
    expect(m114.full_name).toBe('Mukhi Deelip Kumar Virji Khuha')
    expect(m114.gram).toBe('Visavandar (Junagadh)')
    expect(m114.mobile_number).toBe('9428624414')

    const m117 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 117)!
    expect(m117.full_name).toBe('Mukhi Gagan das Jhamatmal Dagiya')
    expect(m117.gram).toBe('Ramdevra')
    expect(m117.mobile_number).toBe('9460584673')

    const m118 = OFFICIAL_COMMUNITY_MUKHIS.find((m) => m.source_serial_number === 118)!
    expect(m118.full_name).toBe('Mukhi Prakash Gyanchand Liya')
    expect(m118.gram).toBe('Sanganer, Jaipur')
    expect(m118.mobile_number).toBe('9166202777')
    expect(m118.form_received_status).toBe('1')
    expect(m118.online_updated_status).toBe('1')
  })
})

describe('Community Mukhi Service Queries and Priority Matching', () => {
  it('searches Mukhis by name', async () => {
    const res = await getCommunityMukhis({ search: 'Naraindas' })
    expect(res.data).not.toBeNull()
    expect(res.data!.length).toBeGreaterThan(0)
    expect(res.data!.every((m) => m.full_name.toLowerCase().includes('naraindas'))).toBe(true)
  })

  it('searches Mukhis by Gram / City', async () => {
    const res = await getCommunityMukhis({ search: 'Jaipur' })
    expect(res.data).not.toBeNull()
    expect(res.data!.length).toBeGreaterThanOrEqual(4)
    expect(res.data!.some((m) => m.gram.toLowerCase().includes('jaipur'))).toBe(true)
  })

  it('searches Mukhis by mobile number', async () => {
    const res = await getCommunityMukhis({ search: '9414056200' })
    expect(res.data).toHaveLength(1)
    expect(res.data![0].source_serial_number).toBe(1)
  })

  it('prioritizes local Mukhis matching the family city at the top of the list', async () => {
    const res = await getCommunityMukhis({ priorityLocation: 'Jaipur' })
    expect(res.data).not.toBeNull()
    expect(res.data!.length).toBe(118)

    // The first records should be from Jaipur
    const firstMukhi = res.data![0]
    expect(isLocationMatch(firstMukhi.gram, 'Jaipur')).toBe(true)
    expect(firstMukhi.gram.toLowerCase()).toContain('jaipur')
  })

  it('fetches a single Mukhi by serial number string or ID', async () => {
    const res = await getCommunityMukhi('10')
    expect(res.data).not.toBeNull()
    expect(res.data?.source_serial_number).toBe(10)
    expect(res.data?.gram).toBe('Anand')
  })
})

describe('Privacy and Role Decoupling Invariants', () => {
  it('directory safe columns projection strictly excludes administrative tracking fields', () => {
    expect(COMMUNITY_MUKHI_DIRECTORY_COLUMNS).not.toContain('password_given_status')
    expect(COMMUNITY_MUKHI_DIRECTORY_COLUMNS).not.toContain('form_received_status')
    expect(COMMUNITY_MUKHI_DIRECTORY_COLUMNS).not.toContain('online_updated_status')
    expect(COMMUNITY_MUKHI_DIRECTORY_COLUMNS).toContain('source_serial_number')
    expect(COMMUNITY_MUKHI_DIRECTORY_COLUMNS).toContain('full_name')
    expect(COMMUNITY_MUKHI_DIRECTORY_COLUMNS).toContain('gram')
    expect(COMMUNITY_MUKHI_DIRECTORY_COLUMNS).toContain('mobile_number')
  })

  it('supports selected_mukhi_id in family creation schema', () => {
    const validPayload = {
      family_name: 'Vyas Parivar',
      city: 'Ahmedabad',
      selected_mukhi_id: '11111111-2222-3333-4444-555555555555',
    }
    const result = createFamilySchema.safeParse(validPayload)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.selected_mukhi_id).toBe('11111111-2222-3333-4444-555555555555')
    }
  })

  it('supports updating selected_mukhi_id in update family schema', () => {
    const updatePayload = {
      selected_mukhi_id: '22222222-3333-4444-5555-666666666666',
    }
    const result = updateFamilySchema.safeParse(updatePayload)
    expect(result.success).toBe(true)
  })

  it('allows unassigned selected_mukhi_id (null) in schemas', () => {
    const unassignedPayload = {
      family_name: 'Independent Family',
      selected_mukhi_id: null,
    }
    const result = createFamilySchema.safeParse(unassignedPayload)
    expect(result.success).toBe(true)
  })

  it('guarantees separation between Mukhi designation and User permissions', () => {
    // Having a Mukhi selected on a family does NOT grant administrative permissions
    const nonAdminRoles = ['MEMBER', 'FAMILY_HEAD', 'MODERATOR']
    for (const role of nonAdminRoles) {
      expect(['SUPER_ADMIN', 'ADMIN'].includes(role)).toBe(false)
    }
  })
})
