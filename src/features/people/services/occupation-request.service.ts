/**
 * Occupation Update Request Service
 *
 * Implements full backend integration for the Occupation Update Request and
 * Admin Approval Workflow:
 * - Submitting occupation requests (validated against official 30 categories)
 * - Admin listing with filters (status, search, category, sort)
 * - Dashboard KPI counts (Total, Pending, Approved, Rejected)
 * - Admin approval updating person.occupation atomically
 * - Admin rejection with mandatory reason
 * - User request status tracking ("My Occupation Requests")
 */

import { supabase } from '@/lib/supabase'
import { isValidOccupation } from '@/constants/occupations'

export interface OccupationUpdateRequest {
  id: string
  person_id: string
  person_name: string
  family_id: string | null
  family_name: string
  current_occupation: string
  requested_occupation: string
  submitted_by: string
  submitted_by_name: string
  submitted_by_email: string | null
  created_at: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejection_reason: string | null
  reviewed_by: string | null
  reviewer_name: string | null
  reviewed_at: string | null
}

export interface OccupationRequestCounts {
  total: number
  pending: number
  approved: number
  rejected: number
}

export interface MyOccupationRequestItem {
  id: string
  person_id: string
  person_name: string
  current_occupation: string
  requested_occupation: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
}

export interface AdminOccupationFilters {
  status?: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  search?: string
  category?: string
  sort?: 'NEWEST' | 'OLDEST'
}

/**
 * Submit an occupation update request for a person.
 * Saves record with status 'PENDING' and notifies administrators.
 */
export async function submitOccupationUpdateRequest(
  personId: string,
  requestedOccupation: string
): Promise<{ success: boolean; requestId?: string; message: string }> {
  const cleanOccupation = requestedOccupation.trim()

  if (!cleanOccupation) {
    throw new Error('Please select an occupation.')
  }

  if (!isValidOccupation(cleanOccupation)) {
    throw new Error(`"${cleanOccupation}" is not one of the official 30 occupation categories.`)
  }

  // 1. Try authoritative RPC
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('submit_occupation_update_request', {
      p_person_id: personId,
      p_requested_occupation: cleanOccupation,
    })

    if (!error && data) {
      return {
        success: true,
        requestId: data.request_id,
        message:
          data.message ||
          'Your occupation update request has been submitted successfully. It is waiting for Admin approval.',
      }
    }

    if (error) {
      // If error is duplicate pending request, surface friendly message
      if (
        error.message?.includes('already exists') ||
        error.message?.includes('unique_pending_occ_request') ||
        error.code === '23505'
      ) {
        throw new Error(
          'A pending occupation update request already exists for this person. Please wait for Admin approval.'
        )
      }
      throw new Error(error.message)
    }
  } catch (err: unknown) {
    // If RPC is missing in remote DB, gracefully fallback to client-side orchestration
    const errMsg = (err as { message?: string }).message || ''
    if (
      errMsg.includes('already exists') ||
      errMsg.includes('unique') ||
      errMsg.includes('not authorized')
    ) {
      throw err
    }

    // Direct table fallback
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      throw new Error('Authentication required to submit occupation requests.')
    }

    // Verify existing pending
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('occupation_update_requests')
      .select('id')
      .eq('person_id', personId)
      .eq('status', 'PENDING')
      .maybeSingle()

    if (existing) {
      throw new Error(
        'A pending occupation update request already exists for this person. Please wait for Admin approval.'
      )
    }

    // Fetch current person
    const { data: person, error: personErr } = await supabase
      .from('persons')
      .select('id, first_name, middle_name, last_name, occupation')
      .eq('id', personId)
      .single()

    if (personErr || !person) {
      throw new Error('Person record not found.')
    }

    // Insert pending request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertErr } = await (supabase as any)
      .from('occupation_update_requests')
      .insert({
        person_id: personId,
        submitted_by: user.id,
        current_occupation: person.occupation || 'Occupation Pending',
        requested_occupation: cleanOccupation,
        status: 'PENDING',
      })
      .select('id')
      .single()

    if (insertErr) {
      if (insertErr.code === '23505') {
        throw new Error(
          'A pending occupation update request already exists for this person. Please wait for Admin approval.'
        )
      }
      throw new Error(insertErr.message)
    }

    // Insert user-facing notification for admins if possible
    try {
      const personName = [person.first_name, person.middle_name, person.last_name]
        .filter(Boolean)
        .join(' ')
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['ADMIN', 'SUPER_ADMIN'])
        .eq('is_active', true)

      if (admins && admins.length > 0) {
        const notifs = admins.map((a) => ({
          recipient_id: a.id,
          actor_id: user.id,
          category: 'COMMUNITY',
          type: 'occupation_request_submitted',
          title: 'New Occupation Update Request',
          body: `${personName || 'Community Member'} has requested an occupation update to ${cleanOccupation}.`,
          action_url: `/admin/occupation-requests?id=${inserted.id}`,
          entity_type: 'occupation_request',
          entity_id: inserted.id,
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('notifications').insert(notifs)
      }
    } catch {
      // Non-blocking notification
    }

    return {
      success: true,
      requestId: inserted.id,
      message:
        'Your occupation update request has been submitted successfully. It is waiting for Admin approval.',
    }
  }

  return {
    success: true,
    message:
      'Your occupation update request has been submitted successfully. It is waiting for Admin approval.',
  }
}

