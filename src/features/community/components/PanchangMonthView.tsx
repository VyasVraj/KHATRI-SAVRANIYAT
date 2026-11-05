/**
 * Panchang Month View Component (Phase 10 / ANDROID-10 Parity)
 *
 * Renders the interactive 7-column calendar grid:
 * - Month and Day navigation (<<, <, Today, >, >>) with >= 44px touch targets
 * - Localized weekday headers (Sun, Mon, Tue, Wed, Thu, Fri, Sat)
 * - Visual markers for Chand, Ekadashi, Poonam, Amavasya, and Festivals
 * - High contrast today indicator and selected cell focus ring
 * - Accessible ARIA labels and keyboard friendly interaction
 */

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Moon,
  Sparkles,
  Circle,
  Calendar,
} from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { PanchangDayInfo, PanchangFilterType } from '../types'

interface PanchangMonthViewProps {
  activeMonthDate: Date
  monthMatrix: PanchangDayInfo[]
  selectedDate: Date
  onSelectDate: (dateString: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onPrevDay: () => void
  onNextDay: () => void
  onJumpToToday: () => void
  filter: PanchangFilterType
}

const WEEKDAYS = [
  { key: 'sun', label: 'Sun' },
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
]

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function PanchangMonthView({
  activeMonthDate,
  monthMatrix,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  onPrevDay,
  onNextDay,
  onJumpToToday,
  filter,
}: PanchangMonthViewProps) {
  const { t } = useLanguage()

  const currentYear = activeMonthDate.getFullYear()
  const currentMonthIndex = activeMonthDate.getMonth()
  const currentMonthName = MONTH_NAMES[currentMonthIndex]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
      {/* Month Navigation Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Previous Month */}
          <button
            type="button"
            onClick={onPrevMonth}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t('panchang.prev_month', 'Previous Month')}
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Previous Day */}
          <button
            type="button"
            onClick={onPrevDay}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t('panchang.prev_day', 'Previous Day')}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Month & Year Title */}
        <div className="text-center">
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {currentMonthName} {currentYear}
          </h2>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Next Day */}
          <button
            type="button"
            onClick={onNextDay}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t('panchang.next_day', 'Next Day')}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Next Month */}
          <button
            type="button"
            onClick={onNextMonth}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label={t('panchang.next_month', 'Next Month')}
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Jump to Today Button */}
          <button
            type="button"
            onClick={onJumpToToday}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500 ml-1"
            aria-label={t('panchang.jump_to_today', 'Jump to Today')}
          >
            <Calendar className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            <span className="hidden sm:inline">
              {t('panchang.today', 'Today')}
            </span>
          </button>
        </div>
      </div>

      {/* Weekday Column Headers */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 py-1 border-b border-slate-100">
        {WEEKDAYS.map((wd) => (
          <div key={wd.key} className="py-1">
            {wd.label}
          </div>
        ))}
      </div>

      {/* 7-Column Calendar Day Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label="Month Calendar">
        {monthMatrix.map((day) => {
          const isFilterMatch =
            filter === 'ALL' ||
            (filter === 'OBSERVANCES' &&
              (day.has_chand || day.has_ekadashi || day.has_poonam || day.has_amavas)) ||
            (filter === 'FESTIVALS' && day.has_festival)

          return (
            <button
              key={day.date_string}
              type="button"
              onClick={() => onSelectDate(day.date_string)}
              aria-selected={day.is_selected}
              aria-label={`${day.formatted_gregorian}, ${day.tithi_name}${
                day.observances.length > 0
                  ? ` (${day.observances.map((o) => o.title).join(', ')})`
                  : ''
              }`}
              className={`relative flex min-h-[44px] sm:min-h-[58px] flex-col justify-between rounded-lg p-1 sm:p-1.5 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                day.is_selected
                  ? 'border-2 border-blue-600 bg-blue-50/60 shadow-sm'
                  : day.is_today
                    ? 'border border-amber-400 bg-amber-50/30'
                    : 'border border-slate-100 hover:border-slate-300 hover:bg-slate-50'
              } ${
                !day.is_current_month
                  ? 'opacity-40 text-slate-400'
                  : isFilterMatch
                    ? 'text-slate-900'
                    : 'opacity-50 text-slate-400'
              }`}
            >
              {/* Day Number Header */}
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-xs sm:text-sm font-bold ${
                    day.is_today
                      ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white'
                      : day.is_selected
                        ? 'text-blue-700'
                        : 'text-slate-800'
                  }`}
                >
                  {day.day_number}
                </span>

                {/* Today Pill (desktop) */}
                {day.is_today && (
                  <span className="hidden sm:inline-block text-[10px] font-bold text-amber-700 bg-amber-100 px-1 rounded">
                    {t('panchang.today', 'Today')}
                  </span>
                )}
              </div>

              {/* Day Observance Indicators */}
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {day.has_chand && (
                  <span title={t('panchang.legend_chand', 'Chand Sighting')}>
                    <Moon className="h-3 w-3 text-blue-600 fill-blue-500 shrink-0" aria-hidden="true" />
                  </span>
                )}
                {day.has_ekadashi && (
                  <span
                    className="flex h-2 w-2 rounded-full bg-amber-500 ring-1 ring-amber-300 shrink-0"
                    title={t('panchang.legend_ekadashi', 'Ekadashi')}
                  />
                )}
                {day.has_poonam && (
                  <span title={t('panchang.legend_poonam', 'Poonam')}>
                    <Circle className="h-2.5 w-2.5 text-amber-500 fill-amber-300 shrink-0" aria-hidden="true" />
                  </span>
                )}
                {day.has_amavas && (
                  <span title={t('panchang.legend_amavas', 'Amavasya')}>
                    <Circle className="h-2.5 w-2.5 text-slate-800 fill-slate-800 shrink-0" aria-hidden="true" />
                  </span>
                )}
                {day.has_festival && (
                  <span title={t('panchang.legend_festival', 'Festival')}>
                    <Sparkles className="h-3 w-3 text-indigo-600 shrink-0" aria-hidden="true" />
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
