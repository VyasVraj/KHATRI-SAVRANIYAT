/**
 * Generation Layout — Pure deterministic branch-aware layout algorithm for
 * genealogical family trees.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. ZERO EXTERNAL LAYOUT DEPENDENCIES:
 *    Uses pure TypeScript geometry without Dagre or ELK bundle overhead.
 * 2. DETERMINISTIC GENERATIONAL Y-COORDINATES:
 *    Y = generation * (TREE_NODE_HEIGHT + TREE_VERTICAL_SPACING)
 *    Parents are strictly above children, spouses on same tier.
 * 3. HIERARCHICAL BRANCH POSITIONING:
 *    - Couples are placed adjacent horizontally with spouse connectors.
 *    - Sibling couples form distinct horizontal branches (e.g. Branch 1: Tushar + Maya, Branch 2: Jayesh + Jignasha).
 *    - Children are centered directly below their respective parents' branch.
 *    - Grandparents/ancestors are centered symmetrically above their descendant branches.
 * 4. PURE & TESTABLE:
 *    Does not touch DOM or SVG; runnable in node/Vitest with 100% determinism.
 */

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

/** Spacing between distinct family branches on the same generation tier */
export const TREE_BRANCH_SPACING = 120

/** Spacing between spouses within a couple */
export const TREE_COUPLE_SPACING = 50

interface ChildUnit {
  nodeIds: string[]
  isCouple: boolean
  width: number
}

interface FamilyBranch {
  coupleNodeIds: string[]
  childrenNodeIds: string[]
  childUnits: ChildUnit[]
  width: number
  x: number
}

/**
 * Computes deterministic (x, y) coordinates for all nodes in a TreeGraph,
 * positioning couples together and centering children under their parents' branch.
 */
