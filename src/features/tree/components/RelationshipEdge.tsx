/**
 * Component: RelationshipEdge
 *
 * Custom React Flow edge rendering interpersonal connections between census persons.
 *
 * VISUAL CONTRACT:
 * 1. PARENT:
 *    Solid blue stroke with directional arrow marker (pointing from parent to child).
 * 2. SPOUSE:
 *    Dashed rose/pink stroke, symmetric connection (no arrow marker).
 * 3. SIBLING:
 *    Dotted teal/emerald stroke, symmetric fraternal connection (no arrow marker).
 */

import React, { memo } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from 'reactflow'
import type { RelationshipEdgeData } from '../types'

/**
 * Custom edge component for React Flow tree visualization.
 */
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
    markerEnd,
    data,
  }) {
    const [edgePath] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 8,
    })

    const type = data?.relationshipType ?? 'PARENT'

    // Configure visual appearance based on canonical relationship type
    let strokeColor = '#3b82f6' // Blue for PARENT
    let strokeDasharray: string | undefined = undefined
    let strokeWidth = 2

    if (type === 'SPOUSE') {
      strokeColor = '#e11d48' // Rose for SPOUSE
      strokeDasharray = '5 5'
      strokeWidth = 2
    } else if (type === 'SIBLING') {
      strokeColor = '#0d9488' // Teal for SIBLING
      strokeDasharray = '3 3'
      strokeWidth = 1.5
    }

    const edgeStyle: React.CSSProperties = {
      ...style,
      stroke: strokeColor,
      strokeWidth,
      strokeDasharray,
      opacity: 0.85,
    }

    return (
      <BaseEdge
        id={id}
        path={edgePath}
        style={edgeStyle}
        markerEnd={type === 'PARENT' ? markerEnd : undefined}
      />
    )
  }
)
