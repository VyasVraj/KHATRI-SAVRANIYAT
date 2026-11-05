/**
 * Component: TreeControls
 *
 * Canvas toolbar providing zoom, recenter, and fit-view actions for the family tree.
 */

import React from 'react'
import { useReactFlow, Panel } from 'reactflow'
import { ZoomIn, ZoomOut, Maximize2, Crosshair } from 'lucide-react'

interface TreeControlsProps {
  /** Optional callback to reset focus onto the root person node */
  onRecenterRoot?: () => void
}

/**
 * Floating toolbar for canvas navigation and zoom control.
 */
export const TreeControls: React.FC<TreeControlsProps> = ({ onRecenterRoot }) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  const handleFitView = () => {
    fitView({ padding: 0.2, duration: 400 })
  }

  const handleZoomIn = () => {
    zoomIn({ duration: 300 })
  }

  const handleZoomOut = () => {
    zoomOut({ duration: 300 })
  }

  return (
    <Panel position="bottom-right" className="flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border shadow-md rounded-lg p-1.5 m-4">
      <button
        type="button"
        onClick={handleZoomIn}
        aria-label="Zoom in"
        title="Zoom In"
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={handleZoomOut}
        aria-label="Zoom out"
        title="Zoom Out"
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <button
        type="button"
        onClick={handleFitView}
        aria-label="Fit view to all nodes"
        title="Fit View"
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {onRecenterRoot && (
        <button
          type="button"
          onClick={onRecenterRoot}
          aria-label="Recenter on focus person"
          title="Recenter on Root Person"
          className="p-1.5 rounded-md hover:bg-muted text-primary hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Crosshair className="w-4 h-4" />
        </button>
      )}
    </Panel>
  )
}
