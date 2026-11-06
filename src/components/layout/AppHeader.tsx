/**
 * Application Header / Navigation
 *
 * Auth-aware: shows user menu when authenticated, Sign In/Join when guest.
 * Mobile: Hamburger menu
 * Desktop: Horizontal nav + user avatar dropdown
 *
 * Design: Deep navy/indigo. No gradients. Clean and professional.
 */

import { useState, useRef, useEffect } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X, Users, User, UserCheck, LogOut, ChevronDown, ShieldCheck, CheckCircle, Bell, Settings, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_NAME, ROUTES, ADMIN_ROLES, PLATFORM_ADMIN_ROLES } from '@/constants/app'
import { BrandLogo } from '@/components/common/BrandLogo'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { signOut } from '@/features/auth/services/auth.service'
import { NotificationBell } from '@/features/notifications'
import { LanguageSelector } from '@/features/i18n'

const NAV_LINKS = [
  { label: 'Discover', href: ROUTES.DISCOVER },
  { label: 'My Family', href: ROUTES.FAMILIES },
  { label: 'Community', href: ROUTES.COMMUNITY },
] as const

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export function AppHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { isAuthenticated, profile, isLoading } = useAuthContext()

  // Close user dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignOut() {
    setUserMenuOpen(false)
    setMobileMenuOpen(false)
    await signOut()
    navigate(ROUTES.HOME, { replace: true })
  }

  const initials = getInitials(profile?.display_name)

  return (
    <header className="sticky top-0 z-50 border-b border-navy-200 bg-navy-900">
      {/* Skip navigation link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
      >
        Skip to main content
      </a>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo / Brand */}
          <Link
            to={ROUTES.HOME}
            className="flex items-center gap-2.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 group"
            aria-label={`${APP_NAME} — Home`}
          >
            <BrandLogo size="sm" alt={APP_NAME} priority className="transition-transform group-hover:scale-105" />
            <span className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap">
              {APP_NAME}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(({ label, href }) => {
              const tourTarget =
                href === ROUTES.DISCOVER
                  ? 'nav-discover'
                  : href === ROUTES.FAMILIES
                  ? 'nav-my-family'
                  : href === ROUTES.COMMUNITY
                  ? 'nav-community'
                  : undefined

              return (
                <NavLink
                  key={href}
                  to={href}
                  data-tour-target={tourTarget}
                  className={({ isActive }) =>
                    cn(
                      'rounded px-3 py-2 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                      isActive
                        ? 'bg-brand-700 text-white'
                        : 'text-navy-200 hover:bg-navy-700 hover:text-white'
                    )
                  }
                >
                  {label}
                </NavLink>
              )
            })}
          </nav>

          {/* Desktop Auth & Language Actions */}
          <div className="hidden items-center gap-3 md:flex">
            <LanguageSelector />
            {!isLoading && (
              <>
                {isAuthenticated ? (
                  <>
                    <NotificationBell />
                    {/* User menu — shown when authenticated */}
                    <div className="relative" ref={userMenuRef}>
                    <button
                      type="button"
                      data-tour-target="nav-profile"
                      onClick={() => setUserMenuOpen((v) => !v)}
                      aria-expanded={userMenuOpen}
                      aria-haspopup="menu"
                      aria-label="User menu"
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-navy-200 transition-colors hover:bg-navy-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
                        aria-hidden="true"
                      >
                        {initials}
                      </span>
                      <span className="max-w-[120px] truncate">
                        {profile?.display_name ?? 'My Account'}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    </button>

                    {userMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 mt-1 w-48 rounded-lg border border-navy-200 bg-white py-1 shadow-lg"
                      >
                        <Link
                          to={ROUTES.PROFILE}
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-navy-50"
                        >
                          <User className="h-4 w-4" />
                          My Profile
                        </Link>
                        <Link
                          to={ROUTES.CONNECTIONS}
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-navy-50"
                        >
                          <UserCheck className="h-4 w-4" />
                          Connections
                        </Link>
                        <Link
                          to={ROUTES.PEOPLE}
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-navy-50"
                        >
                          <Users className="h-4 w-4" />
                          Census Records
                        </Link>
                        <Link
                          to={ROUTES.NOTIFICATIONS}
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-navy-50"
                        >
                          <Bell className="h-4 w-4" />
                          Notifications
                        </Link>
                        <Link
                          to={ROUTES.NOTIFICATION_PREFERENCES}
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-navy-50"
                        >
                          <Settings className="h-4 w-4" />
                          Notification Settings
                        </Link>
                        {profile?.role && PLATFORM_ADMIN_ROLES.includes(profile.role) && (
                          <Link
                            to={ROUTES.ADMIN}
                            role="menuitem"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
                          >
                            <Shield className="h-4 w-4 text-brand-600" />
                            Admin Hub
                          </Link>
                        )}
                        {profile?.role && ADMIN_ROLES.includes(profile.role) && (
                          <>
                            <Link
                              to={ROUTES.CLAIM_REVIEW_QUEUE}
                              role="menuitem"
                              onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-navy-50"
                            >
                              <ShieldCheck className="h-4 w-4 text-brand-600" />
                              Claim Reviews
                            </Link>
                            <Link
                              to={ROUTES.VERIFICATION_REVIEW_QUEUE}
                              role="menuitem"
                              onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-navy-50"
                            >
                              <CheckCircle className="h-4 w-4 text-emerald-600" />
                              Verification Reviews
                            </Link>
                          </>
                        )}
                        <hr className="my-1 border-navy-100" />
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleSignOut}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      </div>
                    )}
                  </div>
                  </>
                ) : (
                  // Guest actions
                  <>
                    <Link
                      to={ROUTES.SIGN_IN}
                      className="rounded px-4 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      Sign In
                    </Link>
                    <Link
                      to={ROUTES.SIGN_UP}
                      className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      Join Community
                    </Link>
                  </>
                )}
              </>
            )}
          </div>

          {/* Mobile menu toggle & actions */}
          <div className="flex items-center gap-2 md:hidden">
            <LanguageSelector />
            {!isLoading && isAuthenticated && <NotificationBell />}
            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-navy-200 transition-colors hover:bg-navy-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <nav
          id="mobile-menu"
          aria-label="Mobile navigation"
          className="border-t border-navy-700 bg-navy-900 md:hidden"
        >
          <div className="space-y-1 px-4 pb-4 pt-2">
            {NAV_LINKS.map(({ label, href }) => {
              const tourTarget =
                href === ROUTES.DISCOVER
                  ? 'nav-discover'
                  : href === ROUTES.FAMILIES
                  ? 'nav-my-family'
                  : href === ROUTES.COMMUNITY
                  ? 'nav-community'
                  : undefined

              return (
                <NavLink
                  key={href}
                  to={href}
                  data-tour-target={tourTarget}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'block rounded px-3 py-2 text-sm font-medium transition-colors min-h-[44px] flex items-center',
                      isActive
                        ? 'bg-brand-700 text-white'
                        : 'text-navy-200 hover:bg-navy-700 hover:text-white'
                    )
                  }
                >
                  {label}
                </NavLink>
              )
            })}

            {/* Mobile auth section */}
            {!isLoading && (
              <div className="mt-3 flex flex-col gap-2 border-t border-navy-700 pt-3">
                {isAuthenticated ? (
                  <>
                    <Link
                      to={ROUTES.PROFILE}
                      data-tour-target="nav-profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex min-h-[44px] items-center gap-2 rounded px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                        {initials}
                      </span>
                      {profile?.display_name ?? 'My Profile'}
                    </Link>
                    <Link
                      to={ROUTES.CONNECTIONS}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white"
                    >
                      <UserCheck className="h-4 w-4" />
                      Connections
                    </Link>
                    <Link
                      to={ROUTES.PEOPLE}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white"
                    >
                      <Users className="h-4 w-4" />
                      Census Records
                    </Link>
                    <Link
                      to={ROUTES.NOTIFICATIONS}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white"
                    >
                      <Bell className="h-4 w-4" />
                      Notifications
                    </Link>
                    <Link
                      to={ROUTES.NOTIFICATION_PREFERENCES}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white"
                    >
                      <Settings className="h-4 w-4" />
                      Notification Settings
                    </Link>
                    {profile?.role && PLATFORM_ADMIN_ROLES.includes(profile.role) && (
                      <Link
                        to={ROUTES.ADMIN}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-navy-700 hover:text-white"
                      >
                        <Shield className="h-4 w-4 text-brand-400" />
                        Admin Hub
                      </Link>
                    )}
                    {profile?.role && ADMIN_ROLES.includes(profile.role) && (
                      <>
                        <Link
                          to={ROUTES.CLAIM_REVIEW_QUEUE}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white"
                        >
                          <ShieldCheck className="h-4 w-4 text-brand-400" />
                          Claim Reviews
                        </Link>
                        <Link
                          to={ROUTES.VERIFICATION_REVIEW_QUEUE}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white"
                        >
                          <CheckCircle className="h-4 w-4 text-emerald-400" />
                          Verification Reviews
                        </Link>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-navy-700"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to={ROUTES.SIGN_IN}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block rounded px-3 py-2 text-center text-sm font-medium text-navy-200 transition-colors hover:bg-navy-700 hover:text-white"
                    >
                      Sign In
                    </Link>
                    <Link
                      to={ROUTES.SIGN_UP}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block rounded bg-brand-600 px-3 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-brand-700"
                    >
                      Join Community
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  )
}
