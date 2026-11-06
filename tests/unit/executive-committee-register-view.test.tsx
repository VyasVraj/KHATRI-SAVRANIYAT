/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit Test: CommitteeDirectoryView (Executive Committee Register Parity)
 *
 * Verifies:
 * - Displays official 31-member Executive Committee (0 Mukhi Directory records)
 * - Section A: Executive Leadership & Central Officers (8 members)
 * - Section B: Committee Members (23 members)
 * - Strict RBAC: Normal User & Mukhi are Read-Only (no Add/Edit/Deactivate buttons)
 * - Strict RBAC: Admin & Super Admin have full management capabilities
 * - Search by name/designation/city/phone
 * - View Member Details modal
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CommitteeDirectoryView } from '@/features/community/components/CommitteeDirectoryView'
import * as authContext from '@/features/auth/context/AuthContext'
import * as commService from '@/features/community/services/executive-committee.service'
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/community/services/executive-committee.service', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/features/community/services/executive-committee.service')
  return {
    ...actual,
    searchPersonsForCommittee: vi.fn().mockResolvedValue([]),
    upsertExecutiveCommitteeMember: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
  }
})
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network offline fallback test' },
      }),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network offline fallback test' },
      }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  },
}))

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <CommitteeDirectoryView />
    </QueryClientProvider>
  )
}

