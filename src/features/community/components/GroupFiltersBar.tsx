/**
 * Group Filters Bar Component (Phase 10 — Subtask 1)
 */

import React from 'react'
import { Search, X, CheckCircle, Users } from 'lucide-react'
import type { GroupFilters, GroupType } from '../types'
import { GROUP_TYPES } from '../schemas/group.schemas'

interface GroupFiltersBarProps {
  filters: GroupFilters
  onChange: (updated: GroupFilters) => void
  isAuthenticated: boolean
}

const TYPE_LABELS: Record<GroupType | 'ALL', string> = {
  ALL: 'All Types',
  VILLAGE_ASSOCIATION: 'Village / Watan',
  COMMITTEE: 'Committees',
  CULTURAL: 'Cultural',
  YOUTH: 'Youth Wing',
  OTHER: 'Other',
}

export const GroupFiltersBar: React.FC<GroupFiltersBarProps> = ({
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

  const handleTypeChange = (type: GroupType | 'ALL') => {
    onChange({ ...filters, group_type: type })
  }

  const handleToggleMyGroups = () => {
    const next =
      filters.membership_filter === 'MY_GROUPS' ? 'ALL' : 'MY_GROUPS'
    onChange({ ...filters, membership_filter: next })
  }

  const handleToggleVerified = () => {
    const next = filters.is_verified ? undefined : true
    onChange({ ...filters, is_verified: next })
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Search Input & Quick Toggles */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={handleSearchChange}
            placeholder="Search groups by name, description, or location..."
            className="w-full min-h-[44px] rounded-lg border border-slate-200 py-2.5 pl-9 pr-9 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

        {/* Toggles */}
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <button
              type="button"
              onClick={handleToggleMyGroups}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                filters.membership_filter === 'MY_GROUPS'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              My Groups
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleVerified}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
              filters.is_verified
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Verified Only
          </button>
        </div>
      </div>

      {/* Group Type Filter Chips */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={() => handleTypeChange('ALL')}
          className={`shrink-0 inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
            !filters.group_type || filters.group_type === 'ALL'
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {TYPE_LABELS.ALL}
        </button>

        {GROUP_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => handleTypeChange(type)}
            className={`shrink-0 inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
              filters.group_type === type
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  )
}
