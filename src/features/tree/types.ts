/**
 * Feature Types: Family Tree Domain
 *
 * Core domain graph types, layout contracts, and React Flow adapter types
 * for genealogical visualization.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. PERSON != USER:
 *    Tree nodes represent human census entities (public.persons), not auth.users accounts.
 * 2. FOUR-TIER SEPARATION:
 *    Database Rows -> Domain Graph (TreeGraph) -> Layout Model -> React Flow Canvas.
 * 3. ZERO SYNTHETIC PLACEHOLDERS:
 *    Tree nodes exist ONLY if the person is RLS-visible. Hidden edges terminate at the boundary.
 */

import type { Node, Edge } from 'reactflow'
import type {
  PersonSummary,
  RelationshipRow,
  RelationshipType,
} from '@/features/relationships/types'

// ---------------------------------------------------------------------------
// Safety Bounds & Geometry Constants
// ---------------------------------------------------------------------------

/** Maximum generation depth in either direction from root (-2 to +2) */
export const MAX_GENERATION_DISTANCE = 2

/** Hard safety limit on total persons in a single tree view */
export const MAX_TREE_NODES = 100

/** Hard safety limit on total relationship edges in a single tree view */
export const MAX_TREE_EDGES = 150

/** Visual node dimensions (px) */
export const TREE_NODE_WIDTH = 220
export const TREE_NODE_HEIGHT = 90

/** Spacing between nodes (px) */
export const TREE_HORIZONTAL_SPACING = 50
export const TREE_VERTICAL_SPACING = 130

// ---------------------------------------------------------------------------
// Domain Graph Models
// ---------------------------------------------------------------------------

/** Genealogical roles relative to the root person within the visualized tree */
export type TreeRole = 'ROOT' | 'PARENT' | 'CHILD' | 'SPOUSE' | 'SIBLING'

/**
 * Domain tree node representing a census person positioned in the genealogical graph.
 * Pure business model completely decoupled from React Flow or DOM coordinates.
 */
export interface TreeNode {
  /** Person UUID */
  id: string
  /** Person census profile metadata (public/community authorized fields only) */
  person: PersonSummary
  /**
   * Generation tier relative to root person:
   *  0 = Root person, spouses, and siblings
   * -1 = Parents
   * -2 = Grandparents
   * +1 = Children
   * +2 = Grandchildren
   */
  generation: number
  /** True if this person is the root person requested for visualization */
  isRoot: boolean
  /** Set of roles this person holds in the current tree view */
  rolesInTree: Set<TreeRole>
}

/**
 * Domain tree edge representing a verified or asserted relationship between two nodes.
 */
export interface TreeEdge {
  /** Unique edge ID (corresponds to relationship.id) */
  id: string
  /** Source relationship UUID */
  relationshipId: string
  /** Canonical relationship type */
  relationshipType: RelationshipType
  /** Source person ID (For PARENT: parent. For SPOUSE/SIBLING: person_a_id) */
  sourceId: string
  /** Target person ID (For PARENT: child. For SPOUSE/SIBLING: person_b_id) */
  targetId: string
  /** Underlying relationship record */
  relationship: RelationshipRow
}

/**
 * Complete in-memory domain graph representation centered on a root person.
 */
export interface TreeGraph {
  /** Target root person UUID */
  rootPersonId: string
  /** Map of person UUID -> TreeNode */
  nodes: Map<string, TreeNode>
  /** Map of relationship UUID -> TreeEdge */
  edges: Map<string, TreeEdge>
  /** Map of generation number (-2..+2) -> ordered list of person UUIDs */
  generations: Map<number, string[]>
  /** True if traversal hit MAX_TREE_NODES or MAX_TREE_EDGES safety bounds */
  isBounded: boolean
}

// ---------------------------------------------------------------------------
// React Flow Presentation Models
// ---------------------------------------------------------------------------

/** Data payload injected into custom React Flow PersonNode */
export interface PersonNodeData {
  person: PersonSummary
  generation: number
  isRoot: boolean
  rolesInTree: TreeRole[]
}

/** Data payload injected into custom React Flow RelationshipEdge */
export interface RelationshipEdgeData {
  relationshipType: RelationshipType
  notes?: string | null
}

/** React Flow node typed for PersonNodeData */
export type PersonFlowNode = Node<PersonNodeData>

/** React Flow edge typed for RelationshipEdgeData */
export type RelationshipFlowEdge = Edge<RelationshipEdgeData>

/** Result of the deterministic generation layout computation */
export interface TreeLayoutResult {
  nodes: PersonFlowNode[]
  edges: RelationshipFlowEdge[]
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    width: number
    height: number
  }
}
