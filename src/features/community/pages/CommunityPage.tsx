/**
 * Community Page (Phase 10 — Subtask 4 Dashboard & Final Hardening)
 *
 * Unified Community Hub Dashboard:
 * - Community Groups & Associations (Subtask 1)
 * - Notice Board / Community Announcements (Subtask 2)
 * - Events & Calendar with RSVP (Subtask 3)
 *
 * Features:
 * - Real-time Community Pulse metric cards
 * - Accessible WAI-ARIA tab navigation with Arrow key keyboard controls
 * - Deep-linking and URL query param synchronization (?tab=groups|announcements|events)
 * - Domain separation preserved: PERSON != USER, FAMILY != GROUP
 * - RLS and authoritative RPC security enforced on all underlying mutations
 */

import React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Users,
  Bell,
  Calendar,
  ArrowRight,
  Pin,
  CheckCircle,
  Clock,
  Cake,
  Moon,
  Shield,
  Award,
  Crown,
  FileText,
} from 'lucide-react'
import { useLanguage } from '@/features/i18n'
import { useGroups } from '../hooks/useGroups'
import { useAnnouncements } from '../hooks/useAnnouncements'
import { useEvents } from '../hooks/useEvents'
import { useBirthdays } from '../hooks/useBirthdays'
import { usePanchang } from '../hooks/usePanchang'
import { useMukhiDirectory } from '../hooks/useMukhiDirectory'
import { useCommittees } from '../hooks/useCommittees'
import { usePanchayat } from '../hooks/usePanchayat'
import { useCirculars } from '../hooks/useCirculars'
import { GroupsCatalog } from '../components/GroupsCatalog'
import { AnnouncementsFeed } from '../components/AnnouncementsFeed'
import { EventsFeed } from '../components/EventsFeed'
import { BirthdaysFeed } from '../components/BirthdaysFeed'
import { PanchangView } from '../components/PanchangView'
import { MukhiDirectoryView } from '../components/MukhiDirectoryView'
import { CommitteeDirectoryView } from '../components/CommitteeDirectoryView'
import { PanchayatDirectoryView } from '../components/PanchayatDirectoryView'
import { CircularsView } from '../components/CircularsView'

export type CommunityTab =
  | 'groups'
  | 'circulars'
  | 'committees'
  | 'panchayat'
  | 'announcements'
  | 'events'
  | 'birthdays'
  | 'panchang'
  | 'mukhi'

