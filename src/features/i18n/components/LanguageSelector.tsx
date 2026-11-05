/**
 * Language Selector Component
 *
 * Matches the Android KhatriSetu language switcher pill (@ EN v)
 * Provides accessible selection between English, Hindi, and Gujarati.
 */

import { useState, useRef, useEffect } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '../context/LanguageContext'

interface LanguageSelectorProps {
  className?: string
  variant?: 'header' | 'menu' | 'card'
}

export function LanguageSelector({ className, variant = 'header' }: LanguageSelectorProps) {
  const { language, setLanguage, languages, currentLanguageOption, t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  if (variant === 'card') {
    return (
      <div className={cn('space-y-2', className)}>
        <label className="text-xs font-medium text-navy-700">
          {t('profile.language')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {languages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all',
                language === lang.code
                  ? 'border-brand-600 bg-brand-50 text-brand-900 font-semibold shadow-xs ring-1 ring-brand-600'
                  : 'border-navy-200 bg-white text-navy-700 hover:bg-navy-50'
              )}
            >
              <span className="text-sm">{lang.nativeName}</span>
              <span className="text-[11px] text-navy-500">{lang.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={menuRef} className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        data-tour-target="header-language-select"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`${t('action.choose_language')}: ${currentLanguageOption.label}`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-navy-700 bg-navy-800/80 px-2.5 py-1 text-xs font-medium text-white shadow-xs transition-colors hover:bg-navy-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
          isOpen && 'bg-navy-700 ring-2 ring-brand-400'
        )}
      >
        <Globe className="h-3.5 w-3.5 text-brand-300" aria-hidden="true" />
        <span className="font-semibold tracking-wide">{currentLanguageOption.shortLabel}</span>
        <ChevronDown className="h-3 w-3 text-navy-300" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-label={t('action.choose_language')}
          className="absolute right-0 z-50 mt-1.5 w-44 origin-top-right rounded-lg border border-navy-200 bg-white p-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-navy-400">
            {t('action.choose_language')}
          </div>
          {languages.map((lang) => {
            const isSelected = language === lang.code
            return (
              <button
                key={lang.code}
                role="menuitem"
                type="button"
                onClick={() => {
                  setLanguage(lang.code)
                  setIsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors',
                  isSelected
                    ? 'bg-brand-50 font-semibold text-brand-900'
                    : 'text-navy-700 hover:bg-navy-50'
                )}
              >
                <div className="flex flex-col">
                  <span>{lang.nativeName}</span>
                  <span className="text-[10px] text-navy-400">{lang.label}</span>
                </div>
                {isSelected && <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
