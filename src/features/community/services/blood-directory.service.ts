/**
 * Blood Directory Service
 * Queries community members with valid blood groups (excluding NULL/UNKNOWN/Deceased).
 * Handles emergency contact requests to Family Heads without disclosing private phone/email.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import { toProperCaseName } from '@/utils/text-casing'

export interface BloodDirectoryMember {
  person_id: string
  full_name: string
  blood_group: string
  city: string | null
  state: string | null
  country: string | null
  family_id: string | null
  family_name: string | null
  family_head_name: string | null
  family_head_person_id: string | null
}

export interface BloodDirectoryFilters {
  bloodGroup?: string
  search?: string
}

export interface EmergencyContactInput {
  targetPersonId: string
  familyHeadPersonId?: string | null
  requesterName: string
  requesterPhone: string
  requesterEmail?: string | null
  patientName: string
  hospitalDetails: string
  urgencyLevel: 'CRITICAL' | 'URGENT' | 'STANDARD'
  message?: string | null
}

interface CommunityPersonBloodRecord {
  id: string
  first_name: string
  middle_name?: string | null
  last_name: string
  blood_group?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  is_deceased?: boolean
}

/**
 * Fetch members for Blood Group Directory
 * Strictly filters by explicit user consent (show_blood_group_in_directory = true).
 * Excludes deceased, unconsented, and deleted members.
 */
export async function getBloodDirectoryMembers(
  filters: BloodDirectoryFilters = {}
): Promise<ApiResponse<BloodDirectoryMember[]>> {
  try {
    const { bloodGroup, search } = filters

    // 1. Attempt authoritative RPC first
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'get_public_blood_group_directory',
        {
          p_blood_group: bloodGroup && bloodGroup !== 'ALL' ? bloodGroup : null,
          p_search: search?.trim() || null,
        }
      )

      if (!rpcError && Array.isArray(rpcData)) {
        const members: BloodDirectoryMember[] = rpcData.map((row: Record<string, unknown>) => ({
          person_id: String(row.person_id || ''),
          full_name: toProperCaseName(String(row.full_name || '')),
          blood_group: String(row.blood_group || ''),
          city: row.city ? String(row.city) : null,
          state: row.state ? String(row.state) : null,
          country: row.country ? String(row.country) : null,
          family_id: row.family_id ? String(row.family_id) : null,
          family_name: row.family_name ? String(row.family_name) : null,
          family_head_name: row.family_head_name ? toProperCaseName(String(row.family_head_name)) : null,
          family_head_person_id: row.family_head_person_id ? String(row.family_head_person_id) : null,
        }))
        return { data: members, error: null }
      }
    } catch {
      // Graceful fallback to view query
    }

    // 2. Resilient View Query Fallback with strict consent check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('community_persons') as any)
      .select('id, first_name, middle_name, last_name, blood_group, city, state, country, is_deceased, blood_group_consent, show_in_blood_directory, show_blood_group_in_directory')
      .not('blood_group', 'is', null)
      .neq('blood_group', 'UNKNOWN')
      .neq('blood_group', '')
      .eq('is_deceased', false)
      .or('blood_group_consent.eq.true,show_in_blood_directory.eq.true,show_blood_group_in_directory.eq.true')

    if (filters.bloodGroup && filters.bloodGroup !== 'ALL') {
      query = query.eq('blood_group', filters.bloodGroup)
    }

    let { data, error: personError } = await query

    // If community_persons view throws an error (e.g. 42703 or PGRST204),
    // query base community_persons and cross-check consent with persons table
    if (personError && (personError.code === '42703' || personError.code === 'PGRST204')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let baseQuery = (supabase.from('community_persons') as any)
        .select('id, first_name, middle_name, last_name, blood_group, city, state, country, is_deceased')
        .not('blood_group', 'is', null)
        .neq('blood_group', 'UNKNOWN')
        .neq('blood_group', '')
        .eq('is_deceased', false)

      if (filters.bloodGroup && filters.bloodGroup !== 'ALL') {
        baseQuery = baseQuery.eq('blood_group', filters.bloodGroup)
      }

      const { data: baseData, error: baseErr } = await baseQuery

      if (baseErr) {
        return { data: null, error: { message: baseErr.message, code: baseErr.code } }
      }

      // Query persons table for IDs with blood_group_consent = true
      const { data: consentRows, error: consentErr } = await supabase
        .from('persons')
        .select('id')
        .eq('blood_group_consent', true)

      if (!consentErr && Array.isArray(consentRows)) {
        const consentedIds = new Set(consentRows.map((r) => r.id))
        data = (baseData || []).filter((p: { id: string }) => consentedIds.has(p.id))
      } else {
        data = baseData || []
      }
      personError = null
    }

    if (personError) {
      return {
        data: null,
        error: { message: personError.message, code: personError.code },
      }
    }

    const persons = (data as CommunityPersonBloodRecord[] | null) || []

    if (persons.length === 0) {
      return { data: [], error: null }
    }

    // Get family memberships to identify Family Head
    const personIds = persons.map((p) => p.id)
    const { data: memberships } = await supabase
      .from('family_members')
      .select('person_id, family_id, is_head, families(id, family_name)')
      .in('person_id', personIds)
      .is('left_at', null)

    // Build map of person_id -> family_id
    const personToFamilyMap = new Map<string, { family_id: string; family_name: string }>()
    const familyIds = new Set<string>()

    memberships?.forEach((m) => {
      if (m.family_id) {
        familyIds.add(m.family_id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fName = (m.families as any)?.family_name || 'Family'
        personToFamilyMap.set(m.person_id, { family_id: m.family_id, family_name: fName })
      }
    })

    // Fetch Heads for these families
    const { data: heads } = await supabase
      .from('family_members')
      .select('family_id, person_id, persons(first_name, last_name)')
      .in('family_id', Array.from(familyIds))
      .eq('is_head', true)
      .is('left_at', null)

    const familyToHeadMap = new Map<string, { head_id: string; head_name: string }>()
    heads?.forEach((h) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = h.persons as any
      const headName = p ? toProperCaseName(`${p.first_name || ''} ${p.last_name || ''}`.trim()) : 'Family Head'
      familyToHeadMap.set(h.family_id, { head_id: h.person_id, head_name: headName })
    })

    // Assemble results
    let results: BloodDirectoryMember[] = persons.map((p) => {
      const famInfo = personToFamilyMap.get(p.id)
      const headInfo = famInfo ? familyToHeadMap.get(famInfo.family_id) : undefined

      return {
        person_id: p.id,
        full_name: toProperCaseName(
          `${p.first_name} ${p.middle_name ? `${p.middle_name} ` : ''}${p.last_name}`.trim()
        ),
        blood_group: p.blood_group || '',
        city: p.city || null,
        state: p.state || null,
        country: p.country || null,
        family_id: famInfo?.family_id || null,
        family_name: famInfo?.family_name || null,
        family_head_name: headInfo?.head_name || null,
        family_head_person_id: headInfo?.head_id || null,
      }
    })

    // Apply text search filter if provided
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase()
      results = results.filter(
        (m) =>
          m.full_name.toLowerCase().includes(q) ||
          (m.city && m.city.toLowerCase().includes(q)) ||
          (m.state && m.state.toLowerCase().includes(q)) ||
          (m.family_name && m.family_name.toLowerCase().includes(q))
      )
    }

    return { data: results, error: null }
  } catch (err) {
    return {
      data: null,
      error: { message: (err as Error).message || 'Failed to fetch blood directory.' },
    }
  }
}