export function CommunityPage() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const activeTab: CommunityTab =
    rawTab === 'circulars' ||
    rawTab === 'committees' ||
    rawTab === 'panchayat' ||
    rawTab === 'announcements' ||
    rawTab === 'events' ||
    rawTab === 'birthdays' ||
    rawTab === 'panchang' ||
    rawTab === 'mukhi'
      ? rawTab
      : 'groups'

  const handleTabChange = (newTab: CommunityTab) => {
    setSearchParams({ tab: newTab }, { replace: true })
  }

  // Fetch summary counts for overview cards
  const { data: groups, isLoading: groupsLoading } = useGroups()
  const { data: announcements, isLoading: announcementsLoading } =
    useAnnouncements()
  const { data: events, isLoading: eventsLoading } = useEvents()
  const {
    data: birthdays,
    todayCount: birthdaysTodayCount,
    thisMonthCount: birthdaysMonthCount,
    isLoading: birthdaysLoading,
  } = useBirthdays()
  const { todayInfo: panchangTodayInfo, nextKeyObservance } = usePanchang()
  const { totalCount: mukhiCount, isLoading: mukhiLoading } = useMukhiDirectory()
  const { totalCount: committeesCount, isLoading: committeesLoading } = useCommittees()
  const { totalCount: panchayatCount, isLoading: panchayatLoading } = usePanchayat()
  const { totalCount: circularsCount, isLoading: circularsLoading } = useCirculars()

  const groupsCount = groups?.length ?? 0
  const verifiedGroupsCount = groups?.filter((g) => g.is_verified).length ?? 0

  const announcementsCount = announcements?.length ?? 0
  const pinnedAnnouncementsCount =
    announcements?.filter((a) => a.is_pinned).length ?? 0

  const eventsCount = events?.length ?? 0
  const upcomingEventsCount =
    events?.filter((e) => new Date(e.start_time).getTime() > Date.now())
      .length ?? 0

  const birthdaysCount = birthdays?.length ?? 0

  // Keyboard navigation for WAI-ARIA tablist
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const tabs: CommunityTab[] = [
      'groups',
      'announcements',
      'events',
      'birthdays',
      'panchang',
      'mukhi',
      'circulars',
      'committees',
      'panchayat',
    ]
    const currentIndex = tabs.indexOf(activeTab)

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextTab = tabs[(currentIndex + 1) % tabs.length]
      handleTabChange(nextTab)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prevTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length]
      handleTabChange(prevTab)
    } else if (e.key === 'Home') {
      e.preventDefault()
      handleTabChange('groups')
    } else if (e.key === 'End') {
      e.preventDefault()
      handleTabChange('panchayat')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Page Header */}
      <div id="community-hub-header">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('community.title', 'Community Hub')}
        </h1>
        <p className="mt-1 text-sm text-slate-500 max-w-3xl">
          {t(
            'community.subtitle',
            'Connect with local village associations, stay informed with official notices, and participate in community gatherings and celebrations.'
          )}
        </p>
      </div>

      {/* Community Pulse Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 community-pulse-metrics">
        {/* Groups Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('groups')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'groups'
              ? 'border-blue-600 bg-blue-50/40 shadow-sm ring-2 ring-blue-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Groups: ${groupsCount} registered`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 shrink-0">
                <Users className="h-5 w-5" />
              </span>
              {verifiedGroupsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200 shrink-0">
                  <CheckCircle className="h-3 w-3" />
                  {verifiedGroupsCount} {t('community.count_verified', 'verified')}
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {groupsLoading ? '...' : groupsCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('community.pulse_groups', 'Groups & Associations')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'community.pulse_groups_desc',
                  'Village wings, cultural associations & committees.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-600 min-h-[24px]">
            <span>{t('community.browse_catalog', 'Browse catalog')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Circulars Metric Card (Screen 47) */}
        <button
          type="button"
          onClick={() => handleTabChange('circulars')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'circulars'
              ? 'border-blue-600 bg-blue-50/40 shadow-sm ring-2 ring-blue-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Circulars: ${circularsCount} published`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-800 shrink-0">
                <FileText className="h-5 w-5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200 shrink-0">
                {circularsLoading ? '...' : circularsCount} {t('circular.count_circulars', 'Circulars')}
              </span>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {circularsLoading ? '...' : circularsCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('circular.pulse_circulars', 'Panchayat Circulars')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'circular.pulse_circulars_desc',
                  'Official notices & executive orders.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-slate-200 min-h-[24px]">
            <span>{t('circular.view_circulars', 'Read circulars')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Committees Metric Card (Screen 44) */}
        <button
          type="button"
          onClick={() => handleTabChange('committees')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'committees'
              ? 'border-blue-600 bg-blue-50/40 shadow-sm ring-2 ring-blue-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Committees: ${committeesCount} active`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700 shrink-0">
                <Award className="h-5 w-5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200 shrink-0">
                {committeesLoading ? '...' : committeesCount} {t('committee.count_committees', 'Committees')}
              </span>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {committeesLoading ? '...' : committeesCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('committee.pulse_committees', 'Committees')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'committee.pulse_committees_desc',
                  'Executive, census, welfare & youth bodies.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-600 min-h-[24px]">
            <span>{t('committee.view_committees', 'View committees')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Panchayat Metric Card (Screen 46) */}
        <button
          type="button"
          onClick={() => handleTabChange('panchayat')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'panchayat'
              ? 'border-purple-600 bg-purple-50/40 shadow-sm ring-2 ring-purple-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Panchayat: ${panchayatCount} officers`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-700 shrink-0">
                <Crown className="h-5 w-5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200 shrink-0">
                {panchayatLoading ? '...' : panchayatCount} {t('panchayat.count_officers', 'Officers')}
              </span>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {panchayatLoading ? '...' : panchayatCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('panchayat.pulse_panchayat', 'Panchayat')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'panchayat.pulse_panchayat_desc',
                  'Central executive & regional Mukhis.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-purple-600 min-h-[24px]">
            <span>{t('panchayat.view_panchayat', 'View leadership roster')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Notices Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('announcements')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'announcements'
              ? 'border-amber-600 bg-amber-50/40 shadow-sm ring-2 ring-amber-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Notice Board: ${announcementsCount} notices`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shrink-0">
                <Bell className="h-5 w-5" />
              </span>
              {pinnedAnnouncementsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200 shrink-0">
                  <Pin className="h-3 w-3 fill-amber-600" />
                  {pinnedAnnouncementsCount} {t('community.count_pinned', 'pinned')}
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {announcementsLoading ? '...' : announcementsCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('community.pulse_notices', 'Notice Board')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'community.pulse_notices_desc',
                  'Official notices, news & community announcements.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-700 min-h-[24px]">
            <span>{t('community.view_notices', 'View notice board')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Events Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('events')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'events'
              ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-2 ring-indigo-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Events: ${eventsCount} events`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                <Calendar className="h-5 w-5" />
              </span>
              {upcomingEventsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200 shrink-0">
                  <Clock className="h-3 w-3" />
                  {upcomingEventsCount} {t('community.count_upcoming', 'upcoming')}
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {eventsLoading ? '...' : eventsCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('community.pulse_events', 'Events & Calendar')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'community.pulse_events_desc',
                  'Gatherings, meetings, celebrations & RSVP registrations.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-indigo-600 min-h-[24px]">
            <span>{t('community.explore_events', 'Explore events')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Birthdays Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('birthdays')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'birthdays'
              ? 'border-rose-600 bg-rose-50/40 shadow-sm ring-2 ring-rose-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Birthdays: ${birthdaysCount} upcoming`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-700 shrink-0">
                <Cake className="h-5 w-5" />
              </span>
              {birthdaysTodayCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm shrink-0">
                  <Cake className="h-3 w-3" />
                  {birthdaysTodayCount} {t('birthdays.filter_today', 'today')}
                </span>
              ) : (
                birthdaysMonthCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 border border-rose-200 shrink-0">
                    <Calendar className="h-3 w-3" />
                    {birthdaysMonthCount} {t('birthdays.filter_this_month', 'this month')}
                  </span>
                )
              )}
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {birthdaysLoading
                  ? '...'
                  : birthdaysTodayCount > 0
                    ? birthdaysTodayCount
                    : birthdaysCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('birthdays.pulse_birthdays', 'Birthdays & Celebrations')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'birthdays.pulse_birthdays_desc',
                  'Upcoming birthdays and community member celebrations.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-rose-600 min-h-[24px]">
            <span>{t('birthdays.view_birthdays', 'View birthdays')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Panchang Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('panchang')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'panchang'
              ? 'border-sky-600 bg-sky-50/40 shadow-sm ring-2 ring-sky-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Panchang: ${panchangTodayInfo.sindhi_month_name}`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-700 shrink-0">
                <Moon className="h-5 w-5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700 border border-sky-200 truncate max-w-[120px] shrink-0">
                {nextKeyObservance ? nextKeyObservance.title : panchangTodayInfo.sindhi_month_name}
              </span>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900 truncate">
                {panchangTodayInfo.sindhi_month_name}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('panchang.pulse_panchang', 'Sindhi Panchang')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'panchang.pulse_panchang_desc',
                  'Lunar tithis, Chand sightings & festivals.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-sky-600 min-h-[24px]">
            <span>{t('panchang.view_panchang', 'View calendar')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Mukhi Directory Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('mukhi')}
          className={`flex min-h-[44px] h-full min-h-[195px] flex-col justify-between rounded-xl border p-4 sm:p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'mukhi'
              ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-2 ring-indigo-500/20'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Mukhi Directory: ${mukhiCount} leaders`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                <Shield className="h-5 w-5" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200 shrink-0">
                {mukhiLoading ? '...' : mukhiCount} {t('mukhi.count_leaders', 'leaders')}
              </span>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {mukhiLoading ? '...' : mukhiCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                {t('mukhi.pulse_mukhi', 'Mukhi Directory')}
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                {t(
                  'mukhi.pulse_mukhi_desc',
                  'Community elders & regional Samaj Mukhis.'
                )}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-indigo-600 min-h-[24px]">
            <span>{t('mukhi.view_directory', 'View directory')}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="border-b border-slate-200">
        <nav
          className="-mb-px flex space-x-3 sm:space-x-6 overflow-x-auto pb-1 no-scrollbar scroll-smooth touch-pan-x scroll-p-2"
          aria-label="Community Hub Tabs"
          role="tablist"
          onKeyDown={handleTabKeyDown}
        >
          <button
            type="button"
            role="tab"
            id="tab-groups"
            aria-selected={activeTab === 'groups'}
            aria-controls="panel-groups"
            tabIndex={activeTab === 'groups' ? 0 : -1}
            onClick={() => handleTabChange('groups')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'groups'
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            <span>{t('community.tab_groups', 'Groups & Associations')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'groups'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {groupsCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-announcements"
            aria-selected={activeTab === 'announcements'}
            aria-controls="panel-announcements"
            tabIndex={activeTab === 'announcements' ? 0 : -1}
            onClick={() => handleTabChange('announcements')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'announcements'
                ? 'border-amber-600 text-amber-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span>{t('community.tab_announcements', 'Notice Board')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'announcements'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {announcementsCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-events"
            aria-selected={activeTab === 'events'}
            aria-controls="panel-events"
            tabIndex={activeTab === 'events' ? 0 : -1}
            onClick={() => handleTabChange('events')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'events'
                ? 'border-indigo-600 text-indigo-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span>{t('community.tab_events', 'Events & Calendar')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'events'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {eventsCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-birthdays"
            aria-selected={activeTab === 'birthdays'}
            aria-controls="panel-birthdays"
            tabIndex={activeTab === 'birthdays' ? 0 : -1}
            onClick={() => handleTabChange('birthdays')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'birthdays'
                ? 'border-rose-600 text-rose-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Cake className="h-4 w-4" aria-hidden="true" />
            <span>{t('birthdays.tab_birthdays', 'Birthdays')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'birthdays'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {birthdaysTodayCount > 0 ? birthdaysTodayCount : birthdaysCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-panchang"
            aria-selected={activeTab === 'panchang'}
            aria-controls="panel-panchang"
            tabIndex={activeTab === 'panchang' ? 0 : -1}
            onClick={() => handleTabChange('panchang')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'panchang'
                ? 'border-sky-600 text-sky-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Moon className="h-4 w-4" aria-hidden="true" />
            <span>{t('panchang.tab_panchang', 'Panchang')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'panchang'
                  ? 'bg-sky-100 text-sky-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              Lunar
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-mukhi"
            aria-selected={activeTab === 'mukhi'}
            aria-controls="panel-mukhi"
            tabIndex={activeTab === 'mukhi' ? 0 : -1}
            onClick={() => handleTabChange('mukhi')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'mukhi'
                ? 'border-indigo-600 text-indigo-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Shield className="h-4 w-4" aria-hidden="true" />
            <span>{t('mukhi.tab_mukhi', 'Mukhi Directory')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'mukhi'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {mukhiCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-circulars"
            aria-selected={activeTab === 'circulars'}
            aria-controls="panel-circulars"
            tabIndex={activeTab === 'circulars' ? 0 : -1}
            onClick={() => handleTabChange('circulars')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'circulars'
                ? 'border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            <span>{t('circular.tab_circulars', 'Circulars')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'circulars'
                  ? 'bg-slate-900 text-white dark:bg-slate-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {circularsCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-committees"
            aria-selected={activeTab === 'committees'}
            aria-controls="panel-committees"
            tabIndex={activeTab === 'committees' ? 0 : -1}
            onClick={() => handleTabChange('committees')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'committees'
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Award className="h-4 w-4" aria-hidden="true" />
            <span>{t('committee.tab_committees', 'Committees')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'committees'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {committeesCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-panchayat"
            aria-selected={activeTab === 'panchayat'}
            aria-controls="panel-panchayat"
            tabIndex={activeTab === 'panchayat' ? 0 : -1}
            onClick={() => handleTabChange('panchayat')}
            className={[
              'flex min-h-[44px] items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'panchayat'
                ? 'border-purple-600 text-purple-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Crown className="h-4 w-4" aria-hidden="true" />
            <span>{t('panchayat.tab_panchayat', 'Panchayat Roster')}</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'panchayat'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {panchayatCount}
            </span>
          </button>
        </nav>
      </div>

      {/* Tab Panels */}
      {activeTab === 'groups' && (
        <div
          id="panel-groups"
          role="tabpanel"
          aria-labelledby="tab-groups"
          tabIndex={0}
        >
          <GroupsCatalog />
        </div>
      )}

      {activeTab === 'circulars' && (
        <div
          id="panel-circulars"
          role="tabpanel"
          aria-labelledby="tab-circulars"
          tabIndex={0}
        >
          <CircularsView />
        </div>
      )}

      {activeTab === 'committees' && (
        <div
          id="panel-committees"
          role="tabpanel"
          aria-labelledby="tab-committees"
          tabIndex={0}
        >
          <CommitteeDirectoryView />
        </div>
      )}

      {activeTab === 'panchayat' && (
        <div
          id="panel-panchayat"
          role="tabpanel"
          aria-labelledby="tab-panchayat"
          tabIndex={0}
        >
          <PanchayatDirectoryView />
        </div>
      )}

      {activeTab === 'announcements' && (
        <div
          id="panel-announcements"
          role="tabpanel"
          aria-labelledby="tab-announcements"
          tabIndex={0}
        >
          <AnnouncementsFeed />
        </div>
      )}

      {activeTab === 'events' && (
        <div
          id="panel-events"
          role="tabpanel"
          aria-labelledby="tab-events"
          tabIndex={0}
        >
          <EventsFeed />
        </div>
      )}

      {activeTab === 'birthdays' && (
        <div
          id="panel-birthdays"
          role="tabpanel"
          aria-labelledby="tab-birthdays"
          tabIndex={0}
        >
          <BirthdaysFeed />
        </div>
      )}

      {activeTab === 'panchang' && (
        <div
          id="panel-panchang"
          role="tabpanel"
          aria-labelledby="tab-panchang"
          tabIndex={0}
        >
          <PanchangView />
        </div>
      )}

      {activeTab === 'mukhi' && (
        <div
          id="panel-mukhi"
          role="tabpanel"
          aria-labelledby="tab-mukhi"
          tabIndex={0}
        >
          <MukhiDirectoryView />
        </div>
      )}
    </div>
  )
}
