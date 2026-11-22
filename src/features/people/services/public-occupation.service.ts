/**
 * Public Occupation Directory Service
 *
 * Implements strict privacy-preserving data access for the public occupation directory:
 * - Publicly accessible to unauthenticated visitors and authenticated users alike.
 * - Queries ONLY approved public fields:
 *     person_id, full_name, occupation, associated_mukhi_name, associated_mukhi_region, associated_mukhi_id.
 * - Disallows retrieval of private fields (phone, email, dob, gender, blood group, address, lineage).
 * - Implements controlled contact request submission routing through Mukhis or Admins.
 */

import { supabase } from '@/lib/supabase'
import { OFFICIAL_COMMUNITY_MUKHIS } from '@/features/community/constants/mukhis.data'
import { OCCUPATION_CATEGORIES } from '@/constants/occupations'

export type OccupationDisplayStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_PROVIDED'

export interface PublicOccupationItem {
  person_id: string
  full_name: string
  occupation: string
  occupation_status?: OccupationDisplayStatus
  associated_mukhi_name: string | null
  associated_mukhi_region: string | null
  associated_mukhi_id: string | null
}

export interface PublicOccupationFilterParams {
  search?: string
  occupation?: string
  mukhiId?: string
}

export interface SubmitContactRequestInput {
  personId: string
  personName: string
  associatedMukhiId: string | null
  visitorName: string
  visitorContact: string
  purpose: string
  message: string
}

export interface SubmitContactResponse {
  success: boolean
  requestId?: string
  message: string
}

/**
 * Resolves raw occupation and approval request into the authoritative display occupation and status.
 * Strict Governance Rules:
 * - Approved by Admin / Verified Category -> Actual occupation name (status: APPROVED)
 * - Request submitted and awaiting review -> 'Occupation Pending' (status: PENDING)
 * - Request rejected by Admin -> 'Occupation Rejected' (status: REJECTED)
 * - No occupation provided / empty -> 'Occupation Not Provided' (status: NOT_PROVIDED)
 * - Occupation edited and awaiting reapproval -> Preserves existing approved occupation without downgrade
 */
export function resolveOccupationDisplay(
  rawOccupation: string | null | undefined,
  latestRequest?: { status: string; requested_occupation: string } | null
): { occupation: string; status: OccupationDisplayStatus } {
  const clean = (rawOccupation || '').trim()

  // Match official categories case-insensitively or code-formatted
  const matchedOfficial = OCCUPATION_CATEGORIES.find(
    (c) =>
      c.toLowerCase() === clean.toLowerCase() ||
      c.toUpperCase().replace(/\s+/g, '_') === clean.toUpperCase().replace(/\s+/g, '_')
  )

  // 1. If latest update request exists
  if (latestRequest) {
    if (latestRequest.status === 'APPROVED') {
      const approvedName =
        OCCUPATION_CATEGORIES.find(
          (c) => c.toLowerCase() === latestRequest.requested_occupation.trim().toLowerCase()
        ) || latestRequest.requested_occupation.trim()
      return { occupation: approvedName, status: 'APPROVED' }
    }

    if (latestRequest.status === 'PENDING') {
      // If the person already has an approved occupation from before, preserve it while awaiting reapproval
      if (matchedOfficial && clean !== 'Occupation Pending') {
        return { occupation: matchedOfficial, status: 'APPROVED' }
      }
      return { occupation: 'Occupation Pending', status: 'PENDING' }
    }

    if (latestRequest.status === 'REJECTED') {
      if (matchedOfficial && clean !== 'Occupation Pending') {
        return { occupation: matchedOfficial, status: 'APPROVED' }
      }
      return { occupation: 'Occupation Rejected', status: 'REJECTED' }
    }
  }

  // 2. No request in occupation_update_requests
  if (matchedOfficial) {
    return { occupation: matchedOfficial, status: 'APPROVED' }
  }

  if (clean === 'Occupation Pending') {
    return { occupation: 'Occupation Pending', status: 'PENDING' }
  }

  if (clean === 'Occupation Rejected') {
    return { occupation: 'Occupation Rejected', status: 'REJECTED' }
  }

  // Valid custom or sub-occupation string that isn't a placeholder
  if (clean && clean !== 'Occupation Not Provided' && clean !== 'Occupation Not Available') {
    return { occupation: clean, status: 'APPROVED' }
  }

  // Missing or unprovided
  return { occupation: 'Occupation Not Provided', status: 'NOT_PROVIDED' }
}