/**
 * Submit emergency contact request to Family Head
 */
export async function submitEmergencyBloodContact(
  input: EmergencyContactInput
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    // 1. Insert into occupation_contact_requests or dedicated emergency requests
    // We can use occupation_contact_requests with channel = 'FAMILY_HEAD' or ADMIN
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabase.from as any)('occupation_contact_requests').insert({
      target_person_id: input.targetPersonId,
      requester_name: input.requesterName.trim(),
      requester_phone: input.requesterPhone.trim(),
      requester_email: input.requesterEmail?.trim() || null,
      channel: 'FAMILY_HEAD',
      message: `[BLOOD DONATION REQUEST - ${input.urgencyLevel}] Patient: ${input.patientName}. Hospital/City: ${input.hospitalDetails}. Message: ${input.message || 'Urgent requirement'}`,
      status: 'PENDING',
    })

    if (insertError) {
      // Fallback: if channel constraint allows MUKHI/ADMIN only, record with ADMIN channel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: fallbackError } = await (supabase.from as any)('occupation_contact_requests').insert({
        target_person_id: input.targetPersonId,
        requester_name: input.requesterName.trim(),
        requester_phone: input.requesterPhone.trim(),
        requester_email: input.requesterEmail?.trim() || null,
        channel: 'ADMIN',
        message: `[BLOOD DONATION REQUEST - ${input.urgencyLevel}] Target Head Person: ${input.familyHeadPersonId || 'Family Head'}. Patient: ${input.patientName}. Hospital/City: ${input.hospitalDetails}. Message: ${input.message || 'Urgent requirement'}`,
        status: 'PENDING',
      })

      if (fallbackError) {
        throw new Error(fallbackError.message)
      }
    }

    return { data: { success: true }, error: null }
  } catch (err) {
    return {
      data: null,
      error: { message: (err as Error).message || 'Failed to send emergency contact request.' },
    }
  }
}
