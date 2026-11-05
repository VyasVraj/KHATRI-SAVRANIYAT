/**
 * Component: PersonNode
 *
 * Custom React Flow node rendering an individual census person in the family tree.
 *
 * ARCHITECTURAL REQUIREMENTS:
 * 1. PERSON != USER:
 *    Renders human census data (public.persons), not user auth credentials.
 * 2. ZERO SYNTHETIC PLACEHOLDERS:
 *    Rendered only for authenticated, RLS-visible individuals. Never displays synthetic placeholders.
 * 3. COMPACT GEOMETRY:
 *    Fixed 220px x 90px card fitting generation-tiered layout without text clipping or jitter.
 * 4. ACCESSIBILITY & NAVIGATION:
 *    Direct semantic link to person profile (/people/:id).
 */

import React, { memo } from 'react'
import { Link } from 'react-router-dom'
import { Handle, Position, type NodeProps } from 'reactflow'
import { User, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PersonNodeData } from '../types'
import { TREE_NODE_WIDTH, TREE_NODE_HEIGHT } from '../types'

/**
 * Custom node component for React Flow tree visualization.
 */
export const PersonNode: React.FC<NodeProps<PersonNodeData>> = memo(function PersonNode({
  data,
}) {
  const { person, isRoot, rolesInTree } = data

  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

  const birthYear =
    person.dob_year ??
    (person.date_of_birth ? new Date(person.date_of_birth).getFullYear() : null)

  const isDeceased = person.status === 'DECEASED'

  return (
    <div
      style={{ width: `${TREE_NODE_WIDTH}px`, height: `${TREE_NODE_HEIGHT}px` }}
      className={cn(
        'relative flex flex-col justify-between p-3 rounded-xl border bg-card text-card-foreground shadow-sm transition-all hover:shadow-md select-none',
        isRoot
          ? 'ring-2 ring-primary border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-primary/10'
          : 'border-border/80 hover:border-border'
      )}
      data-testid={`tree-node-${person.id}`}
    >
      {/* React Flow Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-2.5 h-2.5 !bg-muted-foreground/40 border-2 !border-background transition-colors hover:!bg-primary"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-2.5 h-2.5 !bg-muted-foreground/40 border-2 !border-background transition-colors hover:!bg-primary"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="w-2.5 h-2.5 !bg-muted-foreground/40 border-2 !border-background transition-colors hover:!bg-primary"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="w-2.5 h-2.5 !bg-muted-foreground/40 border-2 !border-background transition-colors hover:!bg-primary"
      />

      {/* Header: Name and Profile Link */}
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-xs',
              isRoot
                ? 'bg-primary text-primary-foreground font-semibold'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <User className="w-3.5 h-3.5" />
          </div>
          <span
            className={cn(
              'text-sm font-semibold truncate leading-tight',
              isRoot && 'text-primary font-bold'
            )}
            title={fullName}
          >
            {fullName || 'Unknown'}
          </span>
        </div>

        <Link
          to={`/people/${person.id}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`View ${fullName}'s profile`}
          className="shrink-0 p-1 text-muted-foreground hover:text-foreground rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Subtitle: Lifespan and Status */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
        {birthYear && (
          <span>
            b. {birthYear}
            {isDeceased ? ' (dec.)' : ''}
          </span>
        )}
        {!birthYear && isDeceased && <span>Deceased</span>}
        {person.gender && (
          <span className="capitalize">{person.gender.toLowerCase()}</span>
        )}
      </div>

      {/* Badges / Roles Footer */}
      <div className="flex items-center justify-between text-[11px] gap-1 overflow-hidden pt-1 border-t border-border/50">
        <div className="flex items-center gap-1 truncate">
          {isRoot && (
            <span className="px-1.5 py-0.2 rounded font-medium bg-primary text-primary-foreground text-[10px]">
              Root
            </span>
          )}
          {rolesInTree
            .filter((r) => r !== 'ROOT')
            .slice(0, 2)
            .map((role) => (
              <span
                key={role}
                className="px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium text-[10px] capitalize"
              >
                {role.toLowerCase()}
              </span>
            ))}
        </div>

        {person.status && person.status !== 'ACTIVE' && (
          <span className="text-[10px] text-muted-foreground shrink-0 uppercase tracking-wider font-mono">
            {person.status}
          </span>
        )}
      </div>
    </div>
  )
})
