/**
 * Component: TreeLegend
 *
 * Compact legend explaining genealogical relationship types and root node indicators.
 */

import React, { useState } from 'react'
import { Panel } from 'reactflow'
import { Info, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Visual key for family tree edge types and node roles.
 */
export const TreeLegend: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Panel position="bottom-left" className="m-4">
      <div className="bg-background/90 backdrop-blur-sm border border-border shadow-md rounded-lg p-2 text-xs select-none max-w-xs transition-all">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center justify-between w-full gap-2 font-medium text-muted-foreground hover:text-foreground text-left"
          aria-expanded={isOpen}
          aria-label="Toggle legend"
        >
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <Info className="w-3.5 h-3.5 text-primary" />
            Legend
          </span>
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>

        {isOpen && (
          <div className="mt-2.5 pt-2 border-t border-border space-y-1.5 text-muted-foreground">
            {/* Root indicator */}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full ring-2 ring-primary bg-primary/20 shrink-0" />
              <span>Root Person (Focus)</span>
            </div>

            {/* Parent connection */}
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 bg-blue-500 shrink-0" />
              <span>Parent &rarr; Child</span>
            </div>

            {/* Spouse connection */}
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-0.5 border-t-2 border-dashed border-rose-500 shrink-0"
                style={{ height: 0 }}
              />
              <span>Spouse (Union)</span>
            </div>

            {/* Sibling connection */}
            <div className="flex items-center gap-2">
              <span
                className="w-4 h-0.5 border-t-2 border-dotted border-teal-600 shrink-0"
                style={{ height: 0 }}
              />
              <span>Sibling</span>
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
