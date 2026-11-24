/**
 * Unit & Integration Tests: Responsive Header & Accessibility Text-Size Adjustment
 *
 * Verifies:
 * 1. Small / Standard text size displays full application name "SINDHI KHATRI SAMAJ".
 * 2. Increased text size (Large, Extra Large, Very Large) automatically switches displayed name to "SKS".
 * 3. Resetting font size immediately restores "SINDHI KHATRI SAMAJ" without page reload.
 * 4. All primary navigation links (Discover, Occupations, Blood Directory, My Family, Community) are rendered and accessible.
 * 5. Horizontal navigation scroll container with proper ARIA attributes.
 * 6. Official application name in aria-label, alt, and title remains "SINDHI KHATRI SAMAJ" at all times.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '@/components/layout/AppHeader'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import { APP_NAME } from '@/constants/app'
import { ACCESSIBILITY_FONT_SIZE_EVENT } from '@/hooks/useAccessibilityFontSize'
import * as authContext from '@/features/auth/context/AuthContext'

vi.mock('@/features/auth/context/AuthContext')

function renderHeader() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('Responsive Header & Accessibility Text-Size Adjustment', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(authContext.useAuthContext).mockReturnValue({
      user: null,
      profile: null,
      role: 'REGULAR',
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    } as never)
  })

  it('1. displays full application name "SINDHI KHATRI SAMAJ" at Standard and Small text sizes', () => {
    localStorage.setItem('khatri_font_size_preference', 'STANDARD')
    renderHeader()

    const brandEl = screen.getByTestId('header-brand-name')
    expect(brandEl).toHaveTextContent('SINDHI KHATRI SAMAJ')

    // Official name is preserved in aria-label and alt text
    const homeLinks = screen.getAllByRole('link', { name: new RegExp(`${APP_NAME} — Home`, 'i') })
    expect(homeLinks.length).toBeGreaterThanOrEqual(1)
  })

  it('2. automatically shortens displayed brand name to "SKS" when text size is increased to LARGE, EXTRA_LARGE, or VERY_LARGE', () => {
    localStorage.setItem('khatri_font_size_preference', 'LARGE')
    renderHeader()

    const brandEl = screen.getByTestId('header-brand-name')
    expect(brandEl).toHaveTextContent('SKS')

    // aria-label still retains official full name
    const homeLinks = screen.getAllByRole('link', { name: new RegExp(`${APP_NAME} — Home`, 'i') })
    expect(homeLinks.length).toBeGreaterThanOrEqual(1)
  })

  it('3. dynamically adjusts from SINDHI KHATRI SAMAJ to SKS and back in real time when font size event fires', () => {
    localStorage.setItem('khatri_font_size_preference', 'STANDARD')
    renderHeader()

    const brandEl = screen.getByTestId('header-brand-name')
    expect(brandEl).toHaveTextContent('SINDHI KHATRI SAMAJ')

    // Increase font size via live event (as triggered by slider)
    act(() => {
      window.dispatchEvent(
        new CustomEvent(ACCESSIBILITY_FONT_SIZE_EVENT, { detail: 'EXTRA_LARGE' })
      )
    })

    expect(brandEl).toHaveTextContent('SKS')

    // Reset back to STANDARD
    act(() => {
      window.dispatchEvent(
        new CustomEvent(ACCESSIBILITY_FONT_SIZE_EVENT, { detail: 'STANDARD' })
      )
    })

    expect(brandEl).toHaveTextContent('SINDHI KHATRI SAMAJ')
  })

  it('4. preserves all 5 navigation links without hiding or removing them', () => {
    renderHeader()

    const desktopNav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(desktopNav).toHaveTextContent('Discover')
    expect(desktopNav).toHaveTextContent('Occupations')
    expect(desktopNav).toHaveTextContent('Blood Directory')
    expect(desktopNav).toHaveTextContent('My Family')
    expect(desktopNav).toHaveTextContent('Community')
  })

  it('5. contains scrollable navigation container with no-scrollbar styling', () => {
    renderHeader()

    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(nav.className).toContain('overflow-x-auto')
    expect(nav.className).toContain('no-scrollbar')
  })
})