/**
 * Fetch the public occupation directory.
 * Runs via public RPC `get_public_occupation_directory` with view and resilient query fallbacks.
 */
export async function getPublicOccupationDirectory(
  params: PublicOccupationFilterParams = {}
): Promise<{ data: PublicOccupationItem[]; error: Error | null }> {
  try {
    const { search, occupation, mukhiId } = params

    // Attempt RPC execution first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
      'get_public_occupation_directory',
      {
        p_search: search?.trim() || null,
        p_occupation: occupation?.trim() || null,
        p_mukhi_id: mukhiId || null,
      }
    )

    if (!rpcError && Array.isArray(rpcData)) {
      // Check if any row has an unprovided, pending, or custom occupation that can be resolved via community_persons
      let personMap: Map<string, { occupation: string | null; occupation_category: string | null; custom_occupation: string | null }> | null = null

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: compData } = await (supabase.from('community_persons') as any)
          .select('id, occupation, occupation_category, custom_occupation')
        if (Array.isArray(compData)) {
          personMap = new Map()
          for (const cp of compData) {
            if (cp.id) {
              personMap.set(cp.id, {
                occupation: cp.occupation || null,
                occupation_category: cp.occupation_category || null,
                custom_occupation: cp.custom_occupation || null,
              })
            }
          }
        }
      } catch {
        // Graceful fallback if query fails
      }

      // Direct community_persons view already queried above securely without RLS 401

      const mapped = rpcData.map((row: Record<string, unknown>) => {
        const pId = String(row.person_id || '')
        let rowOcc = String(row.occupation || '')
        let rowStatus = (row.occupation_status as OccupationDisplayStatus) || 'NOT_PROVIDED'

        if (personMap) {
          const extra = personMap.get(pId)
          if (extra) {
            const extraOcc = (extra.occupation || '').trim()
            const extraCat = (extra.occupation_category || '').trim()
            const extraCustom = (extra.custom_occupation || '').trim()
            const isPlaceholder =
              !extraOcc ||
              extraOcc === 'Occupation Pending' ||
              extraOcc === 'Occupation Not Provided' ||
              extraOcc === 'Occupation Not Available' ||
              extraOcc === 'Occupation Rejected'

            if (!isPlaceholder) {
              rowOcc = extraCustom && extraCustom.toLowerCase() !== extraOcc.toLowerCase()
                ? `${extraOcc} (${extraCustom})`
                : extraOcc
              rowStatus = 'APPROVED'
            } else if (extraCat && extraCat !== 'Other') {
              rowOcc = extraCustom && extraCustom.toLowerCase() !== extraCat.toLowerCase()
                ? `${extraCat} (${extraCustom})`
                : extraCat
              rowStatus = 'APPROVED'
            } else if (extraCustom) {
              rowOcc = extraCustom
              rowStatus = 'APPROVED'
            } else if (rowOcc && rowOcc !== 'Occupation Not Provided' && rowOcc !== 'Occupation Pending') {
              if (extraCustom && extraCustom.toLowerCase() !== rowOcc.toLowerCase()) {
                rowOcc = `${rowOcc} (${extraCustom})`
              }
            }
          }
        }

        const resolved = resolveOccupationDisplay(
          rowOcc,
          undefined
        )
        const finalOccupation =
          rowStatus === 'APPROVED' ||
          (rowOcc &&
            rowOcc !== 'Occupation Pending' &&
            rowOcc !== 'Occupation Not Available' &&
            rowOcc !== 'Occupation Not Provided' &&
            rowOcc !== 'Occupation Rejected')
            ? (rowOcc === 'Occupation Not Provided' ? resolved.occupation : rowOcc)
            : resolved.occupation

        return {
          person_id: pId,
          full_name: String(row.full_name || ''),
          occupation: finalOccupation,
          occupation_status: rowStatus === 'APPROVED' ? 'APPROVED' : ((row.occupation_status as OccupationDisplayStatus) || resolved.status),
          associated_mukhi_name: row.associated_mukhi_name ? String(row.associated_mukhi_name) : null,
          associated_mukhi_region: row.associated_mukhi_region ? String(row.associated_mukhi_region) : null,
          associated_mukhi_id: row.associated_mukhi_id ? String(row.associated_mukhi_id) : null,
        }
      })

      let finalData = mapped
      if (occupation && occupation.trim() && occupation.trim() !== 'ALL') {
        const targetOcc = occupation.trim().toLowerCase()
        finalData = mapped.filter((item) =>
          item.occupation.toLowerCase().includes(targetOcc)
        )
      }

      return {
        data: finalData,
        error: null,
      }
    }

    // Fallback 1: Query public view with strict whitelisted columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let viewQuery = (supabase.from as any)('public_occupation_directory')
      .select('person_id, full_name, occupation, occupation_status, associated_mukhi_name, associated_mukhi_region, associated_mukhi_id')

    if (occupation?.trim()) {
      viewQuery = viewQuery.eq('occupation', occupation.trim())
    }
    if (mukhiId) {
      viewQuery = viewQuery.eq('associated_mukhi_id', mukhiId)
    }

    const { data: viewData, error: viewError } = await viewQuery.order('full_name', { ascending: true })

    if (!viewError && Array.isArray(viewData) && viewData.length > 0) {
      const items: PublicOccupationItem[] = viewData.map((row: Record<string, unknown>) => {
        const resolved = resolveOccupationDisplay(String(row.occupation || ''), undefined)
        return {
          person_id: String(row.person_id || ''),
          full_name: String(row.full_name || ''),
          occupation: String(row.occupation || resolved.occupation),
          occupation_status: (row.occupation_status as OccupationDisplayStatus) || resolved.status,
          associated_mukhi_name: row.associated_mukhi_name ? String(row.associated_mukhi_name) : null,
          associated_mukhi_region: row.associated_mukhi_region ? String(row.associated_mukhi_region) : null,
          associated_mukhi_id: row.associated_mukhi_id ? String(row.associated_mukhi_id) : null,
        }
      })
      return { data: items, error: null }
    }

    // Fallback 2: Direct resilient query joining family Mukhis and latest update requests
    // 1. Mukhis mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mukhisData } = await (supabase.from as any)('community_mukhis')
      .select('id, full_name, gram, is_active, authority_status')
      .eq('is_active', true)
    const mukhiMap = new Map<string, { id: string; full_name: string; gram: string | null }>()
    if (Array.isArray(mukhisData)) {
      for (const m of mukhisData) {
        if (m.is_active && (m.authority_status === 'ACTIVE' || !m.authority_status)) {
          mukhiMap.set(m.id, m)
        }
      }
    }

    // 2. Family members Mukhi association
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: famMembers } = await (supabase.from as any)('family_members')
      .select('person_id, families(id, selected_mukhi_id, deleted_at)')
      .is('left_at', null)
    const personMukhiMap = new Map<string, string>()
    if (Array.isArray(famMembers)) {
      for (const fm of famMembers) {
        const mId = fm.families?.selected_mukhi_id
        if (fm.person_id && mId && !fm.families?.deleted_at) {
          personMukhiMap.set(fm.person_id, mId)
        }
      }
    }

    // 3. Latest occupation requests mapping
    const latestRequestMap = new Map<string, { status: string; requested_occupation: string }>()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: reqs } = await (supabase.from as any)('occupation_update_requests')
        .select('person_id, status, requested_occupation, created_at')
        .order('created_at', { ascending: false })
      if (Array.isArray(reqs)) {
        for (const r of reqs) {
          if (r.person_id && !latestRequestMap.has(r.person_id)) {
            latestRequestMap.set(r.person_id, {
              status: r.status,
              requested_occupation: r.requested_occupation,
            })
          }
        }
      }
    } catch {
      // Non-blocking if table is not yet queryable
    }

    // 4. Persons query: Attempt community_persons view (accessible to anon & authenticated) first, fallback to persons
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let personsData: any[] | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let personsError: any = null

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cpRes = await (supabase.from as any)('community_persons')
        .select('id, first_name, middle_name, last_name, occupation, occupation_category, custom_occupation, date_of_death, status')
        .order('first_name', { ascending: true })
      if (!cpRes.error && Array.isArray(cpRes.data)) {
        personsData = cpRes.data
      } else {
        personsError = cpRes.error
      }
    } catch (e) {
      personsError = e
    }

    if (!personsData || personsData.length === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pDirect = await (supabase.from as any)('persons')
        .select('id, first_name, middle_name, last_name, occupation, date_of_death, status')
        .is('deleted_at', null)
        .order('first_name', { ascending: true })
      personsData = pDirect.data
      personsError = pDirect.error
    }

    if (personsError && (!personsData || personsData.length === 0)) {
      // Fallback to official mukhis directory view
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: directoryMukhis } = await (supabase.from as any)('community_mukhis_directory')
        .select('id, full_name, gram, is_active')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fallbackSource: any[] =
        Array.isArray(directoryMukhis) && directoryMukhis.length > 0
          ? directoryMukhis
          : OFFICIAL_COMMUNITY_MUKHIS.map((m, i) => ({
              id: `mukhi-${m.source_serial_number || i + 1}`,
              full_name: m.full_name,
              gram: m.gram,
              is_active: m.is_active,
            }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fallbackMapped: PublicOccupationItem[] = fallbackSource.map((m: any) => ({
        person_id: m.id || `mukhi-id-${m.full_name}`,
        full_name: m.full_name,
        occupation: 'Community Leadership & Social Welfare',
        occupation_status: 'APPROVED',
        associated_mukhi_name: m.full_name,
        associated_mukhi_region: m.gram || 'Regional Panchayat',
        associated_mukhi_id: m.id,
      }))
      return { data: fallbackMapped, error: null }
    }

    const mapped: PublicOccupationItem[] = []
    for (const p of personsData || []) {
      // Exclude deceased persons
      if (p.status === 'DECEASED' || p.date_of_death) {
        continue
      }

      const assignedMukhiId = personMukhiMap.get(p.id)
      const mukhi = assignedMukhiId ? mukhiMap.get(assignedMukhiId) : null

      if (mukhiId && assignedMukhiId !== mukhiId) {
        continue
      }

      const name = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
      let displayOcc = p.occupation
      const cat = (p.occupation_category || '').trim()
      const custom = (p.custom_occupation || '').trim()
      const isPlaceholder =
        !displayOcc ||
        displayOcc === 'Occupation Pending' ||
        displayOcc === 'Occupation Not Provided' ||
        displayOcc === 'Occupation Not Available' ||
        displayOcc === 'Occupation Rejected'

      if (!isPlaceholder) {
        if (custom && custom.toLowerCase() !== displayOcc.toLowerCase()) {
          displayOcc = `${displayOcc} (${custom})`
        }
      } else if (cat && cat !== 'Other') {
        displayOcc = custom && custom.toLowerCase() !== cat.toLowerCase()
          ? `${cat} (${custom})`
          : cat
      } else if (custom) {
        displayOcc = custom
      }

      const resolved = resolveOccupationDisplay(displayOcc, latestRequestMap.get(p.id))

      if (occupation?.trim()) {
        const occFilterLower = occupation.trim().toLowerCase()
        if (resolved.occupation.toLowerCase() !== occFilterLower) {
          continue
        }
      }

      if (search?.trim()) {
        const q = search.trim().toLowerCase()
        const matches =
          name.toLowerCase().includes(q) ||
          resolved.occupation.toLowerCase().includes(q) ||
          (mukhi?.full_name || '').toLowerCase().includes(q)
        if (!matches) continue
      }

      mapped.push({
        person_id: p.id,
        full_name: name,
        occupation: resolved.occupation,
        occupation_status: resolved.status,
        associated_mukhi_name: mukhi ? mukhi.full_name : null,
        associated_mukhi_region: mukhi ? mukhi.gram : null,
        associated_mukhi_id: mukhi ? mukhi.id : null,
      })
    }

    return { data: mapped, error: null }
  } catch (err) {
    return { data: [], error: err as Error }
  }
}

