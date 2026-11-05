/**
 * Unit tests for ErrorBoundary component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

describe('ErrorBoundary Component', () => {
  const originalLocation = window.location
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        reload: vi.fn(),
        href: '',
      },
    })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })

  it('renders children normally when hasError is false', () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <div>Application content is running safely</div>
      </ErrorBoundary>
    )

    expect(html).toContain('Application content is running safely')
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('Something went wrong')
  })

  it('computes derived state with hasError true on error', () => {
    const state = ErrorBoundary.getDerivedStateFromError()
    expect(state).toEqual({ hasError: true })
  })

  it('renders safe fallback when hasError is true without raw details', () => {
    const instance = new ErrorBoundary({
      children: <div>Child Content</div>,
    })
    instance.state = { hasError: true }

    const node = instance.render() as React.ReactElement
    const html = renderToStaticMarkup(node)

    // Accessible alert container
    expect(html).toContain('role="alert"')
    expect(html).toContain('aria-live="assertive"')

    // Generic safe message
    expect(html).toContain('Something went wrong')
    expect(html).toContain('An unexpected display issue occurred. Your data is safe.')
    expect(html).toContain('Reload Application')
    expect(html).toContain('Return Home')

    // Sensitive implementation terms must NOT be rendered
    expect(html).not.toContain('Database')
    expect(html).not.toContain('PostgREST')
    expect(html).not.toContain('Supabase')
    expect(html).not.toContain('stack trace')
    expect(html).not.toContain('Child Content')
  })

  it('triggers window.location.reload on handleReload', () => {
    const instance = new ErrorBoundary({
      children: <div>Child</div>,
    })
    instance.handleReload()
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('navigates to "/" on handleReturnHome', () => {
    const instance = new ErrorBoundary({
      children: <div>Child</div>,
    })
    instance.handleReturnHome()
    expect(window.location.href).toBe('/')
  })

  it('resets error state on handleReset', () => {
    const instance = new ErrorBoundary({
      children: <div>Child</div>,
    })
    instance.state = { hasError: true }
    instance.setState = vi.fn().mockImplementation((updater) => {
      instance.state = typeof updater === 'function' ? updater(instance.state) : updater
    })

    instance.handleReset()
    expect(instance.setState).toHaveBeenCalledWith({ hasError: false })
  })

  it('supports custom ReactNode fallback', () => {
    const instance = new ErrorBoundary({
      children: <div>Child</div>,
      fallback: <div role="alert">Custom Safe Notice</div>,
    })
    instance.state = { hasError: true }

    const node = instance.render() as React.ReactElement
    const html = renderToStaticMarkup(node)

    expect(html).toContain('Custom Safe Notice')
    expect(html).not.toContain('Something went wrong')
  })

  it('supports custom render function fallback with reset callback', () => {
    const instance = new ErrorBoundary({
      children: <div>Child</div>,
      fallback: ({ reset }) => (
        <div>
          <span>Custom Function Fallback</span>
          <button type="button" onClick={reset}>
            Reset Boundary
          </button>
        </div>
      ),
    })
    instance.state = { hasError: true }

    const node = instance.render() as React.ReactElement
    const html = renderToStaticMarkup(node)

    expect(html).toContain('Custom Function Fallback')
    expect(html).toContain('Reset Boundary')
  })

  it('logs safe diagnostic notification in componentDidCatch without sensitive data', () => {
    const instance = new ErrorBoundary({
      children: <div>Child</div>,
    })

    const error = new Error('Sensitive error with token eyJhbGciOi and password secret123')
    instance.componentDidCatch(error, { componentStack: 'at ChildComponent\n  at div' })

    // If DEV mode, it logs a generic string without raw tokens
    if (import.meta.env.DEV) {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorBoundary] An unhandled rendering error was captured by the boundary')
      )
      // Never log the sensitive tokens
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('eyJhbGciOi'))
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining('secret123'))
    }
  })
})
