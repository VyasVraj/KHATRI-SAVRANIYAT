/**
 * Community Mukhi Service — Official 118-member Community Mukhi Directory & Family-wise Selection.
 *
 * Source of truth: Official Community Mukhi List ("Mukhi list Name city phone details (1).pdf").
 * Contains 118 official Mukhis with source serial number, name, gram/location, and mobile number.
 *
 * SECURITY & PRIVACY RULES:
 * - PERSON != USER != MUKHI: A directory Mukhi record is separate from authenticated user accounts.
 * - Selecting a Mukhi does NOT automatically grant application login or Mukhi permissions.
 * - Administrative tracking fields (password given, form received, online updated) are strictly
 *   restricted to administrator workflows and are never exposed in community directory queries.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import {
  OFFICIAL_COMMUNITY_MUKHIS,
  type CommunityMukhi,
} from '../constants/mukhis.data'

export type { CommunityMukhi }

export interface CommunityMukhiFilters {
  search?: string
  gram?: string
  priorityLocation?: string
}

/** Directory-safe projection for community users */
export const COMMUNITY_MUKHI_DIRECTORY_COLUMNS =
  'id, source_serial_number, full_name, gram, mobile_number, gotra, nukh, is_active, linked_user_id, linked_person_id'

/**
 * Hydrated fallback list with deterministic mock UUIDs for offline/pre-migration resilience
 */
const HYDRATED_FALLBACK_MUKHIS: CommunityMukhi[] = OFFICIAL_COMMUNITY_MUKHIS.map((m) => ({
  ...m,
  id: `00000000-0000-4000-a000-${String(m.source_serial_number).padStart(12, '0')}`,
}))

/**
 * Normalizes location string for fuzzy comparison
 */
function normalizeLocation(loc?: string | null): string {
  if (!loc) return ''
  return loc.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Check if a Mukhi gram matches the target family city/location
 */
export function isLocationMatch(gram: string, targetLocation?: string | null): boolean {
  if (!targetLocation?.trim()) return false
  const normTarget = normalizeLocation(targetLocation)
  const normGram = normalizeLocation(gram)
  if (!normTarget || !normGram) return false
  return normGram.includes(normTarget) || normTarget.includes(normGram)
}

/**
 * Fetch official Community Mukhis with search, location filtering, and priority location sorting.
 *
 * If `priorityLocation` is supplied (e.g. family's city), Mukhis from that gram/city
 * will appear at the top of the list to assist the user in finding their local Mukhi.
 */
export async function getCommunityMukhis(
  filters: CommunityMukhiFilters = {}
): Promise<ApiResponse<CommunityMukhi[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from as any)('community_mukhis')
      .select(COMMUNITY_MUKHI_DIRECTORY_COLUMNS)
      .eq('is_active', true)

    if (filters.gram && filters.gram !== 'ALL') {
      query = query.ilike('gram', `%${filters.gram}%`)
    }

    const { data, error } = await query.order('source_serial_number', { ascending: true })

    let list: CommunityMukhi[] = []

    if (error || !data || data.length === 0) {
      // Fallback to authoritative 118 records
      list = [...HYDRATED_FALLBACK_MUKHIS]
    } else {
      list = data as CommunityMukhi[]
    }

    // Apply search filter (name, gram, mobile, serial number)
    if (filters.search?.trim()) {
      const q = filters.search.toLowerCase().trim()
      list = list.filter((m) => {
        const matchName = m.full_name.toLowerCase().includes(q)
        const matchGram = m.gram.toLowerCase().includes(q)
        const matchPhone = (m.mobile_number ?? '').includes(q)
        const matchSerial = String(m.source_serial_number) === q
        return matchName || matchGram || matchPhone || matchSerial
      })
    }

    // Apply specific gram filter if in fallback mode
    if (filters.gram && filters.gram !== 'ALL') {
      const g = filters.gram.toLowerCase()
      list = list.filter((m) => m.gram.toLowerCase().includes(g))
    }

    // If priority location is provided, sort matching Mukhis to the top
    if (filters.priorityLocation?.trim()) {
      const loc = filters.priorityLocation.trim()
      list.sort((a, b) => {
        const aMatch = isLocationMatch(a.gram, loc) ? 1 : 0
        const bMatch = isLocationMatch(b.gram, loc) ? 1 : 0
        if (aMatch !== bMatch) {
          return bMatch - aMatch // Match comes first
        }
        return a.source_serial_number - b.source_serial_number
      })
    }

    return { data: list, error: null }
  } catch {
    return {
      data: HYDRATED_FALLBACK_MUKHIS,
      error: null,
    }
  }
}

/**
 * Fetch a single Community Mukhi by ID
 */