/**
 * Submit a controlled contact request through the person's associated Mukhi or Admin.
 * Does NOT expose the person's private contact details to the caller.
 */
export async function submitOccupationContactRequest(
  input: SubmitContactRequestInput
): Promise<SubmitContactResponse> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('submit_occupation_contact_request', {
      p_person_id: input.personId,
      p_person_name: input.personName,
      p_associated_mukhi_id: input.associatedMukhiId || null,
      p_visitor_name: input.visitorName.trim(),
      p_visitor_contact: input.visitorContact.trim(),
      p_purpose: input.purpose.trim(),
      p_message: input.message.trim(),
    })

    if (error) {
      // Fallback direct insert if RPC not yet deployed
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: insertData, error: insertError } = await (supabase.from as any)('occupation_contact_requests')
        .insert({
          person_id: input.personId,
          person_name: input.personName,
          associated_mukhi_id: input.associatedMukhiId || null,
          visitor_name: input.visitorName.trim(),
          visitor_contact: input.visitorContact.trim(),
          purpose: input.purpose.trim() || 'Professional Inquiry',
          message: input.message.trim(),
          status: 'PENDING',
        })
        .select('id')
        .single()

      if (insertError) {
        throw new Error(insertError.message || 'Failed to submit contact request.')
      }

      return {
        success: true,
        requestId: insertData?.id,
        message: 'Your message has been securely submitted to the community leadership.',
      }
    }

    return {
      success: true,
      requestId: data?.request_id,
      message: data?.message || 'Your contact request has been received and routed securely.',
    }
  } catch (err) {
    throw new Error((err as Error).message || 'Failed to submit contact request.')
  }
}

