/**
 * Unit Tests: AdminLayout (Phase 13 Subtask 2)
 * (src/features/admin/components/AdminLayout.tsx)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminLayout } from '@/features/admin/components/AdminLayout'
import { ADMIN_NAV_ITEMS } from '@/features/admin/constants'
import * as AuthContextModule from '@/features/auth/context/AuthContext'
import type { ProfileRow } from '@/types'

vi.mock('@/features/auth/context/AuthContext', () => ({
  useAuthContext: vi.fn(),
}))

describe('AdminLayout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContextModule.useAuthContext).mockReturnValue({
      session: null,
      user: { id: 'admin-1', email: 'admin@platform.com' } as unknown as import('@supabase/supabase-js').User,
      profile: {
        id: 'admin-1',
        display_name: 'Platform Administrator',
        email: 'admin@platform.com',
        role: 'SUPER_ADMIN',
        is_active: true,
      } as ProfileRow,
      isLoading: false,
      isAuthenticated: true,
    })
  })

  function renderLayoutMarkup(initialRoute = '/admin'): string {
    return renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: [initialRoute] },
        React.createElement(
          Routes,
          null,
          React.createElement(
            Route,
            { element: React.createElement(AdminLayout) },
            React.createElement(Route, {
              path: '/admin',
              element: React.createElement('div', { 'data-testid': 'admin-outlet' }, 'Dashboard Content'),
            }),
            React.createElement(Route, {
              path: '/admin/claims',
              element: React.createElement('div', { 'data-testid': 'claims-outlet' }, 'Claims Content'),
            }),
            React.createElement(Route, {
              path: '/admin/verifications',
              element: React.createElement('div', { 'data-testid': 'verifications-outlet' }, 'Verifications Content'),
            })
          )
        )
      )
    )
  }

  it('renders accessibility skip-link targeting administrative content', () => {
    const markup = renderLayoutMarkup()
    expect(markup).toContain('href="#admin-main-content"')
    expect(markup).toContain('Skip to administrative content')
  })

  it('renders navigation links for existing administrative workflows', () => {
    const markup = renderLayoutMarkup()

    ADMIN_NAV_ITEMS.forEach((item) => {
      expect(markup).toContain(item.label)
      expect(markup).toContain(`href="${item.href}"`)
    })

    expect(markup).toContain('data-testid="admin-outlet"')
  })

  it('indicates active route with aria-current="page"', () => {
    const markup = renderLayoutMarkup('/admin')
    expect(markup).toContain('aria-current="page"')
  })

  it('displays user role and profile information in desktop sidebar', () => {
    const markup = renderLayoutMarkup()
    expect(markup).toContain('SUPER_ADMIN')
    expect(markup).toContain('Platform Administrator')
    expect(markup).toContain('admin@platform.com')
  })

  it('provides a return-to-community navigation link', () => {
    const markup = renderLayoutMarkup()
    expect(markup).toContain('Exit to KHATRI SARVANIYAT')
    expect(markup).toContain('href="/"')
  })

  it('contains mobile header and toggle button with accessibility attributes', () => {
    const markup = renderLayoutMarkup()
    expect(markup).toContain('aria-label="Open admin navigation"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('aria-controls="admin-drawer"')
  })
})
