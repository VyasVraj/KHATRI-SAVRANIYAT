/**
 * Component: TreeControls
 *
 * Bottom-right floating toolbar matching the reference design layout:
 * - [+] Zoom in
 * - [-] Zoom out
 * - [⛶] Full-screen toggle
 */

import React from 'react'
import { useReactFlow, Panel } from 'reactflow'
import { Plus, Minus, Maximize2, Minimize2 } from 'lucide-react'

interface TreeControlsProps {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}

export const TreeControls: React.FC<TreeControlsProps> = ({
  isFullscreen,
  onToggleFullscreen,
}) => {
  const { zoomIn, zoomOut } = useReactFlow()

  return (
    <Panel position="bottom-right" className="m-4">
      <div
        role="toolbar"
        aria-label="Tree Canvas Controls"
        className="flex flex-col items-center gap-1.5 rounded-2xl border border-[#DCE3EF] bg-white p-1.5 shadow-sm"
      >
        <button
          type="button"
          onClick={() => zoomIn({ duration: 300 })}
          aria-label="Zoom in"
          title="Zoom In"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="h-px w-6 bg-slate-200" />

        <button
          type="button"
          onClick={() => zoomOut({ duration: 300 })}
          aria-label="Zoom out"
          title="Zoom Out"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <Minus className="h-4 w-4" />
        </button>

        {onToggleFullscreen && (
          <>
            <div className="h-px w-6 bg-slate-200" />
            <button
              type="button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
              title={isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </>
        )}
      </div>
    </Panel>
  )
}