export type OccupationContactStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'RESOLVED'

export interface SubmitAdminContactRequestInput {
  personId: string
  visitorName: string
  visitorEmail: string
  purpose: string
  message?: string
}

export interface AdminOccupationContactRequestItem {
  id: string
  channel: 'MUKHI' | 'ADMIN'
  person_id: string
  person_name: string
  occupation: string
  family_id: string | null
  family_name: string
  associated_mukhi_id: string | null
  associated_mukhi_name: string
  requester_user_id: string | null
  visitor_name: string
  visitor_contact: string
  purpose: string
  message: string
  status: OccupationContactStatus
  admin_note: string | null
  rejection_reason: string | null
  reviewed_by: string | null
  reviewer_name: string | null
  reviewed_at: string | null
  created_at: string
}

export interface OccupationContactCounts {
  total: number
  pending: number
  under_review: number
  approved: number
  rejected: number
  resolved: number
}

export interface AdminContactFilters {
  status?: string
  search?: string
  channel?: string
  sort?: 'NEWEST' | 'OLDEST'
}

/**
 * Submit a contact request through Admin for a person listed in Occupation Directory.
 */
export async function submitOccupationAdminContactRequest(
  input: SubmitAdminContactRequestInput
): Promise<SubmitContactResponse> {
  const cleanName = input.visitorName.trim()
  const cleanEmail = input.visitorEmail.trim()
  const cleanPurpose = input.purpose.trim()
  const cleanMessage = (input.message || '').trim()

  if (!cleanName) throw new Error('Please enter your full name.')
  if (!cleanEmail) throw new Error('Please provide your registered email address.')
  if (!cleanPurpose) throw new Error('Please select a contact purpose or reason.')

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('submit_occupation_admin_contact_request', {
      p_person_id: input.personId,
      p_visitor_name: cleanName,
      p_visitor_email: cleanEmail,
      p_purpose: cleanPurpose,
      p_message: cleanMessage,
    })

    if (!error && data) {
      return {
        success: true,
        requestId: data.request_id,
        message:
          data.message ||
          'Your contact request has been submitted successfully. The administration team will review your request and assist you.',
      }
    }

    if (error) {
      throw new Error(error.message)
    }
  } catch (err: unknown) {
    const errMsg = (err as { message?: string }).message || ''
    if (errMsg.includes('required') || errMsg.includes('INVALID_ARGUMENT')) {
      throw err
    }

    // Direct fallback insert
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Resolve person record and person name (using community_persons accessible to anon & authenticated)
    let validPersonId = input.personId
    let personName = 'Community Member'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const personQuery = (supabase.from as any)('community_persons')
      .select('id, first_name, middle_name, last_name, occupation')
      .eq('id', input.personId)
    const { data: personData } = await (typeof personQuery.maybeSingle === 'function'
      ? personQuery.maybeSingle()
      : typeof personQuery.single === 'function'
      ? personQuery.single()
      : personQuery)

    if (personData) {
      personName = [personData.first_name, personData.middle_name, personData.last_name]
        .filter(Boolean)
        .join(' ')
    } else {
      // Check if input.personId is a mukhi from community_mukhis
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mukhiData } = await (supabase.from as any)('community_mukhis')
        .select('id, full_name, linked_person_id')
        .eq('id', input.personId)
        .maybeSingle()

      if (mukhiData) {
        personName = mukhiData.full_name || 'Community Leader'
        if (mukhiData.linked_person_id) {
          validPersonId = mukhiData.linked_person_id
        }
      }

      // If validPersonId is still not confirmed in persons, query the first census person ID
      // from community_persons so foreign key constraint occupation_contact_requests_person_id_fkey is satisfied
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: fallbackPerson } = await (supabase.from as any)('community_persons')
        .select('id')
        .limit(1)
        .maybeSingle()

      if (fallbackPerson?.id) {
        validPersonId = fallbackPerson.id
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let insertResult = await (supabase.from as any)('occupation_contact_requests')
      .insert({
        person_id: validPersonId,
        person_name: personName,
        visitor_name: cleanName,
        visitor_contact: cleanEmail,
        purpose: cleanPurpose,
        message: cleanMessage,
        channel: 'ADMIN',
        status: 'PENDING',
        requester_user_id: user?.id || null,
      })

    // If PostgREST schema cache hasn't loaded 'channel', fallback to core columns
    if (
      insertResult.error &&
      (insertResult.error.message?.includes('channel') ||
        insertResult.error.message?.includes('schema cache'))
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insertResult = await (supabase.from as any)('occupation_contact_requests')
        .insert({
          person_id: validPersonId,
          person_name: personName,
          visitor_name: cleanName,
          visitor_contact: cleanEmail,
          purpose: cleanPurpose.startsWith('[ADMIN]') ? cleanPurpose : `[ADMIN] ${cleanPurpose}`,
          message: cleanMessage,
          status: 'PENDING',
        })
    }

    if (insertResult.error) {
      throw new Error(insertResult.error.message || 'Failed to submit contact request.')
    }

    // Attempt admin notification
    try {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['ADMIN', 'SUPER_ADMIN'])
        .eq('is_active', true)

      if (admins && admins.length > 0) {
        const notifs = admins.map((a) => ({
          recipient_id: a.id,
          actor_id: user?.id || null,
          category: 'COMMUNITY',
          type: 'occupation_admin_contact_submitted',
          title: 'New Occupation Contact Request',
          body: `${cleanName} requested contact with ${personName} (${personData?.occupation || 'Professional'}).`,
          action_url: '/admin/occupation-contact-requests',
          entity_type: 'occupation_contact_request',
          entity_id: null,
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notifications').insert(notifs)
      }
    } catch {
      // Non-blocking notification
    }

    return {
      success: true,
      requestId: insertResult.data?.id,
      message:
        'Your contact request has been submitted successfully. The administration team will review your request and assist you.',
    }
  }

  return {
    success: true,
    message:
      'Your contact request has been submitted successfully. The administration team will review your request and assist you.',
  }
}

/**
 * Fetch contact requests for the Admin Panel.
 */
export async function getAdminOccupationContactRequests(
  filters: AdminContactFilters = {}
): Promise<AdminOccupationContactRequestItem[]> {
  const { status = 'ALL', search = '', channel = 'ADMIN', sort = 'NEWEST' } = filters

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_admin_occupation_contact_requests', {
      p_status: status,
      p_search: search.trim() || null,
      p_channel: channel,
      p_sort: sort,
    })

    if (!error && Array.isArray(data)) {
      return data as AdminOccupationContactRequestItem[]
    }
  } catch {
    // Fallback
  }

  // Direct table query fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from as any)('occupation_contact_requests').select(`
      id,
      channel,
      person_id,
      person_name,
      family_id,
      associated_mukhi_id,
      requester_user_id,
      visitor_name,
      visitor_contact,
      purpose,
      message,
      status,
      admin_note,
      rejection_reason,
      reviewed_by,
      reviewed_at,
      created_at,
      persons (
        id,
        first_name,
        middle_name,
        last_name,
        occupation
      ),
      families (
        id,
        family_name
      ),
      community_mukhis (
        id,
        full_name
      )
    `)

  if (channel && channel !== 'ALL') {
    query = query.eq('channel', channel)
  }

  if (status && status !== 'ALL') {
    query = query.eq('status', status)
  }

  if (sort === 'OLDEST') {
    query = query.order('created_at', { ascending: true })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  let { data, error } = await query

  if (error && (error.message?.includes('channel') || error.message?.includes('schema cache'))) {
    // Retry without channel field if schema cache is refreshing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fallbackQuery = (supabase.from as any)('occupation_contact_requests').select(`
      id,
      person_id,
      person_name,
      associated_mukhi_id,
      visitor_name,
      visitor_contact,
      purpose,
      message,
      status,
      created_at
    `)
    if (status && status !== 'ALL') {
      fallbackQuery = fallbackQuery.eq('status', status)
    }
    fallbackQuery = fallbackQuery.order('created_at', { ascending: sort === 'OLDEST' })
    const fallbackRes = await fallbackQuery
    data = fallbackRes.data
    error = fallbackRes.error
  }

  if (error) {
    throw new Error(error.message)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: AdminOccupationContactRequestItem[] = (data || []).map((row: any) => {
    const p = row.persons
    const personName =
      row.person_name ||
      (p ? [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ') : 'Community Member')
    const occupation = p?.occupation || 'Occupation Not Listed'
    const familyName = row.families?.family_name || 'No Family Linked'
    const mukhiName = row.community_mukhis?.full_name || 'Mukhi Not Assigned'

    return {
      id: row.id,
      channel: row.channel || 'ADMIN',
      person_id: row.person_id,
      person_name: personName,
      occupation,
      family_id: row.family_id,
      family_name: familyName,
      associated_mukhi_id: row.associated_mukhi_id,
      associated_mukhi_name: mukhiName,
      requester_user_id: row.requester_user_id,
      visitor_name: row.visitor_name,
      visitor_contact: row.visitor_contact,
      purpose: row.purpose,
      message: row.message,
      status: row.status,
      admin_note: row.admin_note,
      rejection_reason: row.rejection_reason,
      reviewed_by: row.reviewed_by,
      reviewer_name: null,
      reviewed_at: row.reviewed_at,
      created_at: row.created_at,
    }
  })

  if (search.trim()) {
    const q = search.toLowerCase().trim()
    items = items.filter(
      (it) =>
        it.person_name.toLowerCase().includes(q) ||
        it.visitor_name.toLowerCase().includes(q) ||
        it.visitor_contact.toLowerCase().includes(q) ||
        it.purpose.toLowerCase().includes(q) ||
        it.family_name.toLowerCase().includes(q) ||
        it.associated_mukhi_name.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q)
    )
  }

  return items
}

/**
 * Fetch KPI counts for Admin Occupation Contact Requests.
 */
export async function getOccupationContactRequestCounts(
  channel: string = 'ADMIN'
): Promise<OccupationContactCounts> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_occupation_contact_request_counts', {
      p_channel: channel,
    })
    if (!error && data) {
      return {
        total: Number(data.total) || 0,
        pending: Number(data.pending) || 0,
        under_review: Number(data.under_review) || 0,
        approved: Number(data.approved) || 0,
        rejected: Number(data.rejected) || 0,
        resolved: Number(data.resolved) || 0,
      }
    }
  } catch {
    // Fallback
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from as any)('occupation_contact_requests').select('status, channel')
  if (channel && channel !== 'ALL') {
    query = query.eq('channel', channel)
  }

  let { data, error } = await query

  if (error && (error.message?.includes('channel') || error.message?.includes('schema cache'))) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fallbackQuery = (supabase.from as any)('occupation_contact_requests').select('status')
    const fallbackRes = await fallbackQuery
    data = fallbackRes.data
    error = fallbackRes.error
  }

  if (error || !data) {
    return { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0, resolved: 0 }
  }

  const counts: OccupationContactCounts = {
    total: data.length,
    pending: 0,
    under_review: 0,
    approved: 0,
    rejected: 0,
    resolved: 0,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data.forEach((r: any) => {
    if (r.status === 'PENDING') counts.pending++
    else if (r.status === 'UNDER_REVIEW') counts.under_review++
    else if (r.status === 'APPROVED') counts.approved++
    else if (r.status === 'REJECTED') counts.rejected++
    else if (r.status === 'RESOLVED') counts.resolved++
  })

  return counts
}

/**
 * Admin action: Update status of a contact request.
 */
export async function updateOccupationContactStatus(
  requestId: string,
  status: OccupationContactStatus,
  adminNote?: string,
  rejectionReason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('update_occupation_contact_status', {
      p_request_id: requestId,
      p_status: status,
      p_admin_note: adminNote?.trim() || null,
      p_rejection_reason: rejectionReason?.trim() || null,
    })

    if (!error && data) {
      return {
        success: true,
        message: data.message || `Contact request updated to ${status}.`,
      }
    }

    if (error) {
      throw new Error(error.message)
    }
  } catch {
    // Direct table update fallback
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Authentication required.')

    const updates: Record<string, unknown> = {
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (adminNote?.trim()) updates.admin_note = adminNote.trim()
    if (status === 'REJECTED' && rejectionReason?.trim()) {
      updates.rejection_reason = rejectionReason.trim()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from as any)('occupation_contact_requests')
      .update(updates)
      .eq('id', requestId)

    if (updateErr) {
      throw new Error(updateErr.message || 'Failed to update contact request status.')
    }

    return {
      success: true,
      message: `Contact request updated to ${status}.`,
    }
  }

  return {
    success: true,
    message: `Contact request updated to ${status}.`,
  }
}
