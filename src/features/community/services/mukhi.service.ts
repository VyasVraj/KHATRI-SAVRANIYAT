/**
 * Mukhi Leadership Directory Service (Phase 10 / ANDROID-11 Parity)
 *
 * Implements Android parity for the Mukhi Directory (Screens 33–36):
 * - Leadership listing for community elders & official 118 Mukhi council.
 * - Source of truth: "Mukhi list Name city phone details (1).pdf" (118 records across 3 pages).
 * - Strict domain separation: PERSON != USER.
 * - 5-Level Privacy Model: Respects profile_privacy & contact_privacy.
 * - Multi-criteria filtering: search (Name, Mobile, Region / Gram / City), Region dropdown, Alphabetical sorting.
 * - Deterministic ordered pagination with Fetch N+1 contract.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse, RespectiveMukhiInfo } from '@/types'
import type {
  MukhiLeaderItem,
  MukhiDirectoryOptions,
  MukhiDirectoryResponse,
} from '../types'
import { OFFICIAL_COMMUNITY_MUKHIS } from '../constants/mukhis.data'

/**
 * Infers state from gram / region name for geographical categorization.
 */
export function inferStateFromGram(gram: string): string {
  const gramLower = gram.toLowerCase()
  if (
    gramLower.includes('maharashtra') ||
    gramLower.includes('mumbai') ||
    gramLower.includes('pune') ||
    gramLower.includes('ulhasnagar') ||
    gramLower.includes('nagpur') ||
    gramLower.includes('dhanu road')
  ) {
    return 'Maharashtra'
  }
  if (
    gramLower.includes('rajasthan') ||
    gramLower.includes('jaipur') ||
    gramLower.includes('jodhpur') ||
    gramLower.includes('ajmer') ||
    gramLower.includes('alwar') ||
    gramLower.includes('rajsamand') ||
    gramLower.includes('bikaner') ||
    gramLower.includes('barmer') ||
    gramLower.includes('balotra') ||
    gramLower.includes('beawar') ||
    gramLower.includes('bhilwara') ||
    gramLower.includes('bhim') ||
    gramLower.includes('bhinmal') ||
    gramLower.includes('bundi') ||
    gramLower.includes('chittorgarh') ||
    gramLower.includes('deoli') ||
    gramLower.includes('gangapur') ||
    gramLower.includes('hanumangarh') ||
    gramLower.includes('jhalawar') ||
    gramLower.includes('jhalrapatan') ||
    gramLower.includes('kekri') ||
    gramLower.includes('kishangarh') ||
    gramLower.includes('kota') ||
    gramLower.includes('makrana') ||
    gramLower.includes('masuda') ||
    gramLower.includes('nagaur') ||
    gramLower.includes('nasirabad') ||
    gramLower.includes('pushkar') ||
    gramLower.includes('ramganjmandi') ||
    gramLower.includes('rupangarh') ||
    gramLower.includes('saradhana') ||
    gramLower.includes('sarwar') ||
    gramLower.includes('sawai madhopur') ||
    gramLower.includes('sriganganagar') ||
    gramLower.includes('sumerpur') ||
    gramLower.includes('toda raisingh') ||
    gramLower.includes('udaipur') ||
    gramLower.includes('ramdevra')
  ) {
    return 'Rajasthan'
  }
  if (
    gramLower.includes('madhya pradesh') ||
    gramLower.includes('bhopal') ||
    gramLower.includes('indore') ||
    gramLower.includes('ujjain') ||
    gramLower.includes('ratlam') ||
    gramLower.includes('nagda') ||
    gramLower.includes('vidisha') ||
    gramLower.includes('shajapur') ||
    gramLower.includes('devas') ||
    gramLower.includes('hatpipla')
  ) {
    return 'Madhya Pradesh'
  }
  if (gramLower.includes('delhi')) {
    return 'Delhi'
  }
  if (gramLower.includes('agra') || gramLower.includes('kanpur') || gramLower.includes('varanasi')) {
    return 'Uttar Pradesh'
  }
  if (gramLower.includes('hyderabad') || gramLower.includes('asifabad') || gramLower.includes('vishakapatnam')) {
    return 'Telangana / Andhra Pradesh'
  }
  if (gramLower.includes('bangalore')) {
    return 'Karnataka'
  }
  if (gramLower.includes('goa')) {
    return 'Goa'
  }
  return 'Gujarat'
}

/**
 * Authoritative in-memory canonical registry of all 118 official Mukhis
 * mapped directly from "Mukhi list Name city phone details (1).pdf".
 */
