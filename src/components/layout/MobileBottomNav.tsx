/**
 * MobileBottomNav Component
 *
 * Implements Android PDF reference mobile bottom navigation bar (Screens 00–49).
 * Features:
 * - 4 primary mobile tabs: Discover, My Family, Community, Profile
 * - Accessible touch targets >= 48px
 * - Safe area inset padding for modern mobile browsers
 * - Active state indicators with aria-current="page"
 * - App Tour target hooks (nav-discover, nav-my-family, nav-community, nav-profile)
 * - Trilingual localization (English, Hindi, Gujarati)
 */

import { NavLink } from 'react-router-dom'
import { Compass, Home, Users, User } from 'lucide-react'
import { ROUTES } from '@/constants/app'
import { useLanguage, type TranslationKey } from '@/features/i18n'
import { cn } from '@/lib/utils'

interface NavTabItem {
  id: string
  labelKey: TranslationKey
  href: string
  icon: React.ComponentType<{ className?: string }>
  tourTarget: string
}

const NAV_TABS: NavTabItem[] = [
  {
    id: 'tab-discover',
    labelKey: 'nav.discover',
    href: ROUTES.DISCOVER,
    icon: Compass,
    tourTarget: 'nav-discover',
  },
  {
    id: 'tab-my-family',
    labelKey: 'nav.my_family',
    href: ROUTES.FAMILIES,
    icon: Home,
    tourTarget: 'nav-my-family',
  },
  {
    id: 'tab-community',
    labelKey: 'nav.community',
    href: ROUTES.COMMUNITY,
    icon: Users,
    tourTarget: 'nav-community',
  },
  {
    id: 'tab-profile',
    labelKey: 'nav.profile',
    href: ROUTES.PROFILE,
    icon: User,
    tourTarget: 'nav-profile',
  },
]

export function MobileBottomNav() {
  const { t } = useLanguage()

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-navy-200 bg-white/95 backdrop-blur-md dark:border-navy-800 dark:bg-navy-900/95 md:hidden safe-bottom"
    >
      <div className="grid h-16 grid-cols-4 items-center">
        {NAV_TABS.map(({ id, labelKey, href, icon: Icon, tourTarget }) => (
          <NavLink
            key={id}
            to={href}
            data-tour-target={tourTarget}
            className={({ isActive }) =>
              cn(
                'flex h-full min-h-[48px] min-w-[48px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset',
                isActive
                  ? 'text-brand-600 dark:text-brand-400 font-semibold'
                  : 'text-navy-500 hover:text-navy-800 dark:text-navy-400 dark:hover:text-white'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'h-5 w-5 transition-transform duration-150',
                    isActive ? 'scale-110 text-brand-600 dark:text-brand-400' : 'text-navy-400 dark:text-navy-500'
                  )}
                  aria-hidden="true"
                />
                <span className="truncate text-[10px] leading-tight tracking-tight">
                  {t(labelKey)}
                </span>
                {isActive && (
                  <span className="sr-only"> (current page)</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
