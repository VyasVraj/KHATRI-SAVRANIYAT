/**
 * Unit tests: Generation Layout Engine
 * (src/features/tree/utils/generation-layout.ts)
 *
 * Verifies deterministic generation-tiered coordinate calculation,
 * horizontal centering, edge marker configuration, and bounding box geometry.
 */

import { describe, it, expect } from 'vitest'
import { computeTreeLayout } from '@/features/tree/utils/generation-layout'
import {
  TREE_NODE_WIDTH,
  TREE_NODE_HEIGHT,
  TREE_VERTICAL_SPACING,
  TREE_HORIZONTAL_SPACING,
  type TreeGraph,
  type TreeNode,
  type TreeEdge,
} from '@/features/tree/types'
import type { PersonSummary, RelationshipRow } from '@/features/relationships/types'
import { MarkerType } from 'reactflow'

function makePersonSummary(id: string): PersonSummary {
  return {
    id,
    first_name: `Name-${id}`,
    middle_name: null,
    last_name: 'Test',
    gender: 'MALE',
    date_of_birth: '1990-01-01',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE',
  }
}

function makeRelRow(id: string, a: string, b: string, type: 'PARENT' | 'SPOUSE' | 'SIBLING'): RelationshipRow {
  return {
    id,
    person_a_id: a,
    person_b_id: b,
    relationship_type: type,
    notes: null,
    verification_status: 'UNVERIFIED',
    created_by: 'user-1',
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: null,
  }
}

function createMockGraph(config: {
  rootId: string
  nodes: { id: string; generation: number; isRoot?: boolean }[]
  edges: { id: string; source: string; target: string; type: 'PARENT' | 'SPOUSE' | 'SIBLING' }[]
}): TreeGraph {
  const nodeMap = new Map<string, TreeNode>()
  const edgeMap = new Map<string, TreeEdge>()
  const genMap = new Map<number, string[]>()

  for (let g = -2; g <= 2; g++) {
    genMap.set(g, [])
  }

  for (const n of config.nodes) {
    nodeMap.set(n.id, {
      id: n.id,
      person: makePersonSummary(n.id),
      generation: n.generation,
      isRoot: Boolean(n.isRoot),
      rolesInTree: new Set(n.isRoot ? ['ROOT'] : ['PARENT']),
    })
    genMap.get(n.generation)?.push(n.id)
  }

  for (const e of config.edges) {
    edgeMap.set(e.id, {
      id: e.id,
      relationshipId: e.id,
      relationshipType: e.type,
      sourceId: e.source,
      targetId: e.target,
      relationship: makeRelRow(e.id, e.source, e.target, e.type),
    })
  }

  return {
    rootPersonId: config.rootId,
    nodes: nodeMap,
    edges: edgeMap,
    generations: genMap,
    isBounded: false,
  }
}

describe('Generation Layout Engine', () => {
  it('returns empty nodes, edges, and zero bounds for empty graph', () => {
    const emptyGraph = createMockGraph({ rootId: 'none', nodes: [], edges: [] })
    const result = computeTreeLayout(emptyGraph)

    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.bounds).toEqual({
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0,
    })
  })

  it('calculates deterministic generational Y coordinates', () => {
    const tierSpacing = TREE_NODE_HEIGHT + TREE_VERTICAL_SPACING // 90 + 130 = 220
    const graph = createMockGraph({
      rootId: 'root',
      nodes: [
        { id: 'gparent', generation: -2 },
        { id: 'parent', generation: -1 },
        { id: 'root', generation: 0, isRoot: true },
        { id: 'child', generation: 1 },
        { id: 'gchild', generation: 2 },
      ],
      edges: [],
    })

    const result = computeTreeLayout(graph)

    const getNode = (id: string) => result.nodes.find((n) => n.id === id)

    expect(getNode('gparent')?.position.y).toBe(-2 * tierSpacing) // -440
    expect(getNode('parent')?.position.y).toBe(-1 * tierSpacing)  // -220
    expect(getNode('root')?.position.y).toBe(0)                    // 0
    expect(getNode('child')?.position.y).toBe(1 * tierSpacing)   // 220
    expect(getNode('gchild')?.position.y).toBe(2 * tierSpacing)  // 440
  })

  it('centers single-node tiers symmetrically at -WIDTH / 2', () => {
    const graph = createMockGraph({
      rootId: 'root',
      nodes: [{ id: 'root', generation: 0, isRoot: true }],
      edges: [],
    })

    const result = computeTreeLayout(graph)
    const rootNode = result.nodes[0]

    expect(rootNode.position.x).toBe(-TREE_NODE_WIDTH / 2) // -110
    expect(rootNode.position.y).toBe(0)
  })

  it('centers multi-node tiers symmetrically around origin', () => {
    const graph = createMockGraph({
      rootId: 'root',
      nodes: [
        { id: 'root', generation: 0, isRoot: true },
        { id: 'spouse', generation: 0 },
      ],
      edges: [],
    })

    const result = computeTreeLayout(graph)
    const totalWidth = 2 * TREE_NODE_WIDTH + TREE_HORIZONTAL_SPACING // 2*220 + 50 = 490
    const startX = -totalWidth / 2 // -245

    const n1 = result.nodes.find((n) => n.id === 'root')
    const n2 = result.nodes.find((n) => n.id === 'spouse')

    expect(n1?.position.x).toBe(startX)
    expect(n2?.position.x).toBe(startX + TREE_NODE_WIDTH + TREE_HORIZONTAL_SPACING)
  })

  it('attaches directional MarkerType.ArrowClosed only to PARENT edges', () => {
    const graph = createMockGraph({
      rootId: 'root',
      nodes: [
        { id: 'root', generation: 0, isRoot: true },
        { id: 'parent', generation: -1 },
        { id: 'spouse', generation: 0 },
        { id: 'sibling', generation: 0 },
      ],
      edges: [
        { id: 'e-parent', source: 'parent', target: 'root', type: 'PARENT' },
        { id: 'e-spouse', source: 'root', target: 'spouse', type: 'SPOUSE' },
        { id: 'e-sibling', source: 'root', target: 'sibling', type: 'SIBLING' },
      ],
    })

    const result = computeTreeLayout(graph)

    const parentEdge = result.edges.find((e) => e.id === 'e-parent')
    const spouseEdge = result.edges.find((e) => e.id === 'e-spouse')
    const siblingEdge = result.edges.find((e) => e.id === 'e-sibling')

    expect(parentEdge?.markerEnd).toEqual({
      type: MarkerType.ArrowClosed,
      color: '#3b82f6',
      width: 14,
      height: 14,
    })
    expect(spouseEdge?.markerEnd).toBeUndefined()
    expect(siblingEdge?.markerEnd).toBeUndefined()
  })

  it('is 100% deterministic across multiple executions', () => {
    const graph = createMockGraph({
      rootId: 'root',
      nodes: [
        { id: 'parent-1', generation: -1 },
        { id: 'parent-2', generation: -1 },
        { id: 'root', generation: 0, isRoot: true },
        { id: 'child-1', generation: 1 },
      ],
      edges: [
        { id: 'e-1', source: 'parent-1', target: 'root', type: 'PARENT' },
        { id: 'e-2', source: 'parent-2', target: 'root', type: 'PARENT' },
        { id: 'e-3', source: 'root', target: 'child-1', type: 'PARENT' },
      ],
    })

    const run1 = computeTreeLayout(graph)
    const run2 = computeTreeLayout(graph)

    expect(run1).toEqual(run2)
  })
})
