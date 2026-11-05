/**
 * Unit Tests: Data Quality Scoring Service (Phase 9 — Subtask 4)
 * (src/features/verification/services/dataQuality.service.ts)
 */

import { describe, it, expect } from 'vitest'
import {
  calculatePersonDataQuality,
  calculateFamilyDataQuality,
} from '@/features/verification/services/dataQuality.service'
import type { PersonRow, FamilyRow } from '@/types'

describe('Data Quality Service', () => {
  describe('calculatePersonDataQuality', () => {
    it('returns score 0 and tier NEEDS_IMPROVEMENT for null or empty person', () => {
      const result = calculatePersonDataQuality(null)
      expect(result.score).toBe(0)
      expect(result.tier).toBe('NEEDS_IMPROVEMENT')
      expect(result.entityType).toBe('PERSON')
      expect(result.warnings).toContain('Record data is missing or incomplete.')
    })

    it('scores full 100 points and EXCELLENT tier for fully populated person record', () => {
      const completePerson: Partial<PersonRow> = {
        id: '11111111-1111-4111-8111-111111111111',
        first_name: 'Aarav',
        middle_name: 'Kumar',
        last_name: 'Patel',
        gender: 'MALE',
        date_of_birth: '1990-05-15',
        birth_place: 'Ahmedabad, Gujarat',
        gotra: 'Kashyap',
        nukh: 'Dhol',
        phone: '+919876543210',
        email_contact: 'aarav@example.com',
        status: 'ACTIVE',
      }

      const result = calculatePersonDataQuality(completePerson)
      expect(result.score).toBe(100)
      expect(result.tier).toBe('EXCELLENT')
      expect(result.missingFields).toHaveLength(0)
      expect(result.categories.coreIdentity.earned).toBe(35)
      expect(result.categories.vitalInformation.earned).toBe(25)
      expect(result.categories.culturalLineage.earned).toBe(25)
      expect(result.categories.contactChannels.earned).toBe(15)
      expect(result.warnings).toHaveLength(0)
    })

    it('scores accurately for minimal record and flags missing fields', () => {
      const minimalPerson: Partial<PersonRow> = {
        id: '11111111-1111-4111-8111-111111111111',
        first_name: 'Kavita',
        last_name: 'Shah',
        status: 'ACTIVE',
      }

      const result = calculatePersonDataQuality(minimalPerson)
      // coreEarned: first_name (10) + last_name (10) = 20
      expect(result.score).toBe(20)
      expect(result.tier).toBe('NEEDS_IMPROVEMENT')
      expect(result.missingFields).toContain('gender')
      expect(result.missingFields).toContain('date_of_birth')
      expect(result.missingFields).toContain('gotra')
    })

    it('warns when deceased person record lacks date of death', () => {
      const deceasedPerson: Partial<PersonRow> = {
        id: '11111111-1111-4111-8111-111111111111',
        first_name: 'Ramesh',
        last_name: 'Patel',
        gender: 'MALE',
        date_of_birth: '1940-01-01',
        status: 'DECEASED',
      }

      const result = calculatePersonDataQuality(deceasedPerson)
      expect(result.warnings).toContain('Record is marked as deceased but lacks date of death.')
    })

    it('warns when date of death precedes date of birth', () => {
      const invalidDatesPerson: Partial<PersonRow> = {
        id: '11111111-1111-4111-8111-111111111111',
        first_name: 'Ramesh',
        last_name: 'Patel',
        date_of_birth: '1980-01-01',
        date_of_death: '1970-01-01',
        status: 'DECEASED',
      }

      const result = calculatePersonDataQuality(invalidDatesPerson)
      expect(result.warnings).toContain('Date of death precedes date of birth.')
    })

    it('warns when birth date is in the future', () => {
      const futureBirthPerson: Partial<PersonRow> = {
        id: '11111111-1111-4111-8111-111111111111',
        first_name: 'Child',
        last_name: 'Patel',
        date_of_birth: '2099-01-01',
      }

      const result = calculatePersonDataQuality(futureBirthPerson)
      expect(result.warnings).toContain('Date of birth is in the future.')
    })
  })

  describe('calculateFamilyDataQuality', () => {
    it('returns score 0 and tier NEEDS_IMPROVEMENT for null or empty family', () => {
      const result = calculateFamilyDataQuality(null)
      expect(result.score).toBe(0)
      expect(result.tier).toBe('NEEDS_IMPROVEMENT')
      expect(result.entityType).toBe('FAMILY')
    })

    it('scores full 100 points and EXCELLENT tier for fully populated family record', () => {
      const completeFamily: Partial<FamilyRow> = {
        id: '22222222-2222-4222-8222-222222222222',
        family_name: 'The Ahmedabad Patel Family',
        description: 'Ancestral roots tracing back five generations from rural Gujarat.',
        gotra: 'Kashyap',
        nukh: 'Dhol',
        city: 'Ahmedabad',
        state: 'Gujarat',
        country: 'India',
      }

      const result = calculateFamilyDataQuality(completeFamily)
      expect(result.score).toBe(100)
      expect(result.tier).toBe('EXCELLENT')
      expect(result.categories.identityAndNarrative.earned).toBe(35)
      expect(result.categories.culturalLineage.earned).toBe(35)
      expect(result.categories.geographicLocation.earned).toBe(30)
      expect(result.warnings).toHaveLength(0)
    })

    it('warns when family record lacks geographical location', () => {
      const noLocationFamily: Partial<FamilyRow> = {
        id: '22222222-2222-4222-8222-222222222222',
        family_name: 'Shah Family',
        gotra: 'Gautam',
      }

      const result = calculateFamilyDataQuality(noLocationFamily)
      expect(result.warnings).toContain('Family record has no geographical location registered.')
      expect(result.missingFields).toContain('city')
      expect(result.missingFields).toContain('state')
    })
  })
})
