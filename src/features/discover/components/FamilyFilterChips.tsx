/**
 * FamilyFilterChips component
 *
 * Displays active family filters as removable badge chips with an explicit "Clear all" button.
 */

import { X } from 'lucide-react'
import type { FamilyDiscoveryFilters } from '../types'
import { useTranslation } from '@/features/i18n'

interface FamilyFilterChipsProps {
  filters: FamilyDiscoveryFilters
  onRemoveFilter: (key: keyof FamilyDiscoveryFilters) => void
  onClearAll: () => void
  className?: string
}

const FILTER_LABELS: Partial<Record<keyof FamilyDiscoveryFilters, string>> = {
  search: 'Search',
  family_name: 'Family Name',
  gotra: 'Gotra',
  nukh: 'Nukh',
  city: 'City',
  state: 'State',
  country: 'Country',
  status: 'Status',
  verification_status: 'Verification',
}

const STATUS_DISPLAY: Record<string, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  ARCHIVED: 'Archived',
}

const VERIFICATION_DISPLAY: Record<string, string> = {
  UNVERIFIED: 'Unverified',
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
}

export function FamilyFilterChips({
  filters,
  onRemoveFilter,
  onClearAll,
  className = '',
}: FamilyFilterChipsProps) {
  const { t } = useTranslation()
  const activeEntries = (
    Object.entries(filters) as [keyof FamilyDiscoveryFilters, string | undefined][]
  ).filter(([, val]) => Boolean(val && val.trim().length > 0))

  if (activeEntries.length === 0) {
    return null
  }

  function formatValue(key: keyof FamilyDiscoveryFilters, val: string): string {
    if (key === 'status') {
      return STATUS_DISPLAY[val] ?? val
    }
    if (key === 'verification_status') {
      return VERIFICATION_DISPLAY[val] ?? val
    }
    return val
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 py-2 text-xs ${className}`}
      aria-label="Active family filters"
    >
      <span className="font-medium text-navy-500">{t('directory.active_filters')}:</span>

      {activeEntries.map(([key, value]) => {
        if (!value) return null
        const label = FILTER_LABELS[key] ?? key
        const displayVal = formatValue(key, value)

        return (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800 border border-brand-200"
          >
            <span>
              <strong className="font-semibold text-brand-900">{label}:</strong>{' '}
              {displayVal}
            </span>
            <button
              type="button"
              onClick={() => onRemoveFilter(key)}
              aria-label={`Remove ${label} filter`}
              className="rounded-full p-0.5 text-brand-600 hover:bg-brand-100 hover:text-brand-900 focus:outline-none"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )
      })}

      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline focus:outline-none"
      >
        {t('directory.clear_all')}
      </button>
    </div>
  )
}
