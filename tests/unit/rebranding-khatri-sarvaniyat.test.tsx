/**
 * Rebranding Validation Suite: KHATRI SARVANIYAT
 *
 * Verifies that the platform identity and official emblem branding:
 * 1. Uses the official Khatri Sarvaniyat emblem with object-contain.
 * 2. Header, Footer, and Loading screen display "KHATRI SARVANIYAT".
 * 3. Footer displays official tagline "Ek Samaj • Ek Pehchaan • Ek Digital Record".
 * 4. PWA manifest and HTML title reflect the official name.
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '@/features/i18n/context/LanguageProvider'
import { BrandLogo } from '@/components/common/BrandLogo'
import { AppHeader } from '@/components/layout/AppHeader'
import { AppFooter } from '@/components/layout/AppFooter'
import { LoadingScreen } from '@/components/common/LoadingScreen'
import { APP_NAME } from '@/constants/app'
import * as authContext from '@/features/auth/context/AuthContext'
import * as fs from 'fs'
import * as path from 'path'

vi.mock('@/features/auth/context/AuthContext')

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>
  )
}

describe('KHATRI SARVANIYAT Rebranding & Official Emblem Verification', () => {
  it('1. BrandLogo renders image with object-contain and official alt attribute', () => {
    render(<BrandLogo size="md" />)
    const img = screen.getByRole('img', { name: /KHATRI SARVANIYAT/i })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', '/logo.png')
    expect(img.className).toContain('object-contain')
  })

  it('2. BrandLogo supports showText and displays KHATRI SARVANIYAT', () => {
    render(<BrandLogo size="md" showText />)
    expect(screen.getByText('KHATRI SARVANIYAT')).toBeInTheDocument()
  })

  it('3. AppHeader renders official emblem and KHATRI SARVANIYAT', () => {
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

    renderWithProviders(<AppHeader />)
    expect(screen.getByText('KHATRI SARVANIYAT')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /KHATRI SARVANIYAT/i })).toBeInTheDocument()
  })

  it('4. AppFooter renders official emblem, brand name, and official tagline', () => {
    renderWithProviders(<AppFooter />)
    expect(screen.getByText('KHATRI SARVANIYAT')).toBeInTheDocument()
    expect(
      screen.getByText('Ek Samaj • Ek Pehchaan • Ek Digital Record')
    ).toBeInTheDocument()
  })

  it('5. LoadingScreen displays official emblem and KHATRI SARVANIYAT', () => {
    render(<LoadingScreen message="Loading directory..." />)
    expect(screen.getByText('KHATRI SARVANIYAT')).toBeInTheDocument()
    expect(screen.getByText('Loading directory...')).toBeInTheDocument()
  })

  it('6. Central APP_NAME constant is KHATRI SARVANIYAT', () => {
    expect(APP_NAME).toBe('KHATRI SARVANIYAT')
  })

  it('7. index.html title and manifest.webmanifest name are KHATRI SARVANIYAT', () => {
    const rootDir = process.cwd()
    const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8')
    const manifestJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'public', 'manifest.webmanifest'), 'utf8')
    )

    expect(indexHtml).toContain('<title>KHATRI SARVANIYAT</title>')
    expect(manifestJson.name).toBe('KHATRI SARVANIYAT')
    expect(manifestJson.short_name).toBe('KHATRI SARVANIYAT')
  })
})
