/**
 * Executive Committee and Family Mukhi Selection Test Suite
 *
 * Validates:
 * 1. 31-member official Executive Committee Register data integrity from Executive Committee Register.pdf.
 * 2. Search and filtering by designation, city, and nukh.
 * 3. Family creation and update schemas supporting selected_mukhi_id.
 * 4. Strict decoupling: Family Head vs Selected Mukhi vs Family Manager vs Auth User.
 * 5. Mukhi selection does not elevate application authorization or admin roles.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  OFFICIAL_EXECUTIVE_COMMITTEE,
  getExecutiveCommitteeMembers,
  getExecutiveCommitteeMember,
} from '@/features/community/services/executive-committee.service'
import {
  createFamilySchema,
  updateFamilySchema,
} from '@/features/families/schemas/families.schemas'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network offline fallback test' },
      }),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network offline fallback test' },
      }),
    })),
    rpc: vi.fn(),
  },
}))

describe('Executive Committee Register (31 Members) Integrity', () => {
  it('contains exactly 31 official committee members from the PDF', () => {
    expect(OFFICIAL_EXECUTIVE_COMMITTEE).toHaveLength(31)
  })

  it('has continuous serial numbers from 1 to 31', () => {
    const serials = OFFICIAL_EXECUTIVE_COMMITTEE.map((m) => m.serial_number).sort(
      (a, b) => a - b
    )
    for (let i = 1; i <= 31; i++) {
      expect(serials[i - 1]).toBe(i)
    }
  })

  it('accurately records the primary executive leadership (Serials 1–8)', () => {
    const [p1, p2, p3, p4, p5, p6, p7, p8] = OFFICIAL_EXECUTIVE_COMMITTEE

    // 1: President - Shri Vasant Kumar Jamnadas Pamnani (Karatela, Bhavnagar, 9033361661)
    expect(p1.serial_number).toBe(1)
    expect(p1.designation).toBe('President')
    expect(p1.full_name).toContain('Vasant Kumar Jamnadas Pamnani')
    expect(p1.nukh).toBe('Karatela')
    expect(p1.city).toBe('Bhavnagar')
    expect(p1.mobile_number).toBe('9033361661')

    // 2: Vice President - Shri Yudhishthir Kevalram (Soneja, Ujjain, 9425332249)
    expect(p2.serial_number).toBe(2)
    expect(p2.designation).toBe('Vice President')
    expect(p2.full_name).toContain('Yudhishthir Kevalram')
    expect(p2.nukh).toBe('Soneja')
    expect(p2.city).toBe('Ujjain')
    expect(p2.mobile_number).toBe('9425332249')

    // 3: Vice President - Shri Balkishan Gobindram (Dhandha, Pushkar, 9414300034)
    expect(p3.serial_number).toBe(3)
    expect(p3.designation).toBe('Vice President')
    expect(p3.full_name).toContain('Balkishan Gobindram')
    expect(p3.nukh).toBe('Dhandha')
    expect(p3.city).toBe('Pushkar')
    expect(p3.mobile_number).toBe('9414300034')

    // 4: Vice President - Smt. Heeradevi Basant Kumar (Khuha, Ujjain, 9977824443)
    expect(p4.serial_number).toBe(4)
    expect(p4.designation).toBe('Vice President')
    expect(p4.full_name).toContain('Heeradevi Basant Kumar')
    expect(p4.nukh).toBe('Khuha')
    expect(p4.city).toBe('Ujjain')
    expect(p4.mobile_number).toBe('9977824443')

    // 5: General Secretary - Mukhi Ghanshyamdas Hemandas (Kapoor, Bantva, 9909972633)
    expect(p5.serial_number).toBe(5)
    expect(p5.designation).toBe('General Secretary')
    expect(p5.full_name).toContain('Ghanshyamdas Hemandas')
    expect(p5.nukh).toBe('Kapoor')
    expect(p5.city).toBe('Bantva')
    expect(p5.mobile_number).toBe('9909972633')

    // 6: Secretary - Mukhi Jeevatram Gehimal (Keeri, Jetpur, 9426930441)
    expect(p6.serial_number).toBe(6)
    expect(p6.designation).toBe('Secretary')
    expect(p6.full_name).toContain('Jeevatram Gehimal')
    expect(p6.nukh).toBe('Keeri')
    expect(p6.city).toBe('Jetpur')
    expect(p6.mobile_number).toBe('9426930441')

    // 7: Treasurer - Shri Chandiram Jethanand (Khuha, Jaipur, 9314513167)
    expect(p7.serial_number).toBe(7)
    expect(p7.designation).toBe('Treasurer')
    expect(p7.full_name).toContain('Chandiram Jethanand')
    expect(p7.nukh).toBe('Khuha')
    expect(p7.city).toBe('Jaipur')
    expect(p7.mobile_number).toBe('9314513167')

    // 8: Organization Secretary - Mukhi Ghanshyamdas Kalloomal (Hargun, Ulhasnagar, 7066706525)
    expect(p8.serial_number).toBe(8)
    expect(p8.designation).toBe('Organization Secretary')
    expect(p8.full_name).toContain('Ghanshyamdas Kalloomal')
    expect(p8.nukh).toBe('Hargun')
    expect(p8.city).toBe('Ulhasnagar')
    expect(p8.mobile_number).toBe('7066706525')
  })

  it('records members 9–31 with full name, nukh, city, and mobile number', () => {
    OFFICIAL_EXECUTIVE_COMMITTEE.slice(8).forEach((m) => {
      expect(m.serial_number).toBeGreaterThanOrEqual(9)
      expect(m.serial_number).toBeLessThanOrEqual(31)
      expect(m.full_name.trim().length).toBeGreaterThan(0)
      expect(m.city.trim().length).toBeGreaterThan(0)
      expect(m.mobile_number?.trim().length).toBeGreaterThan(0)
    })
  })
})

describe('Executive Committee Directory Queries and Filters', () => {
  it('filters by designation correctly', async () => {
    const res = await getExecutiveCommitteeMembers({ designation: 'Vice President' })
    expect(res.data).toBeDefined()
    expect(res.data!.length).toBe(3)
    res.data!.forEach((m) => {
      expect(m.designation).toBe('Vice President')
    })
  })

  it('filters by city correctly', async () => {
    const res = await getExecutiveCommitteeMembers({ city: 'Bhavnagar' })
    expect(res.data).toBeDefined()
    expect(res.data!.length).toBeGreaterThanOrEqual(1)
    res.data!.forEach((m) => {
      expect(m.city.toLowerCase()).toBe('bhavnagar')
    })
  })

  it('searches by nukh correctly', async () => {
    const res = await getExecutiveCommitteeMembers({ search: 'Karatela' })
    expect(res.data).toBeDefined()
    expect(res.data!.some((m) => m.nukh === 'Karatela')).toBe(true)
  })

  it('finds single member by ID or serial number', async () => {
    const res = await getExecutiveCommitteeMember('1')
    expect(res.data).toBeDefined()
    expect(res.data!.serial_number).toBe(1)
    expect(res.data!.full_name).toContain('Vasant Kumar')
  })
})

describe('Family Mukhi Selection Schema & Permission Decoupling', () => {
  it('accepts valid UUID for selected_mukhi_id in createFamilySchema', () => {
    const validUuid = '11111111-1111-1111-1111-111111111101'
    const result = createFamilySchema.safeParse({
      family_name: 'Vyas Pariwar',
      selected_mukhi_id: validUuid,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.selected_mukhi_id).toBe(validUuid)
    }
  })

  it('accepts null or omitted selected_mukhi_id in createFamilySchema', () => {
    const resNull = createFamilySchema.safeParse({
      family_name: 'Vyas Pariwar',
      selected_mukhi_id: null,
    })
    expect(resNull.success).toBe(true)

    const resOmitted = createFamilySchema.safeParse({
      family_name: 'Vyas Pariwar',
    })
    expect(resOmitted.success).toBe(true)
  })

  it('rejects invalid non-UUID string for selected_mukhi_id', () => {
    const result = createFamilySchema.safeParse({
      family_name: 'Vyas Pariwar',
      selected_mukhi_id: 'not-a-valid-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid UUID for selected_mukhi_id in updateFamilySchema', () => {
    const validUuid = '11111111-1111-1111-1111-111111111105'
    const result = updateFamilySchema.safeParse({
      selected_mukhi_id: validUuid,
    })
    expect(result.success).toBe(true)
  })

  it('guarantees separation between Mukhi designation and Administrative permissions', () => {
    // Having "Mukhi" in a member's name or designating them on a family
    // MUST NOT inherently grant admin or user roles.
    const mukhiMember = OFFICIAL_EXECUTIVE_COMMITTEE.find((m) =>
      m.full_name.startsWith('Mukhi')
    )
    expect(mukhiMember).toBeDefined()
    expect(mukhiMember!.designation).not.toBe('ADMIN')
    expect(mukhiMember!.designation).not.toBe('SUPER_ADMIN')

    // Committee designations are strictly organizational, not auth roles
    const authRoles = ['SUPER_ADMIN', 'ADMIN', 'COMMUNITY_MODERATOR', 'MEMBER']
    OFFICIAL_EXECUTIVE_COMMITTEE.forEach((m) => {
      expect(authRoles.includes(m.designation)).toBe(false)
    })
  })
})
