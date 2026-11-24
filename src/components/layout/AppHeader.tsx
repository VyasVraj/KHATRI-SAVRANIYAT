/**
 * Application Header / Navigation
 *
 * Auth-aware: shows user menu when authenticated, Sign In/Join when guest.
 * Mobile: Hamburger menu
 * Desktop: Horizontal nav + user avatar dropdown
 *
 * Design: Deep navy/indigo. No gradients. Clean and professional.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Menu, X, Users, User, UserCheck, LogOut, ChevronDown, ChevronLeft, ChevronRight, ShieldCheck, CheckCircle, Bell, Shield, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_NAME, ROUTES, ADMIN_ROLES, PLATFORM_ADMIN_ROLES } from '@/constants/app'
import { BrandLogo } from '@/components/common/BrandLogo'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { signOut } from '@/features/auth/services/auth.service'
import { NotificationBell } from '@/features/notifications'
import { LanguageSelector } from '@/features/i18n'
import { AccessibilityFontSizeSlider } from '@/components/common/AccessibilityFontSizeSlider'
import { useAccessibilityFontSize } from '@/hooks/useAccessibilityFontSize'
import { isAppInstalled, onInstallStateChange } from '@/lib/pwa'
import { InstallAppModal } from '@/components/common/InstallAppModal'
import { AvatarImage } from '@/features/media'
import { usePersonByUserId } from '@/features/people'

const NAV_LINKS = [
  { label: 'Discover', href: ROUTES.DISCOVER },
  { label: 'Occupations', href: ROUTES.OCCUPATION_DIRECTORY },
  { label: 'Blood Directory', href: ROUTES.BLOOD_GROUP_DIRECTORY },
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
  const [installModalOpen, setInstallModalOpen] = useState(false)
  const [isInstalled, setIsInstalled] = useState(isAppInstalled())
  const userMenuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, user, profile, isLoading } = useAuthContext()
  const { data: linkedPerson } = usePersonByUserId(user?.id)
  const [liveAvatarUrl, setLiveAvatarUrl] = useState<string | null>(null)

  const { fontSize, step } = useAccessibilityFontSize()
  const headerContainerRef = useRef<HTMLDivElement>(null)
  const navScrollRef = useRef<HTMLElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isBrandAbbreviated, setIsBrandAbbreviated] = useState(step >= 3)

  const checkNavScroll = useCallback(() => {
    const el = navScrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 2)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2)
  }, [])

  const scrollNav = (direction: 'left' | 'right') => {
    const el = navScrollRef.current
    if (!el) return
    const amount = Math.max(160, el.clientWidth * 0.6)
    el.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    })
  }

  const handleNavWheel = (e: React.WheelEvent<HTMLElement>) => {
    const el = navScrollRef.current
    if (!el) return
    if (el.scrollWidth > el.clientWidth) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY
        checkNavScroll()
      }
    }
  }

  const checkHeaderFit = useCallback(() => {
    if (step >= 3) {
      setIsBrandAbbreviated(true)
      return
    }

    const headerEl = headerContainerRef.current
    const navEl = navScrollRef.current
    if (!headerEl) {
      setIsBrandAbbreviated(false)
      return
    }

    const availableWidth = headerEl.clientWidth
    if (availableWidth < 980 && navEl && navEl.scrollWidth > navEl.clientWidth + 20) {
      setIsBrandAbbreviated(true)
    } else {
      setIsBrandAbbreviated(false)
    }
  }, [step])

  useEffect(() => {
    checkNavScroll()
    checkHeaderFit()

    const navEl = navScrollRef.current
    const headerEl = headerContainerRef.current

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        checkNavScroll()
        checkHeaderFit()
      })
      if (navEl) observer.observe(navEl)
      if (headerEl) observer.observe(headerEl)
    }

    const onResize = () => {
      checkNavScroll()
      checkHeaderFit()
    }

    window.addEventListener('resize', onResize)

    return () => {
      if (observer) observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [checkNavScroll, checkHeaderFit, fontSize, step])

  useEffect(() => {
    const el = navScrollRef.current
    if (!el) return
    const activeItem = el.querySelector('[aria-current="page"]') as HTMLElement | null
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
    checkNavScroll()
  }, [location.pathname, checkNavScroll])

  useEffect(() => {
    setLiveAvatarUrl(profile?.avatar_url ?? linkedPerson?.avatar_url ?? null)
  }, [profile?.avatar_url, linkedPerson?.avatar_url])

  useEffect(() => {
    const handleAvatarUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ target: { type: string; id: string }; url: string | null }>
      if (customEvent.detail) {
        setLiveAvatarUrl(customEvent.detail.url)
      }
    }
    window.addEventListener('community-roots:avatar-updated', handleAvatarUpdated)
    return () => window.removeEventListener('community-roots:avatar-updated', handleAvatarUpdated)
  }, [])

  const currentAvatarUrl = liveAvatarUrl ?? profile?.avatar_url ?? linkedPerson?.avatar_url ?? null

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Lock body scroll and listen for Escape key when mobile drawer is open
  useEffect(() => {
    if (!mobileMenuOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileMenuOpen])

  // Swipe-to-close drawer touch gesture handling
  const touchStartX = useRef<number | null>(null)
  const touchCurrentX = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchCurrentX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    if (touchStartX.current !== null && touchCurrentX.current !== null) {
      const deltaX = touchCurrentX.current - touchStartX.current
      if (deltaX < -40) {
        setMobileMenuOpen(false)
      }
    }
    touchStartX.current = null
    touchCurrentX.current = null
  }

  useEffect(() => {
    return onInstallStateChange((state) => {
      setIsInstalled(state.isInstalled)
    })
  }, [])

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
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-navy-200 bg-navy-900 print:hidden">
        {/* Skip navigation link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
      >
        Skip to main content
      </a>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" ref={headerContainerRef}>
        <div className="flex h-16 items-center justify-between gap-2 sm:gap-4 min-w-0">
          {/* Logo / Brand */}
          <Link
            to={ROUTES.HOME}
            className="flex items-center gap-2 sm:gap-2.5 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 group min-w-0 shrink-0"
            aria-label={`${APP_NAME} — Home`}
            title={APP_NAME}
          >
            <BrandLogo size="sm" alt={APP_NAME} priority className="transition-transform group-hover:scale-105 shrink-0" />
            <span
              data-testid="header-brand-name"
              className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap transition-all duration-200"
            >
              {isBrandAbbreviated ? 'SKS' : APP_NAME}
            </span>
          </Link>

          {/* Desktop Navigation with Auto-Scroll */}
          <div className="hidden md:flex items-center min-w-0 flex-1 justify-center px-1 lg:px-2 relative overflow-hidden">
            {/* Left scroll control button */}
            {canScrollLeft && (
              <button
                type="button"
                onClick={() => scrollNav('left')}
                aria-label="Scroll navigation left"
                className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-navy-800/90 text-navy-200 hover:text-white hover:bg-navy-700 transition-colors z-20 shadow-xs mr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            {/* Left fade gradient indicator */}
            {canScrollLeft && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-navy-900 to-transparent z-10"
              />
            )}

            {/* Scrollable nav items list */}
            <nav
              ref={navScrollRef}
              onScroll={checkNavScroll}
              onWheel={handleNavWheel}
              aria-label="Primary navigation"
              className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap py-1 px-1 min-w-0"
            >
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
                        'rounded px-3 py-2 text-sm font-medium transition-colors shrink-0',
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

            {/* Right fade gradient indicator */}
            {canScrollRight && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-navy-900 to-transparent z-10"
              />
            )}

            {/* Right scroll control button */}
            {canScrollRight && (
              <button
                type="button"
                onClick={() => scrollNav('right')}
                aria-label="Scroll navigation right"
                className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-navy-800/90 text-navy-200 hover:text-white hover:bg-navy-700 transition-colors z-20 shadow-xs ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Desktop Auth & Language Actions */}
          <div className="hidden items-center gap-3 md:flex shrink-0">
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
                      {currentAvatarUrl ? (
                        <AvatarImage
                          src={currentAvatarUrl}
                          name={profile?.display_name ?? 'User'}
                          alt={profile?.display_name ?? 'My Account'}
                          size="xs"
                          shape="circle"
                          enablePreview={false}
                          className="h-7 w-7 border border-navy-700 shadow-xs"
                        />
                      ) : (
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
                          aria-hidden="true"
                        >
                          {initials}
                        </span>
                      )}
                      <span className="max-w-[120px] truncate">
                        {profile?.display_name ?? 'My Account'}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    </button>

                    {userMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 mt-1 w-64 rounded-lg border border-navy-200 bg-white py-1 shadow-lg"
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
                        {profile?.role && ['MUKHI', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI', 'SUPER_ADMIN', 'ADMIN'].includes(profile.role) && (
                          <Link
                            to={ROUTES.MUKHI_PORTAL}
                            role="menuitem"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
                          >
                            <Shield className="h-4 w-4 text-amber-600" />
                            Mukhi Portal
                          </Link>
                        )}
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
                        {/* TEXT SIZE / ACCESSIBILITY SLIDER (PART 21) */}
                        <div className="border-t border-navy-100 p-2">
                          <AccessibilityFontSizeSlider variant="light" />
                        </div>

                        {/* PWA Install Action */}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setUserMenuOpen(false)
                            setInstallModalOpen(true)
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-navy-700 hover:bg-navy-50"
                        >
                          <Download className="h-4 w-4 text-brand-600" />
                          {isInstalled ? 'Installation Instructions' : 'Install App'}
                        </button>

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
          <div className="flex items-center gap-1.5 sm:gap-2 md:hidden">
            <LanguageSelector />
            {!isLoading && isAuthenticated && <NotificationBell />}
            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-navy-200 transition-colors hover:bg-navy-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-drawer"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer & Semi-Transparent Backdrop Portal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            className={cn(
              'fixed inset-0 z-[60] transition-opacity duration-300 md:hidden',
              mobileMenuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            {/* Backdrop: Dark semi-transparent overlay covering 100% of screen & bottom nav */}
            <div
              className="absolute inset-0 bg-navy-950/75 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Slide-out Drawer Panel */}
            <aside
              id="mobile-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={cn(
                'absolute inset-y-0 left-0 flex w-[85vw] max-w-[320px] flex-col bg-navy-900 border-r border-navy-800 text-white shadow-2xl transition-transform duration-300 ease-in-out',
                mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
              )}
            >
              {/* Drawer Top Header with Safe Area Inset */}
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-navy-800 px-4 pt-[env(safe-area-inset-top,0px)] bg-navy-950/80">
                <Link
                  to={ROUTES.HOME}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 text-white focus-visible:outline-none min-w-0 shrink"
                  aria-label={`${APP_NAME} — Home`}
                >
                  <BrandLogo size="sm" alt={APP_NAME} priority className="shrink-0" />
                  <span className="text-base font-bold tracking-tight text-white whitespace-nowrap truncate">
                    {APP_NAME}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-navy-300 hover:bg-navy-800 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {/* Drawer Scrollable Links with Safe Area Inset */}
              <nav
                id="mobile-drawer-nav"
                aria-label="Mobile navigation links"
                className="flex-1 overflow-y-auto px-3 py-3 space-y-1 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
              >
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
                          'flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]',
                          isActive
                            ? 'bg-brand-700 text-white font-bold'
                            : 'text-navy-200 hover:bg-navy-800 hover:text-white'
                        )
                      }
                    >
                      {label}
                    </NavLink>
                  )
                })}

                {/* Mobile auth section */}
                {!isLoading && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-navy-800 pt-3">
                    {isAuthenticated ? (
                      <>
                        <Link
                          to={ROUTES.PROFILE}
                          data-tour-target="nav-profile"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
                        >
                          {currentAvatarUrl ? (
                            <AvatarImage
                              src={currentAvatarUrl}
                              name={profile?.display_name ?? 'User'}
                              alt={profile?.display_name ?? 'My Profile'}
                              size="xs"
                              shape="circle"
                              enablePreview={false}
                              className="h-7 w-7 shrink-0 border border-navy-700 shadow-xs"
                            />
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white shrink-0">
                              {initials}
                            </span>
                          )}
                          <span className="truncate">{profile?.display_name ?? 'My Profile'}</span>
                        </Link>
                        <Link
                          to={ROUTES.CONNECTIONS}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
                        >
                          <UserCheck className="h-4 w-4 shrink-0 text-navy-400" />
                          <span>Connections</span>
                        </Link>
                        <Link
                          to={ROUTES.PEOPLE}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
                        >
                          <Users className="h-4 w-4 shrink-0 text-navy-400" />
                          <span>Census Records</span>
                        </Link>
                        <Link
                          to={ROUTES.NOTIFICATIONS}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
                        >
                          <Bell className="h-4 w-4 shrink-0 text-navy-400" />
                          <span>Notifications</span>
                        </Link>
                        {profile?.role && ['MUKHI', 'COMMUNITY_MUKHI', 'ASSISTANT_MUKHI', 'SUPER_ADMIN', 'ADMIN'].includes(profile.role) && (
                          <Link
                            to={ROUTES.MUKHI_PORTAL}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-navy-800 hover:text-white"
                          >
                            <Shield className="h-4 w-4 shrink-0 text-amber-400" />
                            <span>Mukhi Portal</span>
                          </Link>
                        )}
                        {profile?.role && PLATFORM_ADMIN_ROLES.includes(profile.role) && (
                          <Link
                            to={ROUTES.ADMIN}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-brand-300 transition-colors hover:bg-navy-800 hover:text-white"
                          >
                            <Shield className="h-4 w-4 shrink-0 text-brand-400" />
                            <span>Admin Hub</span>
                          </Link>
                        )}
                        {profile?.role && ADMIN_ROLES.includes(profile.role) && (
                          <>
                            <Link
                              to={ROUTES.CLAIM_REVIEW_QUEUE}
                              onClick={() => setMobileMenuOpen(false)}
                              className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
                            >
                              <ShieldCheck className="h-4 w-4 shrink-0 text-brand-400" />
                              <span>Claim Reviews</span>
                            </Link>
                            <Link
                              to={ROUTES.VERIFICATION_REVIEW_QUEUE}
                              onClick={() => setMobileMenuOpen(false)}
                              className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
                            >
                              <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
                              <span>Verification Reviews</span>
                            </Link>
                          </>
                        )}

                        {/* Mobile Text Size / Accessibility Slider */}
                        <div className="my-2">
                          <AccessibilityFontSizeSlider variant="dark" />
                        </div>

                        {/* PWA Install Mobile Action */}
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMenuOpen(false)
                            setInstallModalOpen(true)
                          }}
                          className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
                        >
                          <Download className="h-4 w-4 shrink-0 text-brand-400" />
                          <span>{isInstalled ? 'Installation Instructions' : 'Install App'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-navy-800 hover:text-red-300"
                        >
                          <LogOut className="h-4 w-4 shrink-0" />
                          <span>Sign out</span>
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Guest Mobile Text Size / Accessibility Slider */}
                        <div className="my-2">
                          <AccessibilityFontSizeSlider variant="dark" />
                        </div>

                        {/* Guest PWA Install Mobile Action */}
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMenuOpen(false)
                            setInstallModalOpen(true)
                          }}
                          className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
                        >
                          <Download className="h-4 w-4 shrink-0 text-brand-400" />
                          <span>{isInstalled ? 'Installation Instructions' : 'Install App'}</span>
                        </button>

                        <div className="grid grid-cols-2 gap-2 pt-2">
                          <Link
                            to={ROUTES.SIGN_IN}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex min-h-[44px] items-center justify-center rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-navy-700"
                          >
                            Sign In
                          </Link>
                          <Link
                            to={ROUTES.SIGN_UP}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex min-h-[44px] items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-700 shadow-sm"
                          >
                            Join Community
                          </Link>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </nav>
            </aside>
          </div>,
          document.body
        )}

      {/* PWA Install Guide Modal */}
      <InstallAppModal
        isOpen={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
      />
    </header>

    {/* Document flow spacer to preserve layout offset and prevent content from going under the fixed header */}
    <div className="h-16 w-full shrink-0 print:hidden" aria-hidden="true" />
  </>
  )
}
