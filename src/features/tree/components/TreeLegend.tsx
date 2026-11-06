/**
 * Component: TreeLegend
 *
 * Left-side floating legend matching the reference design layout:
 * - Spouse (purple line)
 * - Parent - Child (blue line)
 * - Siblings (blue dashed line)
 * - Head of Family (gold crown badge)
 * - Male (blue circle/icon)
 * - Female (pink circle/icon)
 * - Couple (interlocking rings)
 * - Selected Person (highlighted border)
 */

import React from 'react'
import { Panel } from 'reactflow'
import { Crown, User } from 'lucide-react'

export const TreeLegend: React.FC = () => {
  return (
    <Panel position="top-left" className="m-4">
      <div
        role="region"
        aria-label="Relationship Legend"
        className="w-48 rounded-2xl border border-[#DCE3EF] bg-white p-4 shadow-sm select-none"
      >
        <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#101828]">
          Relationship Legend
        </h4>

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
              <span>⚭</span>
            </div>
            <span className="font-medium text-slate-700">Couple</span>
          </div>

          {/* Selected Person */}
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-5 rounded border-2 border-[#2563EB] bg-blue-50/50 shrink-0" />
            <span className="font-medium text-slate-700">Selected Person</span>
          </div>
        </div>
      </div>
    </Panel>
  )
}