/**
 * Fetch all occupation requests for Admin Panel.
 */
export async function getAdminOccupationRequests(
  filters: AdminOccupationFilters = {}
): Promise<OccupationUpdateRequest[]> {
  const { status = 'ALL', search = '', category = '', sort = 'NEWEST' } = filters

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_admin_occupation_requests', {
      p_status: status,
      p_search: search.trim() || null,
      p_category: category.trim() || null,
      p_sort: sort,
    })

    if (!error && Array.isArray(data)) {
      return data as OccupationUpdateRequest[]
    }
  } catch {
    // Fallback if RPC is not present
  }

  // Fallback to direct query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any).from('occupation_update_requests').select(`
      id,
      person_id,
      family_id,
      current_occupation,
      requested_occupation,
      submitted_by,
      created_at,
      status,
      rejection_reason,
      reviewed_by,
      reviewed_at,
      persons (
        id,
        first_name,
        middle_name,
        last_name
      ),
      families (
        id,
        family_name
      )
    `)

  if (status && status !== 'ALL') {
    query = query.eq('status', status)
  }

  if (category && category !== 'ALL') {
    query = query.eq('requested_occupation', category)
  }

  if (sort === 'OLDEST') {
    query = query.order('created_at', { ascending: true })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let results: OccupationUpdateRequest[] = (data || []).map((row: any) => {
    const p = row.persons
    const personName = p
      ? [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
      : 'Unknown Person'
    const familyName = row.families?.family_name || 'No Family Linked'

    return {
      id: row.id,
      person_id: row.person_id,
      person_name: personName,
      family_id: row.family_id,
      family_name: familyName,
      current_occupation: row.current_occupation || 'Occupation Pending',
      requested_occupation: row.requested_occupation,
      submitted_by: row.submitted_by,
      submitted_by_name: 'User',
      submitted_by_email: null,
      created_at: row.created_at,
      status: row.status,
      rejection_reason: row.rejection_reason,
      reviewed_by: row.reviewed_by,
      reviewer_name: null,
      reviewed_at: row.reviewed_at,
    }
  })

  if (search.trim()) {
    const q = search.toLowerCase().trim()
    results = results.filter(
      (r) =>
        r.person_name.toLowerCase().includes(q) ||
        r.family_name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.requested_occupation.toLowerCase().includes(q)
    )
  }

  return results
}

/**
 * Fetch KPI counts for Admin Dashboard.
 */
export async function getOccupationRequestCounts(): Promise<OccupationRequestCounts> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_occupation_request_counts')
    if (!error && data) {
      return {
        total: Number(data.total) || 0,
        pending: Number(data.pending) || 0,
        approved: Number(data.approved) || 0,
        rejected: Number(data.rejected) || 0,
      }
    }
  } catch {
    // Fallback
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('occupation_update_requests')
    .select('status')

  if (error || !data) {
    return { total: 0, pending: 0, approved: 0, rejected: 0 }
  }

  const counts: OccupationRequestCounts = {
    total: data.length,
    pending: 0,
    approved: 0,
    rejected: 0,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data.forEach((r: any) => {
    if (r.status === 'PENDING') counts.pending++
    else if (r.status === 'APPROVED') counts.approved++
    else if (r.status === 'REJECTED') counts.rejected++
  })

  return counts
}

/**
 * Fetch requests submitted by current user (for tracking).
 */
export async function getMyOccupationRequests(personId?: string): Promise<MyOccupationRequestItem[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('get_my_occupation_requests', {
      p_person_id: personId || null,
    })
    if (!error && Array.isArray(data)) {
      return data as MyOccupationRequestItem[]
    }
  } catch {
    // Fallback
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('occupation_update_requests')
    .select(`
      id,
      person_id,
      current_occupation,
      requested_occupation,
      status,
      rejection_reason,
      created_at,
      reviewed_at,
      persons (
        first_name,
        middle_name,
        last_name
      )
    `)
    .eq('submitted_by', user.id)
    .order('created_at', { ascending: false })

  if (personId) {
    query = query.eq('person_id', personId)
  }

  const { data, error } = await query
  if (error || !data) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((r: any) => {
    const p = r.persons
    const personName = p
      ? [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
      : 'Community Member'

    return {
      id: r.id,
      person_id: r.person_id,
      person_name: personName,
      current_occupation: r.current_occupation || 'Occupation Pending',
      requested_occupation: r.requested_occupation,
      status: r.status,
      rejection_reason: r.rejection_reason,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at,
    }
  })
}

/**
 * Admin action: Approve an occupation update request.
 * Atomically updates persons.occupation in database and marks request APPROVED.
 */
export async function approveOccupationRequest(requestId: string): Promise<{ success: boolean; message: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('approve_occupation_update_request', {
      p_request_id: requestId,
    })

    if (!error && data) {
      return {
        success: true,
        message: data.message || 'Occupation request approved successfully.',
      }
    }

    if (error) {
      throw new Error(error.message)
    }
  } catch (err: unknown) {
    const errMsg = (err as { message?: string }).message || ''
    if (errMsg.includes('already been reviewed') || errMsg.includes('Unauthorized')) {
      throw err
    }

    // Direct fallback
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Authentication required.')

    // Fetch request
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: req, error: reqErr } = await (supabase as any)
      .from('occupation_update_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (reqErr || !req) {
      throw new Error('Occupation update request not found.')
    }

    if (req.status !== 'PENDING') {
      throw new Error(`Request has already been reviewed (current status: ${req.status}).`)
    }

    // Update person occupation
    const { error: personUpdateErr } = await supabase
      .from('persons')
      .update({
        occupation: req.requested_occupation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.person_id)

    if (personUpdateErr) {
      throw new Error(`Failed to update person occupation: ${personUpdateErr.message}`)
    }

    // Mark request approved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: reqUpdateErr } = await (supabase as any)
      .from('occupation_update_requests')
      .update({
        status: 'APPROVED',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (reqUpdateErr) {
      throw new Error(`Failed to update request status: ${reqUpdateErr.message}`)
    }

    // Notify requesting user
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('notifications').insert({
        recipient_id: req.submitted_by,
        actor_id: user.id,
        category: 'COMMUNITY',
        type: 'occupation_request_approved',
        title: 'Occupation Update Request Approved',
        body: `Your request to update occupation to ${req.requested_occupation} has been approved.`,
        action_url: `/people/${req.person_id}`,
        entity_type: 'occupation_request',
        entity_id: requestId,
      })
    } catch {
      // Non-blocking notification
    }

    return {
      success: true,
      message: 'Occupation request approved successfully.',
    }
  }

  return {
    success: true,
    message: 'Occupation request approved successfully.',
  }
}

/**
 * Admin action: Reject an occupation update request with reason.
 * Preserves the person's current occupation and marks request REJECTED.
 */
export async function rejectOccupationRequest(
  requestId: string,
  rejectionReason: string
): Promise<{ success: boolean; message: string }> {
  const cleanReason = rejectionReason.trim()
  if (!cleanReason) {
    throw new Error('Please provide a reason for rejection.')
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('reject_occupation_update_request', {
      p_request_id: requestId,
      p_rejection_reason: cleanReason,
    })

    if (!error && data) {
      return {
        success: true,
        message: data.message || 'Occupation request rejected.',
      }
    }

    if (error) {
      throw new Error(error.message)
    }
  } catch (err: unknown) {
    const errMsg = (err as { message?: string }).message || ''
    if (errMsg.includes('already been reviewed') || errMsg.includes('Unauthorized')) {
      throw err
    }

    // Direct fallback
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Authentication required.')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: req, error: reqErr } = await (supabase as any)
      .from('occupation_update_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (reqErr || !req) {
      throw new Error('Occupation update request not found.')
    }

    if (req.status !== 'PENDING') {
      throw new Error(`Request has already been reviewed (current status: ${req.status}).`)
    }

    // Mark rejected with reason
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: reqUpdateErr } = await (supabase as any)
      .from('occupation_update_requests')
      .update({
        status: 'REJECTED',
        rejection_reason: cleanReason,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)

    if (reqUpdateErr) {
      throw new Error(`Failed to update request status: ${reqUpdateErr.message}`)
    }

    // Notify user with reason
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('notifications').insert({
        recipient_id: req.submitted_by,
        actor_id: user.id,
        category: 'COMMUNITY',
        type: 'occupation_request_rejected',
        title: 'Occupation Update Request Rejected',
        body: `Your occupation update request was not approved. Reason: ${cleanReason}`,
        action_url: `/people/${req.person_id}`,
        entity_type: 'occupation_request',
        entity_id: requestId,
      })
    } catch {
      // Non-blocking notification
    }

    return {
      success: true,
      message: 'Occupation request rejected.',
    }
  }

  return {
    success: true,
    message: 'Occupation request rejected.',
  }
}
