/**
 * FamilyListPage — Community Family Census registry & My Family view.
 *
 * Requirements:
 * - Immediate synchronization upon family creation.
 * - Displays newly registered family with highlight banner.
 * - Shows Family Head, Gotra, Nukh, Location, Member count.
 * - Tab options: "All Families" vs "My Families" for instant personal family view.
 * - Mobile-first search across family name, family head, gotra, nukh, and location.
 */

import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Users, Search, PlusCircle, Compass, X, CheckCircle2, Heart } from 'lucide-react'
import { useFamilyList } from '../hooks/useFamilyList'
import { FamilyCard } from '../components/FamilyCard'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'
import { useTranslation } from '@/features/i18n'
import { useAuthContext } from '@/features/auth/context/AuthContext'

function useSafeLocation() {
  try {
    return useLocation()
  } catch {
    return { state: null, pathname: '', search: '', hash: '', key: 'default' }
  }
}

function useSafeNavigate() {
  try {
    return useNavigate()
  } catch {
    return () => {}
  }
}

export function FamilyListPage() {
  const navigate = useSafeNavigate()
  const location = useSafeLocation()
  const { user, isLoading: isAuthLoading } = useAuthContext()
  const { t } = useTranslation()
  const { data: families = [], isLoading, error, refetch } = useFamilyList()

  // State from creation redirect
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [highlightFamilyId, setHighlightFamilyId] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (location.state?.message) {
      setSuccessMessage(location.state.message as string)
      if (location.state.highlightFamilyId) {
        setHighlightFamilyId(location.state.highlightFamilyId as string)
      }
      // Clear navigation history state to avoid banner on manual refresh
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  // Split into "My Families" (created by or managed by current user) vs all
  const myFamilies = useMemo(() => {
    if (!user?.id) return []
    return families.filter((f) => {
      const isCreator = f.created_by === user.id
      const isManager = f.manager_user_id === user.id
      return isCreator || isManager
    })
  }, [families, user?.id])

  // Select base list according to active tab
  const baseList = activeTab === 'my' ? myFamilies : families

  // Filtered families based on search input
  const filteredFamilies = useMemo(() => {
    let list = baseList
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((f) => {
        const nameMatch = f.family_name.toLowerCase().includes(q)
        const cityMatch = f.city?.toLowerCase().includes(q) ?? false
        const gotraMatch = f.gotra?.toLowerCase().includes(q) ?? false
        const nukhMatch = f.nukh?.toLowerCase().includes(q) ?? false
        const headMatch = f.head?.name?.toLowerCase().includes(q) ?? false
        return nameMatch || cityMatch || gotraMatch || nukhMatch || headMatch
      })
    }

    // If there is a highlighted family, push it to the very top
    if (highlightFamilyId) {
      const idx = list.findIndex((f) => f.id === highlightFamilyId)
      if (idx > 0) {
        const highlighted = list[idx]
        return [highlighted, ...list.slice(0, idx), ...list.slice(idx + 1)]
      }
    }

    return list
  }, [baseList, searchQuery, highlightFamilyId])

  if (isLoading || isAuthLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="flex items-center gap-2 text-sm text-navy-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <span>Loading family census records…</span>
        </div>
      </div>
    )
  }

  if (error) {
    const message =
      (error as { message?: string }).message ??
      'Could not load family records. Please try again.'
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 space-y-4 shadow-xs">
          <div>
            <p className="font-semibold text-base text-red-800">Error Loading Census</p>
            <p className="mt-1 text-red-600">{message}</p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition-colors"
          >
            Retry Loading
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10 space-y-6">
      {/* Success Notification Banner */}
      {successMessage && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Census Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-navy-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-brand-700 border border-brand-200">
              {t('census.page_title')}
            </span>
            <span className="text-xs font-semibold text-navy-500">
              • {families.length} {t('census.total_families')}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-navy-900 sm:text-3xl">
            {activeTab === 'my' ? 'My Registered Families' : t('census.page_title')}
          </h1>
          <p className="mt-1 text-sm text-navy-600 max-w-2xl">
            {activeTab === 'my'
              ? 'Households and families registered or headed by you.'
              : t('census.page_subtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(ROUTES.DISCOVER)}
            className="flex items-center gap-1.5 text-xs"
          >
            <Compass className="h-4 w-4" />
            <span>Search Directory</span>
          </Button>
          <Button
            size="sm"
            onClick={() => navigate(ROUTES.FAMILY_CREATE)}
            className="flex items-center gap-1.5 text-xs font-bold shadow-sm"
          >
            <PlusCircle className="h-4 w-4" />
            <span>{t('census.start_census')}</span>
          </Button>
        </div>
      </div>

      {/* View Tabs: All Families vs My Families */}
      <div className="flex items-center gap-2 border-b border-navy-100 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'all'
              ? 'bg-brand-600 text-white shadow-xs'
              : 'text-navy-600 hover:bg-navy-50'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>All Community Families ({families.length})</span>
        </button>

        {user?.id && (
          <button
            type="button"
            onClick={() => setActiveTab('my')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'my'
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-navy-600 hover:bg-navy-50'
            }`}
          >
            <Heart className="h-3.5 w-3.5" />
            <span>My Families ({myFamilies.length})</span>
          </button>
        )}
      </div>

      {/* Search Filter Bar */}
      {families.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by family name, lineage or city..."
            aria-label="Filter families"
            className="w-full rounded-xl border border-navy-200 bg-white py-2.5 pl-10 pr-9 text-sm text-navy-900 shadow-2xs placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* List, Filtered Results, or Empty State */}
      {filteredFamilies.length > 0 ? (
        <ul className="space-y-3" aria-label="Family records">
          {filteredFamilies.map((family) => (
            <li key={family.id}>
              <FamilyCard
                family={family}
                isHighlighted={family.id === highlightFamilyId}
                onClick={() => navigate(ROUTES.FAMILY_DETAIL(family.id))}
              />
            </li>
          ))}
        </ul>
      ) : searchQuery ? (
        <div className="rounded-xl border border-navy-200 bg-white p-8 text-center space-y-3">
          <Search className="mx-auto h-8 w-8 text-navy-300" />
          <p className="text-sm font-semibold text-navy-800">
            No families found matching &ldquo;{searchQuery}&rdquo;
          </p>
          <p className="text-xs text-navy-500">
            Try adjusting your search keywords or clear the filter.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setSearchQuery('')}>
            Clear Search
          </Button>
        </div>
      ) : activeTab === 'my' ? (
        <div className="rounded-2xl border border-dashed border-navy-200 bg-white p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Heart className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-base font-bold text-navy-900">No personal families registered yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-navy-500">
            Register your household to manage your family members and view your genealogical family tree.
          </p>
          <Button
            className="mt-5 font-bold shadow-sm"
            size="sm"
            onClick={() => navigate(ROUTES.FAMILY_CREATE)}
          >
            <PlusCircle className="mr-1.5 h-4 w-4" />
            Register My Family
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-navy-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Users className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-navy-900">No family records yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-navy-500">
            Start building the community census registry by registering your family unit.
          </p>
          <Button
            className="mt-6 font-bold shadow-sm"
            onClick={() => navigate(ROUTES.FAMILY_CREATE)}
          >
            <PlusCircle className="mr-1.5 h-4 w-4" />
            {t('census.start_census')}
          </Button>
        </div>
      )}
    </div>
  )
}
