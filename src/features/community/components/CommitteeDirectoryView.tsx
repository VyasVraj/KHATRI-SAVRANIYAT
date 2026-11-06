/**
 * Committee Directory View (Screen 44 — Official Executive Committee Directory)
 *
 * Canonical Directory for Khatri Sarvaniyat Executive Committee (Karyakarini):
 * - Renders ONLY the official 31-member Executive Committee records (0 Mukhi Directory records).
 * - Section A: Executive Leadership & Central Officers (8 members: President, 3 Vice Presidents,
 *   General Secretary, Secretary, Treasurer, Organization Secretary).
 * - Section B: Committee Members (23 members).
 * - Dynamic count from Supabase.
 * - Search by name, designation, nukh, city, or phone.
 * - Filter by designation and city.
 * - Sort by PDF Serial Order, Alphabetical (A-Z, Z-A), and City.
 * - View Member Details modal.
 * - Responsive Cards and Table view modes.
 * - Strict RBAC: Only ADMIN and SUPER_ADMIN can Add, Edit, or Deactivate members.
 *   NORMAL USER and MUKHI roles are strictly read-only.
 */

import React, { useState, useMemo } from 'react'
import {
  Award,
  Search,
  Phone,
  MapPin,
  Shield,
  CheckCircle2,
  RotateCcw,
  LayoutGrid,
  Table as TableIcon,
  Plus,
  Edit2,
  Power,
  Eye,
  X,
  ArrowUpDown,
} from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useLanguage } from '@/features/i18n'
import { PLATFORM_ADMIN_ROLES } from '@/constants/app'
import { useExecutiveCommittee } from '../hooks/useExecutiveCommittee'
import type { ExecutiveCommitteeMember } from '../services/executive-committee.service'

type SortOption = 'serial_asc' | 'name_asc' | 'name_desc' | 'city_asc'

const LEADERSHIP_DESIGNATIONS = [
  'President',
  'Vice President',
  'General Secretary',
  'Secretary',
  'Treasurer',
  'Organization Secretary',
]

