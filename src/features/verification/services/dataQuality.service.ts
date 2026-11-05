/**
 * Data Quality Service — Deterministic, explainable scoring engine (Phase 9 — Subtask 4)
 *
 * INVARIANTS:
 * - Deterministic: Pure function given record fields; zero randomness or opaque AI scoring.
 * - Operates ONLY on fields that actually exist in the database schema.
 * - DATA QUALITY != VERIFICATION: Never conflates record completeness with official attestation.
 */

import type { PersonRow, FamilyRow } from '@/types'
import type { DataQualityScore, DataQualityTier } from '../types/quality.types'

function determineTier(score: number): DataQualityTier {
  if (score >= 85) return 'EXCELLENT'
  if (score >= 70) return 'GOOD'
  if (score >= 50) return 'ADEQUATE'
  return 'NEEDS_IMPROVEMENT'
}

/**
 * Calculates deterministic data quality score for a census Person record.
 * Total points: 100
 * - Core Identity (35 pts)
 * - Vital Information (25 pts)
 * - Cultural Lineage (25 pts)
 * - Contact & Supplementary (15 pts)
 */
export function calculatePersonDataQuality(
  person: Partial<PersonRow> | null | undefined
): DataQualityScore {
  if (!person || !person.id) {
    return {
      entityType: 'PERSON',
      entityId: person?.id || '',
      score: 0,
      tier: 'NEEDS_IMPROVEMENT',
      categories: {},
      missingFields: ['first_name', 'last_name'],
      recommendations: ['Provide fundamental identification details.'],
      warnings: ['Record data is missing or incomplete.'],
      calculatedAt: new Date().toISOString(),
    }
  }

  const missingFields: string[] = []
  const recommendations: string[] = []
  const warnings: string[] = []

  // 1. Core Identity (35 pts)
  let coreEarned = 0
  if (person.first_name && person.first_name.trim().length > 0) coreEarned += 10
  else missingFields.push('first_name')

  if (person.last_name && person.last_name.trim().length > 0) coreEarned += 10
  else missingFields.push('last_name')

  if (person.gender) coreEarned += 10
  else {
    missingFields.push('gender')
    recommendations.push('Specify gender to complete biographical record.')
  }

  if (person.middle_name || person.maiden_name) coreEarned += 5
  else recommendations.push('Add middle name or maiden name if applicable.')

  // 2. Vital Information (25 pts)
  let vitalEarned = 0
  if (person.date_of_birth) vitalEarned += 15
  else {
    missingFields.push('date_of_birth')
    recommendations.push('Add date of birth for age calculation and accurate lineage dating.')
  }

  if (person.birth_place && person.birth_place.trim().length > 0) vitalEarned += 10
  else {
    missingFields.push('birth_place')
    recommendations.push('Add place of birth to assist community genealogical matching.')
  }

  // 3. Cultural Lineage (25 pts)
  let lineageEarned = 0
  if (person.gotra && person.gotra.trim().length > 0) lineageEarned += 15
  else {
    missingFields.push('gotra')
    recommendations.push('Specify Gotra for clan and exogamy relationship mapping.')
  }

  if (person.nukh && person.nukh.trim().length > 0) lineageEarned += 10
  else {
    missingFields.push('nukh')
    recommendations.push('Specify Nukh for community branch tracking.')
  }

  // 4. Contact & Supplementary (15 pts)
  let contactEarned = 0
  if (person.phone || person.email_contact || person.phone_secondary) contactEarned += 15
  else {
    missingFields.push('contact_info')
    recommendations.push('Add at least one contact channel (phone or email) for community reachability.')
  }

  // Consistency & Defensive Validation Warnings
  if (person.status === 'DECEASED' && !person.date_of_death) {
    warnings.push('Record is marked as deceased but lacks date of death.')
  }

  if (person.date_of_birth && person.date_of_death) {
    if (new Date(person.date_of_death) < new Date(person.date_of_birth)) {
      warnings.push('Date of death precedes date of birth.')
    }
  }

  if (person.date_of_birth) {
    const today = new Date().toISOString().split('T')[0]
    if (person.date_of_birth > today) {
      warnings.push('Date of birth is in the future.')
    }
  }

  const totalScore = coreEarned + vitalEarned + lineageEarned + contactEarned
  const tier = determineTier(totalScore)

  return {
    entityType: 'PERSON',
    entityId: person.id,
    score: totalScore,
    tier,
    categories: {
      coreIdentity: {
        label: 'Core Identity',
        earned: coreEarned,
        max: 35,
        description: 'First name, last name, gender, and full identity.',
      },
      vitalInformation: {
        label: 'Vital Information',
        earned: vitalEarned,
        max: 25,
        description: 'Birth date, place of birth, and life events.',
      },
      culturalLineage: {
        label: 'Cultural Lineage',
        earned: lineageEarned,
        max: 25,
        description: 'Gotra and Nukh ancestral identity.',
      },
      contactChannels: {
        label: 'Contact & Supplementary',
        earned: contactEarned,
        max: 15,
        description: 'Telephone, email contact, and directory profile.',
      },
    },
    missingFields,
    recommendations,
    warnings,
    calculatedAt: new Date().toISOString(),
  }
}

