/**
 * Unit tests: PeopleFilters, PeopleFilterChips, and PeopleSearchBar
 * (src/features/discover/components/PeopleFilters.tsx)
 * (src/features/discover/components/PeopleFilterChips.tsx)
 * (src/features/discover/components/PeopleSearchBar.tsx)
 */

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PeopleFilters } from '@/features/discover/components/PeopleFilters'
import { PeopleFilterChips } from '@/features/discover/components/PeopleFilterChips'
import { PeopleSearchBar } from '@/features/discover/components/PeopleSearchBar'
import type { PersonDiscoveryFilters, DiscoveryFilterOptions } from '@/features/discover/types'

describe('People Directory Filter Components', () => {
  describe('PeopleSearchBar', () => {
    it('renders with placeholder and current value', () => {
      const html = renderToStaticMarkup(
        React.createElement(PeopleSearchBar, {
          value: 'Ramesh',
          onChange: vi.fn(),
          placeholder: 'Search members...',
        })
      )
      expect(html).toContain('value="Ramesh"')
      expect(html).toContain('placeholder="Search members..."')
      expect(html).toContain('aria-label="Clear search text"')
    })

    it('does not render clear button when input is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(PeopleSearchBar, {
          value: '',
          onChange: vi.fn(),
        })
      )
      expect(html).not.toContain('aria-label="Clear search text"')
    })
  })

  describe('PeopleFilters', () => {
    const mockOptions: DiscoveryFilterOptions = {
      gotras: ['Kashyap', 'Vatsa'],
      nukhs: ['NukhA', 'NukhB'],
      kuls: ['KulA', 'KulB'],
      cities: [],
      states: [],
    }

    it('renders closed filter bar with active count badge', () => {
      const activeFilters: PersonDiscoveryFilters = {
        gotra: 'Kashyap',
        status: 'ACTIVE',
      }

      const html = renderToStaticMarkup(
        React.createElement(PeopleFilters, {
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
      expect(html).not.toContain('id="people-filters-panel"')
    })

    it('renders expanded filter panel with supported criteria when open', () => {
      const html = renderToStaticMarkup(
        React.createElement(PeopleFilters, {
          filters: {},
          filterOptions: mockOptions,
          onFilterChange: vi.fn(),
          onReset: vi.fn(),
          isOpen: true,
          onToggle: vi.fn(),
        })
      )

      expect(html).toContain('id="people-filters-panel"')
      expect(html).toContain('Gotra')
      expect(html).toContain('Nukh')
      expect(html).not.toContain('label-kul')
      expect(html).toContain('Birth Place')
      expect(html).toContain('Living Status')
      expect(html).toContain('Verification Status')
      // Supported dropdown options
      expect(html).toContain('Kashyap')
      expect(html).toContain('Vatsa')
      expect(html).toContain('Active')
      expect(html).toContain('Deceased')
      expect(html).toContain('Verified')
    })
  })

  describe('PeopleFilterChips', () => {
    it('returns empty when no active filters', () => {
      const html = renderToStaticMarkup(
        React.createElement(PeopleFilterChips, {
          filters: {},
          onRemoveFilter: vi.fn(),
          onClearAll: vi.fn(),
        })
      )
      expect(html).toBe('')
    })

    it('renders chips for active filters and provides Clear all action', () => {
      const filters: PersonDiscoveryFilters = {
        gotra: 'Kashyap',
        status: 'ACTIVE',
        verification_status: 'VERIFIED',
      }

      const html = renderToStaticMarkup(
        React.createElement(PeopleFilterChips, {
          filters,
          onRemoveFilter: vi.fn(),
          onClearAll: vi.fn(),
        })
      )

      expect(html).toContain('Active filters:')
      expect(html).toContain('Gotra:</strong> Kashyap')
      expect(html).toContain('Status:</strong> Active')
      expect(html).toContain('Verification:</strong> Verified')
      expect(html).toContain('Clear all')
    })
  })
})
