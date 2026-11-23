/**
 * Unit Tests: Family Tree Access Control, Member Privacy & Profile Editing Permissions
 *
 * Verifies:
 * 1. Family tree access permissions for Creator, Approved Claimant, Admin, Mukhi vs Unrelated User.
 * 2. Backend RPC tree access gate and FORBIDDEN response.
 * 3. Person record privacy masking (Name, Age in years, Gotra, Nukh, Occupation are visible;
 *    exact date of birth, personal phone, email, and family relationships are restricted).
 * 4. Profile editing controls visibility (only Creator, Claimant/Owner, Admin).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { checkFamilyTreeAccess, getPersonTreeGraph } from '@/features/tree/services/tree.service'
import { FamilyTreePage } from '@/features/tree/pages/FamilyTreePage'
import { PersonDetail } from '@/features/people/components/PersonDetail'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { PersonRow } from '@/features/people'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({}),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}))

// Mock tree graph layout calculation
vi.mock('@/features/tree/services/tree-layout.service', () => ({
  calculateTreeLayout: vi.fn().mockResolvedValue({
    nodes: [],
    edges: [],
  }),
}))

const FAM_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'
const USER_A_ID = 'user-creator-123'
const USER_B_ID = 'user-unrelated-456'

describe('Family Tree Access Control & Service Level Enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows access when RPC confirms authorized viewer (Creator / Claimant / Admin / Mukhi)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: true,
      error: null,
    } as never)

    const canAccess = await checkFamilyTreeAccess(FAM_ID)
    expect(canAccess).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('can_view_family_tree', {
      p_family_id: FAM_ID,
    })
  })

  it('denies access when RPC confirms user is unrelated normal user', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: false,
      error: null,
    } as never)

    const canAccess = await checkFamilyTreeAccess(FAM_ID)
    expect(canAccess).toBe(false)
  })

  it('getPersonTreeGraph returns FORBIDDEN error when access is denied', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: false,
      error: null,
    } as never)

    const res = await getPersonTreeGraph(PERSON_ID, FAM_ID)
    expect(res.data).toBeNull()
    expect(res.error?.code).toBe('FORBIDDEN')
    expect(res.error?.message).toContain('permission to view')
  })
})

describe('FamilyTreePage Access Restricted UI', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  it('renders Access Restricted screen when user is unauthorized', async () => {
    // Return false for RPC access check
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: false,
      error: null,
    } as never)

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: FAM_ID, family_name: 'Vyas Family', created_by: USER_A_ID },
            error: null,
          }),
        }),
      }),
    } as never)

    const mockAuthContext: AuthContextValue = {
      user: { id: USER_B_ID, email: 'unrelated@example.com' } as never,
      session: null,
      isAuthenticated: true,
      profile: {
        id: USER_B_ID,
        role: 'MEMBER',
        is_active: true,
        full_name: 'Unrelated User',
        created_at: '',
        updated_at: '',
      } as never,
      isLoading: false,
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={mockAuthContext}>
          <MemoryRouter initialEntries={[`/families/${FAM_ID}/tree`]}>
            <Routes>
              <Route path="/families/:familyId/tree" element={<FamilyTreePage />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    )

    expect(await screen.findByText('Access Restricted')).toBeInTheDocument()
    expect(
      screen.getByText(/You do not have permission to view this family's records/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Return to My Family/i })).toBeInTheDocument()
  })
})

describe('PersonDetail Member Privacy & Edit Permissions', () => {
  const mockPerson = {
    id: PERSON_ID,
    first_name: 'Pravin',
    middle_name: 'K',
    last_name: 'Khatri',
    gender: 'MALE' as const,
    date_of_birth: '1975-08-20',
    age: 49,
    current_age: 49,
    gotra: 'Kashyap',
    nukh: 'Pithva',
    occupation: 'Civil Engineer',
    blood_group: 'B+',
    birth_place: 'Bhuj',
    phone: '+91 98765 43210',
    email_contact: 'pravin.khatri@example.com',
    avatar_url: 'https://example.com/avatar.jpg',
    profile_privacy: 'COMMUNITY' as const,
    status: 'ACTIVE' as const,
    created_by: USER_A_ID,
    user_id: USER_A_ID,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  } as unknown as PersonRow

  it('shows permitted public info (name, photo, age, gotra, nukh, occupation) and masks private details for unrelated user', () => {
    const mockAuthContext: AuthContextValue = {
      user: { id: USER_B_ID, email: 'unrelated@example.com' } as never,
      session: null,
      isAuthenticated: true,
      profile: {
        id: USER_B_ID,
        role: 'MEMBER',
        is_active: true,
        full_name: 'Unrelated User',
        created_at: '',
        updated_at: '',
      } as never,
      isLoading: false,
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={mockAuthContext}>
            <PersonDetail person={mockPerson} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // 1. Permitted public information
    expect(screen.getByText('Pravin K Khatri')).toBeInTheDocument()
    expect(screen.getByText('49 years')).toBeInTheDocument()
    expect(screen.getByText('Kashyap')).toBeInTheDocument()
    expect(screen.getByText('Pithva')).toBeInTheDocument()
    expect(screen.getByText('Civil Engineer')).toBeInTheDocument()

    // 2. Sensitive private information masked
    expect(screen.queryByText('+91 98765 43210')).not.toBeInTheDocument()
    expect(screen.queryByText('pravin.khatri@example.com')).not.toBeInTheDocument()
    expect(screen.getByText('Protected by Community Privacy Policy')).toBeInTheDocument()
    expect(screen.getByText('Hidden from public view')).toBeInTheDocument()

    // 3. Edit controls MUST NOT be visible for unrelated user
    expect(screen.queryByText(/Upload photo|Change photo/i)).not.toBeInTheDocument()
    expect(screen.queryByTitle('Update Occupation / Profession')).not.toBeInTheDocument()
  })

  it('shows private details and edit controls to the profile creator/owner', () => {
    const mockAuthContext: AuthContextValue = {
      user: { id: USER_A_ID, email: 'pravin@example.com' } as never,
      session: null,
      isAuthenticated: true,
      profile: {
        id: USER_A_ID,
        role: 'MEMBER',
        is_active: true,
        full_name: 'Pravin Khatri',
        created_at: '',
        updated_at: '',
      } as never,
      isLoading: false,
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthContext.Provider value={mockAuthContext}>
            <PersonDetail person={mockPerson} />
          </AuthContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // 1. Private contact information visible to owner
    expect(screen.getByText('pravin.khatri@example.com')).toBeInTheDocument()
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument()

    // 2. Edit controls visible to owner
    expect(screen.getByText('Change photo')).toBeInTheDocument()
    expect(screen.getByTitle('Update Occupation / Profession')).toBeInTheDocument()
  })
})
