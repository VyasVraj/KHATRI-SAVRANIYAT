/**
 * worldwide-birthplace-search.test.tsx
 *
 * Exhaustive unit tests for worldwide birthplace autocomplete, one-click selection,
 * cascading filters, Unicode support, duplicate names across countries, and edit reopening.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CitySelector } from '@/components/forms/CitySelector'
import {
  getCountries,
  getStatesForCountry,
  getCitiesForState,
  searchCities,
  searchCitiesAsync,
} from '@/services/cities.service'

describe('Worldwide Master Registry Services (222 Countries & 3,934 States)', () => {
  it('covers all 222 countries and territories', () => {
    const countries = getCountries()
    expect(countries.length).toBe(222)
    expect(countries.some((c) => c.name === 'Russia' && c.code === 'RU')).toBe(true)
    expect(countries.some((c) => c.name === 'India' && c.code === 'IN')).toBe(true)
    expect(countries.some((c) => c.name === 'United States' && c.code === 'US')).toBe(true)
    expect(countries.some((c) => c.name === 'Australia' && c.code === 'AU')).toBe(true)
    expect(countries.some((c) => c.name === 'United Kingdom' && c.code === 'GB')).toBe(true)
  })

  it('loads states for Russia and retrieves Moscow state', () => {
    const ruStates = getStatesForCountry('Russia')
    expect(ruStates.length).toBe(81)
    expect(ruStates.some((s) => s.name === 'Moscow')).toBe(true)
  })

  it('retrieves cities for Russia -> Moscow and includes Moscow city', () => {
    const moscowCities = getCitiesForState('Russia', 'Moscow')
    expect(moscowCities.length).toBeGreaterThanOrEqual(390)
    expect(moscowCities[0].name).toBe('Moscow')
    expect(moscowCities[0].state).toBe('Moscow')
    expect(moscowCities[0].country).toBe('Russia')
  })

  it('performs partial, case-insensitive, and Unicode-aware search', async () => {
    // Partial search inside Moscow
    const partialMatch = searchCities('mos', 10, { country: 'Russia', state: 'Moscow' })
    expect(partialMatch.length).toBeGreaterThan(0)
    expect(partialMatch.some((c) => c.name === 'Moscow')).toBe(true)

    // Async search inside Moscow
    const asyncMatch = await searchCitiesAsync('mos', 10, { country: 'Russia', state: 'Moscow' })
    expect(asyncMatch.length).toBeGreaterThan(0)
    expect(asyncMatch.some((c) => c.name === 'Moscow')).toBe(true)

    // Unicode place in Moscow, Russia (Altuf’yevskiy)
    const unicodeMatch = searchCities('altuf', 10, { country: 'Russia', state: 'Moscow' })
    expect(unicodeMatch.length).toBeGreaterThan(0)
    expect(unicodeMatch[0].name).toContain('Altuf')

    // French Unicode place (Ambérieu)
    const frMatch = searchCities('amberieu', 10, { country: 'France' })
    expect(frMatch.length).toBeGreaterThan(0)
  })

  it('distinguishes duplicate city names across different countries', () => {
    const moscows = searchCities('moscow', 10)
    expect(moscows.length).toBeGreaterThanOrEqual(2)

    const russiaMoscow = moscows.find((c) => c.country === 'Russia')
    const usMoscow = moscows.find((c) => c.country === 'United States')

    expect(russiaMoscow).toBeDefined()
    expect(russiaMoscow?.state).toBe('Moscow')
    expect(usMoscow).toBeDefined()
  })

  it('returns empty array when searching nonexistent location without false positives', () => {
    const none = searchCities('NonexistentPlaceZyx999', 10)
    expect(none).toEqual([])
  })
})

describe('CitySelector UI Component — One-Click Selection & Behavior', () => {
  it('renders with label and placeholder and opens on click', async () => {
    const onSelect = vi.fn()
    render(<CitySelector label="Birthplace" onSelectCity={onSelect} />)

    const input = screen.getByPlaceholderText('Search birthplace worldwide...')
    expect(input).toBeInTheDocument()

    fireEvent.focus(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('executes one-click city selection and populates City, State, Country', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const { rerender } = render(
      <CitySelector
        label="Birthplace"
        value=""
        onSelectCity={onSelect}
      />
    )

    // 1. Toggle cascading filters
    const filterBtn = screen.getByRole('button', { name: /Filter by Country\/State/i })
    await user.click(filterBtn)

    // 2. Select Russia
    const countrySelect = screen.getByRole('combobox', { name: /^country$/i })
    await user.selectOptions(countrySelect, 'Russia')

    // 3. Select Moscow
    const stateSelect = screen.getByRole('combobox', { name: /^state \/ province$/i })
    await user.selectOptions(stateSelect, 'Moscow')

    // 4. Focus input to trigger search
    const input = screen.getByPlaceholderText('Search birthplace worldwide...')
    await user.click(input)

    // 5. Verify Moscow city suggestion appears in listbox
    await waitFor(() => {
      const listbox = screen.getByRole('listbox')
      expect(listbox).toBeInTheDocument()
      expect(listbox.textContent).toContain('Moscow')
    })

    // 6. One-click selection inside listbox
    const listbox = screen.getByRole('listbox')
    const moscowOptions = listbox.querySelectorAll('[data-option-item]')
    expect(moscowOptions.length).toBeGreaterThan(0)
    await user.click(moscowOptions[0])

    // 7. Verify onSelectCity called with full metadata
    expect(onSelect).toHaveBeenCalledWith({
      city: 'Moscow',
      state: 'Moscow',
      country: 'Russia',
    })

    // 8. Re-render with selected value and verify formatted display
    rerender(
      <CitySelector
        label="Birthplace"
        value="Moscow, Moscow, Russia"
        onSelectCity={onSelect}
      />
    )

    expect(screen.getByDisplayValue('Moscow, Moscow, Russia')).toBeInTheDocument()
  })

  it('resets state and city when country filter is changed', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <CitySelector
        label="Birthplace"
        value="Moscow, Moscow, Russia"
        onSelectCity={onSelect}
      />
    )

    // Open cascading filter
    const filterBtn = screen.getByRole('button', { name: /Filter by Country\/State/i })
    await user.click(filterBtn)

    const countrySelect = screen.getByRole('combobox', { name: /^country$/i })
    const stateSelect = screen.getByRole('combobox', { name: /^state \/ province$/i })

    // Change country to India
    await user.selectOptions(countrySelect, 'India')

    // State must be reset
    expect(stateSelect).toHaveValue('')
    // onSelectCity called to reset city selection
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ city: '', state: '', country: 'India' })
    )
  })

  it('preserves saved composite birthplace when editing profile without breaking search', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <CitySelector
        label="Birthplace"
        value="Anand, Gujarat, India"
        onSelectCity={onSelect}
      />
    )

    const input = screen.getByDisplayValue('Anand, Gujarat, India')
    expect(input).toBeInTheDocument()

    // Clicking input should not search for full literal string "Anand, Gujarat, India"
    await user.click(input)

    // Should display Gujarat cities including Anand
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /anand/i })).toBeInTheDocument()
    })
  })

  it('displays "No matching cities found in master registry." for nonexistent search', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <CitySelector
        label="Birthplace"
        onSelectCity={onSelect}
      />
    )

    const input = screen.getByPlaceholderText('Search birthplace worldwide...')
    await user.click(input)
    await user.type(input, 'NonexistentVillage99999')

    await waitFor(() => {
      expect(screen.getByText(/No matching cities found in master registry/i)).toBeInTheDocument()
      expect(screen.getByText(/Add "NonexistentVillage99999" to Directory/i)).toBeInTheDocument()
    })
  })

  it('resolves composite country strings like "Russia (RU)" and loads Moscow cities immediately on state change', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(
      <CitySelector
        label="Birthplace"
        onSelectCity={onSelect}
      />
    )

    // Open cascading filter
    const filterBtn = screen.getByRole('button', { name: /Filter by Country\/State/i })
    await user.click(filterBtn)

    const countrySelect = screen.getByRole('combobox', { name: /^country$/i })
    await user.selectOptions(countrySelect, 'Russia')

    const stateSelect = screen.getByRole('combobox', { name: /^state \/ province$/i })
    await user.selectOptions(stateSelect, 'Moscow')

    // Listbox should immediately appear with Moscow cities populated (including Moscow city)
    await waitFor(() => {
      const listbox = screen.getByRole('listbox')
      expect(listbox).toBeInTheDocument()
      expect(listbox.textContent).toContain('Moscow')
      expect(listbox.textContent).not.toContain('No matching cities found in master registry.')
    })

    // Click Moscow option for one-click selection
    const listbox = screen.getByRole('listbox')
    const options = listbox.querySelectorAll('[data-option-item]')
    expect(options.length).toBeGreaterThan(0)
    await user.click(options[0])

    expect(onSelect).toHaveBeenCalledWith({
      city: 'Moscow',
      state: 'Moscow',
      country: 'Russia',
    })
  })
})
