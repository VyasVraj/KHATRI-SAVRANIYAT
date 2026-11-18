/**
 * Component: FamilyTreeCanvas
 *
 * Interactive family tree visualization canvas powered by React Flow,
 * strictly matching the reference design layout without gradients:
 * - Central canvas displaying the family hierarchy
 * - Left floating Relationship Legend
 * - Right floating Selected Person Panel
 * - Bottom-left floating Tree Overview (MiniMap)
 * - Bottom-right floating zoom and fullscreen controls
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  type Node,
  type NodeTypes,
  type EdgeTypes,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Lock,
  Loader2,
  AlertCircle,
  Network,
  Save,
  RotateCcw,
  Crosshair,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useFamilyTree } from '../hooks/useFamilyTree'
import { useTreeLayout } from '../hooks/useTreeLayout'
import {
  getFamilyTreeLayout,
  saveFamilyTreeLayout,
  resetFamilyTreeLayout,
} from '../services/tree.service'
import { PersonNode } from './PersonNode'
import { RelationshipEdge } from './RelationshipEdge'
import { TreeControls } from './TreeControls'
import { TreeLegend } from './TreeLegend'
import { TreeOverviewMiniMap } from './TreeOverviewMiniMap'
import { SelectedPersonPanel } from './SelectedPersonPanel'
import type { TreeGraph, TreeNode } from '../types'

export interface FamilyTreeCanvasProps {
  /** Person UUID serving as the root focus of the family tree */
  rootPersonId: string
  /** Optional family UUID to scope the full family roster */
  familyId?: string
  /** Optional container class name */
  className?: string
  /** Controlled selected person UUID */
  selectedPersonId?: string | null
  /** Callback when selection changes */
  onSelectPerson?: (personId: string | null) => void
  /** Trigger to re-fit view */
  fitTrigger?: number
  /** Collapse state */
  isCollapsed?: boolean
  /** Callback to notify parent of loaded tree graph */
  onTreeLoaded?: (treeGraph: TreeGraph) => void
}

const NODE_TYPES: NodeTypes = {
  person: PersonNode,
}

const EDGE_TYPES: EdgeTypes = {
  relationship: RelationshipEdge,
}