export const CommitteeDirectoryView: React.FC = () => {
  const { t } = useLanguage()
  const { profile } = useAuthContext()
  const isAdmin = Boolean(profile?.role && PLATFORM_ADMIN_ROLES.includes(profile.role))

  const {
    members,
    isLoading,
    isError,
    error,
    refetch,
    upsertMember,
    isUpserting,
    toggleStatus,
    isTogglingStatus,
  } = useExecutiveCommittee()

  // Filters & Controls State
  const [search, setSearch] = useState('')
  const [selectedDesignation, setSelectedDesignation] = useState('ALL')
  const [selectedCity, setSelectedCity] = useState('ALL')
  const [sortBy, setSortBy] = useState<SortOption>('serial_asc')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  // Modals State
  const [detailMember, setDetailMember] = useState<ExecutiveCommitteeMember | null>(null)
  const [editMember, setEditMember] = useState<Partial<ExecutiveCommitteeMember> | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [deactivatingMember, setDeactivatingMember] = useState<ExecutiveCommitteeMember | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Derived filter options
  const designations = useMemo(() => {
    const set = new Set<string>()
    members.forEach((m) => {
      if (m.designation) set.add(m.designation)
    })
    return ['ALL', ...Array.from(set)]
  }, [members])

  const cities = useMemo(() => {
    const set = new Set<string>()
    members.forEach((m) => {
      if (m.city) set.add(m.city)
    })
    return ['ALL', ...Array.from(set).sort()]
  }, [members])

  // Filter and Sort members
  const processedMembers = useMemo(() => {
    let list = members.filter((m) => {
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const matchName = m.full_name.toLowerCase().includes(q)
        const matchNukh = (m.nukh ?? '').toLowerCase().includes(q)
        const matchCity = m.city.toLowerCase().includes(q)
        const matchDesig = m.designation.toLowerCase().includes(q)
        const matchPhone = (m.mobile_number ?? '').includes(q)
        if (!matchName && !matchNukh && !matchCity && !matchDesig && !matchPhone) {
          return false
        }
      }

      // Designation filter
      if (selectedDesignation !== 'ALL' && m.designation !== selectedDesignation) {
        return false
      }

      // City filter
      if (selectedCity !== 'ALL' && m.city !== selectedCity) {
        return false
      }

      return true
    })

    // Sorting
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.full_name.localeCompare(b.full_name)
        case 'name_desc':
          return b.full_name.localeCompare(a.full_name)
        case 'city_asc':
          return a.city.localeCompare(b.city)
        case 'serial_asc':
        default:
          return a.serial_number - b.serial_number
      }
    })

    return list
  }, [members, search, selectedDesignation, selectedCity, sortBy])

  // Split into Section A (Leadership) and Section B (Members)
  const { leadershipMembers, ordinaryMembers } = useMemo(() => {
    const leadership: ExecutiveCommitteeMember[] = []
    const ordinary: ExecutiveCommitteeMember[] = []

    processedMembers.forEach((m) => {
      const isLeader =
        LEADERSHIP_DESIGNATIONS.some((desig) => m.designation.toLowerCase().includes(desig.toLowerCase())) ||
        m.serial_number <= 8

      if (isLeader) {
        leadership.push(m)
      } else {
        ordinary.push(m)
      }
    })

    return { leadershipMembers: leadership, ordinaryMembers: ordinary }
  }, [processedMembers])

  const hasActiveFilters =
    search.trim() !== '' || selectedDesignation !== 'ALL' || selectedCity !== 'ALL' || sortBy !== 'serial_asc'

  const handleResetFilters = () => {
    setSearch('')
    setSelectedDesignation('ALL')
    setSelectedCity('ALL')
    setSortBy('serial_asc')
  }

  const getDesignationBadgeClass = (designation: string) => {
    if (designation.includes('President')) {
      return 'bg-amber-100 text-amber-900 border-amber-300 ring-1 ring-amber-400/40'
    }
    if (designation.includes('Secretary')) {
      return 'bg-blue-100 text-blue-900 border-blue-300 ring-1 ring-blue-400/40'
    }
    if (designation.includes('Treasurer')) {
      return 'bg-emerald-100 text-emerald-900 border-emerald-300 ring-1 ring-emerald-400/40'
    }
    return 'bg-slate-100 text-slate-800 border-slate-300'
  }

  // Admin Save Member (Add or Edit)
  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editMember?.full_name?.trim()) {
      setFormError('Full name is required.')
      return
    }
    if (!editMember?.nukh?.trim()) {
      setFormError('Nukh / Lineage is required.')
      return
    }
    if (!editMember?.city?.trim()) {
      setFormError('City is required.')
      return
    }

    setFormError(null)
    try {
      await upsertMember(editMember)
      setIsAddModalOpen(false)
      setEditMember(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save committee member.')
    }
  }

  // Admin Toggle Active / Deactivate
  const handleConfirmToggleStatus = async () => {
    if (!deactivatingMember) return
    try {
      await toggleStatus({
        id: deactivatingMember.id,
        isActive: !deactivatingMember.is_active,
      })
      setDeactivatingMember(null)
    } catch {
      // Ignored
    }
  }

  return (
    <div className="space-y-8" data-testid="committee-directory-view">
      {/* 1. OFFICIAL EXECUTIVE COMMITTEE REGISTER BANNER */}
      <div className="rounded-2xl border border-navy-800 bg-gradient-to-r from-navy-900 via-navy-950 to-navy-900 text-white p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40 shadow-xs">
                <Award className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-white sm:text-2xl tracking-tight">
                  Executive Committee
                </h1>
                <span className="text-xs text-amber-300 font-medium">
                  {t('committee.directory_title', 'Committees & Governance Bodies')}
                </span>
              </div>
            </div>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Official leadership, executive representatives and committee members of KHATRI SARVANIYAT.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-navy-700 bg-navy-800/80 px-4 py-2 text-center">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                Total Members
              </span>
              <span className="text-xl font-extrabold text-amber-400">
                {isLoading ? '...' : `${members.length} Members`}
              </span>
            </div>

            {/* Admin Add Member Action Button */}
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setEditMember({
                    designation: 'Member',
                    full_name: '',
                    nukh: '',
                    city: '',
                    mobile_number: '',
                    is_active: true,
                    serial_number: members.length + 1,
                  })
                  setFormError(null)
                  setIsAddModalOpen(true)
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-navy-950 font-bold text-xs shadow-sm transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Member</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. SEARCH, FILTERS & VIEW MODE CONTROLS */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Box */}
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
            <input
              type="text"
              placeholder="Search by name, designation, nukh, city, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-navy-200 bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>

          {/* Designation Dropdown */}
          <div>
            <select
              value={selectedDesignation}
              onChange={(e) => setSelectedDesignation(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-navy-200 bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="ALL">All Designations ({designations.length - 1})</option>
              {designations
                .filter((d) => d !== 'ALL')
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>
          </div>

          {/* City Dropdown */}
          <div>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-navy-200 bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            >
              <option value="ALL">All Cities ({cities.length - 1})</option>
              {cities
                .filter((c) => c !== 'ALL')
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-navy-200 bg-white text-navy-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="serial_asc">PDF Serial Order</option>
                <option value="name_asc">Name (A to Z)</option>
                <option value="name_desc">Name (Z to A)</option>
                <option value="city_asc">City (A to Z)</option>
              </select>
              <ArrowUpDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-navy-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Filter Summary and View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-navy-100 text-xs">
          <div className="flex items-center gap-2 text-navy-600">
            <span>
              Showing <strong>{processedMembers.length}</strong> of <strong>{members.length}</strong> committee members
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-800 hover:underline ml-2"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-navy-200 p-0.5 bg-navy-50">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-navy-900 shadow-2xs'
                  : 'text-navy-600 hover:text-navy-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-navy-900 shadow-2xs'
                  : 'text-navy-600 hover:text-navy-900'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. LOADING / ERROR / EMPTY STATES */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-40 rounded-xl border border-navy-200 bg-white p-5 animate-pulse space-y-3"
            >
              <div className="h-4 w-1/3 bg-navy-100 rounded" />
              <div className="h-5 w-3/4 bg-navy-100 rounded" />
              <div className="h-4 w-1/2 bg-navy-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
          <p className="text-sm text-red-700">
            {error instanceof Error ? error.message : 'Failed to load executive committee register.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && processedMembers.length === 0 && (
        <div className="rounded-xl border border-dashed border-navy-200 bg-white p-10 text-center space-y-2">
          <Award className="h-8 w-8 text-navy-400 mx-auto" />
          <p className="text-sm font-semibold text-navy-800">No committee members matched your search.</p>
          <p className="text-xs text-navy-500">Try adjusting your search query or reset the filters.</p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-2 text-xs text-brand-600 font-semibold underline"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* 4. MAIN SECTIONS: SECTION A (LEADERSHIP) & SECTION B (MEMBERS) */}
      {!isLoading && !isError && processedMembers.length > 0 && (
        <div className="space-y-10">
          {/* SECTION A — EXECUTIVE LEADERSHIP */}
          {leadershipMembers.length > 0 && (
            <section aria-labelledby="section-a-heading" className="space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-navy-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-800 font-bold text-xs ring-1 ring-amber-300">
                  A
                </span>
                <div>
                  <h2 id="section-a-heading" className="text-lg font-bold text-navy-950 tracking-tight">
                    Section A — Executive Leadership & Central Officers
                  </h2>
                  <p className="text-xs text-navy-600">
                    President, Vice Presidents, General Secretary, Secretary, Treasurer & Organization Secretary ({leadershipMembers.length} officers)
                  </p>
                </div>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {leadershipMembers.map((member) => renderMemberCard(member))}
                </div>
              ) : (
                renderMemberTable(leadershipMembers)
              )}
            </section>
          )}

          {/* SECTION B — COMMITTEE MEMBERS */}
          {ordinaryMembers.length > 0 && (
            <section aria-labelledby="section-b-heading" className="space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-navy-200">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-800 font-bold text-xs ring-1 ring-blue-300">
                  B
                </span>
                <div>
                  <h2 id="section-b-heading" className="text-lg font-bold text-navy-950 tracking-tight">
                    Section B — Committee Members
                  </h2>
                  <p className="text-xs text-navy-600">
                    Elected and nominated community representatives ({ordinaryMembers.length} members)
                  </p>
                </div>
              </div>

              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ordinaryMembers.map((member) => renderMemberCard(member))}
                </div>
              ) : (
                renderMemberTable(ordinaryMembers)
              )}
            </section>
          )}
        </div>
      )}

      {/* 5. MEMBER DETAIL MODAL */}
      {detailMember && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-navy-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-navy-100">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-100 text-navy-800 text-xs font-bold">
                  #{detailMember.serial_number}
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-md border ${getDesignationBadgeClass(
                    detailMember.designation
                  )}`}
                >
                  {detailMember.designation}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailMember(null)}
                className="p-1 rounded-md text-navy-400 hover:text-navy-700 hover:bg-navy-50"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs uppercase tracking-wider text-navy-400 font-semibold block">
                  Full Name
                </span>
                <span className="text-base font-bold text-navy-950">
                  {detailMember.full_name}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <span className="text-xs uppercase tracking-wider text-navy-400 font-semibold block">
                    Nukh / Lineage
                  </span>
                  <span className="font-semibold text-navy-800">{detailMember.nukh || '—'}</span>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider text-navy-400 font-semibold block">
                    City
                  </span>
                  <span className="font-semibold text-navy-800">{detailMember.city}</span>
                </div>
              </div>

              <div className="pt-2">
                <span className="text-xs uppercase tracking-wider text-navy-400 font-semibold block">
                  Mobile Number
                </span>
                {detailMember.mobile_number ? (
                  <a
                    href={`tel:${detailMember.mobile_number}`}
                    className="inline-flex items-center gap-1.5 font-bold text-brand-600 hover:text-brand-800 hover:underline mt-0.5"
                  >
                    <Phone className="h-4 w-4" />
                    <span>{detailMember.mobile_number}</span>
                  </a>
                ) : (
                  <span className="text-navy-400">—</span>
                )}
              </div>

              <div className="pt-2 border-t border-navy-100 flex items-center justify-between text-xs text-navy-500">
                <span>Authority Status:</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded-full ${
                    detailMember.is_active
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {detailMember.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-navy-100 flex justify-end">
              <button
                type="button"
                onClick={() => setDetailMember(null)}
                className="px-4 py-2 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-800 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. ADMIN ADD / EDIT MEMBER MODAL */}
      {isAdmin && (isAddModalOpen || editMember) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-navy-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-navy-100">
              <h3 className="text-base font-bold text-navy-950">
                {editMember?.id ? 'Edit Committee Member' : 'Add Executive Committee Member'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false)
                  setEditMember(null)
                  setFormError(null)
                }}
                className="p-1 rounded-md text-navy-400 hover:text-navy-700 hover:bg-navy-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveMember} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Serial Number */}
                <div>
                  <label className="block font-semibold text-navy-700 mb-1">Serial Number *</label>
                  <input
                    type="number"
                    value={editMember?.serial_number ?? ''}
                    onChange={(e) =>
                      setEditMember((prev) => ({
                        ...prev,
                        serial_number: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                    required
                    className="w-full px-3 py-2 rounded-lg border border-navy-200 text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* Designation */}
                <div>
                  <label className="block font-semibold text-navy-700 mb-1">Designation *</label>
                  <input
                    type="text"
                    list="designation-suggestions"
                    value={editMember?.designation ?? ''}
                    onChange={(e) =>
                      setEditMember((prev) => ({ ...prev, designation: e.target.value }))
                    }
                    placeholder="e.g. Vice President or Member"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-navy-200 text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <datalist id="designation-suggestions">
                    <option value="President" />
                    <option value="Vice President" />
                    <option value="General Secretary" />
                    <option value="Secretary" />
                    <option value="Treasurer" />
                    <option value="Organization Secretary" />
                    <option value="Member" />
                  </datalist>
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block font-semibold text-navy-700 mb-1">
                  Full Name (with honorific, e.g. Shri / Mukhi / Smt.) *
                </label>
                <input
                  type="text"
                  value={editMember?.full_name ?? ''}
                  onChange={(e) =>
                    setEditMember((prev) => ({ ...prev, full_name: e.target.value }))
                  }
                  placeholder="e.g. Mukhi Ghanshyamdas Hemandas"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-navy-200 text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Nukh / Lineage */}
                <div>
                  <label className="block font-semibold text-navy-700 mb-1">Nukh / Lineage *</label>
                  <input
                    type="text"
                    value={editMember?.nukh ?? ''}
                    onChange={(e) =>
                      setEditMember((prev) => ({ ...prev, nukh: e.target.value }))
                    }
                    placeholder="e.g. Karatela, Kapoor, Khuha"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-navy-200 text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* City */}
                <div>
                  <label className="block font-semibold text-navy-700 mb-1">City *</label>
                  <input
                    type="text"
                    value={editMember?.city ?? ''}
                    onChange={(e) =>
                      setEditMember((prev) => ({ ...prev, city: e.target.value }))
                    }
                    placeholder="e.g. Bhavnagar, Jaipur"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-navy-200 text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Mobile Number */}
              <div>
                <label className="block font-semibold text-navy-700 mb-1">Mobile Number</label>
                <input
                  type="text"
                  value={editMember?.mobile_number ?? ''}
                  onChange={(e) =>
                    setEditMember((prev) => ({ ...prev, mobile_number: e.target.value }))
                  }
                  placeholder="10-digit mobile number"
                  className="w-full px-3 py-2 rounded-lg border border-navy-200 text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Active Status Checkbox */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="is_active_checkbox"
                  checked={editMember?.is_active ?? true}
                  onChange={(e) =>
                    setEditMember((prev) => ({ ...prev, is_active: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="is_active_checkbox" className="font-medium text-navy-800">
                  Active Committee Member
                </label>
              </div>

              <div className="pt-3 border-t border-navy-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false)
                    setEditMember(null)
                    setFormError(null)
                  }}
                  className="px-4 py-2 rounded-lg bg-navy-100 hover:bg-navy-200 text-navy-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpserting}
                  className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold disabled:opacity-50"
                >
                  {isUpserting ? 'Saving...' : 'Save Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. ADMIN DEACTIVATE CONFIRMATION MODAL */}
      {isAdmin && deactivatingMember && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-navy-100 space-y-4">
            <h3 className="text-base font-bold text-navy-950">
              {deactivatingMember.is_active ? 'Deactivate Member?' : 'Reactivate Member?'}
            </h3>
            <p className="text-xs text-navy-600 leading-relaxed">
              Are you sure you want to{' '}
              {deactivatingMember.is_active ? 'deactivate' : 'reactivate'}{' '}
              <strong>{deactivatingMember.full_name}</strong> (#{deactivatingMember.serial_number})?
              Deactivation preserves historical records in the archive.
            </p>

            <div className="pt-2 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDeactivatingMember(null)}
                className="px-3 py-1.5 rounded-lg bg-navy-100 text-navy-800 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTogglingStatus}
                onClick={handleConfirmToggleStatus}
                className={`px-3 py-1.5 rounded-lg text-white font-semibold ${
                  deactivatingMember.is_active
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                } disabled:opacity-50`}
              >
                {isTogglingStatus
                  ? 'Processing...'
                  : deactivatingMember.is_active
                  ? 'Confirm Deactivation'
                  : 'Confirm Reactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Sub-renderer for Member Card
  function renderMemberCard(member: ExecutiveCommitteeMember) {
    return (
      <div
        key={member.id}
        className="rounded-xl border border-navy-200 bg-white p-4 shadow-2xs hover:shadow-sm transition-shadow flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-100 text-navy-800 text-[11px] font-bold ring-1 ring-navy-200">
                #{member.serial_number}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getDesignationBadgeClass(
                  member.designation
                )}`}
              >
                {member.designation}
              </span>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 className="h-3 w-3" />
              Official
            </span>
          </div>

          <h3 className="text-sm font-bold text-navy-950 tracking-tight">
            {member.full_name}
          </h3>

          <div className="mt-2.5 space-y-1 text-xs text-navy-600">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-navy-400 shrink-0" />
              <span>Nukh: <strong className="text-navy-800">{member.nukh || '—'}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-navy-400 shrink-0" />
              <span>City: <strong className="text-navy-800">{member.city}</strong></span>
            </div>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-navy-100 space-y-2">
          {member.mobile_number ? (
            <div className="flex items-center justify-between text-xs">
              <span className="text-navy-400">Phone:</span>
              <a
                href={`tel:${member.mobile_number}`}
                className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-800 hover:underline"
              >
                <Phone className="h-3 w-3" />
                <span>{member.mobile_number}</span>
              </a>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-1 pt-1">
            <button
              type="button"
              onClick={() => setDetailMember(member)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-600 hover:text-navy-900 hover:underline"
            >
              <Eye className="h-3 w-3" />
              <span>View Details</span>
            </button>

            {/* Admin Management Actions */}
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="Edit Member"
                  onClick={() => {
                    setEditMember(member)
                    setFormError(null)
                    setIsAddModalOpen(true)
                  }}
                  className="p-1 rounded text-navy-500 hover:text-navy-900 hover:bg-navy-100"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title={member.is_active ? 'Deactivate Member' : 'Activate Member'}
                  onClick={() => setDeactivatingMember(member)}
                  className={`p-1 rounded ${
                    member.is_active
                      ? 'text-red-500 hover:text-red-700 hover:bg-red-50'
                      : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Sub-renderer for Member Table
  function renderMemberTable(memberList: ExecutiveCommitteeMember[]) {
    return (
      <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white shadow-2xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-navy-200 bg-navy-50/80 text-navy-700 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-2.5 px-3 w-12 text-center">No.</th>
              <th className="py-2.5 px-3">Designation</th>
              <th className="py-2.5 px-3">Full Name</th>
              <th className="py-2.5 px-3">Nukh</th>
              <th className="py-2.5 px-3">City</th>
              <th className="py-2.5 px-3">Mobile No</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-100 text-navy-800">
            {memberList.map((member) => (
              <tr key={member.id} className="hover:bg-navy-50/50 transition-colors">
                <td className="py-2.5 px-3 text-center font-bold text-navy-600">
                  #{member.serial_number}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${getDesignationBadgeClass(
                      member.designation
                    )}`}
                  >
                    {member.designation}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-bold text-navy-950">
                  {member.full_name}
                </td>
                <td className="py-2.5 px-3 text-navy-700">{member.nukh || '—'}</td>
                <td className="py-2.5 px-3 font-medium text-navy-700">{member.city}</td>
                <td className="py-2.5 px-3">
                  {member.mobile_number ? (
                    <a
                      href={`tel:${member.mobile_number}`}
                      className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      <span>{member.mobile_number}</span>
                    </a>
                  ) : (
                    <span className="text-navy-400">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right space-x-1">
                  <button
                    type="button"
                    onClick={() => setDetailMember(member)}
                    className="p-1 rounded text-navy-600 hover:text-navy-900 hover:bg-navy-100 inline-block"
                    title="View Details"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditMember(member)
                          setFormError(null)
                          setIsAddModalOpen(true)
                        }}
                        className="p-1 rounded text-navy-600 hover:text-navy-900 hover:bg-navy-100 inline-block"
                        title="Edit"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeactivatingMember(member)}
                        className={`p-1 rounded inline-block ${
                          member.is_active
                            ? 'text-red-500 hover:text-red-700 hover:bg-red-50'
                            : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={member.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
}
