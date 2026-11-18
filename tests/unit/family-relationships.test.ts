/**
 * Comprehensive Unit Tests: Khatri Sarvaniyat English + Hindi Family Relationships Reference
 *
 * Source: Family_Relationships_English_Hindi_Reference(1).pdf
 * Verification of:
 * - 13 official categories + 1 fallback section
 * - 123 total relationship definitions
 * - Exact "English (Hindi)" display formatting
 * - Multilingual English + Devanagari Hindi search
 * - Reciprocal relationship derivation by gender
 * - Legacy compatibility & non-destructive format conversions
 * - Mapping to public.family_role database enum
 */

import { describe, it, expect } from 'vitest'
import {
  FAMILY_RELATIONSHIP_CATEGORIES,
  ALL_FAMILY_RELATIONSHIPS,
  ALL_DISPLAY_RELATIONSHIPS,
  getRelationshipDefinition,
  formatRelationshipDisplay,
  getReciprocalRelationship,
  mapRelationshipToFamilyRole,
} from '@/constants/familyRelationships'

describe('Family Relationships English + Hindi Reference System', () => {
  it('covers all 13 official PDF categories and comprehensive relationship options', () => {
    expect(FAMILY_RELATIONSHIP_CATEGORIES.length).toBe(13)
    expect(FAMILY_RELATIONSHIP_CATEGORIES[0].categoryName).toBe('Immediate family and spouse')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[1].categoryName).toBe('Grandparents, grandchildren and ancestors')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[2].categoryName).toBe('Siblings and half/step siblings')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[3].categoryName).toBe('Aunts, uncles and their spouses')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[4].categoryName).toBe('Cousins and cousin-side relations')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[5].categoryName).toBe('Nephews, nieces and ALL their branches')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[6].categoryName).toBe("In-laws: spouse's family and child's spouse")
    expect(FAMILY_RELATIONSHIP_CATEGORIES[7].categoryName).toBe('Step-family, adoptive and foster relationships')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[8].categoryName).toBe('Further generations and extended descendants')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[9].categoryName).toBe('Guardian, household and social/ceremonial ties')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[10].categoryName).toBe('Former, deceased and relationship status')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[11].categoryName).toBe('Reciprocal and derived relationships for family-tree software')
    expect(FAMILY_RELATIONSHIP_CATEGORIES[12].categoryName).toBe('Other / Specify Community Relationship')
  })

  it('contains all 162 total options with valid canonical keys and definitions', () => {
    expect(ALL_FAMILY_RELATIONSHIPS.length).toBe(162)
    expect(ALL_DISPLAY_RELATIONSHIPS.length).toBe(162)

    const allKeys = new Set<string>()
    for (const cat of FAMILY_RELATIONSHIP_CATEGORIES) {
      for (const item of cat.items) {
        expect(item.canonicalKey).toBeTruthy()
        expect(allKeys.has(item.canonicalKey)).toBe(false) // No duplicate keys
        allKeys.add(item.canonicalKey)

        expect(item.englishLabel).toBeTruthy()
        expect(item.hindiLabel).toBeTruthy()
        expect(item.displayLabel).toContain(item.hindiLabel)
        expect(item.meaning).toBeTruthy()
        expect(['MALE', 'FEMALE', 'NEUTRAL']).toContain(item.gender)
      }
    }
  })

  it('formats every relationship strictly as "English (Hindi)"', () => {
    expect(formatRelationshipDisplay('Father')).toBe('Father (पिता)')
    expect(formatRelationshipDisplay('Mother')).toBe('Mother (माता)')
    expect(formatRelationshipDisplay('Son')).toBe('Son (बेटा)')
    expect(formatRelationshipDisplay('Daughter')).toBe('Daughter (बेटी)')
    expect(formatRelationshipDisplay('Husband')).toBe('Husband (पति)')
    expect(formatRelationshipDisplay('Wife')).toBe('Wife (पत्नी)')
    expect(formatRelationshipDisplay('Paternal uncle')).toBe('Paternal uncle (चाचा / ताऊ)')
    expect(formatRelationshipDisplay('Maternal uncle')).toBe('Maternal uncle (मामा)')
    expect(formatRelationshipDisplay('Paternal aunt')).toBe('Paternal aunt (बुआ)')
    expect(formatRelationshipDisplay('Maternal aunt')).toBe('Maternal aunt (मौसी)')
    expect(formatRelationshipDisplay('Grandfather')).toBe('Grandfather (दादा / नाना)')
    expect(formatRelationshipDisplay('Grandmother')).toBe('Grandmother (दादी / नानी)')
    expect(formatRelationshipDisplay('Elder brother')).toBe('Elder brother (बड़ा भाई)')
    expect(formatRelationshipDisplay('Younger sister')).toBe('Younger sister (छोटी बहन)')
    expect(formatRelationshipDisplay('Stepfather')).toBe('Stepfather (सौतेले पिता)')
    expect(formatRelationshipDisplay('Adopted son')).toBe('Adopted son (गोद लिया हुआ बेटा)')
    expect(formatRelationshipDisplay('Widow')).toBe('Widow (विधवा)')
    expect(formatRelationshipDisplay('Deceased father')).toBe('Deceased father (दिवंगत पिता)')
  })

  it('resolves relationship definitions from canonical keys, English, and Hindi', () => {
    // By canonical key
    const defKey = getRelationshipDefinition('paternal_uncle')
    expect(defKey).toBeDefined()
    expect(defKey?.englishLabel).toBe('Paternal uncle')
    expect(defKey?.hindiLabel).toBe('चाचा / ताऊ')

    // By English label
    const defEng = getRelationshipDefinition('Maternal aunt')
    expect(defEng).toBeDefined()
    expect(defEng?.canonicalKey).toBe('maternal_aunt')

    // By Display label
    const defDisp = getRelationshipDefinition('Wife (पत्नी)')
    expect(defDisp).toBeDefined()
    expect(defDisp?.canonicalKey).toBe('wife')

    // By Hindi text
    const defHindi = getRelationshipDefinition('मौसी')
    expect(defHindi).toBeDefined()
    expect(defHindi?.canonicalKey).toBe('maternal_aunt')
  })

  it('derives accurate reciprocal relationships based on target gender', () => {
    // 1. Father of a MALE -> Son (बेटा)
    const rec1 = getReciprocalRelationship('father', 'MALE')
    expect(rec1?.displayLabel).toBe('Son (बेटा)')

    // 2. Father of a FEMALE -> Daughter (बेटी)
    const rec2 = getReciprocalRelationship('father', 'FEMALE')
    expect(rec2?.displayLabel).toBe('Daughter (बेटी)')

    // 3. Husband of a FEMALE -> Wife (पत्नी)
    const rec3 = getReciprocalRelationship('husband', 'FEMALE')
    expect(rec3?.displayLabel).toBe('Wife (पत्नी)')

    // 4. Paternal uncle of a MALE -> Nephew (भतीजा / भांजा)
    const rec4 = getReciprocalRelationship('paternal_uncle', 'MALE')
    expect(rec4?.displayLabel).toBe('Nephew (भतीजा / भांजा)')

    // 5. Grandfather of a FEMALE -> Granddaughter (पोती / नातिन)
    const rec5 = getReciprocalRelationship('grandfather', 'FEMALE')
    expect(rec5?.displayLabel).toBe('Granddaughter (पोती / नातिन)')

    // 6. Elder brother of a MALE -> Younger brother (छोटा भाई)
    const rec6 = getReciprocalRelationship('elder_brother', 'MALE')
    expect(rec6?.displayLabel).toBe('Younger brother (छोटा भाई)')
  })

  it('preserves custom "Other: XYZ" specifications non-destructively', () => {
    expect(formatRelationshipDisplay('Other: Family Priest')).toBe('Other: Family Priest')
    expect(formatRelationshipDisplay('Other: Caregiver')).toBe('Other: Caregiver')
    expect(mapRelationshipToFamilyRole('Other: Family Priest')).toBe('EXTENDED')
  })

  it('accurately maps composite "English (Hindi)" labels to public.family_role enum', () => {
    expect(mapRelationshipToFamilyRole('Father (पिता)')).toBe('PARENT')
    expect(mapRelationshipToFamilyRole('Mother (माता)')).toBe('PARENT')
    expect(mapRelationshipToFamilyRole('Son (बेटा)')).toBe('CHILD')
    expect(mapRelationshipToFamilyRole('Daughter (बेटी)')).toBe('CHILD')
    expect(mapRelationshipToFamilyRole('Wife (पत्नी)')).toBe('SPOUSE')
    expect(mapRelationshipToFamilyRole('Husband (पति)')).toBe('SPOUSE')
    expect(mapRelationshipToFamilyRole('Brother (भाई)')).toBe('SIBLING')
    expect(mapRelationshipToFamilyRole('Sister (बहन)')).toBe('SIBLING')
    expect(mapRelationshipToFamilyRole('Paternal grandfather (दादा)')).toBe('GRANDPARENT')
    expect(mapRelationshipToFamilyRole('Grandson (पोता / नाती)')).toBe('GRANDCHILD')
    expect(mapRelationshipToFamilyRole('Stepfather (सौतेले पिता)')).toBe('PARENT')
    expect(mapRelationshipToFamilyRole('Adopted daughter (गोद ली हुई बेटी)')).toBe('CHILD')
    expect(mapRelationshipToFamilyRole('Widow (विधवा)')).toBe('SPOUSE')
    expect(mapRelationshipToFamilyRole('Paternal uncle (चाचा / ताऊ)')).toBe('EXTENDED')
    expect(mapRelationshipToFamilyRole('First cousin (चचेरा / ममेरा / फुफेरा / मौसेरा भाई-बहन)')).toBe('EXTENDED')
  })
})
