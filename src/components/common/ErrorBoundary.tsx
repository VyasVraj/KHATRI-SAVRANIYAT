/**
 * ErrorBoundary
 *
 * Top-level and sub-tree React class Error Boundary.
 * Catches uncaught rendering and lifecycle errors in descendant components.
 *
 * Security & Privacy Invariants:
 * 1. NEVER renders raw error.message, stack traces, database error codes, or PostgREST payloads.
 * 2. Surfaces only sanitized, user-friendly language suitable for all audiences.
 * 3. In development mode (import.meta.env.DEV), logs safe diagnostic component stacks,
 *    strictly scrubbing any detected tokens, JWTs, credentials, or PII.
 * 4. Provides accessible, mobile-friendly recovery actions: "Reload Application" and "Return Home".
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { captureException } from '@/lib/observability'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode | ((props: { reset: () => void }) => ReactNode)
}

interface ErrorBoundaryState {
  hasError: boolean
  correlationId?: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const correlationId = captureException(error, { componentStack: errorInfo.componentStack })
    this.setState({ correlationId })

    // Development-only diagnostic logging with strict exclusion of credentials/tokens
    if (import.meta.env.DEV) {
      // Diagnostic notification without printing sensitive objects or payloads
      // (Using console.error only in dev mode for developer debugging)
      // eslint-disable-next-line no-console
      console.error(
        '[ErrorBoundary] An unhandled rendering error was captured by the boundary. Details are suppressed in UI.'
      )
    }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleReturnHome = (): void => {
    window.location.href = '/'
  }

  handleReset = (): void => {
    this.setState({ hasError: false, correlationId: undefined })
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({ reset: this.handleReset })
        }
        return this.props.fallback
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-12"
        >
          <div className="w-full max-w-md rounded-lg border border-navy-200 bg-white p-6 shadow-sm text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>

            <h1 className="mb-2 text-xl font-bold text-navy-950 sm:text-2xl">
              Something went wrong
            </h1>

            <p className="mb-6 text-sm text-navy-600 sm:text-base leading-relaxed">
              An unexpected display issue occurred. Your data is safe. Please try reloading the page or
              returning to the home screen.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reload Application
              </button>

              <button
                type="button"
                onClick={this.handleReturnHome}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-navy-300 bg-white px-4 py-2.5 text-sm font-medium text-navy-700 shadow-sm transition-colors hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Return Home
              </button>
            </div>

            {this.state.correlationId && (
              <p className="mt-5 text-xs text-navy-400 font-mono">
                Reference: {this.state.correlationId}
              </p>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
