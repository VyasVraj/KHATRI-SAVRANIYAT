/**
 * Cities Service — Searchable City Database & User Custom City Management.
 *
 * Requirements:
 * - Autocomplete and search by city name (case-insensitive, partial matching).
 * - Automatic State and Country population.
 * - Handles duplicates gracefully.
 * - "+ Add New City" option: saves to Supabase cities table and local cache so it persists
 *   across sessions, restarts, and is available for all future searches.
 * - Highly resilient: works offline/locally if Supabase is temporarily unreachable.
 */

import { supabase } from '@/lib/supabase'
import staticCities from '@/constants/cities_data.json'

export interface CityItem {
  id?: string
  name: string
  state: string
  country: string
  is_custom?: boolean
}

const LOCAL_STORAGE_CUSTOM_CITIES_KEY = 'community_roots_custom_cities_v1'

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

  // 2. Add static verified cities
  for (const c of staticCities) {
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
 * Syncs any dynamic cities from Supabase public.cities table.
 */
export async function syncRemoteCities(): Promise<CityItem[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('cities')
      .select('id, name, state, country, is_custom')
      .order('name', { ascending: true })

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
 * Search cities by query string.
 */
export function searchCities(query: string, limit = 20): CityItem[] {
  if (!inMemoryCities.length) {
    initializeInMemoryCache()
  }

  const q = query.trim().toLowerCase()
  if (!q) {
    return inMemoryCities.slice(0, limit)
  }

  return inMemoryCities
    .filter((c) => {
      const name = c.name.toLowerCase()
      const state = c.state.toLowerCase()
      return name.includes(q) || state.includes(q)
    })
    .slice(0, limit)
}

/**
 * Adds a new missing city to the database and persistent cache.
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

  // Attempt to save to Supabase public.cities
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
