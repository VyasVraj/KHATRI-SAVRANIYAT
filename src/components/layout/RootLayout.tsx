/**
 * Root Layout
 *
 * The persistent application shell: navigation header + main content area + footer.
 * All authenticated app routes render within this layout.
 *
 * Design: Clean, professional, community-oriented.
 * No gradients. Deep navy/indigo primary. Warm white background.
 */

import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { AppFooter } from './AppFooter'
import { MobileBottomNav } from './MobileBottomNav'
import { AppTourOverlay } from '@/features/onboarding'

export function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <AppHeader />
      <main
        id="main-content"
        className="flex-1 pb-16 md:pb-0"
        // Accessibility: skip link target
        tabIndex={-1}
      >
        <Outlet />
      </main>
      <AppFooter />
      <MobileBottomNav />
      <AppTourOverlay />
    </div>
  )
}
