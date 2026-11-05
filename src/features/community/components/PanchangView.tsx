/**
 * Panchang View Component (Phase 10 / ANDROID-10 Parity)
 *
 * Primary Sindhi Panchang & Lunar Calendar view (Screens 29-32):
 * - Interactive 7-column calendar matrix
 * - Month & Day navigation (<<, <, Today, >, >>)
 * - Observances & Festivals filter bar
 * - Detailed daily observance card with cross-referenced community events
 * - Marker legend and transparent provenance notice
 * - Mobile-first responsive layout with >= 44px touch targets
 */

import { Moon } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import { usePanchang } from '../hooks/usePanchang'
import { PanchangMonthView } from './PanchangMonthView'
import { PanchangDayDetail } from './PanchangDayDetail'
import { PanchangFiltersBar } from './PanchangFiltersBar'
import { PanchangLegend } from './PanchangLegend'

export function PanchangView() {
  const { t } = useLanguage()

  const {
    activeMonthDate,
    monthMatrix,
    selectedDate,
    selectedDayInfo,
    filter,
    setFilter,
    selectDate,
    jumpToToday,
    prevMonth,
    nextMonth,
    prevDay,
    nextDay,
    monthObservances,
  } = usePanchang()

  const festivalsCount = monthObservances.filter((d) => d.has_festival).length
  const observancesCount = monthObservances.length

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div>
        <div className="flex items-center gap-2">
          <Moon className="h-6 w-6 text-blue-600" aria-hidden="true" />
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {t('panchang.title', 'Sindhi Panchang & Lunar Calendar')}
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-500 max-w-3xl">
          {t(
            'panchang.subtitle',
            'Traditional Sindhi calendar, lunar tithis, Chand sightings, Ekadashi observances, and cultural festivals.'
          )}
        </p>
      </div>

      {/* Filter Chips Bar */}
      <PanchangFiltersBar
        filter={filter}
        onChange={setFilter}
        observancesCount={observancesCount}
        festivalsCount={festivalsCount}
      />

      {/* Main Grid: Month View & Day Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Month Calendar Matrix (Left) */}
        <div className="lg:col-span-7 space-y-4">
          <PanchangMonthView
            activeMonthDate={activeMonthDate}
            monthMatrix={monthMatrix}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            onPrevDay={prevDay}
            onNextDay={nextDay}
            onJumpToToday={jumpToToday}
            filter={filter}
          />

          {/* Marker Legend */}
          <PanchangLegend />
        </div>

        {/* Selected Day Details Card (Right) */}
        <div className="lg:col-span-5">
          <PanchangDayDetail dayInfo={selectedDayInfo} />
        </div>
      </div>
    </div>
  )
}
