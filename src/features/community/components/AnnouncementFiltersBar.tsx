/**
 * Announcement Filters Bar Component (Phase 10 — Subtask 2)
 */

import React from 'react'
import { Search, X, Globe, Users, Bell } from 'lucide-react'
import type { AnnouncementFilters, AnnouncementType } from '../types'
import { ANNOUNCEMENT_TYPES } from '../schemas/announcement.schemas'

interface AnnouncementFiltersBarProps {
  filters: AnnouncementFilters
  onChange: (updated: AnnouncementFilters) => void
  isAuthenticated: boolean
}

const TYPE_LABELS: Record<AnnouncementType | 'ALL', string> = {
  ALL: 'All Notices',
  GENERAL: 'General',
  URGENT: 'Urgent',
  EVENT: 'Events',
  BEREAVEMENT: 'Obituaries / Bereavement',
  CELEBRATION: 'Celebrations',
}

export const AnnouncementFiltersBar: React.FC<AnnouncementFiltersBarProps> = ({
  filters,
  onChange,
  isAuthenticated,
}) => {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, search: e.target.value })
  }

  const handleClearSearch = () => {
    onChange({ ...filters, search: '' })
  }

  const handleTypeChange = (type: AnnouncementType | 'ALL') => {
    onChange({ ...filters, announcement_type: type })
  }

  const handleScopeChange = (scope: 'ALL' | 'GLOBAL' | 'MY_GROUPS') => {
    onChange({ ...filters, scope })
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Search & Scope Toggles */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder="Search notice titles or content..."
            className="w-full min-h-[44px] rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-9 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
          />
          {filters.search && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex min-h-[44px] min-w-[44px] items-center justify-center text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Scope Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => handleScopeChange('ALL')}
            className={`flex min-h-[44px] items-center gap-1 px-3 py-2 rounded-md transition-colors ${
              (filters.scope === 'ALL' || !filters.scope)
                ? 'bg-white text-slate-900 font-semibold shadow-xs'
                : 'hover:text-slate-900'
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>All</span>
          </button>

          <button
            type="button"
            onClick={() => handleScopeChange('GLOBAL')}
            className={`flex min-h-[44px] items-center gap-1 px-3 py-2 rounded-md transition-colors ${
              filters.scope === 'GLOBAL'
                ? 'bg-white text-slate-900 font-semibold shadow-xs'
                : 'hover:text-slate-900'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Community-Wide</span>
          </button>

          {isAuthenticated && (
            <button
              type="button"
              onClick={() => handleScopeChange('MY_GROUPS')}
              className={`flex min-h-[44px] items-center gap-1 px-3 py-2 rounded-md transition-colors ${
                filters.scope === 'MY_GROUPS'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'hover:text-slate-900'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>My Groups</span>
            </button>
          )}
        </div>
      </div>

      {/* Type Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => handleTypeChange('ALL')}
          className={`shrink-0 inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 font-medium transition-colors ${
            !filters.announcement_type || filters.announcement_type === 'ALL'
              ? 'bg-brand-600 text-white font-semibold shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {TYPE_LABELS.ALL}
        </button>

        {ANNOUNCEMENT_TYPES.map((type) => {
          const isSelected = filters.announcement_type === type
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={`shrink-0 inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 font-medium transition-colors ${
                isSelected
                  ? 'bg-brand-600 text-white font-semibold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {TYPE_LABELS[type]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
