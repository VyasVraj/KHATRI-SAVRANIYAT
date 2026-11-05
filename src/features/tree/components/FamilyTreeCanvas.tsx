/**
 * Component: FamilyTreeCanvas
 *
 * Interactive family tree visualization canvas powered by React Flow.
 *
 * ARCHITECTURAL REQUIREMENTS:
 * 1. PRIVACY & ACCESS CONTROL:
 *    - Gate 1: Renders only for authenticated users (authenticated privilege model).
 *    - Gate 2: RLS dual-endpoint visibility dictates graph nodes. No synthetic private placeholders.
 * 2. BOUNDED TRAVERSAL:
 *    - Displays bounding warning if generation BFS hit safety bounds (MAX_TREE_NODES / MAX_TREE_EDGES).
 * 3. DETERMINISTIC PRESENTATION:
 *    - Pure generation-tiered layout positioning nodes without layout jitter or external ELK/Dagre dependencies.
 * 4. RESPONSIVE & MOBILE-FRIENDLY:
 *    - Touch-enabled pan/zoom, responsive toolbar, collapsible legend, fitView on initial load.
 */

import React, { useCallback } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  type NodeTypes,
  type EdgeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Lock,
  Loader2,
  AlertCircle,
  Network,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useFamilyTree } from '../hooks/useFamilyTree'
import { useTreeLayout } from '../hooks/useTreeLayout'
import { PersonNode } from './PersonNode'
import { RelationshipEdge } from './RelationshipEdge'
import { TreeControls } from './TreeControls'
import { TreeLegend } from './TreeLegend'
import { TREE_NODE_WIDTH, TREE_NODE_HEIGHT } from '../types'

export interface FamilyTreeCanvasProps {
  /** Person UUID serving as the root focus of the family tree */
  rootPersonId: string
  /** Optional container class name */
  className?: string
}

/**
 * Static custom node and edge registration (module-scoped to prevent React Flow re-renders)
 */
const NODE_TYPES: NodeTypes = {
  person: PersonNode,
}

const EDGE_TYPES: EdgeTypes = {
  relationship: RelationshipEdge,
}

/**
 * Inner canvas component executing within ReactFlowProvider context.
 */
function CanvasInner({ rootPersonId, className }: FamilyTreeCanvasProps) {
  const { isAuthenticated } = useAuthContext()
  const { setCenter } = useReactFlow()

  const {
    data: treeGraph,
    isLoading,
    error,
  } = useFamilyTree(rootPersonId)

  const { nodes, edges } = useTreeLayout(treeGraph)

  // Recenter handler targeting the root person node
  const handleRecenterRoot = useCallback(() => {
    const rootNode = nodes.find((n) => n.data.isRoot)
    if (rootNode) {
      const centerX = rootNode.position.x + TREE_NODE_WIDTH / 2
      const centerY = rootNode.position.y + TREE_NODE_HEIGHT / 2
      setCenter(centerX, centerY, { zoom: 1, duration: 400 })
    }
  }, [nodes, setCenter])

  // Gate 1: Unauthenticated state
  if (!isAuthenticated) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center rounded-xl border border-border bg-muted/20 min-h-[450px]',
          className
        )}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3 text-muted-foreground">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          Sign In Required
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Genealogical family tree records are restricted to authenticated community members.
        </p>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-12 text-center rounded-xl border border-border bg-card min-h-[450px]',
          className
        )}
      >
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm font-medium text-foreground">
          Building genealogical graph...
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Traversing family relationships across generations
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center rounded-xl border border-destructive/30 bg-destructive/5 text-destructive min-h-[450px]',
          className
        )}
      >
        <AlertCircle className="w-8 h-8 mb-3" />
        <h3 className="text-base font-semibold">Unable to Load Family Tree</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-md">
          {(error as Error)?.message || 'An error occurred while building the tree.'}
        </p>
      </div>
    )
  }

  // Empty state (person has no visible relatives in census)
  if (nodes.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center rounded-xl border border-border bg-card min-h-[450px]',
          className
        )}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3 text-muted-foreground">
          <Network className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          No Family Connections Recorded
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          No visible family relationships found for this individual within the community census.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative w-full h-[600px] min-h-[500px] rounded-xl border border-border bg-slate-50/50 dark:bg-slate-950/40 overflow-hidden shadow-inner',
        className
      )}
      data-testid="family-tree-canvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={true}
        panOnScroll={false}
        panOnDrag={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          className="opacity-40"
        />

        {/* Bounded Traversal Safety Notice */}
        {treeGraph?.isBounded && (
          <Panel position="top-right" className="m-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs shadow-sm select-none">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Bounded view: Closest 100 relatives displayed for performance</span>
            </div>
          </Panel>
        )}

        <TreeControls onRecenterRoot={handleRecenterRoot} />
        <TreeLegend />
      </ReactFlow>
    </div>
  )
}

/**
 * Interactive genealogical tree visualizer centered on a specific person.
 *
 * Wraps canvas in ReactFlowProvider to ensure hook isolation.
 */
export const FamilyTreeCanvas: React.FC<FamilyTreeCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
