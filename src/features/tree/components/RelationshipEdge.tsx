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
  getBezierPath,
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

    // For horizontal couple connections, use smooth step path
    // For vertical parent-child and sibling connections, use smooth step / bezier
    const [edgePath, labelX, labelY] = isCouple
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          borderRadius: 8,
        })
      : getBezierPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
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
                <span className="leading-none text-[13px]">⚭</span>
              </div>
            ) : label ? (
              // Pill label along connection line
              <span
                style={{
                  backgroundColor: strokeColor,
                }}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm tracking-wide"
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