/**
 * Calculates deterministic data quality score for a census Family record.
 * Total points: 100
 * - Identity & Narrative (35 pts)
 * - Cultural Lineage (35 pts)
 * - Geographic Location (30 pts)
 */
export function calculateFamilyDataQuality(
  family: Partial<FamilyRow> | null | undefined
): DataQualityScore {
  if (!family || !family.id) {
    return {
      entityType: 'FAMILY',
      entityId: family?.id || '',
      score: 0,
      tier: 'NEEDS_IMPROVEMENT',
      categories: {},
      missingFields: ['family_name'],
      recommendations: ['Provide fundamental family name.'],
      warnings: ['Record data is missing or incomplete.'],
      calculatedAt: new Date().toISOString(),
    }
  }

  const missingFields: string[] = []
  const recommendations: string[] = []
  const warnings: string[] = []

  // 1. Identity & Narrative (35 pts)
  let identityEarned = 0
  if (family.family_name && family.family_name.trim().length > 0) identityEarned += 20
  else missingFields.push('family_name')

  if (family.description && family.description.trim().length >= 10) identityEarned += 15
  else if (family.description && family.description.trim().length > 0) identityEarned += 8
  else {
    missingFields.push('description')
    recommendations.push('Add a brief family description or historical context.')
  }

  // 2. Cultural Lineage (35 pts)
  let lineageEarned = 0
  if (family.gotra && family.gotra.trim().length > 0) lineageEarned += 20
  else {
    missingFields.push('gotra')
    recommendations.push('Specify Gotra for family clan identification.')
  }

  if (family.nukh && family.nukh.trim().length > 0) lineageEarned += 15
  else {
    missingFields.push('nukh')
    recommendations.push('Specify Nukh for ancestral branch tracking.')
  }

  // 3. Geographic Location (30 pts)
  let locationEarned = 0
  if (family.city && family.city.trim().length > 0) locationEarned += 15
  else {
    missingFields.push('city')
    recommendations.push('Add city of residence for regional community directory.')
  }

  if (family.state && family.state.trim().length > 0) locationEarned += 10
  else {
    missingFields.push('state')
    recommendations.push('Add state or province.')
  }

  if (family.country && family.country.trim().length > 0) locationEarned += 5
  else missingFields.push('country')

  if (!family.city && !family.state) {
    warnings.push('Family record has no geographical location registered.')
  }

  const totalScore = identityEarned + lineageEarned + locationEarned
  const tier = determineTier(totalScore)

  return {
    entityType: 'FAMILY',
    entityId: family.id,
    score: totalScore,
    tier,
    categories: {
      identityAndNarrative: {
        label: 'Identity & Description',
        earned: identityEarned,
        max: 35,
        description: 'Family surname, name, and background narrative.',
      },
      culturalLineage: {
        label: 'Cultural Lineage',
        earned: lineageEarned,
        max: 35,
        description: 'Gotra and Nukh identity.',
      },
      geographicLocation: {
        label: 'Geographic Location',
        earned: locationEarned,
        max: 30,
        description: 'City, state, and country of residence.',
      },
    },
    missingFields,
    recommendations,
    warnings,
    calculatedAt: new Date().toISOString(),
  }
}
