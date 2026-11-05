/**
 * PeopleSearchBar component
 *
 * Dedicated search bar for the People Directory.
 * Supports instantaneous text binding, an explicit clear action,
 * and accessible keyboard navigation.
 */

import { Search, X } from 'lucide-react'
import { useTranslation } from '@/features/i18n'

interface PeopleSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function PeopleSearchBar({
  value,
  onChange,
  placeholder,
  disabled = false,
  className = '',
}: PeopleSearchBarProps) {
  const { t } = useTranslation()
  const effectivePlaceholder = placeholder ?? t('directory.search_people_placeholder')
  return (
    <div className={`relative flex w-full items-center ${className}`}>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-navy-400"
        aria-hidden="true"
      >
        <Search className="h-5 w-5" />
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={effectivePlaceholder}
        aria-label="Search people by name"
        className={[
          'w-full rounded-lg border border-navy-300 bg-white py-2.5 pl-10 pr-10 text-sm text-navy-900',
          'placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
          'disabled:cursor-not-allowed disabled:bg-navy-50 disabled:text-navy-400',
          'transition duration-150 ease-in-out',
        ].join(' ')}
      />

      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search text"
          className="absolute inset-y-0 right-0 flex items-center pr-3 text-navy-400 hover:text-navy-600 focus:outline-none"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
