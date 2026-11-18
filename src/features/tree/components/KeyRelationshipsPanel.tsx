/**
 * Component: KeyRelationshipsPanel
 *
 * Bottom panel for the Family Tree view matching the approved reference design layout:
 * - Left Card: "Key Relationships (with respect to [Head of Family])"
 *     Lists all key members of the household with their explicit English + Hindi relationship.
 * - Right Card: "Legend"
 *     Visual guide showing Couple (∞), Parent-Child direct line, Extended connections,
 *     Head of Family border, and Deceased Member border.
 */

import React from 'react'
import { User, Info, Users, Heart, Crown } from 'lucide-react'
import { toProperCaseName } from '@/utils/text-casing'
import { formatRelationshipDisplay } from '@/constants/familyRelationships'
import type { TreeNode } from '../types'

export interface KeyRelationshipsPanelProps {
  headPersonName?: string
  nodes: TreeNode[]
}

function getRelativeIcon(rel: string) {
  const norm = rel.toLowerCase()
  if (norm.includes('wife') || norm.includes('husband') || norm.includes('spouse') || norm.includes('पत्नी') || norm.includes('पति')) {
    return <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-100 shrink-0" />
  }
  if (norm.includes('mother') || norm.includes('माता')) {
    return <span className="text-xs shrink-0" role="img" aria-label="Mother">👩</span>
  }
  if (norm.includes('father') || norm.includes('पिता')) {
    return <span className="text-xs shrink-0" role="img" aria-label="Father">👨</span>
  }
  if (norm.includes('brother') || norm.includes('sister') || norm.includes('भाई') || norm.includes('बहन') || norm.includes('bhabhi') || norm.includes('भाभी')) {
    return <Users className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
  }
  return <User className="h-3.5 w-3.5 text-blue-500 shrink-0" />
}

export const KeyRelationshipsPanel: React.FC<KeyRelationshipsPanelProps> = ({
  headPersonName = 'Head of Family',
  nodes,
}) => {
  // Filter out the head of family node itself
  const relatives = nodes
    .filter((n) => !n.isHead && n.relationshipLabel && n.relationshipLabel !== 'Head of Family')
    .sort((a, b) => {
      // Order: Parents first, then Spouses, Siblings, In-laws, Children, Nephews/Nieces
      const getPriority = (rel: string) => {
        const l = rel.toLowerCase()
        if (l.includes('father') || l.includes('mother') || l.includes('पिता') || l.includes('माता')) return 1
        if (l.includes('wife') || l.includes('husband') || l.includes('पत्नी') || l.includes('पति')) return 2
        if (l.includes('brother') || l.includes('sister') || l.includes('भाई') || l.includes('बहन')) return 3
        if (l.includes('sister-in-law') || l.includes('brother-in-law') || l.includes('भाभी')) return 4
        if (l.includes('son') || l.includes('daughter') || l.includes('बेटा') || l.includes('बेटी')) return 5
        if (l.includes('nephew') || l.includes('niece') || l.includes('भतीजा') || l.includes('भांजा')) return 6
        return 7
      }
      return getPriority(a.relationshipLabel || '') - getPriority(b.relationshipLabel || '')
    })

  // Split into two balanced columns
  const midpoint = Math.ceil(relatives.length / 2)
  const col1 = relatives.slice(0, midpoint)
  const col2 = relatives.slice(midpoint)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
      {/* 1. Left Card: Key Relationships */}
      <div
        role="region"
        aria-label={`Key Relationships with respect to ${headPersonName}`}
        className="lg:col-span-2 rounded-2xl border border-[#DDD6FE] bg-[#F5F3FF]/70 p-4 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-3.5 border-b border-purple-200/60 pb-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-100 text-purple-700">
            <User className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-xs sm:text-sm font-bold text-slate-800">
            Key Relationships <span className="font-medium text-slate-600">(with respect to {toProperCaseName(headPersonName)})</span>
          </h3>
        </div>

        {relatives.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No additional family members recorded.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {/* Column 1 */}
            <div className="space-y-2">
              {col1.map((n) => {
                const displayName = toProperCaseName(n.person.first_name || 'Member')
                const relLabel = formatRelationshipDisplay(n.relationshipLabel || 'Relative')
                return (
                  <div key={n.id} className="flex items-center gap-2">
                    {getRelativeIcon(relLabel)}
                    <span className="font-bold text-slate-800">{displayName}</span>
                    <span className="text-slate-400">–</span>
                    <span className="text-slate-700">{relLabel}</span>
                  </div>
                )
              })}
            </div>

            {/* Column 2 */}
            <div className="space-y-2">
              {col2.map((n) => {
                const displayName = toProperCaseName(n.person.first_name || 'Member')
                const relLabel = formatRelationshipDisplay(n.relationshipLabel || 'Relative')
                return (
                  <div key={n.id} className="flex items-center gap-2">
                    {getRelativeIcon(relLabel)}
                    <span className="font-bold text-slate-800">{displayName}</span>
                    <span className="text-slate-400">–</span>
                    <span className="text-slate-700">{relLabel}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Right Card: Legend */}
      <div
        role="region"
        aria-label="Family Tree Legend"
        className="rounded-2xl border border-[#BAE6FD] bg-[#F0F9FF]/80 p-4 shadow-sm space-y-3"
      >
        <div className="flex items-center gap-2 border-b border-sky-200/60 pb-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <Info className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-xs sm:text-sm font-bold text-slate-800">Legend</h3>
        </div>

        <div className="space-y-2 text-xs text-slate-700">
          {/* Couple / Married */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white border border-[#9333EA] text-[#9333EA] font-bold text-[11px]">
              ∞
            </div>
            <span>= Couple / Married</span>
          </div>

          {/* Parent - Child (Direct Line) */}
          <div className="flex items-center gap-2.5">
            <span className="h-0.5 w-7 rounded bg-[#2563EB] shrink-0" aria-hidden="true" />
            <span>= Parent – Child (Direct Line)</span>
          </div>

          {/* Extended / Other Connection */}
          <div className="flex items-center gap-2.5">
            <span
              className="h-0.5 w-7 border-t-2 border-dashed border-[#2563EB] shrink-0"
              style={{ height: 0 }}
              aria-hidden="true"
            />
            <span>= Extended / Other Connection</span>
          </div>

          {/* Head of Family */}
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-7 rounded border-2 border-[#1E3A8A] bg-blue-50/50 shrink-0 flex items-center justify-center">
              <Crown className="h-2.5 w-2.5 text-amber-500 fill-amber-400" />
            </div>
            <span>= Head of Family</span>
          </div>

          {/* Deceased Member */}
          <div className="flex items-center gap-2.5">
            <div className="h-4 w-7 rounded border-2 border-dashed border-slate-400 bg-slate-100/70 shrink-0" />
            <span>= Deceased Member</span>
          </div>
        </div>
      </div>
    </div>
  )
}