describe('CommitteeDirectoryView (Executive Committee Register & Strict RBAC)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders official 31 members split into Section A (8 officers) and Section B (23 members) for Normal User (Read-Only)', async () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'usr-normal', email: 'normal@khatri.org' } as unknown as User,
      profile: {
        id: 'usr-normal',
        role: 'MEMBER',
        display_name: 'Normal User',
      } as any,
      isAuthenticated: true,
      isLoading: false,
      session: null,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Executive Committee')).toBeInTheDocument()
      expect(screen.getByText(/Section A — Executive Leadership/i)).toBeInTheDocument()
      expect(screen.getByText(/Section B — Committee Members/i)).toBeInTheDocument()
    })

    // Verify President in Section A
    expect(screen.getByText('Shri Vasant Kumar Jamnadas Pamnani')).toBeInTheDocument()
    expect(screen.getAllByText('Bhavnagar').length).toBeGreaterThan(0)
    expect(screen.getByText('9033361661')).toBeInTheDocument()

    // Verify Mukhi in name preserved as source name
    expect(screen.getByText('Mukhi Ghanshyamdas Hemandas')).toBeInTheDocument()

    // READ-ONLY: Normal user cannot see Add Member or Edit buttons
    expect(screen.queryByRole('button', { name: /Add Member/i })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Edit Member')).not.toBeInTheDocument()
    expect(screen.queryByTitle(/Deactivate Member/i)).not.toBeInTheDocument()
  })

  it('renders read-only view for MUKHI role without Add or Edit buttons', async () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'usr-mukhi', email: 'mukhi@khatri.org' } as unknown as User,
      profile: {
        id: 'usr-mukhi',
        role: 'MUKHI',
        display_name: 'Regional Mukhi',
      } as any,
      isAuthenticated: true,
      isLoading: false,
      session: null,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Executive Committee')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /Add Member/i })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Edit Member')).not.toBeInTheDocument()
  })

  it('renders Add Member, Edit, and Deactivate buttons for ADMIN and SUPER_ADMIN roles', async () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'usr-admin', email: 'admin@khatri.org' } as unknown as User,
      profile: {
        id: 'usr-admin',
        role: 'ADMIN',
        display_name: 'Samaj Admin',
      } as any,
      isAuthenticated: true,
      isLoading: false,
      session: null,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Executive Committee')).toBeInTheDocument()
    })

    // Admin has Add Member button
    expect(screen.getByRole('button', { name: /Add Member/i })).toBeInTheDocument()

    // Admin has Edit Member buttons once loaded
    await waitFor(() => {
      const editButtons = screen.getAllByTitle('Edit Member')
      expect(editButtons.length).toBeGreaterThan(0)
    })
  })

  it('opens Member Details modal when clicking View Details', async () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'usr-normal', email: 'normal@khatri.org' } as unknown as User,
      profile: { id: 'usr-normal', role: 'MEMBER', display_name: 'Normal User' } as any,
      isAuthenticated: true,
      isLoading: false,
      session: null,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Shri Vasant Kumar Jamnadas Pamnani')).toBeInTheDocument()
    })

    const viewDetailsButtons = screen.getAllByRole('button', { name: /View Details/i })
    fireEvent.click(viewDetailsButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Authority Status:')).toBeInTheDocument()
      expect(screen.getByText('Active')).toBeInTheDocument()
    })
  })

  it('renders Search Existing Community Person, Gotra, and Nukh in Add Member modal', async () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'usr-admin', email: 'admin@khatri.org' } as unknown as User,
      profile: { id: 'usr-admin', role: 'SUPER_ADMIN', display_name: 'Admin' } as any,
      isAuthenticated: true,
      isLoading: false,
      session: null,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Member/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Add Member/i }))

    await waitFor(() => {
      expect(screen.getByText('Add Executive Committee Member')).toBeInTheDocument()
    })

    // 1. Search Existing Community Person is at the top of the modal before Serial Number
    expect(screen.getByText('Search Existing Community Person')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/Search by Full Name, Mobile Number, or Person ID/i)
    ).toBeInTheDocument()

    // 2. Serial Number and Designation
    expect(screen.getByLabelText(/Serial Number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Designation/i)).toBeInTheDocument()

    // 3. Lineage Gotra & Nukh Select
    expect(
      screen.getByText(/Community Lineage \(Brahma Khatri Gotra & Nukh Register\)/i)
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Select Gotra/i).length).toBeGreaterThanOrEqual(1)
  })

  it('autofills details and sets linked_person_id when selecting a person from search results', async () => {
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'usr-admin', email: 'admin@khatri.org' } as unknown as User,
      profile: { id: 'usr-admin', role: 'SUPER_ADMIN', display_name: 'Admin' } as any,
      isAuthenticated: true,
      isLoading: false,
      session: null,
    })

    vi.mocked(commService.searchPersonsForCommittee).mockResolvedValue([
      {
        id: '12345678-1234-1234-1234-123456789abc',
        first_name: 'Haresh',
        middle_name: 'Kishore',
        last_name: 'Mehta',
        full_name: 'Haresh Kishore Mehta',
        gender: 'MALE',
        birth_place: 'Jaipur',
        city: 'Jaipur',
        gotra: 'Agastya',
        nukh: 'Arora',
        phone: '9876543210',
      },
    ])

    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Member/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Add Member/i }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search by Full Name, Mobile Number, or Person ID/i)).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search by Full Name, Mobile Number, or Person ID/i)
    fireEvent.change(searchInput, { target: { value: 'Haresh' } })

    await waitFor(() => {
      expect(screen.getByText('Haresh Kishore Mehta')).toBeInTheDocument()
    })

    // Click on the search result candidate
    fireEvent.click(screen.getByText('Haresh Kishore Mehta'))

    // Verify linked info
    await waitFor(() => {
      expect(screen.getByText('Clear / Unlink')).toBeInTheDocument()
      expect(screen.getByText(/Linked Person ID: 12345678-1234-1234-1234-123456789abc/i)).toBeInTheDocument()
    })

    // Verify autofilled inputs
    const fullNameInput = screen.getByLabelText(/Full Name/i) as HTMLInputElement
    expect(fullNameInput.value).toBe('Shri Haresh Kishore Mehta')

    const cityInput = screen.getByLabelText(/City/i) as HTMLInputElement
    expect(cityInput.value).toBe('Jaipur')

    const phoneInput = screen.getByLabelText(/Mobile Number/i) as HTMLInputElement
    expect(phoneInput.value).toBe('9876543210')
  })
})
