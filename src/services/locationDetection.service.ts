/**
 * Location Detection Service — Automatic Geolocation & Canonical Location Resolution
 *
 * Requirements:
 * 1. Prompts user for Geolocation permission via navigator.geolocation.
 * 2. Obtains device latitude & longitude coordinates.
 * 3. Resolves coordinates into City, State/Province, and Country using client-side reverse
 *    geocoding and matches against authoritative worldwide location database.
 * 4. Gracefully handles permission denial, timeout, and device unavailability.
 */

import { searchCities, type CityItem } from './cities.service'
import { supabase } from '@/lib/supabase'

export interface DetectedLocationResult {
  success: boolean
  location?: {
    city: string
    state: string
    country: string
  }
  error?: string
}

/**
 * Detects current user location using browser Geolocation API and resolves
 * it into an authoritative canonical City, State, and Country triplet.
 */
export async function detectUserLocation(): Promise<DetectedLocationResult> {
  if (!navigator || !navigator.geolocation) {
    return {
      success: false,
      error: 'Geolocation is not supported by your browser or device. Please select your city manually.',
    }
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords

          // Reverse geocode via BigDataCloud client API (fast, free, no API key needed for client-side reverse geocoding)
          let rawCity = ''
          let rawState = ''
          let rawCountry = 'India'

          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 6000)

            const httpClient = (globalThis as unknown as Record<string, typeof fetch>)['fetch']
            const res = await httpClient(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
              { signal: controller.signal }
            )
            clearTimeout(timeoutId)

            if (res.ok) {
              const data = await res.json()
              rawCity = data.city || data.locality || data.localityInfo?.administrative?.[3]?.name || data.localityInfo?.administrative?.[2]?.name || ''
              rawState = data.principalSubdivision || data.localityInfo?.administrative?.[1]?.name || ''
              rawCountry = data.countryName || 'India'
            }
          } catch {
            // Fallback to OpenStreetMap Nominatim reverse geocode
            try {
              const controller2 = new AbortController()
              const timeoutId2 = setTimeout(() => controller2.abort(), 6000)

              const httpClient = (globalThis as unknown as Record<string, typeof fetch>)['fetch']
              const res2 = await httpClient(
                `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2`,
                { signal: controller2.signal }
              )
              clearTimeout(timeoutId2)

              if (res2.ok) {
                const data2 = await res2.json()
                const addr = data2.address || {}
                rawCity = addr.city || addr.town || addr.village || addr.suburb || addr.county || ''
                rawState = addr.state || ''
                rawCountry = addr.country || 'India'
              }
            } catch {
              // Non-fatal, will check DB or return error
            }
          }

          if (!rawCity && !rawState) {
            resolve({
              success: false,
              error: 'Coordinates obtained, but city name could not be resolved. Please search and select your city manually.',
            })
            return
          }

          // Authoritative cross-reference against worldwide_locations database view / cities service
          let matchedItem: CityItem | null = null

          // Step A: First try querying public.worldwide_locations in Supabase
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: dbLocs } = await (supabase.from as any)('worldwide_locations')
              .select('city_name, state_name, country_name')
              .ilike('city_name', `%${rawCity.trim()}%`)
              .limit(5)

            if (Array.isArray(dbLocs) && dbLocs.length > 0) {
              const exact = dbLocs.find(
                (l: { city_name: string; state_name?: string }) =>
                  l.city_name.toLowerCase() === rawCity.toLowerCase() &&
                  (!rawState || (l.state_name && l.state_name.toLowerCase() === rawState.toLowerCase()))
              ) || dbLocs[0]

              matchedItem = {
                name: exact.city_name,
                state: exact.state_name || rawState,
                country: exact.country_name || rawCountry,
              }
            }
          } catch {
            // Non-blocking fallback to local service index
          }

          // Step B: Fallback to local authoritative cities database
          if (!matchedItem && rawCity) {
            const matches = searchCities(rawCity, 10)
            if (matches.length > 0) {
              const exact = matches.find(
                (m) =>
                  m.name.toLowerCase() === rawCity.toLowerCase() &&
                  (!rawState || m.state.toLowerCase() === rawState.toLowerCase())
              ) || matches[0]

              matchedItem = exact
            }
          }

          if (matchedItem) {
            resolve({
              success: true,
              location: {
                city: matchedItem.name,
                state: matchedItem.state,
                country: matchedItem.country || 'India',
              },
            })
          } else {
            resolve({
              success: true,
              location: {
                city: rawCity,
                state: rawState,
                country: rawCountry,
              },
            })
          }
        } catch (err) {
          resolve({
            success: false,
            error: (err as Error).message || 'Failed to detect location. Please search and select manually.',
          })
        }
      },
      (error) => {
        let msg = 'Location detection was not successful. Please search and select your city manually.'
        if (error.code === 1) {
          msg = 'Location permission was denied. Please allow location access or select your city manually below.'
        } else if (error.code === 2) {
          msg = 'Location position is unavailable. Please search and select your city manually.'
        } else if (error.code === 3) {
          msg = 'Location detection timed out. Please search and select your city manually.'
        }
        resolve({
          success: false,
          error: msg,
        })
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes cache
      }
    )
  })
}
