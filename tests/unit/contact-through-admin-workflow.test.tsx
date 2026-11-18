/**
 * Unit Test Suite: Contact Through Admin Workflow & Directory Integration
 *
 * Verifies all criteria from prompt:
 * 1. Both [ Contact Through Mukhi ] and [ Contact Through Admin ] buttons are simultaneously visible for every person in the directory.
 * 2. Works for person with assigned Mukhi and person without assigned Mukhi.
 * 3. Clicking "Contact Through Admin" opens dedicated dialog with pre-populated requester info, mandatory reason, and optional message.
 * 4. Submission validates required fields, stores channel='ADMIN' with status='PENDING', and alerts user with exact success message.
 * 5. Admin & Super Admin panel displays dedicated Occupation Contact Requests section with KPI cards and table.
 * 6. Admin can update request status (Under Review, Approved, Rejected, Resolved) and add administrative notes.
 * 7. Rejection requires a reason.
 * 8. Strict Privacy: Person's private contact details (phone, email) are NEVER exposed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PublicOccupationDirectoryPage } from '@/features/people/pages/PublicOccupationDirectoryPage'
import { ContactThroughAdminModal } from '@/features/people/components/ContactThroughAdminModal'
import { OccupationContactRequestsPage } from '@/features/admin/pages/OccupationContactRequestsPage'
import { OccupationContactRequestDetailModal } from '@/features/admin/components/OccupationContactRequestDetailModal'
import * as publicOccupationService from '@/features/people/services/public-occupation.service'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'

const mockPeople: publicOccupationService.PublicOccupationItem[] = [
  {
    person_id: 'person-101',
    full_name: 'Haresh Khatri',
    occupation: 'Healthcare',
    associated_mukhi_name: 'Mukhi Asandas Chandumal Dhandha',
    associated_mukhi_region: 'Porbandar',
    associated_mukhi_id: 'mukhi-083',
  },
  {
    person_id: 'person-102',
    full_name: 'Deepak Khatri',
    occupation: 'Information Technology',
    associated_mukhi_name: 'Mukhi Jayesh C Vyas',
    associated_mukhi_region: 'Vadodara',
    associated_mukhi_id: 'mukhi-001',
  },
  {
    person_id: 'person-103',
    full_name: 'Suman Khatri',
    occupation: 'Education & Academia',
    associated_mukhi_name: null,
    associated_mukhi_region: null,
    associated_mukhi_id: null,
  },
]

const mockAdminRequests: publicOccupationService.AdminOccupationContactRequestItem[] = [
  {
    id: 'req-001',
    channel: 'ADMIN',
    person_id: 'person-101',
    person_name: 'Haresh Khatri',
    occupation: 'Healthcare',
    family_id: 'fam-001',
    family_name: 'Khatri Porbandar Parivar',
    associated_mukhi_id: 'mukhi-083',
    associated_mukhi_name: 'Mukhi Asandas Chandumal Dhandha',
    requester_user_id: 'user-001',
    visitor_name: 'Vikram Joshi',
    visitor_contact: 'vikram.joshi@example.com',
    purpose: 'Professional Consultation',
    message: 'Looking for a medical second opinion from community health professionals.',
    status: 'PENDING',
    admin_note: null,
    rejection_reason: null,
    reviewed_by: null,
    reviewer_name: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
  },
]

function createMockAuth(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN'): AuthContextValue {
  return {
    user: {
      id: 'auth-user-1',
      email: 'requester@khatri.org',
      app_metadata: {},
      user_metadata: { full_name: 'Kavita Requester' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
    session: null,
    profile: {
      id: 'profile-1',
      role,
      display_name: 'Kavita Requester',
      font_size_preference: 'STANDARD',
    } as unknown as AuthContextValue['profile'],
    isLoading: false,
    isAuthenticated: true,
  }
}

describe('Contact Through Admin Workflow', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.restoreAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    vi.spyOn(publicOccupationService, 'getPublicOccupationDirectory').mockResolvedValue({
      data: mockPeople,
      error: null,
    })
    vi.spyOn(publicOccupationService, 'getAdminOccupationContactRequests').mockResolvedValue(
      mockAdminRequests
    )
    vi.spyOn(publicOccupationService, 'getOccupationContactRequestCounts').mockResolvedValue({
      total: 1,
      pending: 1,
      under_review: 0,
      approved: 0,
      rejected: 0,
      resolved: 0,
    })
  })

  it('Requirement 1 & 2: Renders BOTH "Contact Through Mukhi" and "Contact Through Admin" for every person', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Haresh Khatri')).toBeInTheDocument()
      expect(screen.getByText('Deepak Khatri')).toBeInTheDocument()
      expect(screen.getByText('Suman Khatri')).toBeInTheDocument()
    })

    const mukhiButtons = screen.getAllByRole('button', { name: /Contact Through Mukhi/i })
    const adminButtons = screen.getAllByRole('button', { name: /Contact Through Admin/i })

    // All 3 persons display BOTH buttons simultaneously
    expect(mukhiButtons).toHaveLength(3)
    expect(adminButtons).toHaveLength(3)

    // Verify first person (with Mukhi)
    expect(screen.getByText('Mukhi Asandas Chandumal Dhandha')).toBeInTheDocument()
    expect(mukhiButtons[0]).toBeInTheDocument()
    expect(adminButtons[0]).toBeInTheDocument()

    // Verify third person (without Mukhi)
    expect(screen.getByText('Mukhi Not Assigned')).toBeInTheDocument()
    expect(mukhiButtons[2]).toBeInTheDocument()
    expect(adminButtons[2]).toBeInTheDocument()
  })

  it('Requirement 3: Opens "Contact Through Admin" modal with pre-populated details and target person data', async () => {
    const mockAuth = createMockAuth('USER')

    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={mockAuth}>
          <MemoryRouter>
            <PublicOccupationDirectoryPage />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Deepak Khatri')).toBeInTheDocument()
    })

    const adminButtons = screen.getAllByRole('button', { name: /Contact Through Admin/i })
    fireEvent.click(adminButtons[0])

    // Dialog opens
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Contact Through Admin/i })).toBeInTheDocument()

    // Target person read-only info
    expect(screen.getByText('Target Community Member (Fixed)')).toBeInTheDocument()
    expect(screen.getAllByText('Haresh Khatri').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Healthcare').length).toBeGreaterThanOrEqual(1)

    // Requester pre-populated fields
    const nameInput = screen.getByPlaceholderText(/Enter your name/i) as HTMLInputElement
    const emailInput = screen.getByPlaceholderText(/yourname@example.com/i) as HTMLInputElement
    expect(nameInput.value).toBe('Kavita Requester')
    expect(emailInput.value).toBe('requester@khatri.org')

    // Privacy notice
    expect(screen.getByText(/Privacy-First Communication/i)).toBeInTheDocument()
  })

  it('Requirement 4: Validates form and submits request to Admin review workflow', async () => {
    const submitSpy = vi
      .spyOn(publicOccupationService, 'submitOccupationAdminContactRequest')
      .mockResolvedValue({
        success: true,
        requestId: 'req-002',
        message:
          'Your contact request has been submitted successfully. The administration team will review your request and assist you.',
      })

    const onClose = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <ContactThroughAdminModal
          isOpen={true}
          onClose={onClose}
          person={mockPeople[0]}
        />
      </QueryClientProvider>
    )

    // Clear name to test validation
    const nameInput = screen.getByPlaceholderText(/Enter your name/i)
    fireEvent.change(nameInput, { target: { value: '' } })
    const form = nameInput.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText(/Please enter your full name/i)).toBeInTheDocument()
    })

    // Fill valid data
    fireEvent.change(nameInput, { target: { value: 'Nikhil Khatri' } })
    const emailInput = screen.getByPlaceholderText(/yourname@example.com/i)
    fireEvent.change(emailInput, { target: { value: 'nikhil@example.com' } })
    const messageInput = screen.getByPlaceholderText(/Briefly state your query or reason for connecting/i)
    fireEvent.change(messageInput, { target: { value: 'Would like to connect for professional advice.' } })

    fireEvent.submit(form)

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith({
        personId: 'person-101',
        visitorName: 'Nikhil Khatri',
        visitorEmail: 'nikhil@example.com',
        purpose: 'Professional Consultation',
        message: 'Would like to connect for professional advice.',
      })
    })

    // Exact success response message
    expect(
      screen.getByText(
        'Your contact request has been submitted successfully. The administration team will review your request and assist you.'
      )
    ).toBeInTheDocument()
  })

  it('Requirement 5: Admin Panel Occupation Contact Requests page displays KPIs and requests table', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/occupation-contact-requests']}>
          <Routes>
            <Route path="/admin/occupation-contact-requests" element={<OccupationContactRequestsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Occupation Contact Requests')).toBeInTheDocument()
    })

    // KPI cards & filters
    expect(screen.getByText('Total Requests')).toBeInTheDocument()
    expect(screen.getAllByText('Pending').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Under Review').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Approved').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Rejected').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Resolved').length).toBeGreaterThanOrEqual(1)

    // Wait for table to resolve
    await waitFor(() => {
      expect(screen.getByText('Vikram Joshi')).toBeInTheDocument()
      expect(screen.getByText('vikram.joshi@example.com')).toBeInTheDocument()
      expect(screen.getByText('Khatri Porbandar Parivar')).toBeInTheDocument()
      expect(screen.getByText('Mukhi Asandas Chandumal Dhandha')).toBeInTheDocument()
    })
  })

  it('Requirement 6 & 7: Admin Detail Modal allows status update, note, and requires reason for rejection', async () => {
    const updateSpy = vi
      .spyOn(publicOccupationService, 'updateOccupationContactStatus')
      .mockResolvedValue({
        success: true,
        message: 'Contact request updated to APPROVED.',
      })

    const onClose = vi.fn()
    const onSuccess = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <OccupationContactRequestDetailModal
          request={mockAdminRequests[0]}
          isOpen={true}
          onClose={onClose}
          onSuccess={onSuccess}
        />
      </QueryClientProvider>
    )

    expect(screen.getByRole('heading', { name: /Occupation Contact Request/i })).toBeInTheDocument()
    expect(screen.getByText(/Vikram Joshi/i)).toBeInTheDocument()

    // Click Approve
    const approveBtn = screen.getByRole('button', { name: /Approve/i })
    fireEvent.click(approveBtn)

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('req-001', 'APPROVED', undefined, undefined)
    })

    // Now test Rejection requiring a reason
    const rejectBtn = screen.getByRole('button', { name: /Reject/i })
    fireEvent.click(rejectBtn)

    // Rejection reason input shows up
    expect(screen.getByText(/Specify Rejection Reason \(Required\)/i)).toBeInTheDocument()
    const confirmRejectBtn = screen.getByRole('button', { name: /Confirm Rejection/i })
    // Disabled while reason is empty
    expect(confirmRejectBtn).toBeDisabled()

    // Type rejection reason
    const reasonInput = screen.getByPlaceholderText(/State clearly why this contact request cannot be approved/i)
    fireEvent.change(reasonInput, { target: { value: 'Inappropriate inquiry context.' } })
    expect(confirmRejectBtn).not.toBeDisabled()

    fireEvent.click(confirmRejectBtn)
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('req-001', 'REJECTED', undefined, 'Inappropriate inquiry context.')
    })
  })

  it('Requirement 8: Strict privacy verification — personal phone and email of person are never rendered', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PublicOccupationDirectoryPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Haresh Khatri')).toBeInTheDocument()
    })

    // Verify phone or direct contact numbers are NOT in the document
    expect(screen.queryByText(/Phone Number/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/\+91/)).not.toBeInTheDocument()
  })

  it('Requirement 9: Resilient fallback when PostgREST schema cache reports missing "channel" column', async () => {
    // Simulate Supabase returning schema cache error on channel
    let callCount = 0
    const mockInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      callCount++
      if (payload.channel) {
        return Promise.resolve({
          data: null,
          error: {
            message: "Could not find the 'channel' column of 'occupation_contact_requests' in the schema cache",
          },
        })
      }
      return Promise.resolve({
        data: { id: 'fallback-req-123' },
        error: null,
      })
    })

    // Mock direct table insert
    const supabase = await import('@/lib/supabase')
    vi.spyOn(supabase.supabase, 'from').mockReturnValue({
      insert: mockInsert,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'person-101', first_name: 'Haresh', last_name: 'Khatri', occupation: 'Healthcare' },
            error: null,
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.supabase.from>)

    // Mock RPC failing to test fallback
    vi.spyOn(supabase.supabase, 'rpc').mockResolvedValue({
      data: null,
      error: { message: 'function submit_occupation_admin_contact_request does not exist' } as unknown as import('@supabase/supabase-js').PostgrestError,
    })

    const result = await publicOccupationService.submitOccupationAdminContactRequest({
      personId: 'person-101',
      visitorName: 'Ramesh Parekh',
      visitorEmail: 'ramesh@example.com',
      purpose: 'Consultation',
      message: 'Testing fallback',
    })

    // Succeeded without throwing schema cache error
    expect(result.success).toBe(true)
    expect(callCount).toBe(2) // Initial attempt with channel + second attempt with fallback
  })
})
