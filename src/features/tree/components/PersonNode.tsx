/**
 * Component: PersonNode
 *
 * Custom React Flow node rendering an individual census person in the family tree,
 * strictly matching the reference design layout without gradients.
 *
 * FEATURES:
 * - Solid color card with 16px rounded corners and subtle border.
 * - Initial-based circular avatar with gender-specific solid colors.
 * - Bold uppercase full name.
 * - Soft yellow relationship pill badge (Father, Mother, Son, Brother, Other).
 * - Distinct gold crown badge for active Head of Family.
 * - Age display with calendar icon.
 * - Dynamic selection highlight ring.
 */

import React, { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Crown, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PersonNodeData } from '../types'
import { TREE_NODE_WIDTH, TREE_NODE_HEIGHT } from '../types'

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.trim()[0]?.toUpperCase() ?? ''
  const l = lastName?.trim()[0]?.toUpperCase() ?? ''
  return f + l || '?'
}

export const PersonNode: React.FC<NodeProps<PersonNodeData>> = memo(function PersonNode({
  data,
  selected,
}) {
  const { person, isHead, relationshipLabel, age, isSelected, onSelect } = data

  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

  const initials = getInitials(person.first_name, person.last_name)
  const isFemale = person.gender === 'FEMALE'
  const isDeceased = person.status === 'DECEASED'

  const activeSelected = selected || isSelected

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSelect) {
      onSelect(person.id)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick(e as unknown as React.MouseEvent)
        }
      }}
      style={{ width: `${TREE_NODE_WIDTH}px`, height: `${TREE_NODE_HEIGHT}px` }}
      aria-label={`${fullName}, ${relationshipLabel || 'Member'}`}
      className={cn(
        'group relative flex items-center gap-3 p-3.5 rounded-2xl bg-white border shadow-sm transition-all duration-150 cursor-pointer select-none text-left',
        isHead
          ? 'border-[#1E3A8A] border-2 shadow-md'
          : isFemale
            ? 'border-pink-200 hover:border-pink-300'
            : 'border-[#DCE3EF] hover:border-blue-300',
        activeSelected && 'ring-2 ring-[#2563EB] border-[#2563EB] shadow-md'
      )}
      data-testid={`tree-node-${person.id}`}
    >
      {/* React Flow Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="w-2.5 h-2.5 !bg-[#2563EB] !border-2 !border-white transition-transform hover:scale-125"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="w-2.5 h-2.5 !bg-[#2563EB] !border-2 !border-white transition-transform hover:scale-125"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="w-2.5 h-2.5 !bg-[#9333EA] !border-2 !border-white transition-transform hover:scale-125"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="w-2.5 h-2.5 !bg-[#9333EA] !border-2 !border-white transition-transform hover:scale-125"
      />

      {/* Left side: Initial-based circular avatar */}
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-transform group-hover:scale-105',
          isFemale
            ? 'bg-[#FCE7F3] text-[#BE185D] border border-[#FBCFE8]'
            : 'bg-[#DBEAFE] text-[#1D4ED8] border border-[#BFDBFE]'
        )}
        aria-hidden="true"
      >
        <span className="tracking-tight">{initials}</span>
      </div>

      {/* Right side: Name, Role Pill, Age */}
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-1">
        {/* Full Name */}
        <h4
          className="truncate text-[13px] font-bold text-[#101828] group-hover:text-[#2563EB] leading-tight"
          title={fullName}
        >
          {fullName || 'Unknown'}
        </h4>

        {/* Relationship or Head Badge */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isHead ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E] border border-amber-200">
              <Crown className="h-3 w-3 text-amber-600 fill-amber-500" />
              <span>Head of Family</span>
            </span>
          ) : relationshipLabel ? (
            <span className="inline-flex items-center rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#92400E] border border-amber-200/60">
              {relationshipLabel}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              Member
            </span>
          )}
        </div>

        {/* Age row */}
        <div className="flex items-center gap-1 text-[11px] text-[#64748B]">
          <Calendar className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="truncate">
            {isDeceased
              ? 'Deceased'
              : age != null
                ? `Age: ${age}`
                : person.dob_year
                  ? `b. ${person.dob_year}`
                  : 'Age: —'}
          </span>
        </div>
      </div>
    </div>
  )
})