export function computeTreeLayout(
  treeGraph: TreeGraph,
  savedPositions?: Record<string, { x: number; y: number }>
): TreeLayoutResult {
  const flowNodes: PersonFlowNode[] = []
  const flowEdges: RelationshipFlowEdge[] = []
  const nodePositionMap = new Map<string, { x: number; y: number }>()

  // Map spouses and parent-child connections across the graph
  const spouseMap = new Map<string, string>()
  const childrenMap = new Map<string, string[]>() // parentId -> childIds
  const parentMap = new Map<string, string[]>() // childId -> parentIds

  for (const edge of treeGraph.edges.values()) {
    if (edge.relationshipType === 'SPOUSE' || edge.isCouple) {
      spouseMap.set(edge.sourceId, edge.targetId)
      spouseMap.set(edge.targetId, edge.sourceId)
    } else if (edge.relationshipType === 'PARENT') {
      const childList = childrenMap.get(edge.sourceId) || []
      if (!childList.includes(edge.targetId)) {
        childList.push(edge.targetId)
        childrenMap.set(edge.sourceId, childList)
      }
      const parentList = parentMap.get(edge.targetId) || []
      if (!parentList.includes(edge.sourceId)) {
        parentList.push(edge.sourceId)
        parentMap.set(edge.targetId, parentList)
      }
    }
  }

  // Identify generation tiers present in the graph
  const sortedGenerations = Array.from(treeGraph.generations.keys()).sort((a, b) => a - b)
  const activeGenerations = sortedGenerations.filter(
    (g) => (treeGraph.generations.get(g)?.length || 0) > 0
  )

  // Check if we have a multi-tier genealogical tree with sibling branches
  // Tier mapping: Generation 0 = Grandparents/Root Ancestors, 1 = Parents/Branches, 2 = Children
  // 1. Group middle tier (tier 1 or tier with multiple couples/families) into branches
  const branches: FamilyBranch[] = []
  const assignedNodes = new Set<string>()

  // Find tier that has sibling branches or children
  const middleGen = activeGenerations.length >= 3 ? activeGenerations[1] : activeGenerations[0]
  const middleNodeIds = (treeGraph.generations.get(middleGen) || []).slice()

  // Sort middle generation nodes by birth date so elder sibling branches are on the left
  middleNodeIds.sort((aId, bId) => {
    const pA = treeGraph.nodes.get(aId)?.person
    const pB = treeGraph.nodes.get(bId)?.person
    const dobA = pA?.date_of_birth || (pA?.dob_year ? String(pA.dob_year) : '')
    const dobB = pB?.date_of_birth || (pB?.dob_year ? String(pB.dob_year) : '')
    if (dobA && dobB) {
      return dobA.localeCompare(dobB)
    }
    return 0
  })

  // Build branches for middle tier
  const processedInTier = new Set<string>()
  for (const id of middleNodeIds) {
    if (processedInTier.has(id)) continue

    const spouseId = spouseMap.get(id)
    const coupleIds = [id]
    processedInTier.add(id)

    if (spouseId && middleNodeIds.includes(spouseId)) {
      // Place male on left, female on right if gender known
      const p1 = treeGraph.nodes.get(id)?.person
      const p2 = treeGraph.nodes.get(spouseId)?.person
      if (p1?.gender === 'FEMALE' && p2?.gender === 'MALE') {
        coupleIds.unshift(spouseId)
      } else {
        coupleIds.push(spouseId)
      }
      processedInTier.add(spouseId)
    }

    // Find all children belonging to this couple
    const branchChildren = new Set<string>()
    for (const parentId of coupleIds) {
      for (const childId of childrenMap.get(parentId) || []) {
        branchChildren.add(childId)
      }
    }

    const childrenList = Array.from(branchChildren)
    // Sort children by birth date so elder child is on left, younger on right
    childrenList.sort((aId, bId) => {
      const pA = treeGraph.nodes.get(aId)?.person
      const pB = treeGraph.nodes.get(bId)?.person
      const dobA = pA?.date_of_birth || (pA?.dob_year ? String(pA.dob_year) : '')
      const dobB = pB?.date_of_birth || (pB?.dob_year ? String(pB.dob_year) : '')
      if (dobA && dobB) {
        return dobA.localeCompare(dobB)
      }
      return 0
    })
    const coupleWidth =
      coupleIds.length === 2
        ? 2 * TREE_NODE_WIDTH + TREE_COUPLE_SPACING
        : TREE_NODE_WIDTH

    // Group children into units (single child or child couple)
    const childUnits: ChildUnit[] = []
    const processedChildren = new Set<string>()

    for (const childId of childrenList) {
      if (processedChildren.has(childId)) continue
      const spId = spouseMap.get(childId)
      if (spId && treeGraph.nodes.has(spId) && !processedInTier.has(spId)) {
        const p1 = treeGraph.nodes.get(childId)?.person
        const p2 = treeGraph.nodes.get(spId)?.person
        const coupleNodeIds =
          p1?.gender === 'FEMALE' && p2?.gender === 'MALE'
            ? [spId, childId]
            : [childId, spId]
        childUnits.push({
          nodeIds: coupleNodeIds,
          isCouple: true,
          width: 2 * TREE_NODE_WIDTH + TREE_COUPLE_SPACING,
        })
        processedChildren.add(childId)
        processedChildren.add(spId)
      } else {
        childUnits.push({
          nodeIds: [childId],
          isCouple: false,
          width: TREE_NODE_WIDTH,
        })
        processedChildren.add(childId)
      }
    }

    const childrenWidth =
      childUnits.length > 0
        ? childUnits.reduce((sum, u) => sum + u.width, 0) +
          (childUnits.length - 1) * TREE_HORIZONTAL_SPACING
        : 0

    const branchWidth = Math.max(coupleWidth, childrenWidth)

    branches.push({
      coupleNodeIds: coupleIds,
      childrenNodeIds: childrenList,
      childUnits,
      width: branchWidth,
      x: 0,
    })
  }

  // If we have distinct branches in the middle generation
  if (branches.length > 0 && activeGenerations.length >= 2) {
    // Total width of all branches including branch spacing
    const totalBranchesWidth =
      branches.reduce((sum, b) => sum + b.width, 0) +
      (branches.length - 1) * TREE_BRANCH_SPACING

    let currentBranchX = -totalBranchesWidth / 2

    for (const branch of branches) {
      branch.x = currentBranchX + branch.width / 2

      // 1. Position couple members in middle generation
      const coupleWidth =
        branch.coupleNodeIds.length === 2
          ? 2 * TREE_NODE_WIDTH + TREE_COUPLE_SPACING
          : TREE_NODE_WIDTH
      const coupleStartX = branch.x - coupleWidth / 2
      const middleY = middleGen * (TREE_NODE_HEIGHT + TREE_VERTICAL_SPACING)

      branch.coupleNodeIds.forEach((nodeId, idx) => {
        const xPos =
          branch.coupleNodeIds.length === 2 && idx === 1
            ? coupleStartX + TREE_NODE_WIDTH + TREE_COUPLE_SPACING
            : coupleStartX
        nodePositionMap.set(nodeId, { x: Math.round(xPos), y: Math.round(middleY) })
        assignedNodes.add(nodeId)
      })

      // 2. Position children (and any child couples) directly under this branch
      const nextGen = middleGen + 1
      const nextY = nextGen * (TREE_NODE_HEIGHT + TREE_VERTICAL_SPACING)

      if (branch.childUnits.length > 0) {
        const totalChildrenWidth =
          branch.childUnits.reduce((sum, u) => sum + u.width, 0) +
          (branch.childUnits.length - 1) * TREE_HORIZONTAL_SPACING
        let currentChildX = branch.x - totalChildrenWidth / 2

        for (const unit of branch.childUnits) {
          if (unit.isCouple) {
            nodePositionMap.set(unit.nodeIds[0], {
              x: Math.round(currentChildX),
              y: Math.round(nextY),
            })
            nodePositionMap.set(unit.nodeIds[1], {
              x: Math.round(currentChildX + TREE_NODE_WIDTH + TREE_COUPLE_SPACING),
              y: Math.round(nextY),
            })
            assignedNodes.add(unit.nodeIds[0])
            assignedNodes.add(unit.nodeIds[1])
          } else {
            nodePositionMap.set(unit.nodeIds[0], {
              x: Math.round(currentChildX),
              y: Math.round(nextY),
            })
            assignedNodes.add(unit.nodeIds[0])
          }
          currentChildX += unit.width + TREE_HORIZONTAL_SPACING
        }
      }

      currentBranchX += branch.width + TREE_BRANCH_SPACING
    }

    // 3. Position top generation (Grandparents/Ancestors) centered above the branches
    const topGen = activeGenerations[0]
    if (topGen < middleGen) {
      const topNodeIds = treeGraph.generations.get(topGen) || []
      const topY = topGen * (TREE_NODE_HEIGHT + TREE_VERTICAL_SPACING)
      const topCenter = 0 // Centered between all branches

      const orderedTop: string[] = []
      const topRemaining = new Set(topNodeIds)
      for (const id of topNodeIds) {
        if (!topRemaining.has(id)) continue
        const spouseId = spouseMap.get(id)
        if (spouseId && topRemaining.has(spouseId)) {
          const p1 = treeGraph.nodes.get(id)?.person
          const p2 = treeGraph.nodes.get(spouseId)?.person
          if (p1?.gender === 'FEMALE' && p2?.gender === 'MALE') {
            orderedTop.push(spouseId, id)
          } else {
            orderedTop.push(id, spouseId)
          }
          topRemaining.delete(id)
          topRemaining.delete(spouseId)
        } else {
          orderedTop.push(id)
          topRemaining.delete(id)
        }
      }

      const topCoupleWidth =
        orderedTop.length === 2
          ? 2 * TREE_NODE_WIDTH + TREE_COUPLE_SPACING
          : orderedTop.length * TREE_NODE_WIDTH + (orderedTop.length - 1) * TREE_HORIZONTAL_SPACING
      const topStartX = topCenter - topCoupleWidth / 2

      orderedTop.forEach((nodeId, idx) => {
        const xPos =
          orderedTop.length === 2 && idx === 1
            ? topStartX + TREE_NODE_WIDTH + TREE_COUPLE_SPACING
            : topStartX + idx * (TREE_NODE_WIDTH + TREE_HORIZONTAL_SPACING)
        nodePositionMap.set(nodeId, { x: Math.round(xPos), y: Math.round(topY) })
        assignedNodes.add(nodeId)
      })
    }
  }

  // 4. Fallback for any remaining unassigned nodes in any tier
  for (const [gen, rawNodeIds] of treeGraph.generations.entries()) {
    const unassigned = rawNodeIds.filter((id) => !assignedNodes.has(id))
    if (unassigned.length === 0) continue

    const tierCount = unassigned.length
    const totalWidth =
      tierCount * TREE_NODE_WIDTH + (tierCount - 1) * TREE_HORIZONTAL_SPACING
    const defaultYPos = gen * (TREE_NODE_HEIGHT + TREE_VERTICAL_SPACING)
    const startX = -totalWidth / 2

    unassigned.forEach((id, index) => {
      const xPos = startX + index * (TREE_NODE_WIDTH + TREE_HORIZONTAL_SPACING)
      nodePositionMap.set(id, { x: Math.round(xPos), y: Math.round(defaultYPos) })
      assignedNodes.add(id)
    })
  }

  let minX = 0
  let maxX = 0
  let minY = 0
  let maxY = 0
  let isFirstNode = true

  // 5. Build React Flow nodes using computed or saved positions
  for (const node of treeGraph.nodes.values()) {
    const pos = nodePositionMap.get(node.id) || { x: 0, y: 0 }
    let finalX = pos.x
    let finalY = pos.y

    if (savedPositions && savedPositions[node.id]) {
      finalX = savedPositions[node.id].x
      finalY = savedPositions[node.id].y
    }

    const finalPos = { x: Math.round(finalX), y: Math.round(finalY) }
    nodePositionMap.set(node.id, finalPos)

    if (isFirstNode) {
      minX = finalX
      maxX = finalX + TREE_NODE_WIDTH
      minY = finalY
      maxY = finalY + TREE_NODE_HEIGHT
      isFirstNode = false
    } else {
      minX = Math.min(minX, finalX)
      maxX = Math.max(maxX, finalX + TREE_NODE_WIDTH)
      minY = Math.min(minY, finalY)
      maxY = Math.max(maxY, finalY + TREE_NODE_HEIGHT)
    }

    flowNodes.push({
      id: node.id,
      type: 'person',
      position: finalPos,
      data: {
        person: node.person,
        generation: node.generation,
        isRoot: node.isRoot,
        rolesInTree: Array.from(node.rolesInTree),
        isHead: node.isHead,
        relationshipLabel: node.relationshipLabel,
        age: node.age,
        parentsNames: node.parentsNames,
        siblingsNames: node.siblingsNames,
      },
    })
  }

  // 6. Convert edges to React Flow representation with clean orthogonal handles
  for (const edge of treeGraph.edges.values()) {
    const isSpouse = edge.relationshipType === 'SPOUSE' || Boolean(edge.isCouple)
    const sourcePos = nodePositionMap.get(edge.sourceId)
    const targetPos = nodePositionMap.get(edge.targetId)

    let sourceHandle = 'source-bottom'
    let targetHandle = 'target-top'

    if (sourcePos && targetPos) {
      const isSameTier = Math.abs(sourcePos.y - targetPos.y) < 60
      if (isSameTier || isSpouse) {
        // Horizontal connection along the same generation tier
        if (sourcePos.x <= targetPos.x) {
          sourceHandle = 'source-right'
          targetHandle = 'target-left'
        } else {
          sourceHandle = 'source-left'
          targetHandle = 'target-right'
        }
      } else if (targetPos.y < sourcePos.y) {
        // Target is in an upper generation tier
        sourceHandle = 'source-top'
        targetHandle = 'target-bottom'
      } else {
        // Target is in a lower generation tier (Parent to Child)
        sourceHandle = 'source-bottom'
        targetHandle = 'target-top'
      }
    } else if (isSpouse) {
      sourceHandle = 'source-right'
      targetHandle = 'target-left'
    }

    flowEdges.push({
      id: edge.id,
      type: 'relationship',
      source: edge.sourceId,
      target: edge.targetId,
      sourceHandle,
      targetHandle,
      markerEnd: undefined,
      data: {
        relationshipType: edge.relationshipType,
        notes: edge.relationship.notes,
        label: edge.label,
        color: edge.color,
        isDashed: edge.isDashed,
        isCouple: edge.isCouple || isSpouse,
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