function CanvasInner({
  rootPersonId,
  familyId,
  className,
  selectedPersonId: propSelectedPersonId,
  onSelectPerson: propOnSelectPerson,
  fitTrigger,
  isCollapsed,
  onTreeLoaded,
}: FamilyTreeCanvasProps) {
  const { isAuthenticated } = useAuthContext()
  const { fitView } = useReactFlow()
  const containerRef = useRef<HTMLDivElement>(null)

  // Default to null so the right-side detail panel is closed on initial load and does not obscure cards
  const [internalSelectedPersonId, setInternalSelectedPersonId] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Interactive repositioning and persistence state
  const [savedPositions, setSavedPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSavingLayout, setIsSavingLayout] = useState(false)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)

  const activeSelectedPersonId =
    propSelectedPersonId !== undefined ? propSelectedPersonId : internalSelectedPersonId

  const handleSelectPerson = useCallback(
    (personId: string | null) => {
      setInternalSelectedPersonId(personId)
      if (propOnSelectPerson) {
        propOnSelectPerson(personId)
      }
    },
    [propOnSelectPerson]
  )

  const {
    data: treeGraph,
    isLoading,
    error,
  } = useFamilyTree(rootPersonId, familyId)

  // Notify parent of loaded graph
  useEffect(() => {
    if (treeGraph && onTreeLoaded) {
      onTreeLoaded(treeGraph)
    }
  }, [treeGraph, onTreeLoaded])

  // Hydrate saved positions from Supabase & localStorage on mount/family change
  useEffect(() => {
    let isMounted = true
    if (familyId) {
      getFamilyTreeLayout(familyId).then((positions) => {
        if (isMounted && Object.keys(positions).length > 0) {
          setSavedPositions(positions)
        }
      })
    }
    return () => {
      isMounted = false
    }
  }, [familyId])

  // Filter treeGraph if collapsed: keep only generation -1 and 0, or immediate branches
  const activeTreeGraph = useMemo(() => {
    if (!treeGraph) return null
    if (!isCollapsed) return treeGraph

    // Filtered treeGraph: keep generations -1, 0, and direct children only
    const filteredNodes = new Map<string, TreeNode>()
    for (const [id, node] of treeGraph.nodes.entries()) {
      if (node.generation <= 0 || node.isRoot || node.isHead) {
        filteredNodes.set(id, node)
      }
    }

    const filteredGenerations = new Map<number, string[]>()
    for (const [gen, ids] of treeGraph.generations.entries()) {
      if (gen <= 0) {
        filteredGenerations.set(gen, ids.filter((id) => filteredNodes.has(id)))
      }
    }

    return {
      ...treeGraph,
      nodes: filteredNodes,
      generations: filteredGenerations,
    }
  }, [treeGraph, isCollapsed])

  const { nodes: rawNodes, edges } = useTreeLayout(activeTreeGraph, savedPositions)

  const initialNodes = useMemo(() => {
    return rawNodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        isSelected: n.id === activeSelectedPersonId,
        onSelect: handleSelectPerson,
      },
    }))
  }, [rawNodes, activeSelectedPersonId, handleSelectPerson])

  // Controlled nodes state for smooth dragging and repositioning
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)

  // Keep nodes synchronized with layout and selection
  useEffect(() => {
    setNodes(initialNodes)
  }, [initialNodes, setNodes])

  // Capture drag events and update coordinates immediately
  const handleNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const newPos = {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y),
      }
      setSavedPositions((prev) => {
        const updated = {
          ...prev,
          [node.id]: newPos,
        }
        if (familyId) {
          try {
            localStorage.setItem(`khatri_tree_layout_${familyId}`, JSON.stringify(updated))
          } catch {
            // ignore localStorage quota errors
          }
        }
        return updated
      })
      setHasUnsavedChanges(true)
    },
    [familyId]
  )

  // Save layout to database
  const handleSaveLayout = useCallback(async () => {
    if (!familyId) return
    setIsSavingLayout(true)
    try {
      await saveFamilyTreeLayout(familyId, savedPositions)
      setHasUnsavedChanges(false)
      setFeedbackMessage('Tree positions saved successfully!')
      setTimeout(() => setFeedbackMessage(null), 3000)
    } catch {
      setFeedbackMessage('Failed to save layout. Please try again.')
      setTimeout(() => setFeedbackMessage(null), 3000)
    } finally {
      setIsSavingLayout(false)
    }
  }, [familyId, savedPositions])

  // Reset layout to default generational layout
  const handleResetLayout = useCallback(async () => {
    setIsSavingLayout(true)
    try {
      if (familyId) {
        await resetFamilyTreeLayout(familyId)
      }
      setSavedPositions({})
      setHasUnsavedChanges(false)
      setFeedbackMessage('Tree layout reset to default generation tiers.')
      setTimeout(() => setFeedbackMessage(null), 3000)
      setTimeout(() => {
        fitView({ padding: 0.25, duration: 400 })
      }, 50)
    } catch {
      setFeedbackMessage('Failed to reset layout.')
      setTimeout(() => setFeedbackMessage(null), 3000)
    } finally {
      setIsSavingLayout(false)
    }
  }, [familyId, fitView])

  // Recenter view
  const handleRecenter = useCallback(() => {
    fitView({ padding: 0.25, duration: 400 })
  }, [fitView])

  // Find currently selected node for the Right Panel
  const selectedNode = useMemo(() => {
    if (!activeTreeGraph || !activeSelectedPersonId) return null
    return activeTreeGraph.nodes.get(activeSelectedPersonId) ?? null
  }, [activeTreeGraph, activeSelectedPersonId])

  // Initial fit to screen and fitTrigger reaction
  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ padding: 0.25, duration: 400 })
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [nodes.length, fitView, fitTrigger, isCollapsed])

  // Fullscreen toggle handler
  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Gate 1: Unauthenticated
  if (!isAuthenticated) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-[#DCE3EF] bg-white min-h-[450px]',
          className
        )}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-3 text-slate-500">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-[#101828]">
          Sign In Required
        </h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
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
          'flex flex-col items-center justify-center p-12 text-center rounded-2xl border border-[#DCE3EF] bg-white min-h-[500px]',
          className
        )}
      >
        <Loader2 className="w-8 h-8 animate-spin text-[#2563EB] mb-3" />
        <p className="text-sm font-semibold text-[#101828]">
          Loading interactive family tree...
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Synchronizing genealogical branches across verified census records
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-red-200 bg-red-50 text-red-700 min-h-[450px]',
          className
        )}
      >
        <AlertCircle className="w-8 h-8 mb-3 text-red-600" />
        <h3 className="text-base font-semibold">Unable to Load Family Tree</h3>
        <p className="text-xs text-red-600 mt-1 max-w-md">
          {(error as Error)?.message || 'An error occurred while building the tree.'}
        </p>
      </div>
    )
  }

  // Empty state
  if (rawNodes.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-[#DCE3EF] bg-white min-h-[450px]',
          className
        )}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 text-[#2563EB] mb-3">
          <Network className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-[#101828]">
          No Family Connections Recorded
        </h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          No family relationships have been recorded for this individual yet.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-[640px] min-h-[520px] rounded-2xl border border-[#DCE3EF] bg-[#F8FAFC] overflow-hidden shadow-sm',
        isFullscreen && 'fixed inset-0 z-50 h-screen w-screen rounded-none border-none',
        className
      )}
      data-testid="family-tree-canvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => handleSelectPerson(null)}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        zoomOnScroll={true}
        panOnScroll={false}
        panOnDrag={true}
        proOptions={{ hideAttribution: true }}
      >
        {/* Subtle grid background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          color="#CBD5E1"
          className="opacity-60"
        />

        {/* Left Side: Relationship Legend */}
        <TreeLegend />

        {/* Top-Right Layout Floating Toolbar */}
        <div
          className={cn(
            'absolute top-4 z-20 flex items-center gap-2 transition-all duration-200',
            selectedNode ? 'right-4 lg:right-[292px]' : 'right-4'
          )}
        >
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={handleSaveLayout}
              disabled={isSavingLayout}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-blue-700 transition-colors"
              title="Save current card positions"
            >
              {isSavingLayout ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>Save Layout</span>
            </button>
          )}

          {(Object.keys(savedPositions).length > 0 || hasUnsavedChanges) && (
            <button
              type="button"
              onClick={handleResetLayout}
              disabled={isSavingLayout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
              title="Reset layout to automatic generation tiers"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
              <span>Reset Layout</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRecenter}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#DCE3EF] bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            title="Recenter Tree"
          >
            <Crosshair className="h-3.5 w-3.5 text-slate-500" />
            <span>Recenter</span>
          </button>
        </div>

        {/* Toast / Notification pill */}
        {feedbackMessage && (
          <div
            className={cn(
              'absolute top-16 z-20 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm animate-fade-in transition-all duration-200',
              selectedNode ? 'right-4 lg:right-[292px]' : 'right-4'
            )}
          >
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Bottom Left: Tree Overview MiniMap */}
        <TreeOverviewMiniMap />

        {/* Bottom Right: Zoom & Fullscreen Controls */}
        <TreeControls
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
        />
      </ReactFlow>

      {/* Right Side: Compact Content-Sized Selected Person Information Card */}
      {selectedNode && (
        <SelectedPersonPanel
          node={selectedNode}
          onClose={() => handleSelectPerson(null)}
        />
      )}
    </div>
  )
}

export const FamilyTreeCanvas: React.FC<FamilyTreeCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  )
}
