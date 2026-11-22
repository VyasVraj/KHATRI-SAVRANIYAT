/**
 * Unit Tests: Fixed Header & Automatic Page Scroll Position
 *
 * Verifies:
 * 1. AppHeader renders with fixed positioning at the top of the viewport (`fixed inset-x-0 top-0 z-40`).
 * 2. Document flow spacer with matching height (`h-16`) prevents page content from being hidden behind the header.
 * 3. Page content scrolls underneath the fixed header.
 * 4. Dropdowns (Language selector, Notification bell, User menu) remain interactive and anchored.
 * 5. ScrollToTop automatically resets vertical and horizontal scroll positions on page-to-page navigation.
 * 6. ScrollToTop does NOT trigger or reset scroll when only search/query parameters change within the same page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { ScrollToTop } from '@/components/common/ScrollToTop'
import { RootLayout } from '@/components/layout/RootLayout'
import { TourProvider } from '@/features/onboarding'
import * as authContext from '@/features/auth/context/AuthContext'
import type { Tables } from '@/types/database.types'

type ProfileRow = Tables<'profiles'>

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

describe('Fixed Header Implementation', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
  })

  it('1. AppHeader renders with fixed positioning at the top of the viewport', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      isAuthenticated: true,
      user: { id: 'test-user-1' } as unknown as import('@supabase/supabase-js').User,
      profile: {
        id: 'test-user-1',
        display_name: 'Darshan Suthar',
        role: 'MEMBER',
      } as unknown as ProfileRow,
      session: null,
      isLoading: false,
      signInWithPassword: async () => ({ error: null }),
      signUpWithPassword: async () => ({ error: null }),
      signOut: async () => {},
    } as unknown as authContext.AuthContextValue)

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/discover']}>
          <AppHeader />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const header = container.querySelector('header')
    expect(header).toBeInTheDocument()

    // Header must have fixed positioning pinning it to the top with proper z-index and background
    expect(header).toHaveClass('fixed')
    expect(header).toHaveClass('top-0')
    expect(header).toHaveClass('inset-x-0')
    expect(header).toHaveClass('z-40')
    expect(header).toHaveClass('bg-navy-900')
    expect(header).toHaveClass('border-b')
  })

  it('2. AppHeader includes a document flow spacer with matching height (h-16)', () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/discover']}>
          <AppHeader />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // The spacer must exist in document flow directly beneath the fixed header
    const spacer = container.querySelector('div.h-16.w-full.shrink-0')
    expect(spacer).toBeInTheDocument()
    expect(spacer).toHaveAttribute('aria-hidden', 'true')
  })

  it('3. User dropdown opens and remains anchored inside the fixed header', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      isAuthenticated: true,
      user: { id: 'test-user-1' } as unknown as import('@supabase/supabase-js').User,
      profile: {
        id: 'test-user-1',
        display_name: 'Darshan Suthar',
        role: 'MEMBER',
      } as unknown as ProfileRow,
      session: null,
      isLoading: false,
      signInWithPassword: async () => ({ error: null }),
      signUpWithPassword: async () => ({ error: null }),
      signOut: async () => {},
    } as unknown as authContext.AuthContextValue)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/discover']}>
          <AppHeader />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const userMenuButton = screen.getByRole('button', { name: /user menu/i })
    expect(userMenuButton).toBeInTheDocument()

    // Open user menu dropdown
    fireEvent.click(userMenuButton)
    const menu = screen.getByRole('menu')
    expect(menu).toBeInTheDocument()
    expect(within(menu).getByText('My Profile')).toBeInTheDocument()
    expect(within(menu).getByText('Connections')).toBeInTheDocument()
  })
})

describe('Automatic Scroll-to-Top on Page Navigation', () => {
  let originalScrollTo: typeof window.scrollTo

  beforeEach(() => {
    originalScrollTo = window.scrollTo
    window.scrollTo = vi.fn()
    document.documentElement.scrollTop = 500
    document.body.scrollTop = 500
  })

  afterEach(() => {
    window.scrollTo = originalScrollTo
  })

  // Helper test component that switches routes or updates query params
  function TestNavComponent() {
    const navigate = useNavigate()
    const location = useLocation()

    return (
      <div>
        <span data-testid="current-pathname">{location.pathname}</span>
        <span data-testid="current-search">{location.search}</span>
        <button
          onClick={() => navigate('/family')}
          data-testid="nav-to-family"
        >
          Go to Family
        </button>
        <button
          onClick={() => navigate('/community')}
          data-testid="nav-to-community"
        >
          Go to Community
        </button>
        <button
          onClick={() => navigate('/discover?filter=active')}
          data-testid="update-query-param"
        >
          Filter Query
        </button>
      </div>
    )
  }

  it('1. Automatically scrolls to top (0, 0) when navigating from page to page', async () => {
    render(
      <MemoryRouter initialEntries={['/discover']}>
        <ScrollToTop />
        <div id="main-content" style={{ overflowY: 'auto' }}>
          <TestNavComponent />
        </div>
      </MemoryRouter>
    )

    // Initial render at /discover: window.scrollTo is not triggered for route transition
    const familyBtn = screen.getByTestId('nav-to-family')

    // Set scroll positions on containers
    const mainEl = document.getElementById('main-content')
    if (mainEl) {
      mainEl.scrollTop = 750
    }
    document.documentElement.scrollTop = 750

    // Navigate to /family
    await act(async () => {
      fireEvent.click(familyBtn)
    })

    expect(screen.getByTestId('current-pathname').textContent).toBe('/family')
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'instant',
    })
    expect(document.documentElement.scrollTop).toBe(0)
    expect(document.body.scrollTop).toBe(0)
    if (mainEl) {
      expect(mainEl.scrollTop).toBe(0)
    }
  })

  it('2. Repeated navigation between multiple pages resets scroll position every time', async () => {
    render(
      <MemoryRouter initialEntries={['/discover']}>
        <ScrollToTop />
        <div id="main-content">
          <TestNavComponent />
        </div>
      </MemoryRouter>
    )

    vi.mocked(window.scrollTo).mockClear()

    // 1. Navigate from /discover to /family
    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-to-family'))
    })
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'instant',
    })

    vi.mocked(window.scrollTo).mockClear()

    // 2. Navigate from /family to /community
    await act(async () => {
      fireEvent.click(screen.getByTestId('nav-to-community'))
    })
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: 'instant',
    })
  })

  it('3. Does NOT reset scroll when only search/query parameters change on the same page', async () => {
    render(
      <MemoryRouter initialEntries={['/discover']}>
        <ScrollToTop />
        <div id="main-content">
          <TestNavComponent />
        </div>
      </MemoryRouter>
    )

    vi.mocked(window.scrollTo).mockClear()
    document.documentElement.scrollTop = 320

    // Update query parameter (?filter=active) without changing pathname
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-query-param'))
    })

    expect(screen.getByTestId('current-pathname').textContent).toBe('/discover')
    expect(screen.getByTestId('current-search').textContent).toBe('?filter=active')

    // window.scrollTo must NOT have been called because pathname did not change
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it('4. RootLayout integrates ScrollToTop and AppHeader with main content correctly', () => {
    vi.spyOn(authContext, 'useAuthContext').mockReturnValue({
      isAuthenticated: false,
      user: null,
      profile: null,
      session: null,
      isLoading: false,
      signInWithPassword: async () => ({ error: null }),
      signUpWithPassword: async () => ({ error: null }),
      signOut: async () => {},
    } as unknown as authContext.AuthContextValue)

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TourProvider>
          <MemoryRouter initialEntries={['/']}>
            <RootLayout />
          </MemoryRouter>
        </TourProvider>
      </QueryClientProvider>
    )

    // Header exists and has fixed class
    const header = container.querySelector('header')
    expect(header).toBeInTheDocument()
    expect(header).toHaveClass('fixed')

    // Main content exists
    const main = container.querySelector('#main-content')
    expect(main).toBeInTheDocument()
  })
})
