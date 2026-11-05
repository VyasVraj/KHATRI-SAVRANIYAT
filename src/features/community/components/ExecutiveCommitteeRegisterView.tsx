/**
 * ExecutiveCommitteeRegisterView — Official 31-member Executive Committee (Karyakarini)
 * Directory for Khatri Sarvaniyat.
 *
 * Source of truth: Executive Committee Register PDF.
 */

import React, { useState, useMemo } from 'react'
import { Award, Search, Phone, MapPin, Shield, CheckCircle2, RotateCcw, LayoutGrid, Table as TableIcon } from 'lucide-react'
import { useExecutiveCommittee } from '../hooks/useExecutiveCommittee'

export const ExecutiveCommitteeRegisterView: React.FC = () => {
  const { members, isLoading, isError, error, refetch } = useExecutiveCommittee()

  const [search, setSearch] = useState('')
  const [selectedDesignation, setSelectedDesignation] = useState('ALL')
  const [selectedCity, setSelectedCity] = useState('ALL')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  // Derive distinct designations and cities for filters
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

  // Filter members
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
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
  }, [members, search, selectedDesignation, selectedCity])

  const hasActiveFilters = search.trim() !== '' || selectedDesignation !== 'ALL' || selectedCity !== 'ALL'

  const handleResetFilters = () => {
    setSearch('')
    setSelectedDesignation('ALL')
    setSelectedCity('ALL')
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

  return (
    <div className="space-y-6">
      {/* Title & Official Register Banner */}
      <div className="rounded-2xl border border-navy-800 bg-gradient-to-r from-navy-900 via-navy-950 to-navy-900 text-white p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40 shadow-xs">
                <Award className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl tracking-tight">
                Executive Committee Register (Karyakarini)
              </h2>
            </div>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Official 31-member governance council of Khatri Sarvaniyat community. Authoritative Mukhis and executive leadership.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-navy-700 bg-navy-800/80 px-4 py-2.5 text-center">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                Official Register
              </span>
              <span className="text-xl font-extrabold text-amber-400">
                {members.length || 31} Members
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
        </div>

        {/* Filter Summary and View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-navy-100 text-xs">
          <div className="flex items-center gap-2 text-navy-600">
            <span>
              Showing <strong>{filteredMembers.length}</strong> of <strong>{members.length}</strong> committee members
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

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-36 rounded-xl border border-navy-200 bg-white p-5 animate-pulse space-y-3"
            >
              <div className="h-4 w-1/3 bg-navy-100 rounded" />
              <div className="h-5 w-3/4 bg-navy-100 rounded" />
              <div className="h-4 w-1/2 bg-navy-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
          <p className="text-sm text-red-700">
            {error instanceof Error ? error.message : 'Failed to load committee register.'}
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

      {/* Empty State */}
      {!isLoading && !isError && filteredMembers.length === 0 && (
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

      {/* GRID VIEW */}
      {!isLoading && !isError && viewMode === 'grid' && filteredMembers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map((member) => (
            <div
              key={member.id}
              className="rounded-xl border border-navy-200 bg-white p-4 shadow-2xs hover:shadow-sm transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-100 text-navy-800 text-xs font-bold ring-1 ring-navy-200">
                      #{member.serial_number}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${getDesignationBadgeClass(
                        member.designation
                      )}`}
                    >
                      {member.designation}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" />
                    Official
                  </span>
                </div>

                <h3 className="text-base font-bold text-navy-950 tracking-tight">
                  {member.full_name}
                </h3>

                <div className="mt-3 space-y-1.5 text-xs text-navy-600">
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-navy-400 shrink-0" />
                    <span>Nukh: <strong className="text-navy-800">{member.nukh || '—'}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-navy-400 shrink-0" />
                    <span>City: <strong className="text-navy-800">{member.city}</strong></span>
                  </div>
                </div>
              </div>

              {member.mobile_number && (
                <div className="mt-4 pt-3 border-t border-navy-100 flex items-center justify-between text-xs">
                  <span className="text-navy-500">Contact:</span>
                  <a
                    href={`tel:${member.mobile_number}`}
                    className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-800 hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <span>{member.mobile_number}</span>
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TABLE VIEW */}
      {!isLoading && !isError && viewMode === 'table' && filteredMembers.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-navy-200 bg-white shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-navy-200 bg-navy-50/80 text-navy-700 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3.5 w-14 text-center">No.</th>
                <th className="py-3 px-4">Designation</th>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Nukh</th>
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4 text-right">Mobile No</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100 text-navy-800">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-navy-50/50 transition-colors">
                  <td className="py-3 px-3.5 text-center font-bold text-navy-600">
                    #{member.serial_number}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${getDesignationBadgeClass(
                        member.designation
                      )}`}
                    >
                      {member.designation}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-navy-950">
                    {member.full_name}
                  </td>
                  <td className="py-3 px-4 text-navy-700">
                    {member.nukh || '—'}
                  </td>
                  <td className="py-3 px-4 font-medium text-navy-700">
                    {member.city}
                  </td>
                  <td className="py-3 px-4 text-right">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
