/**
 * Cities Service — Worldwide Searchable City Database & Location Master.
 *
 * Source: Official World Countries, States & Cities Registry (222 countries, 3,934 divisions, 137k+ places).
 *
 * Features:
 * - Real-time autocomplete & search by city name (case-insensitive, prefix + partial matching).
 * - Automatic State and Country population.
 * - Country -> State -> City cascading lookup.
 * - Server-side RPC search with local cache fallback for instant offline/resilient responses.
 * - "+ Add New City" option: persists to Supabase cities table and local cache.
 */

import { supabase } from '@/lib/supabase'
import worldCountriesData from '@/constants/world_countries.json'
import worldStatesData from '@/constants/world_states.json'
import worldCitiesData from '@/constants/world_cities_priority.json'

export interface CountryItem {
  name: string
  code: string
}

export interface StateItem {
  name: string
  country_code: string
  expected_count?: number
}

export interface CityItem {
  id?: string
  name: string
  state: string
  country: string
  country_code?: string
  is_custom?: boolean
}

const LOCAL_STORAGE_CUSTOM_CITIES_KEY = 'community_roots_custom_cities_v2'

/**
 * Normalizes string for deduplication comparison.
 */
function normalizeKey(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ')
}

function makeCityKey(name: string, state: string, country: string): string {
  return `${normalizeKey(name)}|${normalizeKey(state)}|${normalizeKey(country)}`
}

/**
 * Loads custom cities stored locally in the browser.
 */
function getLocalCustomCities(): CityItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_CITIES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Persists a custom city to local storage.
 */
function saveLocalCustomCity(city: CityItem) {
  try {
    const existing = getLocalCustomCities()
    const key = makeCityKey(city.name, city.state, city.country)
    if (!existing.some((c) => makeCityKey(c.name, c.state, c.country) === key)) {
      existing.unshift({ ...city, is_custom: true })
      localStorage.setItem(LOCAL_STORAGE_CUSTOM_CITIES_KEY, JSON.stringify(existing))
    }
  } catch {
    // Non-blocking
  }
}

/**
 * Pre-sorted list of countries with India and primary diaspora hubs prioritized on top.
 */
