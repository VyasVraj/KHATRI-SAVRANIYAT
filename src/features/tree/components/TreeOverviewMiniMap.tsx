/**
 * Component: TreeOverviewMiniMap
 *
 * Bottom-left floating overview panel matching the reference design layout:
 * - Title: Tree Overview with popout icon
 * - Miniature interactive view of the tree nodes and branches
 * - Solid node colors indicating gender and Head of Family
 */

import React from 'react'
import { Panel, MiniMap, type Node } from 'reactflow'
import { ExternalLink } from 'lucide-react'
import type { PersonNodeData } from '../types'

export const TreeOverviewMiniMap: React.FC = () => {
  const nodeColor = (node: Node<PersonNodeData>): string => {
    if (node.data?.isHead) return '#FDE68A' // Gold/yellow for head
    if (node.data?.person?.gender === 'FEMALE') return '#F472B6' // Pink for female
    return '#60A5FA' // Blue for male
  }

  return (
    <Panel position="bottom-left" className="m-4">
      <div
        role="region"
        aria-label="Tree Overview"
        className="w-48 rounded-2xl border border-[#DCE3EF] bg-white p-3 shadow-sm select-none"
      >
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#101828]">
            Tree Overview
          </h4>
          <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        </div>

        <div className="h-28 w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
          <MiniMap
            nodeColor={nodeColor}
            nodeStrokeWidth={2}
            nodeBorderRadius={6}
            maskColor="rgba(241, 245, 249, 0.6)"
            className="!m-0 !w-full !h-full !border-none !bg-transparent"
          />
        </div>
      </div>
    </Panel>
  )
}
