/**
 * Component: FamilyMemberListView
 *
 * Alternate structured list view of all family members, matching Section 7:
 * "VIEW LIST: Switch from graphical tree view to a structured family member list."
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { User, GitFork, Crown, Calendar, ArrowRight } from 'lucide-react'
import type { TreeNode } from '../types'
import { ROUTES } from '@/constants/app'
import { cn } from '@/lib/utils'

interface FamilyMemberListViewProps {
  nodes: TreeNode[]
  onSelectPersonInTree: (personId: string) => void
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.trim()[0]?.toUpperCase() ?? ''
  const l = lastName?.trim()[0]?.toUpperCase() ?? ''
  return f + l || '?'
}

export const FamilyMemberListView: React.FC<FamilyMemberListViewProps> = ({
  nodes,
  onSelectPersonInTree,
}) => {
  const navigate = useNavigate()

  // Sort nodes: Head first, then Parents (gen -1), then Spouses (gen 0), then Children/Siblings (gen 1)
  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.isHead && !b.isHead) return -1
    if (!a.isHead && b.isHead) return 1
    if (a.generation !== b.generation) return a.generation - b.generation
    const nameA = `${a.person.first_name} ${a.person.last_name}`
    const nameB = `${b.person.first_name} ${b.person.last_name}`
    return nameA.localeCompare(nameB)
  })

  return (
    <div className="w-full rounded-2xl border border-[#DCE3EF] bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-[#101828]">
            Family Roster & Lineage Directory
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Structured member catalog with recorded relationships and census profiles
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-[#2563EB]">
          {nodes.length} {nodes.length === 1 ? 'Member' : 'Members'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedNodes.map((node) => {
          const { person, isHead, relationshipLabel, age } = node
          const fullName = [person.first_name, person.middle_name, person.last_name]
            .filter(Boolean)
            .join(' ')
          const initials = getInitials(person.first_name, person.last_name)
          const isFemale = person.gender === 'FEMALE'

          return (
            <div
              key={person.id}
              className={cn(
                'flex flex-col justify-between rounded-xl border p-4 transition-all duration-150 hover:shadow-md bg-white',
                isHead ? 'border-[#1E3A8A] border-2 shadow-sm' : 'border-[#DCE3EF]'
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-bold border',
                    isFemale
                      ? 'bg-[#FCE7F3] text-[#BE185D] border-[#FBCFE8]'
                      : 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]'
                  )}
                  aria-hidden="true"
                >
                  <span>{initials}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="truncate text-sm font-bold text-[#101828]">
                      {fullName}
                    </h4>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    {isHead ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E] border border-amber-200">
                        <Crown className="h-3 w-3 fill-amber-500 text-amber-600" />
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

                    {person.gender && (
                      <span className="capitalize text-[11px] text-slate-500">
                        • {person.gender.toLowerCase()}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                    <Calendar className="h-3 w-3 text-slate-400" />
                    <span>
                      {age != null ? `Age: ${age}` : person.dob_year ? `b. ${person.dob_year}` : 'Age not recorded'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPersonInTree(person.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#2563EB] bg-white py-1.5 px-2 text-[11px] font-semibold text-[#2563EB] hover:bg-blue-50 transition-colors"
                >
                  <GitFork className="h-3.5 w-3.5" />
                  <span>View in Tree</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate(ROUTES.PERSON_DETAIL(person.id))}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Profile</span>
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
