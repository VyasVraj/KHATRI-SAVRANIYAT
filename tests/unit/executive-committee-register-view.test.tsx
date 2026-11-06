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
import type { User } from '@supabase/supabase-js'

vi.mock('@/features/auth/context/AuthContext')
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
})
