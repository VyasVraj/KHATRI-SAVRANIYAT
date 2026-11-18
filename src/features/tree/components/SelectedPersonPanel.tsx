/**
 * Component: SelectedPersonPanel
 *
 * Right-side floating information panel displaying details for the clicked person,
 * strictly matching the reference design layout without gradients.
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X,
  Crown,
  Calendar,
  User,
  Users,
  Compass,
  ArrowRight,
} from 'lucide-react'
import type { TreeNode } from '../types'
import { ROUTES } from '@/constants/app'
import { cn } from '@/lib/utils'
import { toProperCaseName } from '@/utils/text-casing'
import { formatRelationshipDisplay } from '@/constants/familyRelationships'

interface SelectedPersonPanelProps {
  node: TreeNode | null
  onClose: () => void
}

function formatDate(isoDate?: string | null): string | null {
  if (!isoDate) return null
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return null
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.trim()[0]?.toUpperCase() ?? ''
  const l = lastName?.trim()[0]?.toUpperCase() ?? ''
  return f + l || '?'
}

export const SelectedPersonPanel: React.FC<SelectedPersonPanelProps> = ({
  node,
  onClose,
}) => {
  const navigate = useNavigate()

  if (!node) return null

  const { person, isHead, relationshipLabel, age, parentsNames, siblingsNames } = node

  const fullName = toProperCaseName(
    [person.first_name, person.middle_name, person.last_name]
      .filter(Boolean)
      .join(' ')
  )

  const initials = getInitials(person.first_name, person.last_name)
  const isFemale = person.gender === 'FEMALE'
  const isAuthorized = person.is_same_family !== false

  const formattedDob = formatDate(person.date_of_birth)

  return (
    <aside
      role="region"
      aria-label={`Details for ${fullName}`}
      className="absolute top-4 right-4 z-20 w-[268px] rounded-2xl border border-[#DCE3EF] bg-white p-3.5 shadow-md select-none transition-all flex flex-col h-auto max-h-[calc(100%-32px)] overflow-y-auto"
    >
      <div>
        {/* Header with Close Button */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold border',
                isFemale
                  ? 'bg-[#FCE7F3] text-[#BE185D] border-[#FBCFE8]'
                  : 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]'
              )}
              aria-hidden="true"
            >
              <span>{initials}</span>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-[#101828] leading-tight" title={fullName}>
                {fullName}
              </h3>

              <div className="mt-1 flex flex-wrap items-center gap-1">
                {isHead && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E] border border-amber-200">
                    <Crown className="h-3 w-3 fill-amber-500 text-amber-600" />
                    <span>Head of Family</span>
                  </span>
                )}
                {relationshipLabel && relationshipLabel !== 'Head of Family' ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                    {formatRelationshipDisplay(relationshipLabel)}
                  </span>
                ) : !isHead ? (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200">
                    Member
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="my-2.5 border-t border-[#DCE3EF]" />

        {/* Details Table */}
        <div className="space-y-2 text-xs">
          {/* Date of Birth (strictly privacy respecting) */}
          {isAuthorized && (formattedDob || person.dob_year) && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[11px]">Date of Birth</span>
              </div>
              <span className="font-semibold text-[#101828] text-[11px] truncate">
                {formattedDob || `Year ${person.dob_year}`}
              </span>
            </div>
          )}

          {/* Age */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[11px]">Age</span>
            </div>
            <span className="font-semibold text-[#101828] text-[11px]">
              {age != null ? `${age} Years` : 'Not recorded'}
            </span>
          </div>

          {/* Relation */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-[11px]">Relation</span>
            </div>
            <span className="font-semibold text-[#101828] text-[11px] truncate">
              {relationshipLabel && relationshipLabel !== 'Head of Family'
                ? formatRelationshipDisplay(relationshipLabel)
                : isHead
                  ? 'Head of Family'
                  : 'Member'}
            </span>
          </div>

          {/* Parents */}
          {parentsNames && (
            <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-[11px]">Parents</span>
              </div>
              <span className="font-semibold text-[#101828] text-[11px] text-right truncate" title={toProperCaseName(parentsNames)}>
                {toProperCaseName(parentsNames)}
              </span>
            </div>
          )}

          {/* Siblings */}
          {siblingsNames && (
            <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="text-[11px]">Siblings</span>
              </div>
              <span className="font-semibold text-[#101828] text-[11px] text-right truncate" title={toProperCaseName(siblingsNames)}>
                {toProperCaseName(siblingsNames)}
              </span>
            </div>
          )}

          {/* Lineage (Gotra / Nukh) if authorized */}
          {isAuthorized && (person.gotra || person.nukh) && (
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-slate-500 shrink-0">
                <Compass className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[11px]">Lineage</span>
              </div>
              <span className="font-semibold text-[#101828] text-[11px] truncate" title={[person.gotra, person.nukh].filter(Boolean).join(' • ')}>
                {[person.gotra, person.nukh].filter(Boolean).join(' • ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* View Full Profile Action Button */}
      <div className="mt-3.5 pt-2.5 border-t border-[#DCE3EF]">
        <button
          type="button"
          onClick={() => navigate(ROUTES.PERSON_DETAIL(person.id))}
          className="flex w-full min-h-[38px] items-center justify-center gap-2 rounded-xl border border-[#2563EB] bg-white py-1.5 px-3 text-xs font-semibold text-[#2563EB] hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <User className="h-3.5 w-3.5" />
          <span>View Full Profile</span>
          <ArrowRight className="h-3.5 w-3.5 ml-auto text-blue-400" />
        </button>
      </div>
    </aside>
  )
}
