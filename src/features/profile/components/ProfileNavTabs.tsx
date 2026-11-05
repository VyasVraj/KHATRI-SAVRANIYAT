/**
 * Profile navigation tabs (ANDROID-12 — Screens 37–43)
 *
 * Implements accessible WAI-ARIA tablist with >= 44px touch targets
 * and keyboard arrow-key navigation across all 6 profile sections.
 */

import React, { useRef, useEffect } from 'react'
import {
  User,
  Sparkles,
  FileText,
  Key,
  Settings,
  Shield,
} from 'lucide-react'
import type { ProfileTab } from '../types'
import { useLanguage } from '@/features/i18n'

export interface ProfileNavTabsProps {
  activeTab: ProfileTab
  onTabChange: (tab: ProfileTab) => void
  completenessScore?: number
}

interface TabItem {
  id: ProfileTab
  labelKey: import('@/features/i18n').TranslationKey
  defaultLabel: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  badge?: string | number
}

export function ProfileNavTabs({
  activeTab,
  onTabChange,
  completenessScore,
}: ProfileNavTabsProps) {
  const { t } = useLanguage()
  const tabListRef = useRef<HTMLDivElement>(null)

  // Ensure active tab is smoothly scrolled into view on mobile
  useEffect(() => {
    const activeBtn = tabListRef.current?.querySelector<HTMLButtonElement>(`#tab-${activeTab}`)
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [activeTab])

  const tabs: TabItem[] = [
    {
      id: 'overview',
      labelKey: 'profile.tab_overview',
      defaultLabel: 'Overview',
      icon: User,
    },
    {
      id: 'completeness',
      labelKey: 'profile.tab_completeness',
      defaultLabel: 'Completeness',
      icon: Sparkles,
      badge: completenessScore !== undefined ? `${completenessScore}%` : undefined,
    },
    {
      id: 'account',
      labelKey: 'profile.tab_account',
      defaultLabel: 'Account',
      icon: FileText,
    },
    {
      id: 'security',
      labelKey: 'profile.tab_security',
      defaultLabel: 'Security',
      icon: Key,
    },
    {
      id: 'settings',
      labelKey: 'profile.tab_settings',
      defaultLabel: 'Settings',
      icon: Settings,
    },
    {
      id: 'privacy',
      labelKey: 'profile.tab_privacy',
      defaultLabel: 'Privacy',
      icon: Shield,
    },
  ]

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let targetIndex: number | null = null

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      targetIndex = (currentIndex + 1) % tabs.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      targetIndex = (currentIndex - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      targetIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      targetIndex = tabs.length - 1
    }

    if (targetIndex !== null) {
      const nextTab = tabs[targetIndex]
      onTabChange(nextTab.id)
      const targetBtn = tabListRef.current?.querySelector<HTMLButtonElement>(`#tab-${nextTab.id}`)
      targetBtn?.focus()
    }
  }

  return (
    <div className="w-full border-b border-navy-200 bg-white">
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Profile navigation sections"
        className="flex overflow-x-auto no-scrollbar scroll-smooth touch-pan-x scroll-p-2 gap-1 sm:gap-2 px-1 pt-1"
      >
        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`
                group relative flex items-center gap-1.5 sm:gap-2 whitespace-nowrap px-3 sm:px-3.5 py-2.5 sm:py-3 text-xs sm:text-sm font-medium
                min-h-[44px] min-w-[44px] transition-all duration-150 border-b-2 shrink-0
                ${
                  isActive
                    ? 'border-brand-600 text-brand-700 font-semibold bg-brand-50/50'
                    : 'border-transparent text-navy-600 hover:text-navy-900 hover:border-navy-300 hover:bg-navy-50/50'
                }
              `}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-brand-600' : 'text-navy-400 group-hover:text-navy-600'
                }`}
                aria-hidden="true"
              />
              <span>{t(tab.labelKey, tab.defaultLabel)}</span>
              {tab.badge && (
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-semibold border shrink-0 ${
                    isActive
                      ? 'bg-brand-100 text-brand-800 border-brand-200'
                      : 'bg-navy-100 text-navy-600 border-navy-200'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
