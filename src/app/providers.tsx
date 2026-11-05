/**
 * Application Providers
 *
 * Wraps the application with all required context providers.
 * Provider order is intentional — inner providers may depend on outer ones.
 *
 * Order:
 * 1. QueryClientProvider — TanStack Query (outermost, no dependencies)
 * 2. AuthProvider — depends on Supabase client (inside QueryClient for profile queries)
 */

import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from '@/lib/query-client'
import { IS_DEVELOPMENT } from '@/constants/app'
import { AuthProvider } from '@/features/auth/context/AuthProvider'
import { LanguageProvider } from '@/features/i18n'
import { TourProvider } from '@/features/onboarding'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
          <TourProvider>
            {children}
          </TourProvider>
        </LanguageProvider>
      </AuthProvider>
      {IS_DEVELOPMENT && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  )
}
