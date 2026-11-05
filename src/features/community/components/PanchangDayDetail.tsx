/**
 * Panchang Day Detail Component (Phase 10 / ANDROID-10 Parity)
 *
 * Detailed card for the active selected calendar date:
 * - Gregorian Date & Day of Week
 * - Sindhi Month, Paksha & Tithi
 * - Observances list with badges (Chand, Ekadashi, Poonam, Amavas, Festival)
 * - Cross-referenced community events for that day
 * - Transparent data provenance notice (strictly avoiding fake astronomical values)
 */

import {
  Calendar,
  Moon,
  Sparkles,
  Info,
  Clock,
  MapPin,
  CheckCircle,
} from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import { useEvents } from '../hooks/useEvents'
import type { PanchangDayInfo } from '../types'

interface PanchangDayDetailProps {
  dayInfo: PanchangDayInfo
}

export function PanchangDayDetail({ dayInfo }: PanchangDayDetailProps) {
  const { t } = useLanguage()
  const { data: events = [] } = useEvents()

  // Find community events on this day
  const dayEvents = events.filter((e) =>
    e.start_time.startsWith(dayInfo.date_string)
  )

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-6">
      {/* Date Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900">
              {dayInfo.formatted_gregorian}
            </h3>
            {dayInfo.is_today && (
              <span className="inline-flex items-center rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                {t('panchang.today', 'Today')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Sindhi Month */}
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              <span>{dayInfo.sindhi_month_name}</span>
            </span>

            {/* Paksha */}
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {dayInfo.paksha_name}
            </span>

            {/* Tithi */}
            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
              {dayInfo.tithi_name}
            </span>
          </div>
        </div>

        {/* Verification Status Badge */}
        {dayInfo.data_status === 'VERIFIED_OBSERVANCE' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Verified Observance</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            <span>Lunar Calendar</span>
          </span>
        )}
      </div>

      {/* Observances & Fasts */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Moon className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <span>{t('panchang.observances_heading', 'Observances & Significance')}</span>
        </h4>

        {dayInfo.observances.length > 0 ? (
          <div className="space-y-2">
            {dayInfo.observances.map((obs) => (
              <div
                key={obs.id}
                className={`rounded-lg border p-4 transition ${
                  obs.type === 'CHAND'
                    ? 'border-blue-200 bg-blue-50/40'
                    : obs.type === 'EKADASHI'
                      ? 'border-amber-200 bg-amber-50/40'
                      : obs.type === 'FESTIVAL'
                        ? 'border-indigo-200 bg-indigo-50/40'
                        : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 text-sm">
                    {obs.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      obs.type === 'CHAND'
                        ? 'bg-blue-100 text-blue-800'
                        : obs.type === 'EKADASHI'
                          ? 'bg-amber-100 text-amber-800'
                          : obs.type === 'FESTIVAL'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {obs.type}
                  </span>
                </div>
                {obs.description && (
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                    {obs.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
            {t(
              'panchang.no_observances_today',
              'No specific religious fasting or observance recorded for this day.'
            )}
          </p>
        )}
      </div>

      {/* Community Events on this Date */}
      <div className="space-y-3 pt-2 border-t border-slate-100">
        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          <span>{t('panchang.community_events_heading', 'Community Events on this Date')}</span>
          {dayEvents.length > 0 && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.2 text-xs font-bold text-indigo-700 ml-1">
              {dayEvents.length}
            </span>
          )}
        </h4>

        {dayEvents.length > 0 ? (
          <div className="space-y-2">
            {dayEvents.map((evt) => (
              <div
                key={evt.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition"
              >
                <div>
                  <div className="font-semibold text-slate-900 text-xs sm:text-sm">
                    {evt.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      <span>
                        {new Date(evt.start_time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </span>
                    {evt.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        <span>{evt.location}</span>
                      </span>
                    )}
                  </div>
                </div>

                <span className="inline-flex self-start sm:self-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
                  {evt.event_type}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
            {t(
              'panchang.no_events_today',
              'No community events scheduled on this date.'
            )}
          </p>
        )}
      </div>

      {/* Transparent Data Provenance Notice */}
      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          {t(
            'panchang.provenance_notice',
            'Verified community observances and traditional Sindhi tithis. Exact astronomical end-timings vary by geographic coordinates.'
          )}
        </p>
      </div>
    </div>
  )
}
