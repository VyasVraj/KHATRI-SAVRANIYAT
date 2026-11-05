/**
 * Panchang Filters Bar (Phase 10 / ANDROID-10 Parity)
 *
 * Provides quick filter chips for the Sindhi Lunar Calendar:
 * - All Days
 * - Observances & Fasts (Chand, Ekadashi, Poonam, Amavas)
 * - Major Festivals
 * - Minimum 44px touch targets
 */

import { Moon, Sparkles, Calendar } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { PanchangFilterType } from '../types'

interface PanchangFiltersBarProps {
  filter: PanchangFilterType
  onChange: (filter: PanchangFilterType) => void
  observancesCount?: number
  festivalsCount?: number
}

export function PanchangFiltersBar({
  filter,
  onChange,
  observancesCount = 0,
  festivalsCount = 0,
}: PanchangFiltersBarProps) {
  const { t } = useLanguage()

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Panchang Filters"
    >
      {/* All Days */}
      <button
        type="button"
        onClick={() => onChange('ALL')}
        aria-pressed={filter === 'ALL'}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          filter === 'ALL'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('panchang.filter_all', 'All Days')}</span>
      </button>

      {/* Observances & Fasts */}
      <button
        type="button"
        onClick={() => onChange('OBSERVANCES')}
        aria-pressed={filter === 'OBSERVANCES'}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-amber-500 ${
          filter === 'OBSERVANCES'
            ? 'bg-amber-600 text-white shadow-sm'
            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('panchang.filter_observances', 'Observances & Fasts')}</span>
        {observancesCount > 0 && (
          <span
            className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
              filter === 'OBSERVANCES'
                ? 'bg-amber-500 text-white'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {observancesCount}
          </span>
        )}
      </button>

      {/* Festivals */}
      <button
        type="button"
        onClick={() => onChange('FESTIVALS')}
        aria-pressed={filter === 'FESTIVALS'}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          filter === 'FESTIVALS'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('panchang.filter_festivals', 'Festivals')}</span>
        {festivalsCount > 0 && (
          <span
            className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
              filter === 'FESTIVALS'
                ? 'bg-indigo-500 text-white'
                : 'bg-indigo-100 text-indigo-800'
            }`}
          >
            {festivalsCount}
          </span>
        )}
      </button>
    </div>
  )
}
