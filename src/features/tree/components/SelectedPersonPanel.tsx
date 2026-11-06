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
import { Panel } from 'reactflow'
import type { TreeNode } from '../types'
import { ROUTES } from '@/constants/app'
import { cn } from '@/lib/utils'

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

  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

  const initials = getInitials(person.first_name, person.last_name)
  const isFemale = person.gender === 'FEMALE'
  const isAuthorized = person.is_same_family !== false

  const formattedDob = formatDate(person.date_of_birth)

  return (
    <Panel position="top-right" className="m-4">
      <div
        role="region"
        aria-label={`Details for ${fullName}`}
        className="w-80 rounded-2xl border border-[#DCE3EF] bg-white p-5 shadow-lg select-none transition-all"
      >
        {/* Header with Close Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold border',
                isFemale
                  ? 'bg-[#FCE7F3] text-[#BE185D] border-[#FBCFE8]'
                  : 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]'
              )}
              aria-hidden="true"
            >
              <span>{initials}</span>
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-bold text-[#101828]">
                {fullName}
              </h3>

              {isHead ? (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E] border border-amber-200">
                  <Crown className="h-3.5 w-3.5 fill-amber-500 text-amber-600" />
                  <span>Head of Family</span>
                </span>
              ) : relationshipLabel ? (
                <span className="mt-1 inline-flex items-center rounded-full bg-[#FEF3C7] px-2.5 py-0.5 text-[11px] font-semibold text-[#92400E] border border-amber-200/60">
                  {relationshipLabel}
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-[#DCE3EF]" />

        {/* Details Table */}
        <div className="space-y-3 text-xs">
          {/* Date of Birth (strictly privacy respecting) */}
          {isAuthorized && (formattedDob || person.dob_year) && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-500">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>Date of Birth</span>
              </div>
              <span className="font-semibold text-[#101828]">
                {formattedDob || `Year ${person.dob_year}`}
              </span>
            </div>
          )}

          {/* Age */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-500">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span>Age</span>
            </div>
            <span className="font-semibold text-[#101828]">
              {age != null ? `${age} Years` : 'Not recorded'}
            </span>
          </div>

          {/* Relation */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-500">
              <User className="h-3.5 w-3.5 text-slate-400" />
              <span>Relation</span>
            </div>
            <span className="font-semibold text-[#101828]">
              {relationshipLabel || (isHead ? 'Head of Family' : 'Member')}
            </span>
          </div>

          {/* Parents */}
          {parentsNames && (
            <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2 text-slate-500">
                <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>Parents</span>
              </div>
              <span className="font-semibold text-[#101828] text-right">
                {parentsNames}
              </span>
            </div>
          )}

          {/* Siblings */}
          {siblingsNames && (
            <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2 text-slate-500">
                <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span>Siblings</span>
              </div>
              <span className="font-semibold text-[#101828] text-right">
                {siblingsNames}
              </span>
            </div>
          )}

          {/* Lineage (Gotra / Nukh) if authorized */}
          {isAuthorized && (person.gotra || person.nukh) && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <div className="flex items-center gap-2 text-slate-500">
                <Compass className="h-3.5 w-3.5 text-slate-400" />
                <span>Lineage</span>
              </div>
              <span className="font-semibold text-[#101828] truncate">
                {[person.gotra, person.nukh].filter(Boolean).join(' • ')}
              </span>
            </div>
          )}
        </div>

        {/* View Full Profile Action Button */}
        <div className="mt-5 pt-3 border-t border-[#DCE3EF]">
          <button
            type="button"
            onClick={() => navigate(ROUTES.PERSON_DETAIL(person.id))}
            className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[#2563EB] bg-white py-2 px-3 text-xs font-semibold text-[#2563EB] hover:bg-blue-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <User className="h-4 w-4" />
            <span>View Full Profile</span>
            <ArrowRight className="h-3.5 w-3.5 ml-auto text-blue-400" />
          </button>
        </div>
      </div>
    </Panel>
  )
}
