/**
 * Hook: useTreeLayout
 *
 * Computes deterministic generation-tiered positions for nodes and edges
 * from an in-memory TreeGraph.
 *
 * Uses pure memoization to prevent canvas jitter or unnecessary recalculation
 * during zoom/pan interactions.
 */

import { useMemo } from 'react'
import { computeTreeLayout } from '../utils/generation-layout'
import type { TreeGraph, TreeLayoutResult } from '../types'

const EMPTY_LAYOUT: TreeLayoutResult = {
  nodes: [],
  edges: [],
  bounds: {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    width: 0,
    height: 0,
  },
}

/**
 * Computes memoized React Flow nodes, edges, and bounding box for a given TreeGraph.
 *
 * @param treeGraph - The domain TreeGraph, or null/undefined if loading/empty
 * @returns React Flow layout representation with positions and geometry bounds
 */
export function useTreeLayout(treeGraph?: TreeGraph | null): TreeLayoutResult {
  return useMemo(() => {
    if (!treeGraph) {
      return EMPTY_LAYOUT
    }
    return computeTreeLayout(treeGraph)
  }, [treeGraph])
}
