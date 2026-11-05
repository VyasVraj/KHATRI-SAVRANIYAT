/**
 * Unit tests for RouteErrorPage component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import * as ReactRouter from 'react-router-dom'
import { RouteErrorPage } from '@/features/errors/pages/RouteErrorPage'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useRouteError: vi.fn(),
    isRouteErrorResponse: vi.fn(),
  }
})

describe('RouteErrorPage Component', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        reload: vi.fn(),
        href: '',
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })

  it('renders dedicated 404 state when route is not found', () => {
    vi.mocked(ReactRouter.useRouteError).mockReturnValue({
      status: 404,
      statusText: 'Not Found',
      data: 'Cannot find /invalid-path',
    })
    vi.mocked(ReactRouter.isRouteErrorResponse).mockReturnValue(true)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RouteErrorPage />
      </MemoryRouter>
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="assertive"')
    expect(html).toContain('Error 404')
    expect(html).toContain('Page Not Found')
    expect(html).toContain('The page you are looking for does not exist')
    expect(html).toContain('Return Home')
    expect(html).toContain('href="/"')

    // Ensure raw error data is not leaked
    expect(html).not.toContain('Cannot find /invalid-path')
    expect(html).not.toContain('stack trace')
  })

  it('renders safe fallback when an unexpected route error occurs', () => {
    const sensitiveError = new Error('Database connection failed: SELECT * FROM auth.users WHERE id = 123')
    vi.mocked(ReactRouter.useRouteError).mockReturnValue(sensitiveError)
    vi.mocked(ReactRouter.isRouteErrorResponse).mockReturnValue(false)

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <RouteErrorPage />
      </MemoryRouter>
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="assertive"')
    expect(html).toContain('Unable to Load Page')
    expect(html).toContain('An unexpected problem occurred while loading this section.')
    expect(html).toContain('Reload Page')
    expect(html).toContain('Return Home')
    expect(html).toContain('href="/"')

    // Sensitive error or query details MUST NOT be exposed
    expect(html).not.toContain('auth.users')
    expect(html).not.toContain('Database connection failed')
    expect(html).not.toContain('SELECT * FROM')
  })
})