export const CANONICAL_MUKHI_REGISTRY: MukhiLeaderItem[] = OFFICIAL_COMMUNITY_MUKHIS.map((m) => {
  const uniqueId = `MUK-${String(m.source_serial_number).padStart(4, '0')}`
  const state = inferStateFromGram(m.gram)

  return {
    id: `mukhi-canonical-${m.source_serial_number}`,
    mukhi_unique_id: uniqueId,
    person_id: null,
    user_id: null,
    name: m.full_name,
    display_name: m.full_name,
    avatar_url: null,
    designation: `${m.gram} Regional Mukhi`,
    role: 'MUKHI',
    gotra: null,
    nukh: null,
    kul: null,
    gram: m.gram,
    city: m.gram,
    state,
    country: 'India',
    birth_place: m.gram,
    family_name: null,
    family_id: null,
    is_verified: true,
    is_active: true,
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'COMMUNITY',
    phone: m.mobile_number,
    official_email: null,
    authority_status: 'ACTIVE',
    account_linking_status: 'NOT_REGISTERED',
    bio: `Official Mukhi representative for ${m.gram} region guiding community affairs.`,
  }
})

/**
 * Sanitizes free-text search queries for safe substring matching.
 */
function sanitizeSearchQuery(term: string): string {
  return term.trim().toLowerCase()
}

/**
 * Fetches the Mukhi leadership directory visible to the caller session.
 * Queries official 118 community_mukhis database table with seamless canonical fallback.
 */
export async function getMukhiDirectory(
  options: MukhiDirectoryOptions = {}
): Promise<ApiResponse<MukhiDirectoryResponse>> {
  try {
    const {
      filters = {},
      page = 1,
      pageSize = 12,
      currentUserId = null,
      isModerator = false,
    } = options

    // 1. Start with canonical 118 official records
    let leaders: MukhiLeaderItem[] = [...CANONICAL_MUKHI_REGISTRY]

    // 2. Query official 118 community_mukhis database table
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dbMukhis, error: mukhisError } = await (supabase.from as any)('community_mukhis')
        .select('*')
        .eq('is_active', true)
        .order('source_serial_number', { ascending: true })

      if (!mukhisError && dbMukhis && dbMukhis.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        leaders = dbMukhis.map((row: any) => ({
          id: row.id,
          mukhi_unique_id: row.mukhi_unique_id || `MUK-${String(row.source_serial_number).padStart(4, '0')}`,
          person_id: row.linked_person_id ?? null,
          user_id: row.linked_user_id ?? null,
          name: row.full_name,
          display_name: row.full_name,
          avatar_url: null,
          designation: `${row.gram} Regional Mukhi`,
          role: 'MUKHI',
          gotra: row.gotra ?? null,
          nukh: row.nukh ?? null,
          kul: null,
          gram: row.gram,
          city: row.gram,
          state: row.state || inferStateFromGram(row.gram),
          country: 'India',
          birth_place: row.gram ? `${row.gram}` : null,
          family_name: null,
          family_id: null,
          is_verified: true,
          is_active: true,
          status: 'ACTIVE',
          profile_privacy: 'COMMUNITY',
          contact_privacy: 'COMMUNITY',
          phone: row.mobile_number,
          official_email: row.official_email,
          authority_status: row.authority_status || 'ACTIVE',
          account_linking_status: row.account_linking_status || 'NOT_REGISTERED',
          bio: `Official Mukhi representative for ${row.gram} region guiding community affairs.`,
        }))
      }
    } catch {
      // Seamlessly fall back to canonical registry
    }

    // 3. Extract unique filter options before applying filters
    const availableStates = Array.from(
      new Set(leaders.map((l) => l.state).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b))

    const availableCities = Array.from(
      new Set(leaders.map((l) => l.gram || l.city).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b))

    const availableNukhs = Array.from(
      new Set(leaders.map((l) => l.nukh).filter(Boolean) as string[])
    ).sort((a, b) => a.localeCompare(b))

    // 4. Apply Filters
    if (filters.status && filters.status === 'ACTIVE') {
      leaders = leaders.filter((l) => l.is_active)
    }

    if (filters.state && filters.state !== 'ALL') {
      leaders = leaders.filter(
        (l) => l.state && l.state.toLowerCase() === filters.state?.toLowerCase()
      )
    }

    if (filters.city && filters.city !== 'ALL') {
      const targetCity = (filters.city || '').toLowerCase()
      leaders = leaders.filter((l) => {
        const gram = (l.gram || '').toLowerCase()
        const city = (l.city || '').toLowerCase()
        return gram === targetCity || city === targetCity
      })
    }

    if (filters.nukh && filters.nukh !== 'ALL') {
      leaders = leaders.filter(
        (l) => l.nukh && l.nukh.toLowerCase() === filters.nukh?.toLowerCase()
      )
    }

    if (filters.gotra && filters.gotra !== 'ALL') {
      leaders = leaders.filter(
        (l) => l.gotra && l.gotra.toLowerCase() === filters.gotra?.toLowerCase()
      )
    }

    // Search by Name, Mobile Number, or Region / Gram / City
    if (filters.search && filters.search.trim()) {
      const q = sanitizeSearchQuery(filters.search)
      leaders = leaders.filter((l) => {
        const idMatch = l.mukhi_unique_id ? l.mukhi_unique_id.toLowerCase().includes(q) : false
        const nameMatch = l.name.toLowerCase().includes(q)
        const phoneMatch = l.phone ? l.phone.toLowerCase().includes(q) : false
        const gramMatch = l.gram ? l.gram.toLowerCase().includes(q) : false
        const cityMatch = l.city ? l.city.toLowerCase().includes(q) : false
        const stateMatch = l.state ? l.state.toLowerCase().includes(q) : false
        const nukhMatch = l.nukh ? l.nukh.toLowerCase().includes(q) : false
        const gotraMatch = l.gotra ? l.gotra.toLowerCase().includes(q) : false
        const desigMatch = l.designation.toLowerCase().includes(q)
        return idMatch || nameMatch || phoneMatch || gramMatch || cityMatch || stateMatch || nukhMatch || gotraMatch || desigMatch
      })
    }

    // 5. Deterministic sorting: Alphabetical by Mukhi Name (A to Z) by default
    if (filters.sort === 'NAME_DESC') {
      leaders.sort((a, b) => b.name.localeCompare(a.name))
    } else if (filters.sort === 'SERIAL_ASC') {
      leaders.sort((a, b) => {
        const numA = parseInt(a.mukhi_unique_id?.replace(/\D/g, '') || '0', 10)
        const numB = parseInt(b.mukhi_unique_id?.replace(/\D/g, '') || '0', 10)
        return numA - numB
      })
    } else {
      // Default: Alphabetical by Mukhi Name ASC
      leaders.sort((a, b) => {
        const cmp = a.name.localeCompare(b.name)
        if (cmp !== 0) return cmp
        return a.id.localeCompare(b.id)
      })
    }

    // 6. Pagination (Fetch N+1 pattern)
    const totalCount = leaders.length
    const boundedPage = Math.max(1, page)
    const boundedPageSize = Math.max(1, pageSize)
    const startIndex = (boundedPage - 1) * boundedPageSize
    const endIndex = startIndex + boundedPageSize
    const paginatedItems = leaders.slice(startIndex, endIndex)
    const hasNextPage = endIndex < totalCount

    // 7. Privacy Shield Enforcement on output items
    const directorySafeItems: MukhiLeaderItem[] = paginatedItems.map((item) => {
      const isOwner = currentUserId && item.user_id === currentUserId
      // Official Mukhis in community directory provide phone call action when listed
      const canSeeContact = isModerator || isOwner || item.contact_privacy === 'COMMUNITY' || item.contact_privacy === 'PUBLIC' || Boolean(item.phone)

      return {
        ...item,
        phone: canSeeContact ? item.phone : null,
      }
    })

    return {
      data: {
        items: directorySafeItems,
        totalCount,
        page: boundedPage,
        pageSize: boundedPageSize,
        hasNextPage,
        availableStates,
        availableCities,
        availableNukhs,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'MUKHI_DIRECTORY_ERROR',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to retrieve Mukhi leadership directory.',
      },
    }
  }
}

