/**
 * Component: RelationshipEdge
 *
 * Custom React Flow edge rendering interpersonal connections between census persons,
 * matching the reference design layout:
 * - Spouse: Horizontal purple line with interlocking couple rings (⚭).
 * - Parent: Solid blue (Father) or pink (Mother) curve with pill label.
 * - Sibling / Descendant: Dashed blue line with relationship pill label ('Son', 'Brother', 'Other').
 */

import React, { memo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  EdgeLabelRenderer,
  type EdgeProps,
} from 'reactflow'
import type { RelationshipEdgeData } from '../types'

export const RelationshipEdge: React.FC<EdgeProps<RelationshipEdgeData>> = memo(
  function RelationshipEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    data,
  }) {
    const isCouple = Boolean(data?.isCouple || data?.relationshipType === 'SPOUSE')
    const isDashed = Boolean(data?.isDashed)
    const label = data?.label
    const customColor = data?.color

    // Use smooth step orthogonal path with rounded corners for both couple and parent/child
    // to prevent diagonal crossing lines from slicing through cards
    const [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: isCouple ? 8 : 16,
    })

    const strokeColor = customColor || (isCouple ? '#9333EA' : '#2563EB')
    const strokeDasharray = isDashed ? '5 5' : undefined
    const strokeWidth = 2

    const edgeStyle: React.CSSProperties = {
      ...style,
      stroke: strokeColor,
      strokeWidth,
      strokeDasharray,
      opacity: 0.95,
    }

    return (
      <>
        <BaseEdge id={id} path={edgePath} style={edgeStyle} />

        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan select-none"
          >
            {isCouple ? (
              // Couple interlocking rings icon
              <div
                title="Spouse / Couple"
                aria-label="Couple connection"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white border-2 border-[#9333EA] shadow-sm text-[#9333EA] text-xs font-bold transition-transform hover:scale-110"
              >
                <span className="leading-none text-[13px] font-bold">∞</span>
              </div>
            ) : label ? (
              // Pill label along connection line with white halo border to avoid overlapping clashes
              <span
                style={{
                  backgroundColor: strokeColor,
                }}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold text-white shadow-md border-2 border-white ring-1 ring-black/10 tracking-wide"
              >
                {label}
              </span>
            ) : null}
          </div>
        </EdgeLabelRenderer>
      </>
    )
  }
)
