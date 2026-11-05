/**
 * Application Root
 *
 * Top-level application component.
 * Composes providers and router.
 */

import { AppProviders } from './providers'
import { AppRouter } from './router'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { PwaUpdateNotification } from '@/components/common/PwaUpdateNotification'

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <PwaUpdateNotification />
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  )
}
