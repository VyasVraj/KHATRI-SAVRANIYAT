/**
 * Cities Service — Worldwide Searchable City Database & Location Master.
 *
 * Source: Official World Countries, States & Cities Registry (222 countries, 3,934 divisions, 137k+ places).
 *
 * Features:
 * - Real-time autocomplete & search by city name (case-insensitive, prefix + partial matching).
 * - Automatic State and Country population.
 * - Country -> State -> City cascading lookup with full 222-country coverage.
 * - Server-side RPC search with local cache fallback for instant offline/resilient responses.
 * - "+ Add New City" option: persists to Supabase cities table and local cache.
 */

import { supabase } from '@/lib/supabase'
import worldCountriesData from '@/constants/world_countries.json'
import worldStatesData from '@/constants/world_states.json'
import worldCitiesPriorityData from '@/constants/world_cities_priority.json'
import worldCitiesHierarchyData from '@/constants/world_cities_hierarchy.json'

export interface CountryItem {
  name: string
  code: string
  id?: string
}

export interface StateItem {
  name: string
  country_code: string
  id?: string
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

/**
 * Strips diacritics/accents for Unicode-aware fuzzy matching.
 */
function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
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
 * Map country code to Country name for O(1) lookups.
 */
const countryCodeToNameMap = new Map<string, string>()
const countryNameToItemMap = new Map<string, CountryItem>()

for (const c of worldCountriesData) {
  countryCodeToNameMap.set(c.code.toUpperCase(), c.name)
  countryNameToItemMap.set(c.name.toLowerCase(), c)
  countryNameToItemMap.set(c.code.toLowerCase(), c)
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
 * Resolves country item by name, ISO code, or composite display string (e.g. "Russia (RU)").
 */
export function resolveCountry(countryNameOrCode: string): CountryItem | undefined {
  if (!countryNameOrCode) return undefined
  const raw = countryNameOrCode.trim()
  if (!raw) return undefined

  // 1. Direct match by lowercase name or code
  const clean = raw.toLowerCase()
  if (countryNameToItemMap.has(clean)) {
    return countryNameToItemMap.get(clean)
  }

  // 2. Extract name and code from formats like "Russia (RU)" or "United States [US]"
  const parenMatch = raw.match(/^([^(]+?)\s*[([]\s*([^()[\]]+)\s*[)\]]$/)
  if (parenMatch) {
    const namePart = parenMatch[1].trim().toLowerCase()
    const codePart = parenMatch[2].trim().toLowerCase()
    if (countryNameToItemMap.has(namePart)) return countryNameToItemMap.get(namePart)
    if (countryNameToItemMap.has(codePart)) return countryNameToItemMap.get(codePart)
  }

  // 3. Fallback: match by prefix or code inside string
  for (const c of worldCountriesData) {
    const cNameLower = c.name.toLowerCase()
    const cCodeLower = c.code.toLowerCase()
    if (clean === cNameLower || clean === cCodeLower) return c
    if (clean.startsWith(cNameLower) || clean.includes(`(${cCodeLower})`)) return c
  }

  return undefined
}

/**
 * Resolves states for a specific country by name or ISO code.
 */
export function getStatesForCountry(countryNameOrCode: string): StateItem[] {
  const matchedCountry = resolveCountry(countryNameOrCode)
  const targetCode = matchedCountry ? matchedCountry.code : countryNameOrCode.trim().toUpperCase()
  if (!targetCode) return []

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

const hierarchyTyped = worldCitiesHierarchyData as Record<string, Record<string, string[]>>

/**
 * Retrieves all cities for a specific country and state.
 */
export function getCitiesForState(countryNameOrCode: string, stateName: string): CityItem[] {
  const matchedCountry = resolveCountry(countryNameOrCode)
  if (!matchedCountry) return []

  const cCode = matchedCountry.code.toUpperCase()
  const cName = matchedCountry.name
  const sNameClean = stateName.trim().toLowerCase()
  const sNameStripped = stripAccents(sNameClean)

  const stateMap = hierarchyTyped[cCode] || {}

  // Find matching state key with flexible matching (exact, stripped accents, prefix)
  let stateKey = Object.keys(stateMap).find((k) => k.toLowerCase() === sNameClean)
  if (!stateKey) {
    stateKey = Object.keys(stateMap).find((k) => stripAccents(k.toLowerCase()) === sNameStripped)
  }
  if (!stateKey) {
    stateKey = Object.keys(stateMap).find(
      (k) =>
        k.toLowerCase().startsWith(sNameClean) ||
        sNameClean.startsWith(k.toLowerCase()) ||
        stripAccents(k.toLowerCase()).includes(sNameStripped)
    )
  }

  const baseCityNames = stateKey ? stateMap[stateKey] : []

  const results: CityItem[] = baseCityNames.map((cityName) => ({
    name: cityName,
    state: stateKey || stateName,
    country: cName,
    country_code: cCode,
  }))

  // Ensure state name itself is available as a city option if missing
  if (results.length === 0 && stateName.trim()) {
    results.push({
      name: stateName.trim(),
      state: stateName.trim(),
      country: cName,
      country_code: cCode,
    })
  }

  // Append any matching custom cities from local storage
  const customList = getLocalCustomCities().filter(
    (c) =>
      c.country.toLowerCase() === cName.toLowerCase() &&
      c.state.toLowerCase() === sNameClean
  )

  for (const cust of customList) {
    if (!results.some((r) => r.name.toLowerCase() === cust.name.toLowerCase())) {
      results.unshift(cust)
    }
  }

  // If city with exact state name exists (e.g., Moscow in Moscow, New York in New York), prioritize it first
  return results.sort((a, b) => {
    const aIsState = a.name.toLowerCase() === sNameClean
    const bIsState = b.name.toLowerCase() === sNameClean
    if (aIsState && !bIsState) return -1
    if (!aIsState && bIsState) return 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * In-memory worldwide flattened cache for fast fallback queries across all countries.
 */
let worldwideIndex: CityItem[] = []

function initializeWorldwideCache() {
  const seen = new Set<string>()
  const combined: CityItem[] = []

  // 1. Custom cities from localStorage first
  for (const c of getLocalCustomCities()) {
    const k = makeCityKey(c.name, c.state, c.country)
    if (!seen.has(k)) {
      seen.add(k)
      combined.push({ ...c, is_custom: true })
    }
  }

  // 2. Verified priority cities
  for (const c of (worldCitiesPriorityData as CityItem[])) {
    const k = makeCityKey(c.name, c.state, c.country)
    if (!seen.has(k)) {
      seen.add(k)
      combined.push(c)
    }
  }

  worldwideIndex = combined
}

initializeWorldwideCache()

/**
 * Synchronous local search across authoritative worldwide registry.
 */
export function searchCities(
  query: string,
  limit = 20,
  filter?: { country?: string; state?: string }
): CityItem[] {
  const q = query.trim().toLowerCase()
  const qClean = stripAccents(q)
  const countryFilter = filter?.country?.trim()
  const stateFilter = filter?.state?.trim()

  // Case 1: Specific Country AND State are selected
  if (countryFilter && stateFilter) {
    const stateCities = getCitiesForState(countryFilter, stateFilter)

    if (!q) {
      return stateCities.slice(0, limit)
    }

    const exact: CityItem[] = []
    const prefix: CityItem[] = []
    const wordPrefix: CityItem[] = []
    const contains: CityItem[] = []

    for (const c of stateCities) {
      const nameLower = c.name.toLowerCase()
      const nameClean = stripAccents(c.name)

      if (nameLower === q || nameClean === qClean) {
        exact.push(c)
      } else if (nameLower.startsWith(q) || nameClean.startsWith(qClean)) {
        prefix.push(c)
      } else if (nameLower.includes(' ' + q) || nameClean.includes(' ' + qClean)) {
        wordPrefix.push(c)
      } else if (nameLower.includes(q) || nameClean.includes(qClean)) {
        contains.push(c)
      }
    }

    const matched = [...exact, ...prefix, ...wordPrefix, ...contains]
    if (matched.length > 0) {
      return matched.slice(0, limit)
    }

    // Fallback: search all cities in that country
    const countryResults = searchCities(query, limit, { country: countryFilter })
    if (countryResults.length > 0) {
      return countryResults
    }

    return []
  }

  // Case 2: Specific Country selected (all states of that country)
  if (countryFilter) {
    const matchedCountry = resolveCountry(countryFilter)
    if (matchedCountry) {
      const cCode = matchedCountry.code.toUpperCase()
      const cName = matchedCountry.name
      const stateMap = hierarchyTyped[cCode] || {}

      const pool: CityItem[] = []
      for (const [stName, cityNames] of Object.entries(stateMap)) {
        for (const cityName of cityNames) {
          pool.push({
            name: cityName,
            state: stName,
            country: cName,
            country_code: cCode,
          })
        }
      }

      if (!q) {
        return pool.slice(0, limit)
      }

      const exact: CityItem[] = []
      const prefix: CityItem[] = []
      const wordPrefix: CityItem[] = []
      const contains: CityItem[] = []

      for (const c of pool) {
        const nameLower = c.name.toLowerCase()
        const nameClean = stripAccents(c.name)

        if (nameLower === q || nameClean === qClean) {
          exact.push(c)
        } else if (nameLower.startsWith(q) || nameClean.startsWith(qClean)) {
          prefix.push(c)
        } else if (nameLower.includes(' ' + q) || nameClean.includes(' ' + qClean)) {
          wordPrefix.push(c)
        } else if (nameLower.includes(q) || nameClean.includes(qClean)) {
          contains.push(c)
        }
        if (exact.length + prefix.length >= limit) break
      }

      return [...exact, ...prefix, ...wordPrefix, ...contains].slice(0, limit)
    }
  }

  // Case 3: Worldwide Search (no country filter)
  if (!worldwideIndex.length) {
    initializeWorldwideCache()
  }

  if (!q) {
    return worldwideIndex.slice(0, limit)
  }

  // Multi-tier ranking across worldwide index
  const exact: CityItem[] = []
  const prefix: CityItem[] = []
  const wordPrefix: CityItem[] = []
  const contains: CityItem[] = []
  const stateMatch: CityItem[] = []

  for (const c of worldwideIndex) {
    const nameLower = c.name.toLowerCase()
    const nameClean = stripAccents(c.name)
    const stateLower = c.state.toLowerCase()

    if (nameLower === q || nameClean === qClean) {
      exact.push(c)
    } else if (nameLower.startsWith(q) || nameClean.startsWith(qClean)) {
      prefix.push(c)
    } else if (nameLower.includes(' ' + q) || nameClean.includes(' ' + qClean)) {
      wordPrefix.push(c)
    } else if (nameLower.includes(q) || nameClean.includes(qClean)) {
      contains.push(c)
    } else if (stateLower.includes(q)) {
      stateMatch.push(c)
    }
  }

  // If worldwideIndex had fewer than limit matches, scan full hierarchy for exact/prefix match
  if (exact.length + prefix.length < limit) {
    outer: for (const [code, stateMap] of Object.entries(hierarchyTyped)) {
      const cName = countryCodeToNameMap.get(code) || code
      for (const [state, cities] of Object.entries(stateMap)) {
        for (const city of cities) {
          const nameLower = city.toLowerCase()
          if (nameLower === q) {
            exact.push({ name: city, state, country: cName, country_code: code })
          } else if (nameLower.startsWith(q)) {
            prefix.push({ name: city, state, country: cName, country_code: code })
          }
          if (exact.length + prefix.length >= limit * 2) break outer
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>()
  const finalResults: CityItem[] = []
  for (const item of [...exact, ...prefix, ...wordPrefix, ...contains, ...stateMatch]) {
    const k = makeCityKey(item.name, item.state, item.country)
    if (!seen.has(k)) {
      seen.add(k)
      finalResults.push(item)
      if (finalResults.length >= limit) break
    }
  }

  return finalResults
}

/**
 * Cache for Supabase DB Country & State UUIDs.
 */
let dbCountriesCache: Array<{ id: string; country_name: string; country_code: string }> | null = null
const dbStatesCache = new Map<string, Array<{ id: string; state_name: string }>>()

async function fetchDbCountries(): Promise<Array<{ id: string; country_name: string; country_code: string }>> {
  if (dbCountriesCache && dbCountriesCache.length > 0) return dbCountriesCache
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryPromise = (supabase as any)
      .from('countries')
      .select('id, country_name, country_code')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await Promise.race([
      queryPromise,
      new Promise((resolve) => setTimeout(() => resolve({ data: null }), 1000)),
    ])

    if (Array.isArray(res?.data) && res.data.length > 0) {
      dbCountriesCache = res.data
    }
  } catch {
    // Non-blocking
  }
  return dbCountriesCache || []
}

async function fetchDbStates(countryId: string): Promise<Array<{ id: string; state_name: string }>> {
  if (dbStatesCache.has(countryId)) return dbStatesCache.get(countryId)!
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryPromise = (supabase as any)
      .from('states')
      .select('id, state_name')
      .eq('country_id', countryId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await Promise.race([
      queryPromise,
      new Promise((resolve) => setTimeout(() => resolve({ data: null }), 1000)),
    ])

    if (Array.isArray(res?.data) && res.data.length > 0) {
      dbStatesCache.set(countryId, res.data)
      return res.data
    }
  } catch {
    // Non-blocking
  }
  return []
}

/**
 * Asynchronous city search combining remote Supabase RPC with authoritative local fallback.
 */
export async function searchCitiesAsync(
  query: string,
  limit = 20,
  filter?: { country?: string; state?: string }
): Promise<CityItem[]> {
  const q = query.trim()
  const localResults = searchCities(q, limit, filter)

  try {
    // Resolve DB country_id and state_id if available
    let countryId: string | null = null
    let stateId: string | null = null

    if (filter?.country) {
      const countries = await fetchDbCountries()
      const targetCountry = resolveCountry(filter.country)
      const matched = countries.find(
        (c) =>
          c.country_name.toLowerCase() === filter.country!.toLowerCase() ||
          (targetCountry && c.country_code.toUpperCase() === targetCountry.code.toUpperCase())
      )
      if (matched) {
        countryId = matched.id
        if (filter?.state) {
          const states = await fetchDbStates(countryId)
          const matchedState = states.find(
            (s) => s.state_name.toLowerCase() === filter.state!.toLowerCase()
          )
          if (matchedState) {
            stateId = matchedState.id
          }
        }
      }
    }

    // Call Supabase search_worldwide_cities RPC if query or IDs present with timeout protection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcPromise = (supabase.rpc as any)('search_worldwide_cities', {
      p_query: q || null,
      p_country_id: countryId,
      p_state_id: stateId,
      p_limit: limit,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await Promise.race([
      rpcPromise,
      new Promise((resolve) => setTimeout(() => resolve({ data: null, error: null }), 1500)),
    ])
    const data = res?.data
    const error = res?.error

    if (!error && Array.isArray(data) && data.length > 0) {
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
    // Graceful fallback to verified local results
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
        if (!worldwideIndex.some((c) => makeCityKey(c.name, c.state, c.country) === k)) {
          worldwideIndex.push(row)
        }
      }
    }
  } catch {
    // Fall back to memory cache
  }
  return worldwideIndex
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
  if (!worldwideIndex.some((c) => makeCityKey(c.name, c.state, c.country) === k)) {
    worldwideIndex.unshift(newCity)
  }

  // Attempt to persist to Supabase public.cities
  try {
    let countryId: string | null = null
    let stateId: string | null = null

    const countries = await Promise.race([
      fetchDbCountries(),
      new Promise<Array<{ id: string; country_name: string; country_code: string }>>((resolve) =>
        setTimeout(() => resolve([]), 600)
      ),
    ])
    const matchedC = countries.find(
      (c) => c.country_name.toLowerCase() === cleanCountry.toLowerCase()
    )
    if (matchedC) {
      countryId = matchedC.id
      const states = await Promise.race([
        fetchDbStates(countryId),
        new Promise<Array<{ id: string; state_name: string }>>((resolve) =>
          setTimeout(() => resolve([]), 600)
        ),
      ])
      const matchedS = states.find(
        (s) => s.state_name.toLowerCase() === cleanState.toLowerCase()
      )
      if (matchedS) stateId = matchedS.id
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insPromise = (supabase as any)
      .from('cities')
      .insert({
        name: cleanName,
        state: cleanState,
        country: cleanCountry,
        is_custom: true,
        country_id: countryId,
        state_id: stateId,
      })
      .select()
      .single()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await Promise.race([
      insPromise,
      new Promise((resolve) => setTimeout(() => resolve({ data: null, error: null }), 800)),
    ])

    if (res?.data) {
      newCity.id = res.data.id
    }
  } catch {
    // Non-blocking: local persistence guarantees availability
  }

  return { data: newCity, error: null }
}
