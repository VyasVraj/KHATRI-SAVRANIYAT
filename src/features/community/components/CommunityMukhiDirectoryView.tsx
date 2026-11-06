/**
 * Component: CommunityMukhiDirectoryView
 *
 * Official Community Mukhi Directory displaying all 118 official records:
 * - Search by Mukhi name, Gram / City, Mobile number
 * - Filter by Gram / Location
 * - Card Grid and Table view modes
 * - Total count indicator
 */

import React, { useState, useMemo } from 'react'
import {
  Shield,
  Search,
  Phone,
  MapPin,
  RotateCcw,
  LayoutGrid,
  Table as TableIcon,
  Users,
} from 'lucide-react'
import { useCommunityMukhis } from '../hooks/useCommunityMukhis'
import { CommunityMukhiCard } from './CommunityMukhiCard'

export const CommunityMukhiDirectoryView: React.FC = () => {
  const { mukhis, isLoading, isError, error, refetch } = useCommunityMukhis()

  const [search, setSearch] = useState('')
  const [selectedGram, setSelectedGram] = useState('ALL')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')

  // Extract distinct locations for dropdown filter
  const grams = useMemo(() => {
    const set = new Set<string>()
    mukhis.forEach((m) => {
      if (m.gram) {
        set.add(m.gram)
      }
    })
    return ['ALL', ...Array.from(set).sort()]
  }, [mukhis])

  // Filtered Mukhi list
  const filteredMukhis = useMemo(() => {
    return mukhis.filter((m) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase().trim()
        const matchName = m.full_name.toLowerCase().includes(q)
        const matchGram = m.gram.toLowerCase().includes(q)
        const matchPhone = (m.mobile_number ?? '').includes(q)
        const matchSerial = String(m.source_serial_number) === q
        if (!matchName && !matchGram && !matchPhone && !matchSerial) {
          return false
        }
      }

      // Location / Gram
      if (selectedGram !== 'ALL' && m.gram !== selectedGram) {
        return false
      }

      return true
    })
  }, [mukhis, search, selectedGram])

  const hasActiveFilters = search.trim() !== '' || selectedGram !== 'ALL'

  const handleResetFilters = () => {
    setSearch('')
    setSelectedGram('ALL')
  }

  return (
    <div className="space-y-6">
      {/* Official Directory Banner */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 text-white p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/30 text-blue-300 ring-1 ring-blue-500/40 shadow-xs">
                <Shield className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-white sm:text-2xl tracking-tight uppercase">
                COMMUNITY MUKHI DIRECTORY
              </h2>
            </div>
            <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
              Official community registry of 118 regional Mukhis guiding Samaj welfare, arbitration, and genealogical records.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500/20 px-3.5 py-1.5 text-xs font-semibold text-blue-300 border border-blue-400/30">
              <Users className="h-4 w-4" />
              <span>{mukhis.length} Mukhis</span>
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Mukhi name, Gram / City, or Mobile..."
              className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Location / Gram Filter */}
          <div className="w-full md:w-64">
            <select
              value={selectedGram}
              onChange={(e) => setSelectedGram(e.target.value)}
              className="w-full min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-label="Filter by Location / Gram"
            >
              <option value="ALL">All Grams & Cities ({grams.length - 1})</option>
              {grams
                .filter((g) => g !== 'ALL')
                .map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
            </select>
          </div>

          {/* View Mode Toggle & Reset */}
          <div className="flex items-center gap-2 shrink-0">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                title="Reset filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}

            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex min-h-[36px] items-center justify-center rounded-md px-3 text-xs font-semibold transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex min-h-[36px] items-center justify-center rounded-md px-3 text-xs font-semibold transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Table view"
              >
                <TableIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Showing Count */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>
            Showing <strong className="font-semibold text-slate-800">{filteredMukhis.length}</strong> of{' '}
            <strong className="font-semibold text-slate-800">{mukhis.length}</strong> official Mukhis
          </span>
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-44 rounded-xl border border-slate-200 bg-white p-5 animate-pulse space-y-3"
            >
              <div className="h-4 w-16 bg-slate-200 rounded" />
              <div className="h-5 w-3/4 bg-slate-200 rounded" />
              <div className="h-4 w-1/2 bg-slate-100 rounded" />
              <div className="h-8 w-28 bg-slate-100 rounded mt-4" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-semibold text-rose-800">
            {error || 'Unable to load Community Mukhi Directory.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Retry
          </button>
        </div>
      ) : filteredMukhis.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <Shield className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No Mukhis Found</h3>
          <p className="mt-1 text-xs text-slate-500">
            No Community Mukhi records match your search &quot;{search}&quot;.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-4 inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Clear Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMukhis.map((mukhi) => (
            <CommunityMukhiCard key={mukhi.id || mukhi.source_serial_number} mukhi={mukhi} />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-4 py-3 w-16">Sr.</th>
                <th scope="col" className="px-4 py-3">Mukhi Name</th>
                <th scope="col" className="px-4 py-3">Gram / City / Location</th>
                <th scope="col" className="px-4 py-3">Mobile Number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredMukhis.map((m) => (
                <tr key={m.id || m.source_serial_number} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 font-bold text-blue-700">#{m.source_serial_number}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{m.full_name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      <span>{m.gram}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {m.mobile_number ? (
                      <a
                        href={`tel:${m.mobile_number}`}
                        className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-800"
                      >
                        <Phone className="h-3 w-3" />
                        <span>{m.mobile_number}</span>
                      </a>
                    ) : (
                      <span className="text-slate-400 italic">—</span>
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
