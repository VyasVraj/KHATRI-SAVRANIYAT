/**
 * App Tour Replay Button Component
 *
 * Placed in Profile / App Settings to allow replaying the guided community tour.
 * Matches Android screens 39, 41, 42.
 */

import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTour } from '../context/TourContext'
import { useLanguage } from '@/features/i18n'

interface AppTourReplayButtonProps {
  className?: string
  variant?: 'button' | 'list-item'
}

export function AppTourReplayButton({ className, variant = 'button' }: AppTourReplayButtonProps) {
  const { resetTour } = useTour()
  const { t } = useLanguage()

  if (variant === 'list-item') {
    return (
      <button
        type="button"
        onClick={resetTour}
        className={cn(
          'flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-navy-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <span className="block text-sm font-medium text-navy-900">{t('profile.app_tour')}</span>
            <span className="block text-xs text-navy-500">{t('profile.app_tour_desc')}</span>
          </div>
        </div>
        <span className="text-xs font-semibold text-brand-600 hover:text-brand-700">
          {t('profile.replay_tour_button')}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={resetTour}
      className={cn(
        'inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-navy-300 bg-white px-3.5 py-2 text-xs font-semibold text-navy-700 shadow-2xs hover:bg-navy-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1 transition-all',
        className
      )}
    >
      <Sparkles className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
      <span>{t('action.replay_tour')}</span>
    </button>
  )
}
