/**
 * Birthday Card Component (Phase 10 / ANDROID-9 Parity)
 *
 * Displays an individual upcoming community birthday:
 * - Avatar/Initials
 * - Full Name
 * - Formatted Day & Month (e.g., "12 Nov")
 * - Celebration status badges (Today, Tomorrow, In X days)
 * - Strict privacy shield: NO birth year or calculated age
 * - Interactive Wish button with >= 44px touch target
 * - Direct profile link with >= 44px touch target
 */

import React from 'react'
import { Link } from 'react-router-dom'
import { Cake, Sparkles, Check, User, ArrowRight } from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import type { BirthdayItem } from '../types'

interface BirthdayCardProps {
  item: BirthdayItem
  hasWished?: boolean
  onSendWish?: (personId: string) => void
  isAuthenticated?: boolean
}

export function BirthdayCard({
  item,
  hasWished = false,
  onSendWish,
  isAuthenticated = false,
}: BirthdayCardProps) {
  const { t } = useLanguage()

  const fullName = [item.first_name, item.middle_name, item.last_name]
    .filter(Boolean)
    .join(' ')

  const initials = `${item.first_name?.[0] || ''}${item.last_name?.[0] || ''}`.toUpperCase()

  const handleWishClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAuthenticated || hasWished || !onSendWish) return
    onSendWish(item.person_id)
  }

  return (
    <div
      className={`relative flex flex-col justify-between rounded-xl border p-4 sm:p-5 shadow-sm transition hover:shadow-md ${
        item.is_today
          ? 'border-amber-300 bg-amber-50/40 ring-1 ring-amber-400'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div>
        {/* Top Header: Badge & Date */}
        <div className="flex items-center justify-between gap-2">
          {item.is_today ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white shadow-sm">
              <Cake className="h-3.5 w-3.5" aria-hidden="true" />
              {t('birthdays.today_badge', 'Birthday Today!')}
            </span>
          ) : item.is_tomorrow ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
              <Sparkles className="h-3 w-3 text-blue-600" aria-hidden="true" />
              {t('birthdays.tomorrow_badge', 'Tomorrow')}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              {t('birthdays.in_days', `In {days} days`).replace(
                '{days}',
                String(item.days_until)
              )}
            </span>
          )}

          <span className="text-xs font-semibold text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200">
            {item.formatted_date}
          </span>
        </div>

        {/* Member Profile Info */}
        <div className="mt-3.5 flex items-center gap-3">
          {item.avatar_url ? (
            <img
              src={item.avatar_url}
              alt=""
              className="h-12 w-12 rounded-full object-cover ring-2 ring-slate-100"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-sm ring-2 ring-slate-100">
              {initials || <User className="h-5 w-5" />}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-900 truncate text-base">
              {fullName}
            </h3>
            <p className="text-xs text-slate-500 truncate">
              {item.formatted_date}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons with >= 44px touch targets */}
      <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-100">
        {/* Wish Button */}
        <button
          type="button"
          onClick={handleWishClick}
          disabled={!isAuthenticated || hasWished}
          aria-label={
            hasWished
              ? `${t('birthdays.wish_sent', 'Wish Sent!')} to ${fullName}`
              : `${t('birthdays.send_wish', 'Send Wish')} to ${fullName}`
          }
          className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${
            hasWished
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
              : !isAuthenticated
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : item.is_today
                  ? 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500'
                  : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
          }`}
        >
          {hasWished ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>{t('birthdays.wish_sent', 'Wish Sent!')}</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>
                {!isAuthenticated
                  ? t('birthdays.send_wish_disabled', 'Sign in to send wishes')
                  : t('birthdays.send_wish', 'Send Wish')}
              </span>
            </>
          )}
        </button>

        {/* View Profile Link */}
        <Link
          to={`/people/${item.person_id}`}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={`View ${fullName}'s profile`}
        >
          <span className="sr-only sm:not-sr-only sm:mr-1">
            {t('action.view', 'View')}
          </span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
