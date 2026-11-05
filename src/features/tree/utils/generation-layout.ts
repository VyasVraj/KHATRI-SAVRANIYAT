/**
 * Generation Layout — Pure deterministic custom layout algorithm for
 * genealogical family trees.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. ZERO EXTERNAL LAYOUT DEPENDENCIES:
 *    Uses pure TypeScript geometry without Dagre or ELK bundle overhead.
 * 2. DETERMINISTIC GENERATIONAL Y-COORDINATES:
 *    Y = generation * (TREE_NODE_HEIGHT + TREE_VERTICAL_SPACING)
 *    Parents are strictly above root (-Y), children below (+Y), spouses/siblings on same tier.
 * 3. SYMMETRIC CENTERING:
 *    Each generation tier is horizontally centered relative to the X=0 origin.
 * 4. PURE & TESTABLE:
 *    Does not touch DOM or SVG; runnable in node/Vitest with 100% determinism.
 */

import { MarkerType } from 'reactflow'
import {
  TREE_NODE_WIDTH,
  TREE_NODE_HEIGHT,
  TREE_HORIZONTAL_SPACING,
  TREE_VERTICAL_SPACING,
  type TreeGraph,
  type TreeLayoutResult,
  type PersonFlowNode,
  type RelationshipFlowEdge,
} from '../types'

/**
 * Computes deterministic (x, y) coordinates for all nodes in a TreeGraph,
 * returning React Flow compatible nodes, edges, and canvas bounding boxes.
 *
 * @param treeGraph - The domain TreeGraph model
 */
export function computeTreeLayout(treeGraph: TreeGraph): TreeLayoutResult {
  const flowNodes: PersonFlowNode[] = []
  const flowEdges: RelationshipFlowEdge[] = []

  let minX = 0
  let maxX = 0
  let minY = 0
  let maxY = 0

  let isFirstNode = true

  // 1. Position nodes by generation tier
  for (const [gen, nodeIds] of treeGraph.generations.entries()) {
    if (nodeIds.length === 0) continue

    const tierCount = nodeIds.length
    const totalTierWidth =
      tierCount * TREE_NODE_WIDTH + (tierCount - 1) * TREE_HORIZONTAL_SPACING

    // Y coordinate is locked by generation level
    const yPos = gen * (TREE_NODE_HEIGHT + TREE_VERTICAL_SPACING)

    // Center the tier around X = 0
    const startX = -totalTierWidth / 2

    nodeIds.forEach((id, index) => {
      const treeNode = treeGraph.nodes.get(id)
      if (!treeNode) return

      const xPos = startX + index * (TREE_NODE_WIDTH + TREE_HORIZONTAL_SPACING)

      // Update bounding box
      if (isFirstNode) {
        minX = xPos
        maxX = xPos + TREE_NODE_WIDTH
        minY = yPos
        maxY = yPos + TREE_NODE_HEIGHT
        isFirstNode = false
      } else {
        minX = Math.min(minX, xPos)
        maxX = Math.max(maxX, xPos + TREE_NODE_WIDTH)
        minY = Math.min(minY, yPos)
        maxY = Math.max(maxY, yPos + TREE_NODE_HEIGHT)
      }

      flowNodes.push({
        id: treeNode.id,
        type: 'person',
        position: {
          x: Math.round(xPos),
          y: Math.round(yPos),
        },
        data: {
          person: treeNode.person,
          generation: treeNode.generation,
          isRoot: treeNode.isRoot,
          rolesInTree: Array.from(treeNode.rolesInTree),
        },
      })
    })
  }

  // 2. Convert edges to React Flow representation
  for (const edge of treeGraph.edges.values()) {
    flowEdges.push({
      id: edge.id,
      type: 'relationship',
      source: edge.sourceId,
      target: edge.targetId,
      markerEnd:
        edge.relationshipType === 'PARENT'
          ? {
              type: MarkerType.ArrowClosed,
              color: '#3b82f6',
              width: 14,
              height: 14,
            }
          : undefined,
      data: {
        relationshipType: edge.relationshipType,
        notes: edge.relationship.notes,
      },
    })
  }

  const width = isFirstNode ? 0 : maxX - minX
  const height = isFirstNode ? 0 : maxY - minY

  return {
    nodes: flowNodes,
    edges: flowEdges,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width,
      height,
    },
  }
}
