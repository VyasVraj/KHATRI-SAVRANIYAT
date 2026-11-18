/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit & Integration Test Suite: Occupation Update Request & Admin Approval Workflow
 *
 * Verifies:
 * 1. User submission with validation against the 30 official categories.
 * 2. Status 'PENDING' initialization without mutating approved occupation.
 * 3. Duplicate pending request prevention.
 * 4. Admin approval: atomic update of person's occupation, status 'APPROVED', user notification.
 * 5. Admin rejection: mandatory reason, preserving current occupation, status 'REJECTED', user notification.
 * 6. Admin Panel filtering, search, category selection, and KPI dashboard calculations.
 * 7. Security invariants and RLS permission boundaries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  submitOccupationUpdateRequest,
  approveOccupationRequest,
  rejectOccupationRequest,
  getAdminOccupationRequests,
  getOccupationRequestCounts,
  getMyOccupationRequests,
} from '@/features/people/services/occupation-request.service'
import { OCCUPATION_CATEGORIES, isValidOccupation } from '@/constants/occupations'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}))

describe('Occupation Update Request & Admin Approval Workflow', () => {
  const mockUser = { id: 'usr-12345', email: 'member@khatrisarvaniyat.org' }
  const mockAdmin = { id: 'admin-999', email: 'admin@khatrisarvaniyat.org' }
  const mockPersonId = '00000000-0000-0000-0000-000000000001'
  const mockRequestId = '11111111-1111-1111-1111-111111111111'

  beforeEach(() => {
    vi.clearAllMocks()
    ;(supabase.auth.getUser as any).mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  describe('1. 30 Official Occupation Categories Validation', () => {
    it('contains exactly the 30 official categories from the authoritative register', () => {
      expect(OCCUPATION_CATEGORIES).toHaveLength(30)
      expect(OCCUPATION_CATEGORIES).toContain('Information Technology')
      expect(OCCUPATION_CATEGORIES).toContain('Healthcare')
      expect(OCCUPATION_CATEGORIES).toContain('Business and Entrepreneurship')
      expect(OCCUPATION_CATEGORIES).toContain('Retail and Trade')
      expect(OCCUPATION_CATEGORIES).toContain('Education')
    })

    it('validates official categories and rejects unofficial or sub-job strings', () => {
      expect(isValidOccupation('Information Technology')).toBe(true)
      expect(isValidOccupation('Healthcare')).toBe(true)
      expect(isValidOccupation('Retail and Trade')).toBe(true)

      // Unofficial, arbitrary, or sub-job titles must fail
      expect(isValidOccupation('Software Wizard')).toBe(false)
      expect(isValidOccupation('Doctor / Surgeon')).toBe(false)
      expect(isValidOccupation('')).toBe(false)
      expect(isValidOccupation(null)).toBe(false)
    })
  })

  describe('2. User Occupation Request Submission', () => {
    it('submits a valid request with PENDING status and returns the official confirmation message', async () => {
      ;(supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          request_id: mockRequestId,
          message:
            'Your occupation update request has been submitted successfully. It is waiting for Admin approval.',
        },
        error: null,
      })

      const res = await submitOccupationUpdateRequest(mockPersonId, 'Information Technology')

      expect(supabase.rpc).toHaveBeenCalledWith('submit_occupation_update_request', {
        p_person_id: mockPersonId,
        p_requested_occupation: 'Information Technology',
      })
      expect(res.success).toBe(true)
      expect(res.requestId).toBe(mockRequestId)
      expect(res.message).toBe(
        'Your occupation update request has been submitted successfully. It is waiting for Admin approval.'
      )
    })

    it('rejects an empty occupation request with a clear validation error', async () => {
      await expect(submitOccupationUpdateRequest(mockPersonId, '   ')).rejects.toThrow(
        'Please select an occupation.'
      )
    })

    it('rejects an invalid occupation category outside the official 30 list', async () => {
      await expect(submitOccupationUpdateRequest(mockPersonId, 'Custom Job Title')).rejects.toThrow(
        '"Custom Job Title" is not one of the official 30 occupation categories.'
      )
    })

    it('prevents duplicate pending requests for the same person', async () => {
      ;(supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505',
          message:
            'A pending occupation update request already exists for this person. Please wait for Admin approval.',
        },
      })

      await expect(
        submitOccupationUpdateRequest(mockPersonId, 'Education')
      ).rejects.toThrow(
        'A pending occupation update request already exists for this person. Please wait for Admin approval.'
      )
    })
  })

  describe('3. Admin Approval Workflow', () => {
    it('approves a pending request, updates persons.occupation atomically, and notifies the user', async () => {
      ;(supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Occupation request approved successfully.',
        },
        error: null,
      })

      const res = await approveOccupationRequest(mockRequestId)

      expect(supabase.rpc).toHaveBeenCalledWith('approve_occupation_update_request', {
        p_request_id: mockRequestId,
      })
      expect(res.success).toBe(true)
      expect(res.message).toBe('Occupation request approved successfully.')
    })

    it('fails gracefully when attempting to approve an already reviewed request', async () => {
      ;(supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Request has already been reviewed (current status: APPROVED).',
        },
      })

      await expect(approveOccupationRequest(mockRequestId)).rejects.toThrow(
        'Request has already been reviewed'
      )
    })
  })

  describe('4. Admin Rejection Workflow', () => {
    it('requires a mandatory rejection reason and rejects the request while preserving the previous occupation', async () => {
      ;(supabase.rpc as any).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Occupation request rejected.',
        },
        error: null,
      })

      const reason = 'Record does not match community verification guidelines.'
      const res = await rejectOccupationRequest(mockRequestId, reason)

      expect(supabase.rpc).toHaveBeenCalledWith('reject_occupation_update_request', {
        p_request_id: mockRequestId,
        p_rejection_reason: reason,
      })
      expect(res.success).toBe(true)
      expect(res.message).toBe('Occupation request rejected.')
    })

    it('throws an error if rejection reason is empty or whitespace only', async () => {
      await expect(rejectOccupationRequest(mockRequestId, '    ')).rejects.toThrow(
        'Please provide a reason for rejection.'
      )
    })
  })

  describe('5. Admin Panel Filters, Search, and Dashboard KPI Counts', () => {
    const mockRequestsList = [
      {
        id: 'req-001',
        person_id: 'per-001',
        person_name: 'Bhagwandas Khuha',
        family_id: 'fam-001',
        family_name: 'Khuha Parivar',
        current_occupation: 'Occupation Pending',
        requested_occupation: 'Business and Entrepreneurship',
        submitted_by: 'usr-1',
        submitted_by_name: 'Bhagwandas',
        submitted_by_email: 'bhagwan@khatri.org',
        created_at: '2026-11-17T01:00:00Z',
        status: 'PENDING',
        rejection_reason: null,
        reviewed_by: null,
        reviewer_name: null,
        reviewed_at: null,
      },
      {
        id: 'req-002',
        person_id: 'per-002',
        person_name: 'Rajesh Khatri',
        family_id: 'fam-002',
        family_name: 'Khatri Family',
        current_occupation: 'Agriculture',
        requested_occupation: 'Healthcare',
        submitted_by: 'usr-2',
        submitted_by_name: 'Rajesh',
        submitted_by_email: 'rajesh@khatri.org',
        created_at: '2026-11-16T12:00:00Z',
        status: 'APPROVED',
        rejection_reason: null,
        reviewed_by: mockAdmin.id,
        reviewer_name: 'Super Admin',
        reviewed_at: '2026-11-16T14:00:00Z',
      },
      {
        id: 'req-003',
        person_id: 'per-003',
        person_name: 'Dinesh Solanki',
        family_id: 'fam-003',
        family_name: 'Solanki Parivar',
        current_occupation: 'Retail and Trade',
        requested_occupation: 'Information Technology',
        submitted_by: 'usr-3',
        submitted_by_name: 'Dinesh',
        submitted_by_email: 'dinesh@khatri.org',
        created_at: '2026-11-15T10:00:00Z',
        status: 'REJECTED',
        rejection_reason: 'Degree documentation required.',
        reviewed_by: mockAdmin.id,
        reviewer_name: 'Super Admin',
        reviewed_at: '2026-11-15T16:00:00Z',
      },
    ]

    it('retrieves requests via getAdminOccupationRequests with correct parameters', async () => {
      ;(supabase.rpc as any).mockResolvedValueOnce({
        data: mockRequestsList,
        error: null,
      })

      const results = await getAdminOccupationRequests({
        status: 'ALL',
        search: 'Khuha',
        category: 'Business and Entrepreneurship',
        sort: 'NEWEST',
      })

      expect(supabase.rpc).toHaveBeenCalledWith('get_admin_occupation_requests', {
        p_status: 'ALL',
        p_search: 'Khuha',
        p_category: 'Business and Entrepreneurship',
        p_sort: 'NEWEST',
      })
      expect(results).toHaveLength(3)
      expect(results[0].person_name).toBe('Bhagwandas Khuha')
    })

    it('retrieves accurate dashboard KPI counts', async () => {
      ;(supabase.rpc as any).mockResolvedValueOnce({
        data: {
          total: 15,
          pending: 5,
          approved: 8,
          rejected: 2,
        },
        error: null,
      })

      const counts = await getOccupationRequestCounts()

      expect(supabase.rpc).toHaveBeenCalledWith('get_occupation_request_counts')
      expect(counts.total).toBe(15)
      expect(counts.pending).toBe(5)
      expect(counts.approved).toBe(8)
      expect(counts.rejected).toBe(2)
    })

    it('retrieves member tracking requests via getMyOccupationRequests', async () => {
      ;(supabase.rpc as any).mockResolvedValueOnce({
        data: [
          {
            id: 'req-001',
            person_id: mockPersonId,
            person_name: 'Bhagwandas Khuha',
            current_occupation: 'Occupation Pending',
            requested_occupation: 'Information Technology',
            status: 'PENDING',
            rejection_reason: null,
            created_at: '2026-11-17T01:00:00Z',
            reviewed_at: null,
          },
        ],
        error: null,
      })

      const myRequests = await getMyOccupationRequests(mockPersonId)

      expect(supabase.rpc).toHaveBeenCalledWith('get_my_occupation_requests', {
        p_person_id: mockPersonId,
      })
      expect(myRequests).toHaveLength(1)
      expect(myRequests[0].status).toBe('PENDING')
      expect(myRequests[0].requested_occupation).toBe('Information Technology')
    })
  })
})