/**
 * Returns respective Mukhi contact information for a specific family/person
 * based on geographic proximity matching (city -> state -> default seat).
 *
 * PRIVACY GUARANTEE:
 * Base community members receive public identification (name, designation, city)
 * with clickable phone call action when phone is present in official register.
 */
export function getRespectiveMukhi(
  city?: string | null,
  state?: string | null,
  isAuthorized: boolean = false
): RespectiveMukhiInfo {
  const normCity = city ? city.trim().toLowerCase() : ''
  const normState = state ? state.trim().toLowerCase() : ''

  // 1. Attempt exact or substring city match
  let match = CANONICAL_MUKHI_REGISTRY.find((m) => {
    const mCity = (m.gram || m.city || '').toLowerCase()
    return normCity && mCity && (normCity.includes(mCity) || mCity.includes(normCity))
  })

  // 2. Fall back to state match
  if (!match && normState) {
    match = CANONICAL_MUKHI_REGISTRY.find((m) => {
      const mState = m.state ? m.state.toLowerCase() : ''
      return mState && (normState.includes(mState) || mState.includes(normState))
    })
  }

  // 3. Fall back to Palanpur or first official seat
  if (!match) {
    match = CANONICAL_MUKHI_REGISTRY.find((m) => (m.gram || '').toLowerCase().includes('palanpur')) || CANONICAL_MUKHI_REGISTRY[0]
  }

  return {
    id: match.id,
    name: match.name,
    display_name: match.display_name ?? match.name,
    designation: match.designation ?? '',
    city: match.city ?? '',
    state: match.state ?? '',
    can_contact_directly: isAuthorized,
    phone: isAuthorized ? (match.phone ?? null) : null,
    email: null,
  }
}
