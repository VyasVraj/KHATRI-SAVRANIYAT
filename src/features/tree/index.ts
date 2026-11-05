/**
 * Public API: Family Tree Feature
 *
 * Genealogical graph traversal, deterministic generation-tiered layout,
 * and React Flow visualization canvas.
 */

// Domain Types and Constants
export * from './types'

// Pure Graph & Layout Algorithms
export { buildTreeGraph } from './utils/graph-builder'
export { computeTreeLayout } from './utils/generation-layout'

// Traversal Services
export { fetchFamilyTreeGraph } from './services/tree.service'

// React Query & Layout Hooks
export { useFamilyTree, treeQueryKeys } from './hooks/useFamilyTree'
export { useTreeLayout } from './hooks/useTreeLayout'

// Presentation Components
export { FamilyTreeCanvas, type FamilyTreeCanvasProps } from './components/FamilyTreeCanvas'
export { FamilyTreePage } from './pages/FamilyTreePage'
export { PersonNode } from './components/PersonNode'
export { RelationshipEdge } from './components/RelationshipEdge'
export { TreeControls } from './components/TreeControls'
export { TreeLegend } from './components/TreeLegend'
