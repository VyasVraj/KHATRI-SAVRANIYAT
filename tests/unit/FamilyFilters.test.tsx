/**
 * Unit tests: FamilyFilters and FamilyFilterChips
 * (src/features/discover/components/FamilyFilters.tsx)
 * (src/features/discover/components/FamilyFilterChips.tsx)
 */

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FamilyFilters } from '@/features/discover/components/FamilyFilters'
import { FamilyFilterChips } from '@/features/discover/components/FamilyFilterChips'
import type { FamilyDiscoveryFilters, DiscoveryFilterOptions } from '@/features/discover/types'

describe('Family Directory Filter Components', () => {
  const mockOptions: DiscoveryFilterOptions = {
    gotras: ['Kashyap', 'Vatsa'],
    nukhs: ['NukhA', 'NukhB'],
    kuls: ['KulA', 'KulB'],
    cities: ['Mumbai', 'Ahmedabad'],
    states: ['Maharashtra', 'Gujarat'],
  }

  describe('FamilyFilters', () => {
    it('renders closed filter bar with active count badge', () => {
      const activeFilters: FamilyDiscoveryFilters = {
        city: 'Mumbai',
        status: 'ACTIVE',
      }

      const html = renderToStaticMarkup(
        React.createElement(FamilyFilters, {
          filters: activeFilters,
          filterOptions: mockOptions,
          onFilterChange: vi.fn(),
          onReset: vi.fn(),
          isOpen: false,
          onToggle: vi.fn(),
        })
      )

      expect(html).toContain('Filters')
      expect(html).toContain('>2<') // 2 active filters badge
      expect(html).not.toContain('id="family-filters-panel"')
    })

    it('renders expanded filter panel with supported criteria when open', () => {
      const html = renderToStaticMarkup(
        React.createElement(FamilyFilters, {
          filters: {},
          filterOptions: mockOptions,
          onFilterChange: vi.fn(),
          onReset: vi.fn(),
          isOpen: true,
          onToggle: vi.fn(),
        })
      )

      expect(html).toContain('id="family-filters-panel"')
      expect(html).toContain('Family Name')
      expect(html).toContain('Gotra')
      expect(html).toContain('Nukh')
      expect(html).not.toContain('label-family-kul')
      expect(html).toContain('City')
      expect(html).toContain('State')
      expect(html).toContain('Country')
      expect(html).toContain('Status')
      expect(html).toContain('Verification Status')
      // Supported dropdown options
      expect(html).toContain('Mumbai')
      expect(html).toContain('Ahmedabad')
      expect(html).toContain('Maharashtra')
      expect(html).toContain('Gujarat')
      expect(html).toContain('Kashyap')
      expect(html).toContain('Vatsa')

      // Unsupported fields NOT rendered
      expect(html).not.toContain('native_place')
      expect(html).not.toContain('mukhi')
    })
  })

  describe('FamilyFilterChips', () => {
    it('returns empty when no active filters', () => {
      const html = renderToStaticMarkup(
        React.createElement(FamilyFilterChips, {
          filters: {},
          onRemoveFilter: vi.fn(),
          onClearAll: vi.fn(),
        })
      )
      expect(html).toBe('')
    })

    it('renders chips for active filters and provides Clear all action', () => {
      const filters: FamilyDiscoveryFilters = {
        city: 'Mumbai',
        gotra: 'Kashyap',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      }

      const html = renderToStaticMarkup(
        React.createElement(FamilyFilterChips, {
          filters,
          onRemoveFilter: vi.fn(),
          onClearAll: vi.fn(),
        })
      )

      expect(html).toContain('Active filters:')
      expect(html).toContain('City:</strong> Mumbai')
      expect(html).toContain('Gotra:</strong> Kashyap')
      expect(html).toContain('Status:</strong> Active')
      expect(html).toContain('Verification:</strong> Verified')
      expect(html).toContain('Clear all')
    })
  })
})
