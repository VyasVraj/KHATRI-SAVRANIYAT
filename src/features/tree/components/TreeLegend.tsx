/**
 * Component: TreeLegend
 *
 * Left-side floating collapsible legend matching the reference design layout:
 * - Collapsible toggle button visible by default (compact state)
 * - Opens complete Relationship Legend on click with smooth animation
 * - Closes on clicking the toggle button or the close icon
 * - Includes all 9 relationship types:
 *   - Spouse (purple line)
 *   - Parent – Child (blue line)
 *   - Siblings (blue dashed line)
 *   - Head of Family (gold crown badge)
 *   - Male (blue circle/icon)
 *   - Female (pink circle/icon)
 *   - Couple (interlocking rings)
 *   - Selected Person (highlighted border)
 *   - Deceased (dashed border)
 */

import React, { useState } from 'react'
import { Panel } from 'reactflow'
import { Crown, User, BookOpen, ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TreeLegendProps {
  defaultExpanded?: boolean
  className?: string
}

export const TreeLegend: React.FC<TreeLegendProps> = ({
  defaultExpanded = false,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded)

  return (
    <Panel position="top-left" className={cn('m-3 sm:m-4 z-20', className)}>
      <div className="flex flex-col items-start select-none">
        {/* Compact Legend Toggle Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded((prev) => !prev)
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            'flex items-center gap-2 rounded-xl border border-[#DCE3EF] bg-white px-3 py-2 text-xs font-semibold shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer',
            isExpanded
              ? 'text-brand-700 bg-brand-50/90 border-brand-300 shadow-sm'
              : 'text-slate-700 hover:bg-slate-50 hover:text-brand-600'
          )}
          aria-expanded={isExpanded}
          aria-controls="relationship-legend-panel"
          aria-label={isExpanded ? 'Hide Relationship Legend' : 'Show Relationship Legend'}
          title={isExpanded ? 'Hide Relationship Legend' : 'Show Relationship Legend'}
        >
          <BookOpen className="h-4 w-4 text-brand-600 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-slate-800">Legend</span>
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-brand-600 transition-transform duration-200" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200" aria-hidden="true" />
          )}
        </button>

        {/* Collapsible Complete Relationship Legend Panel */}
        {isExpanded && (
          <div
            id="relationship-legend-panel"
            role="region"
            aria-label="Relationship Legend"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="mt-2 w-48 max-h-[calc(100vh-160px)] overflow-y-auto rounded-2xl border border-[#DCE3EF] bg-white p-4 shadow-lg select-none transition-all duration-200 animate-in fade-in slide-in-from-top-2 zoom-in-95"
          >
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#101828]">
                Relationship Legend
              </h4>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsExpanded(false)
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                aria-label="Close Relationship Legend"
                title="Close Relationship Legend"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-[#101828]">
              {/* Spouse */}
              <div className="flex items-center gap-2.5">
                <span className="h-0.5 w-6 rounded bg-[#9333EA] shrink-0" aria-hidden="true" />
                <span className="font-medium text-slate-700">Spouse</span>
              </div>

              {/* Parent - Child */}
              <div className="flex items-center gap-2.5">
                <span className="h-0.5 w-6 rounded bg-[#2563EB] shrink-0" aria-hidden="true" />
                <span className="font-medium text-slate-700">Parent – Child</span>
              </div>

              {/* Siblings */}
              <div className="flex items-center gap-2.5">
                <span
                  className="h-0.5 w-6 border-t-2 border-dashed border-[#2563EB] shrink-0"
                  style={{ height: 0 }}
                  aria-hidden="true"
                />
                <span className="font-medium text-slate-700">Siblings</span>
              </div>

              {/* Head of Family */}
              <div className="flex items-center gap-2.5 pt-1">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#FEF3C7] text-[#92400E] border border-amber-200">
                  <Crown className="h-3 w-3 fill-amber-500 text-amber-600" />
                </div>
                <span className="font-medium text-slate-700">Head of Family</span>
              </div>

              {/* Male */}
              <div className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE] text-[#1D4ED8] border border-[#BFDBFE]">
                  <User className="h-3 w-3" />
                </div>
                <span className="font-medium text-slate-700">Male</span>
              </div>

              {/* Female */}
              <div className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FCE7F3] text-[#BE185D] border border-[#FBCFE8]">
                  <User className="h-3 w-3" />
                </div>
                <span className="font-medium text-slate-700">Female</span>
              </div>

              {/* Couple */}
              <div className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[#9333EA] border border-[#9333EA] text-[11px] font-bold">
                  <span>∞</span>
                </div>
                <span className="font-medium text-slate-700">Couple (∞)</span>
              </div>

              {/* Selected Person */}
              <div className="flex items-center gap-2.5">
                <div className="h-4 w-5 rounded border-2 border-[#2563EB] bg-blue-50/50 shrink-0" />
                <span className="font-medium text-slate-700">Selected Person</span>
              </div>

              {/* Deceased Member */}
              <div className="flex items-center gap-2.5">
                <div className="h-4 w-5 rounded border-2 border-dashed border-slate-400 bg-slate-100/70 shrink-0" />
                <span className="font-medium text-slate-700">Deceased</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
