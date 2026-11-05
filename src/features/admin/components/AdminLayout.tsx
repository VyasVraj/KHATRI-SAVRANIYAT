/**
 * AdminLayout — Reusable administrative application layout
 *
 * Phase 13 — Subtask 2: Admin Hub, Layout & Platform Metrics
 *
 * Features:
 * - Responsive desktop sidebar + mobile drawer navigation
 * - Active route indication with accessible aria-current="page"
 * - Keyboard accessible with Escape-to-close drawer and focus visible rings
 * - Accessible skip-link to administrative main content
 * - Centralized navigation configuration for administrative workflows
 * - Non-intrusive: preserves main application layout outside admin routes
 */

import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import {
  Menu,
  X,
  ArrowLeft,
  Shield,
} from 'lucide-react'
import { ROUTES } from '@/constants/app'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_ITEMS } from '../constants'

export function AdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const { profile } = useAuthContext()

  // Close mobile drawer on route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Close mobile drawer on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileMenuOpen])

  return (
    <div className="flex min-h-screen flex-col bg-navy-50 md:flex-row">
      {/* Accessibility Skip Link */}
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to administrative content
      </a>

      {/* Mobile Top Header */}
      <div className="flex h-16 items-center justify-between border-b border-navy-200 bg-navy-900 px-4 md:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-sm font-bold text-white tracking-tight">Admin Hub</span>
            <span className="block text-[10px] uppercase font-semibold tracking-wider text-brand-300">
              {profile?.role ?? 'ADMIN'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? 'Close admin navigation' : 'Open admin navigation'}
          aria-controls="admin-drawer"
          className="rounded-lg p-2 text-navy-200 transition-colors hover:bg-navy-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {mobileMenuOpen ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <Menu className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Mobile Backdrop & Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-navy-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Admin Navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-navy-200 bg-white shadow-2xl transition-transform"
          >
            {/* Drawer Header */}
            <div className="flex h-16 items-center justify-between border-b border-navy-200 bg-navy-900 px-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
                  <Shield className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-white tracking-tight">Admin Hub</span>
                  <span className="block text-[10px] uppercase font-semibold tracking-wider text-brand-300">
                    Platform Control
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close admin navigation"
                className="rounded-lg p-1.5 text-navy-300 hover:bg-navy-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Navigation links (Mobile) */}
            <nav aria-label="Administrative mobile navigation" className="flex-1 space-y-1.5 p-4 overflow-y-auto">
              <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-navy-400">
                Administration
              </div>
              {ADMIN_NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = item.exact
                  ? location.pathname === item.href
                  : location.pathname.startsWith(item.href)

                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    end={item.exact}
                    aria-current={isActive ? 'page' : undefined}
                    className={({ isActive: linkActive }) =>
                      cn(
                        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                        linkActive
                          ? 'bg-brand-50 text-brand-700 font-semibold'
                          : 'text-navy-700 hover:bg-navy-50 hover:text-navy-900'
                      )
                    }
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5 flex-shrink-0 transition-colors',
                        isActive ? 'text-brand-600' : 'text-navy-400 group-hover:text-navy-600'
                      )}
                      aria-hidden="true"
                    />
                    <div>
                      <div>{item.label}</div>
                      <div className="text-[11px] font-normal text-navy-500">{item.description}</div>
                    </div>
                  </NavLink>
                )
              })}
            </nav>

            {/* Drawer Footer */}
            <div className="border-t border-navy-200 bg-navy-50/50 p-4">
              <Link
                to={ROUTES.HOME}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <ArrowLeft className="h-4 w-4 text-navy-400" aria-hidden="true" />
                Return to Community
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar */}
      <aside
        aria-label="Administrative sidebar"
        className="hidden md:flex md:w-64 md:flex-col md:flex-shrink-0 border-r border-navy-200 bg-white"
      >
        {/* Sidebar Brand Header */}
        <div className="flex h-16 items-center gap-3 border-b border-navy-200 bg-navy-900 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <span className="block truncate text-sm font-bold text-white tracking-tight">Admin Hub</span>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              <span className="block truncate text-[10px] uppercase font-semibold tracking-wider text-brand-300">
                {profile?.role ?? 'ADMIN'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav aria-label="Administrative navigation" className="flex-1 space-y-1.5 p-4 overflow-y-auto">
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-navy-400">
            Platform Workflows
          </div>

          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.exact
              ? location.pathname === item.href
              : location.pathname.startsWith(item.href)

            return (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.exact}
                aria-current={isActive ? 'page' : undefined}
                className={({ isActive: linkActive }) =>
                  cn(
                    'group flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    linkActive
                      ? 'bg-brand-50 text-brand-700 font-semibold'
                      : 'text-navy-700 hover:bg-navy-50 hover:text-navy-900'
                  )
                }
              >
                <Icon
                  className={cn(
                    'h-5 w-5 mt-0.5 flex-shrink-0 transition-colors',
                    isActive ? 'text-brand-600' : 'text-navy-400 group-hover:text-navy-600'
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <div className="truncate">{item.label}</div>
                  <div className="truncate text-[11px] font-normal text-navy-500">{item.description}</div>
                </div>
              </NavLink>
            )
          })}
        </nav>

        {/* Sidebar Footer — User & Exit link */}
        <div className="border-t border-navy-200 bg-navy-50/60 p-4">
          <div className="mb-3 px-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-400">
              Signed in as
            </div>
            <div className="truncate text-xs font-medium text-navy-800">
              {profile?.display_name || 'Administrator'}
            </div>
            <div className="truncate text-[11px] text-navy-500">
              {profile?.email}
            </div>
          </div>

          <Link
            to={ROUTES.HOME}
            className="flex items-center gap-2 rounded-lg border border-navy-200 bg-white px-3 py-2 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-100 hover:text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-navy-500" aria-hidden="true" />
            <span>Exit to KHATRI SARVANIYAT</span>
          </Link>
        </div>
      </aside>

      {/* Main Administrative Content Area */}
      <main
        id="admin-main-content"
        tabIndex={-1}
        className="flex-1 overflow-y-auto outline-none"
      >
        <Outlet />
      </main>
    </div>
  )
}
