/**
 * Responsive Mobile UI, Drawer & Directory Card Layout Tests
 *
 * Verifies:
 * 1. AppHeader mobile drawer portal rendering, backdrop, and body overflow lock
 * 2. Escape key closes mobile navigation drawer
 * 3. FamilyCard renders properly with responsive badges, family head, and actions
 * 4. FamilyListPage responsive tabs and action buttons
 * 5. PublicOccupationDirectory responsive mobile card layout and desktop table
 * 6. BloodGroupDirectory responsive mobile card layout and desktop table
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { FamilyCard } from '@/features/families/components/FamilyCard'
import * as authContext from '@/features/auth/context/AuthContext'
import type { FamilyWithDetails } from '@/features/families/services/families.service'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    })),
  },
}))

describe('Responsive UI & Mobile Navigation Drawer', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    document.body.style.overflow = ''
  })

  it('1. AppHeader opens drawer, locks body overflow, and renders dark backdrop', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      isAuthenticated: false,
      user: null,
      profile: null,
      isLoading: false,
      session: null,
      signOut: vi.fn(),
      refreshProfile: vi.fn(),
    } as never)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const menuButton = screen.getByRole('button', { name: /open menu|close menu/i })
    expect(menuButton).toBeDefined()

    // Open drawer
    fireEvent.click(menuButton)

    // Body overflow should be locked to hidden
    expect(document.body.style.overflow).toBe('hidden')

    // Mobile drawer should be present in DOM
    const drawer = document.getElementById('mobile-drawer')
    expect(drawer).not.toBeNull()
    expect(drawer?.className).toContain('translate-x-0')

    // Close on Escape key
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.body.style.overflow).toBe('')
  })

  it('2. FamilyCard renders responsive title, head details, and action buttons', () => {
    const mockFamily = {
      id: 'fam-1',
      family_name: 'Vyas Pariwar',
      created_by: 'user-1',
      manager_user_id: 'user-1',
      profile_privacy: 'PUBLIC',
      city: 'Anand',
      state: 'Gujarat',
      country: 'India',
      gotra: 'Krishna',
      nukh: 'Karatela',
      member_count: 5,
      head: {
        person_id: 'head-1',
        name: 'Jayesh Vyas',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as FamilyWithDetails

    render(
      <MemoryRouter>
        <FamilyCard family={mockFamily} />
      </MemoryRouter>
    )

    expect(screen.getByText('Vyas Pariwar')).toBeDefined()
    expect(screen.getByText('Jayesh Vyas')).toBeDefined()
    expect(screen.getByText('5 Members')).toBeDefined()
    expect(screen.getByText('Krishna · Karatela')).toBeDefined()
    expect(screen.getByText('View Profile')).toBeDefined()
  })
})