export async function getCommunityMukhi(id: string): Promise<ApiResponse<CommunityMukhi | null>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from as any)('community_mukhis')
      .select(COMMUNITY_MUKHI_DIRECTORY_COLUMNS)
      .eq('id', id)
      .maybeSingle()

    if (error || !data) {
      const fallback = HYDRATED_FALLBACK_MUKHIS.find(
        (m) => m.id === id || String(m.source_serial_number) === id
      )
      return { data: fallback || null, error: null }
    }

    return { data: data as CommunityMukhi, error: null }
  } catch {
    const fallback = HYDRATED_FALLBACK_MUKHIS.find(
      (m) => m.id === id || String(m.source_serial_number) === id
    )
    return { data: fallback || null, error: null }
  }
}

export interface UpsertCommunityMukhiInput {
  id?: string
  full_name: string
  gram: string
  mobile_number?: string | null
  gotra?: string | null
  nukh?: string | null
  linked_person_id?: string | null
  official_email?: string | null
  authority_status?: string
  is_active?: boolean
}

/**
 * Upsert (create or update) an official Community Mukhi.
 * Admin / Super Admin operation only.
 */
export async function upsertCommunityMukhi(
  input: UpsertCommunityMukhiInput
): Promise<ApiResponse<CommunityMukhi>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      full_name: input.full_name.trim(),
      gram: input.gram.trim(),
      mobile_number: input.mobile_number?.trim() || null,
      gotra: input.gotra?.trim() || null,
      nukh: input.nukh?.trim() || null,
      linked_person_id: input.linked_person_id || null,
      official_email: input.official_email?.trim() || null,
      is_active: input.is_active ?? true,
      updated_at: new Date().toISOString(),
    }

    if (input.authority_status) {
      payload.authority_status = input.authority_status
    }

    if (input.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('community_mukhis')
        .update(payload)
        .eq('id', input.id)
        .select()
        .single()

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } }
      }
      return { data: data as CommunityMukhi, error: null }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from as any)('community_mukhis')
        .insert(payload)
        .select()
        .single()

      if (error) {
        return { data: null, error: { message: error.message, code: error.code } }
      }
      return { data: data as CommunityMukhi, error: null }
    }
  } catch (err) {
    return {
      data: null,
      error: {
        message: err instanceof Error ? err.message : 'Failed to save Mukhi record',
      },
    }
  }
}

/**
 * Check if a person is already registered as an official Mukhi in any region.
 */
export async function checkPersonAlreadyMukhi(
  personId: string,
  excludeMukhiId?: string
): Promise<{ isMukhi: boolean; gram?: string; name?: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase.from as any)('community_mukhis')
      .select('id, full_name, gram')
      .eq('linked_person_id', personId)
      .eq('is_active', true)

    if (excludeMukhiId) {
      q = q.neq('id', excludeMukhiId)
    }

    const { data } = await q.maybeSingle()
    if (data) {
      return { isMukhi: true, gram: data.gram, name: data.full_name }
    }
    return { isMukhi: false }
  } catch {
    return { isMukhi: false }
  }
}

export interface MukhiPersonCandidate {
  id: string
  first_name: string
  middle_name?: string | null
  last_name: string
  full_name: string
  gender?: string | null
  age?: number | null
  dob_year?: number | null
  birth_place?: string | null
  city?: string | null
  state?: string | null
  gotra?: string | null
  nukh?: string | null
}

/**
 * Search existing census persons to autofill and link a Mukhi entry.
 * Does NOT mutate public.persons or create duplicate person records.
 */
export async function searchPersonsForMukhiForm(
  query: string
): Promise<MukhiPersonCandidate[]> {
  const q = query.trim()
  if (!q || q.length < 2) return []

  try {
    const sanitized = q.replace(/[,()"\\]/g, ' ').replace(/\s+/g, ' ').trim()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from as any)('community_persons')
      .select('id, first_name, middle_name, last_name, gender, age, dob_year, birth_place, city, state, gotra, nukh')
      .or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,middle_name.ilike.%${sanitized}%,city.ilike.%${sanitized}%,birth_place.ilike.%${sanitized}%`)
      .limit(10)

    if (error || !data || data.length === 0) {
      // Fallback query on persons table
      const { data: pData } = await supabase
        .from('persons')
        .select('id, first_name, middle_name, last_name, gender, dob_year, birth_place, gotra, nukh')
        .or(`first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%,middle_name.ilike.%${sanitized}%`)
        .limit(10)

      if (!pData) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (pData as any[]).map((p) => ({
        id: p.id,
        first_name: p.first_name,
        middle_name: p.middle_name,
        last_name: p.last_name,
        full_name: [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' '),
        gender: p.gender,
        dob_year: p.dob_year,
        birth_place: p.birth_place,
        city: p.birth_place,
        state: null,
        gotra: p.gotra,
        nukh: p.nukh,
      }))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((p) => ({
      id: p.id,
      first_name: p.first_name,
      middle_name: p.middle_name,
      last_name: p.last_name,
      full_name: [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' '),
      gender: p.gender,
      age: p.age,
      dob_year: p.dob_year,
      birth_place: p.birth_place,
      city: p.city,
      state: p.state,
      gotra: p.gotra,
      nukh: p.nukh,
    }))
  } catch {
    return []
  }
}
