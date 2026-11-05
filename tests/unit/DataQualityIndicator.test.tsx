/**
 * Unit Tests: DataQualityIndicator UI Component (Phase 9 — Subtask 4)
 * (src/features/verification/components/DataQualityIndicator.tsx)
 */

import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DataQualityIndicator } from '@/features/verification/components/DataQualityIndicator'
import type { PersonRow, FamilyRow } from '@/types'

describe('DataQualityIndicator Component', () => {
  it('renders score and tier badge for person record', () => {
    const person: Partial<PersonRow> = {
      id: '11111111-1111-4111-8111-111111111111',
      first_name: 'Aarav',
      last_name: 'Patel',
      gender: 'MALE',
      date_of_birth: '1990-01-01',
      gotra: 'Kashyap',
    }

    const html = renderToStaticMarkup(
      React.createElement(DataQualityIndicator, { person })
    )

    expect(html).toContain('data-testid="data-quality-indicator"')
    expect(html).toContain('data-testid="quality-tier-badge"')
    expect(html).toContain('data-testid="quality-score-value"')
    expect(html).toContain('Record Completeness &amp; Quality')
    // Must contain the architectural disclaimer
    expect(html).toContain('Data Quality measures record completeness')
    expect(html).toContain('imply or substitute for official moderator verification')
  })

  it('renders details section when showDetailsInitially is true', () => {
    const person: Partial<PersonRow> = {
      id: '11111111-1111-4111-8111-111111111111',
      first_name: 'Aarav',
      last_name: 'Patel',
    }

    const html = renderToStaticMarkup(
      React.createElement(DataQualityIndicator, {
        person,
        showDetailsInitially: true,
      })
    )

    expect(html).toContain('data-testid="quality-details-section"')
    expect(html).toContain('Core Identity')
    expect(html).toContain('Vital Information')
    expect(html).toContain('Improvement Recommendations')
  })

  it('renders for family record', () => {
    const family: Partial<FamilyRow> = {
      id: '22222222-2222-4222-8222-222222222222',
      family_name: 'The Patel Household',
      description: 'Ancestral roots tracing back five generations from rural Gujarat.',
      gotra: 'Kashyap',
      nukh: 'Dhol',
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
    }

    const html = renderToStaticMarkup(
      React.createElement(DataQualityIndicator, { family })
    )

    expect(html).toContain('data-testid="data-quality-indicator"')
    expect(html).toContain('Excellent Quality')
  })
})

