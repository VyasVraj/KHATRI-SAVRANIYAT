/**
 * Component: FamilyTreeHeader
 *
 * Dedicated Family Tree header strictly matching the reference design layout:
 * - Back to Family button
 * - Tree icon + 'Family Tree' heading
 * - Family Name & Member Count (e.g. 'VYAS FAMILY • 5 Members')
 * - Interactive action buttons: Expand All, Collapse All, Fit to Screen, View List
 */

import React from 'react'
import {
  ArrowLeft,
  Network,
  Maximize2,
  Minimize2,
  Target,
  List,
  GitFork,
} from 'lucide-react'

interface FamilyTreeHeaderProps {
  familyName: string
  memberCount: number
  onBack: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onFitToScreen: () => void
  isListView: boolean
  onToggleViewList: () => void
}

export const FamilyTreeHeader: React.FC<FamilyTreeHeaderProps> = ({
  familyName,
  memberCount,
  onBack,
  onExpandAll,
  onCollapseAll,
  onFitToScreen,
  isListView,
  onToggleViewList,
}) => {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-2 select-none">
      {/* Left section: Back button + Title + Subtitle */}
      <div className="flex items-start sm:items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to family"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Family</span>
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563EB]">
            <Network className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#101828]">
              Family Tree
            </h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {familyName ? `${familyName.toUpperCase()} • ` : ''}
              {memberCount} {memberCount === 1 ? 'Member' : 'Members'}
            </p>
          </div>
        </div>
      </div>

      {/* Right section: Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onExpandAll}
          title="Expand All Generations"
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Maximize2 className="h-3.5 w-3.5 text-slate-500" />
          <span>Expand All</span>
        </button>

        <button
          type="button"
          onClick={onCollapseAll}
          title="Collapse to Nucleus"
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Minimize2 className="h-3.5 w-3.5 text-slate-500" />
          <span>Collapse All</span>
        </button>

        <button
          type="button"
          onClick={onFitToScreen}
          title="Fit Complete Tree to Screen"
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Target className="h-3.5 w-3.5 text-slate-500" />
          <span>Fit to Screen</span>
        </button>

        <button
          type="button"
          onClick={onToggleViewList}
          title={isListView ? 'Switch to Tree View' : 'Switch to List View'}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#6D28D9] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#5B21B6] transition-colors shadow-sm"
        >
          {isListView ? (
            <>
              <GitFork className="h-3.5 w-3.5" />
              <span>View Tree</span>
            </>
          ) : (
            <>
              <List className="h-3.5 w-3.5" />
              <span>View List</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
