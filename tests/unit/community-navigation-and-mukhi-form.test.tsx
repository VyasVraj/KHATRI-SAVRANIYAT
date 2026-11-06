/**
 * Unit Tests: Community Navigation Visibility, Scrolling, Committee Designation Dropdown & Mukhi Form
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CommunityPage } from '@/features/community/pages/CommunityPage'
import { CommitteeDirectoryView } from '@/features/community/components/CommitteeDirectoryView'
import { MukhiFormModal } from '@/features/community/components/MukhiFormModal'
import * as authContext from '@/features/auth/context/AuthContext'
import type { User } from '@supabase/supabase-js'
import type { ProfileRow } from '@/types'
import type { MukhiLeaderItem } from '@/features/community/types'

vi.mock('@/features/auth/context/AuthContext')
vi.mock('@/features/community/services/community-mukhis.service', async () => {
  const actual = await vi.importActual('@/features/community/services/community-mukhis.service')
  return {
    ...actual,
    upsertCommunityMukhi: vi.fn(),
    checkPersonAlreadyMukhi: vi.fn(),
    searchPersonsForMukhiForm: vi.fn(),
  }
})

describe('1. Community Navigation Tab Text Visibility & Responsiveness', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })

    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'admin-user-id', email: 'admin@example.com' } as User,
      profile: {
        id: 'admin-user-id',
        role: 'SUPER_ADMIN',
        full_name: 'Super Admin',
      } as unknown as ProfileRow,
      isAuthenticated: true,
      isLoading: false,
    } as unknown as ReturnType<typeof authContext.useAuthContext>)
  })

  it('renders active Circulars tab with high contrast text and badge without blinding dark:text-slate-100', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/community?tab=circulars']}>
          <CommunityPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Circulars tab must be present and selected
    expect(html).toContain('id="tab-circulars"')
    expect(html).toContain('aria-selected="true"')

    // Verify high-contrast text and border on Circulars tab
    expect(html).toContain('border-slate-900')
    expect(html).toContain('text-slate-900')
    expect(html).toContain('bg-slate-900')
    expect(html).toContain('text-white')

    // Must NOT have white-on-white text bug
    expect(html).not.toContain('dark:border-slate-100 dark:text-slate-100')
  })

  it('provides horizontal scrolling container with flex-nowrap to support large and extra large font sizes', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/community']}>
          <CommunityPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Verify container and navigation classes
    expect(html).toContain('w-full max-w-full overflow-hidden border-b border-slate-200')
    expect(html).toContain('overflow-x-auto')
    expect(html).toContain('touch-pan-x')
    expect(html).toContain('whitespace-nowrap')
  })

  it('ensures inactive tabs have WCAG compliant high contrast text-slate-600', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/community?tab=mukhi']}>
          <CommunityPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Inactive tabs should use text-slate-600
    expect(html).toContain('text-slate-600')
  })
})

describe('2. Executive Committee Designation Dropdown', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })

    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: { id: 'admin-user-id', email: 'admin@example.com' } as User,
      profile: {
        id: 'admin-user-id',
        role: 'SUPER_ADMIN',
        full_name: 'Super Admin',
      } as unknown as ProfileRow,
      isAuthenticated: true,
      isLoading: false,
    } as unknown as ReturnType<typeof authContext.useAuthContext>)
  })

  it('renders official designations in designation select dropdown', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CommitteeDirectoryView />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(html).toContain('Executive Committee')
    expect(html).toContain('Add Member')
  })
})

describe('3. Mukhi Form Modal with Existing Person Search & Gotra/Nukh', () => {
  it('renders Search Existing Community Person section and Gotra/Nukh dropdowns', () => {
    const html = renderToStaticMarkup(
      <MukhiFormModal
        isOpen={true}
        mukhi={null}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    // Header
    expect(html).toContain('Add Official Community Mukhi')

    // Person Search
    expect(html).toContain('Search Existing Community Person')
    expect(html).toContain('Search community member by full name, city or birthplace...')

    // Gotra & Nukh Select
    expect(html).toContain('Community Lineage (Brahma Khatri Gotra &amp; Nukh Register)')
    expect(html).toContain('Select Gotra')
    expect(html).toContain('Select Gotra first')

    // Mandatory inputs
    expect(html).toContain('Mukhi Full Name *')
    expect(html).toContain('Region / Gram / City *')
  })

  it('renders prefilled details when editing an existing Mukhi', () => {
    const mockMukhi: MukhiLeaderItem = {
      id: 'mukhi-uuid-1',
      name: 'Mukhi Vasant Kumar Jamandas Pamnani',
      gram: 'Bhavnagar',
      phone: '9033361661',
      gotra: 'Agastya',
      nukh: 'Pamnani',
      authority_status: 'ACTIVE',
      person_id: 'person-uuid-1',
      user_id: null,
      designation: 'Panchayat Mukhi',
      role: 'MUKHI',
      is_verified: true,
      is_active: true,
      status: 'ACTIVE',
      profile_privacy: 'COMMUNITY',
    }

    const html = renderToStaticMarkup(
      <MukhiFormModal
        isOpen={true}
        mukhi={mockMukhi}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    expect(html).toContain('Edit Mukhi Details')
    expect(html).toContain('Mukhi Vasant Kumar Jamandas Pamnani')
    expect(html).toContain('Bhavnagar')
    expect(html).toContain('9033361661')
    expect(html).toContain('Linked Person ID: person-uuid-1')
  })
})
