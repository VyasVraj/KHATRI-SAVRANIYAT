/**
 * Event Filters Bar Component (Phase 10 — Subtask 3)
 */

import type { EventFilters, EventType } from '../types'
import { EVENT_TYPES } from '../schemas/event.schemas'
import { Search, X } from 'lucide-react'

interface EventFiltersBarProps {
  filters: EventFilters
  onChange: (filters: EventFilters) => void
  onReset: () => void
}

export function EventFiltersBar({
  filters,
  onChange,
  onReset,
}: EventFiltersBarProps) {
  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.event_type !== 'ALL' ||
    filters.scope !== 'ALL' ||
    filters.timeframe !== 'UPCOMING'

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      {/* Search Input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search events by title, description, venue, or group..."
          value={filters.search || ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-full min-h-[44px] rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      </div>

      {/* Filter Dropdowns and Timeframe Segmented Controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Timeframe toggle */}
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => onChange({ ...filters, timeframe: 'UPCOMING' })}
            className={`min-h-[44px] flex items-center rounded-md px-3 py-2 transition ${
              filters.timeframe === 'UPCOMING'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Upcoming
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...filters, timeframe: 'PAST' })}
            className={`min-h-[44px] flex items-center rounded-md px-3 py-2 transition ${
              filters.timeframe === 'PAST'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Past
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...filters, timeframe: 'ALL' })}
            className={`min-h-[44px] flex items-center rounded-md px-3 py-2 transition ${
              filters.timeframe === 'ALL'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
        </div>

        {/* Event Type Filter */}
        <div className="relative">
          <select
            value={filters.event_type || 'ALL'}
            onChange={(e) =>
              onChange({
                ...filters,
                event_type: e.target.value as EventType | 'ALL',
              })
            }
            className="min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="ALL">All Event Types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Scope Filter */}
        <div className="relative">
          <select
            value={filters.scope || 'ALL'}
            onChange={(e) =>
              onChange({
                ...filters,
                scope: e.target.value as 'ALL' | 'GLOBAL' | 'MY_GROUPS',
              })
            }
            className="min-h-[44px] rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="ALL">All Scopes</option>
            <option value="GLOBAL">Community-Wide Only</option>
            <option value="MY_GROUPS">My Groups Only</option>
          </select>
        </div>

        {/* Reset Filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
            title="Clear filters"
          >
            <X className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>
    </div>
  )
}
