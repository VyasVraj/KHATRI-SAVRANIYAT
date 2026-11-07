/**
 * worldwide-locations.test.ts — Unit tests for worldwide location master and My Family visibility.
 */

import { describe, it, expect } from 'vitest'
import {
  getCountries,
  getStatesForCountry,
  searchCities,
  searchCitiesAsync,
  addNewCity,
} from '@/services/cities.service'
import { getMyFamilyIds } from '@/features/families/services/families.service'

describe('Worldwide Location Master & Services', () => {
  it('loads 222 countries and prioritizes key community countries', () => {
    const countries = getCountries()
    expect(countries.length).toBeGreaterThanOrEqual(220)
    expect(countries[0].code).toBe('IN')
    expect(countries[0].name).toBe('India')
    expect(countries.some((c) => c.name === 'United States')).toBe(true)
    expect(countries.some((c) => c.name === 'United Arab Emirates')).toBe(true)
    expect(countries.some((c) => c.name === 'United Kingdom')).toBe(true)
  })

  it('loads states for a given country (e.g. India has Gujarat, Maharashtra)', () => {
    const indianStates = getStatesForCountry('India')
    expect(indianStates.length).toBeGreaterThanOrEqual(28)
    expect(indianStates.some((s) => s.name === 'Gujarat')).toBe(true)
    expect(indianStates.some((s) => s.name === 'Maharashtra')).toBe(true)

    const usStates = getStatesForCountry('US')
    expect(usStates.length).toBeGreaterThan(0)
    expect(usStates.some((s) => s.name === 'California')).toBe(true)
  })

  it('searches cities by name with exact match prioritizing', async () => {
    const results = searchCities('Anand', 10)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name.toLowerCase()).toBe('anand')
    expect(results[0].state).toBe('Gujarat')
    expect(results[0].country).toBe('India')

    const asyncResults = await searchCitiesAsync('Anand', 10)
    expect(asyncResults.length).toBeGreaterThan(0)
    expect(asyncResults[0].name.toLowerCase()).toBe('anand')
  })

  it('filters cities by country and state correctly', () => {
    const gujaratCities = searchCities('', 50, { country: 'India', state: 'Gujarat' })
    expect(gujaratCities.length).toBeGreaterThan(0)
    expect(gujaratCities.every((c) => c.state === 'Gujarat')).toBe(true)
  })

  it('allows adding a custom city to local cache and returns it in subsequent searches', async () => {
    const customCity = {
      name: 'CustomTestVillage',
      state: 'Gujarat',
      country: 'India',
    }
    const res = await addNewCity(customCity)
    expect(res.data).not.toBeNull()
    expect(res.data?.name).toBe('CustomTestVillage')

    const searchRes = searchCities('CustomTestVillage', 5)
    expect(searchRes.some((c) => c.name === 'CustomTestVillage')).toBe(true)
  })
})

describe('getMyFamilyIds Service Function', () => {
  it('returns empty array when userId is not provided', async () => {
    const res = await getMyFamilyIds(undefined)
    expect(res).toEqual([])
  })
})