export function getCountries(): CountryItem[] {
  const priorityCodes = ['IN', 'US', 'AE', 'GB', 'CA', 'KE', 'TZ', 'AU', 'NZ', 'OM', 'KW', 'QA', 'SG']
  return [...worldCountriesData].sort((a, b) => {
    const aPri = priorityCodes.indexOf(a.code)
    const bPri = priorityCodes.indexOf(b.code)
    if (aPri !== -1 && bPri !== -1) return aPri - bPri
    if (aPri !== -1) return -1
    if (bPri !== -1) return 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Resolves states for a specific country by name or ISO code.
 */
export function getStatesForCountry(countryNameOrCode: string): StateItem[] {
  const clean = countryNameOrCode.trim().toLowerCase()
  if (!clean) return []

  // Try matching country by code or name
  const matchedCountry = worldCountriesData.find(
    (c) => c.code.toLowerCase() === clean || c.name.toLowerCase() === clean
  )
  const targetCode = matchedCountry ? matchedCountry.code : countryNameOrCode.toUpperCase()

  const list = (worldStatesData as StateItem[]).filter(
    (s) => s.country_code.toUpperCase() === targetCode
  )

  // Prioritize primary Indian states if target is India
  if (targetCode === 'IN') {
    const indianPriority = ['Gujarat', 'Maharashtra', 'Rajasthan', 'Madhya Pradesh', 'Delhi']
    return list.sort((a, b) => {
      const aPri = indianPriority.indexOf(a.name)
      const bPri = indianPriority.indexOf(b.name)
      if (aPri !== -1 && bPri !== -1) return aPri - bPri
      if (aPri !== -1) return -1
      if (bPri !== -1) return 1
      return a.name.localeCompare(b.name)
    })
  }

  return list.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * In-memory combined cache for fast synchronous searches.
 */
let inMemoryCities: CityItem[] = []

function initializeInMemoryCache() {
  const seen = new Set<string>()
  const combined: CityItem[] = []

  // 1. Add custom cities from localStorage first
  for (const c of getLocalCustomCities()) {
    const k = makeCityKey(c.name, c.state, c.country)
    if (!seen.has(k)) {
      seen.add(k)
      combined.push({ ...c, is_custom: true })
    }
  }

  // 2. Add verified priority & Indian cities
  for (const c of (worldCitiesData as CityItem[])) {
    const k = makeCityKey(c.name, c.state, c.country)
    if (!seen.has(k)) {
      seen.add(k)
      combined.push(c)
    }
  }

  inMemoryCities = combined
}

// Initialize on module load
initializeInMemoryCache()

/**
 * Synchronous local search across in-memory verified city dataset.
 */
export function searchCities(
  query: string,
  limit = 20,
  filter?: { country?: string; state?: string }
): CityItem[] {
  if (!inMemoryCities.length) {
    initializeInMemoryCache()
  }

  const q = query.trim().toLowerCase()
  const countryFilter = filter?.country?.trim().toLowerCase()
  const stateFilter = filter?.state?.trim().toLowerCase()

  let pool = inMemoryCities

  if (countryFilter) {
    pool = pool.filter((c) => c.country.toLowerCase() === countryFilter)
  }
  if (stateFilter) {
    pool = pool.filter((c) => c.state.toLowerCase() === stateFilter)
  }

  if (!q) {
    return pool.slice(0, limit)
  }

  // Multi-tier ranking:
  // 1. Exact match on city name
  // 2. City name starts with query
  // 3. Word inside city name starts with query
  // 4. City name contains query
  // 5. State contains query
  const exact: CityItem[] = []
  const prefix: CityItem[] = []
  const wordPrefix: CityItem[] = []
  const contains: CityItem[] = []
  const stateMatch: CityItem[] = []

  for (const c of pool) {
    const nameLower = c.name.toLowerCase()
    const stateLower = c.state.toLowerCase()

    if (nameLower === q) {
      exact.push(c)
    } else if (nameLower.startsWith(q)) {
      prefix.push(c)
    } else if (nameLower.includes(' ' + q)) {
      wordPrefix.push(c)
    } else if (nameLower.includes(q)) {
      contains.push(c)
    } else if (stateLower.includes(q)) {
      stateMatch.push(c)
    }
  }

  return [...exact, ...prefix, ...wordPrefix, ...contains, ...stateMatch].slice(0, limit)
}

/**
 * Asynchronous city search combining remote Supabase RPC with local fallback.
 */
export async function searchCitiesAsync(
  query: string,
  limit = 20,
  filter?: { country?: string; state?: string }
): Promise<CityItem[]> {
  const q = query.trim()
  const localResults = searchCities(q, limit, filter)

  if (!q) return localResults

  try {
    // Attempt remote RPC search_worldwide_cities
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('search_worldwide_cities', {
      p_query: q,
      p_limit: limit,
    })

    if (!error && Array.isArray(data) && data.length > 0) {
      // Map remote rows to CityItem
      const remoteItems: CityItem[] = data.map((r: {
        city_id?: string
        city_name: string
        state_name: string
        country_name: string
        country_code?: string
      }) => ({
        id: r.city_id,
        name: r.city_name,
        state: r.state_name,
        country: r.country_name,
        country_code: r.country_code,
      }))

      // Merge remote with local deduplicated
      const seen = new Set<string>()
      const merged: CityItem[] = []

      for (const item of [...remoteItems, ...localResults]) {
        const k = makeCityKey(item.name, item.state, item.country)
        if (!seen.has(k)) {
          seen.add(k)
          merged.push(item)
          if (merged.length >= limit) break
        }
      }
      return merged
    }
  } catch {
    // Fall back to local search
  }

  return localResults
}

/**
 * Syncs any dynamic cities from Supabase public.cities table.
 */
export async function syncRemoteCities(): Promise<CityItem[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('cities')
      .select('id, name, state, country, is_custom')
      .order('name', { ascending: true })
      .limit(500)

    if (!error && Array.isArray(data) && data.length > 0) {
      for (const row of data) {
        const k = makeCityKey(row.name, row.state, row.country)
        if (!inMemoryCities.some((c) => makeCityKey(c.name, c.state, c.country) === k)) {
          inMemoryCities.push(row)
        }
      }
    }
  } catch {
    // Fall back to memory cache
  }
  return inMemoryCities
}

/**
 * Adds a new custom city to the database and persistent cache.
 */
export async function addNewCity(input: {
  name: string
  state: string
  country?: string
}): Promise<{ data: CityItem | null; error: Error | null }> {
  const cleanName = input.name.trim()
  const cleanState = input.state.trim()
  const cleanCountry = (input.country || 'India').trim()

  if (!cleanName) {
    return { data: null, error: new Error('City name is required') }
  }
  if (!cleanState) {
    return { data: null, error: new Error('State name is required') }
  }

  const newCity: CityItem = {
    name: cleanName,
    state: cleanState,
    country: cleanCountry,
    is_custom: true,
  }

  // Save to local cache immediately
  saveLocalCustomCity(newCity)

  const k = makeCityKey(cleanName, cleanState, cleanCountry)
  if (!inMemoryCities.some((c) => makeCityKey(c.name, c.state, c.country) === k)) {
    inMemoryCities.unshift(newCity)
  }

  // Attempt to persist to Supabase public.cities
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('cities')
      .insert({
        name: cleanName,
        state: cleanState,
        country: cleanCountry,
        is_custom: true,
      })
      .select()
      .single()

    if (!error && data) {
      newCity.id = data.id
    }
  } catch {
    // Non-blocking: local persistence guarantees availability
  }

  return { data: newCity, error: null }
}
