/**
 * Panchang Legend Component (Phase 10 / ANDROID-10 Parity)
 *
 * Explains calendar marker icons and symbols for cultural observances.
 */

import { Moon, Sparkles, Circle } from 'lucide-react'
import { useLanguage } from '@/features/i18n'

export function PanchangLegend() {
  const { t } = useLanguage()

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-700">
      <div className="font-semibold text-slate-900 mb-2">
        {t('panchang.legend_title', 'Panchang Markers')}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {/* Chand */}
        <div className="flex items-center gap-1.5">
          <Moon className="h-3.5 w-3.5 text-blue-600 fill-blue-500" aria-hidden="true" />
          <span>{t('panchang.legend_chand', 'Chand Sighting')}</span>
        </div>

        {/* Ekadashi */}
        <div className="flex items-center gap-1.5">
          <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200" aria-hidden="true" />
          <span>{t('panchang.legend_ekadashi', 'Ekadashi Fast')}</span>
        </div>

        {/* Poonam */}
        <div className="flex items-center gap-1.5">
          <Circle className="h-3.5 w-3.5 text-amber-500 fill-amber-300" aria-hidden="true" />
          <span>{t('panchang.legend_poonam', 'Poonam (Full Moon)')}</span>
        </div>

        {/* Amavasya */}
        <div className="flex items-center gap-1.5">
          <Circle className="h-3.5 w-3.5 text-slate-800 fill-slate-800" aria-hidden="true" />
          <span>{t('panchang.legend_amavas', 'Amavasya')}</span>
        </div>

        {/* Festival */}
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
          <span>{t('panchang.legend_festival', 'Major Festival')}</span>
        </div>
      </div>
    </div>
  )
}
