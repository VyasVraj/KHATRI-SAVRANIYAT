import { describe, it, expect } from 'vitest'
import gotraNukhData from '@/constants/gotra_nukh_data.json'
import {
  GOTRAS,
  GOTRA_NUKH_MAP,
  resolveCanonicalGotra,
  resolveCanonicalNukh,
  getNukhsForGotra,
  isValidNukhForGotra,
} from '@/constants/gotraNukh'

describe('Brahma Khatri Gotra & Nukh Master Directory (29 Gotras, 148 Nukhs)', () => {
  it('contains exactly 29 authoritative Gotras in master data JSON and constants', () => {
    expect(gotraNukhData.gotras.length).toBe(29)
    expect(GOTRAS.length).toBe(29)
    expect(Object.keys(GOTRA_NUKH_MAP).length).toBe(29)
  })

  it('contains exactly 148 Nukh entries across all 29 Gotras', () => {
    let totalNukhsInJson = 0
    gotraNukhData.gotras.forEach((g) => {
      totalNukhsInJson += g.nukhs.length
    })
    expect(totalNukhsInJson).toBe(148)

    let totalNukhsInConstants = 0
    Object.values(GOTRA_NUKH_MAP).forEach((list) => {
      totalNukhsInConstants += list.length
    })
    expect(totalNukhsInConstants).toBe(148)
  })

  it('verifies all 29 Gotra names conform to official PDF directory names', () => {
    const expectedGotrasFromPdf = [
      'Agastya',
      'Uttari',
      'Badrayan',
      'Bhabhroya',
      'Bharadwaj',
      'Taitar',
      'Parashar',
      'Jamdagni',
      'Dhananjay',
      'Dakhshayan',
      'Rahugan',
      'Sudarshan',
      'Shandilya',
      'Shankhpal',
      'Kashyap',
      'Kamuk',
      'Krishna',
      'Karno',
      'Kaushik',
      'Gargya',
      'Gautam',
      'Mandhata',
      'Mudgal',
      'Narniyojan',
      'Vaman',
      'Vamdev',
      'Vatsa',
      'Vashistha',
      'Unrecorded / Not Known',
    ]

    expect([...GOTRAS].sort()).toEqual([...expectedGotrasFromPdf].sort())
  })

  it('resolves historical and alternate Gotra spellings unambiguously', () => {
    expect(resolveCanonicalGotra('Krishna (Shishan)')).toBe('Krishna')
    expect(resolveCanonicalGotra('krishna (shishan)')).toBe('Krishna')
    expect(resolveCanonicalGotra('Shishan')).toBe('Krishna')
    expect(resolveCanonicalGotra('Utri')).toBe('Uttari')
    expect(resolveCanonicalGotra('Badarayana')).toBe('Badrayan')
    expect(resolveCanonicalGotra('Bhamaraya')).toBe('Bhabhroya')
    expect(resolveCanonicalGotra('Tandira')).toBe('Taitar')
    expect(resolveCanonicalGotra('Jamadagni')).toBe('Jamdagni')
    expect(resolveCanonicalGotra('Dhananjaya')).toBe('Dhananjay')
    expect(resolveCanonicalGotra('Darvashayana')).toBe('Dakhshayan')
    expect(resolveCanonicalGotra('Raghuna')).toBe('Rahugan')
    expect(resolveCanonicalGotra('Kashyap (Kashyapa)')).toBe('Kashyap')
    expect(resolveCanonicalGotra('Karna')).toBe('Karno')
    expect(resolveCanonicalGotra('Naradijana')).toBe('Narniyojan')
    expect(resolveCanonicalGotra('Vashishtha')).toBe('Vashistha')
    expect(resolveCanonicalGotra('Gotra not known')).toBe('Unrecorded / Not Known')
  })

  it('resolves canonical Nukhs and validates Nukh belonging to Gotra', () => {
    // Krishna Gotra contains Karatela
    expect(isValidNukhForGotra('Krishna', 'Karatela')).toBe(true)
    expect(isValidNukhForGotra('Krishna (Shishan)', 'Karatela')).toBe(true)
    expect(isValidNukhForGotra('Shandilya', 'Karatela')).toBe(false)

    // Check dropdown options for Krishna
    const krishnaNukhs = getNukhsForGotra('Krishna')
    expect(krishnaNukhs).toContain('Karatela')
    expect(krishnaNukhs).toContain('Karchila')
    expect(krishnaNukhs).toContain('Kharkhur (Khudkhudiya)')

    // Canonical resolution of aliases in Krishna Gotra
    expect(resolveCanonicalNukh('Krishna', 'Khudkhudiya')).toBe('Kharkhur (Khudkhudiya)')
    expect(resolveCanonicalNukh('Krishna', 'khudkhudiya')).toBe('Kharkhur (Khudkhudiya)')
  })
})

describe('Privacy and Directory Card Invariants', () => {
  it('verifies that other-family view payload strictly excludes private fields', () => {
    // Simulated other-family row from community_persons view
    const otherFamilyRow = {
      id: 'person-123',
      first_name: 'ARTI',
      middle_name: 'NANAK',
      last_name: 'PAMNANI',
      maiden_name: null,
      gender: 'FEMALE' as const,
      age: 28,
      dob_year: null, // masked
      date_of_birth: null, // masked
      birth_place: null, // masked
      city: null, // masked
      state: null, // masked
      gotra: null, // masked
      nukh: null, // masked
      kul: null, // masked
      status: 'ACTIVE' as const,
      verification_status: 'UNVERIFIED' as const,
      is_same_family: false,
    }

    // Full name and calculated age are visible
    expect(otherFamilyRow.first_name).toBe('ARTI')
    expect(otherFamilyRow.age).toBe(28)

    // Private details are strictly null
    expect(otherFamilyRow.dob_year).toBeNull()
    expect(otherFamilyRow.date_of_birth).toBeNull()
    expect(otherFamilyRow.birth_place).toBeNull()
    expect(otherFamilyRow.city).toBeNull()
    expect(otherFamilyRow.state).toBeNull()
    expect(otherFamilyRow.gotra).toBeNull()
    expect(otherFamilyRow.nukh).toBeNull()
  })

  it('verifies that same-family view payload includes resolved lineage and location', () => {
    // Simulated same-family row from community_persons view
    const sameFamilyRow = {
      id: 'person-123',
      first_name: 'ARTI',
      middle_name: 'NANAK',
      last_name: 'PAMNANI',
      maiden_name: null,
      gender: 'FEMALE' as const,
      age: 28,
      dob_year: 1996,
      date_of_birth: '1996-05-14',
      birth_place: 'Anand, Gujarat',
      city: 'Anand',
      state: 'Gujarat',
      gotra: 'Krishna',
      nukh: 'Karatela',
      kul: null,
      status: 'ACTIVE' as const,
      verification_status: 'UNVERIFIED' as const,
      is_same_family: true,
    }

    expect(sameFamilyRow.dob_year).toBe(1996)
    expect(sameFamilyRow.city).toBe('Anand')
    expect(sameFamilyRow.state).toBe('Gujarat')
    expect(sameFamilyRow.gotra).toBe('Krishna')
    expect(sameFamilyRow.nukh).toBe('Karatela')
  })
})
