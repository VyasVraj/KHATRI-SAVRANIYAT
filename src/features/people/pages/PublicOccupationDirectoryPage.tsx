/**
 * PublicOccupationDirectoryPage Component
 *
 * Publicly accessible community directory for discovering community members by profession.
 * Accessible to:
 * - Unauthenticated visitors
 * - Registered community users
 * - Mukhis
 * - Admins and Super Admins
 *
 * STRICT PRIVACY GOVERNANCE:
 * Displays ONLY:
 * 1. Person's full name
 * 2. Occupation / Profession (30 official categories or "Occupation Not Available")
 * 3. Associated Mukhi (Name + Region, or "Mukhi Not Assigned")
 *
 * Controlled contact routing is facilitated via Mukhi/Admin without disclosing personal phone/email.
 */

import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ROUTES } from '@/constants/app'
import {
  Briefcase,
  Search,
  UserCheck,
  Building,
  Loader2,
  X,
  Shield,
  ShieldCheck,
  Users,
  Clock,
  XCircle,
} from 'lucide-react'
import { OCCUPATION_CATEGORIES } from '@/constants/occupations'
import { useCommunityMukhis } from '@/features/community/hooks/useCommunityMukhis'
import {
  getPublicOccupationDirectory,
  type PublicOccupationItem,
} from '../services/public-occupation.service'
import { ContactThroughMukhiModal } from '../components/ContactThroughMukhiModal'
import { ContactThroughAdminModal } from '../components/ContactThroughAdminModal'
import { toProperCaseName } from '@/utils/text-casing'

export function PublicOccupationDirectoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOccupation, setSelectedOccupation] = useState('')
  const [selectedMukhiId, setSelectedMukhiId] = useState('')

  // Contact Through Mukhi modal state
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [contactTargetPerson, setContactTargetPerson] = useState<PublicOccupationItem | null>(null)

  // Contact Through Admin modal state
  const [adminModalOpen, setAdminModalOpen] = useState(false)
  const [adminTargetPerson, setAdminTargetPerson] = useState<PublicOccupationItem | null>(null)

  // Mukhis for filter dropdown
  const { mukhis: activeMukhis, isLoading: isLoadingMukhis } = useCommunityMukhis()

  // Load public directory records using TanStack Query for instant reactive updates & cache invalidation
  const {
    data: people = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['public-occupation-directory', selectedOccupation, selectedMukhiId, searchQuery],
    queryFn: async () => {
      const res = await getPublicOccupationDirectory({
        search: searchQuery,
        occupation: selectedOccupation,
        mukhiId: selectedMukhiId,
      })
      if (res.error) throw res.error
      return res.data || []
    },
    staleTime: 1000 * 30,
  })

  const fetchError = queryError ? (queryError as Error).message || 'Failed to load directory.' : null

  // Filter client-side if needed for instant responsiveness
  const filteredPeople = useMemo(() => {
    let result = people
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      result = result.filter(
        (p) =>
          p.full_name.toLowerCase().includes(q) ||
          p.occupation.toLowerCase().includes(q) ||
          (p.associated_mukhi_name && p.associated_mukhi_name.toLowerCase().includes(q)) ||
          (p.associated_mukhi_region && p.associated_mukhi_region.toLowerCase().includes(q))
      )
    }
    return result
  }, [people, searchQuery])

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedOccupation('')
    setSelectedMukhiId('')
  }

  const handleOpenMukhiContact = (person: PublicOccupationItem) => {
    setContactTargetPerson(person)
    setContactModalOpen(true)
  }

  const handleOpenAdminContact = (person: PublicOccupationItem) => {
    setAdminTargetPerson(person)
    setAdminModalOpen(true)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-navy-100 pb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-900 text-brand-300">
            <Briefcase className="h-4.5 w-4.5" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-700">
            Public Community Directory
          </span>
        </div>
        <h1 className="text-2xl font-bold text-navy-900 tracking-tight sm:text-3xl">
          Profession & Occupation Directory
        </h1>
        <p className="text-xs sm:text-sm text-navy-600 mt-1 max-w-3xl leading-normal">
          Explore and connect with verified community members across the 30 Official Occupation Categories. In accordance with strict community privacy standards, personal contact numbers remain private, and communication is securely facilitated through designated Mukhis or central leadership.
        </p>

        <div className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-blue-50/80 border border-blue-200 px-3.5 py-2 text-xs text-blue-900">
          <ShieldCheck className="h-4 w-4 text-blue-700 shrink-0" />
          <span>
            <strong>Privacy Assured:</strong> Only public member names, profession categories, and regional Mukhi assignments are displayed.
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        {/* Top Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by person name, occupation, or associated Mukhi name..."
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              aria-label="Clear search query"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Occupation Filter */}
          <div>
            <label className="block text-[11px] font-bold text-navy-800 uppercase tracking-wide mb-1">
              Occupation Category
            </label>
            <select
              value={selectedOccupation}
              onChange={(e) => setSelectedOccupation(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium"
            >
              <option value="">All 30 Occupation Categories</option>
              {OCCUPATION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Associated Mukhi Filter */}
          <div>
            <label className="block text-[11px] font-bold text-navy-800 uppercase tracking-wide mb-1">
              Associated Mukhi
            </label>
            <select
              value={selectedMukhiId}
              onChange={(e) => setSelectedMukhiId(e.target.value)}
              disabled={isLoadingMukhis}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 font-medium disabled:opacity-50"
            >
              <option value="">All Associated Mukhis</option>
              {activeMukhis.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.gram || 'Regional'})
                </option>
              ))}
            </select>
          </div>

          {/* Action: Clear Filters */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              disabled={!searchQuery && !selectedOccupation && !selectedMukhiId}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors h-[38px]"
            >
              <X className="h-3.5 w-3.5" />
              <span>Clear Search & Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Results Table / Cards */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-navy-900 uppercase tracking-wide">
              Results: {filteredPeople.length} {filteredPeople.length === 1 ? 'Person' : 'People'}
            </span>
            {(selectedOccupation || selectedMukhiId || searchQuery) && (
              <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 border border-brand-200">
                Filtered
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Categorized via 30 Main Occupation Categories
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-500">
            <Loader2 className="h-7 w-7 animate-spin mx-auto mb-2 text-brand-600" />
            <p className="text-xs font-medium">Loading public directory...</p>
          </div>
        ) : fetchError ? (
          <div className="py-14 text-center text-slate-500 px-4">
            <Briefcase className="h-8 w-8 mx-auto mb-2 text-amber-500" />
            <p className="text-sm font-semibold text-slate-800">Directory Temporarily Unavailable</p>
            <p className="text-xs text-slate-500 mt-1">{fetchError}</p>
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="py-16 text-center text-slate-500 px-4">
            <Users className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">
              No community members found matching your search.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Try selecting another occupation category or clearing the search filter.
            </p>
            <div className="mt-4">
              <button
                onClick={clearFilters}
                className="text-xs font-semibold text-brand-600 hover:text-brand-800 underline"
              >
                Clear all filters
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile Cards (Screens < 768px) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredPeople.map((person) => {
                const mukhiName = person.associated_mukhi_name
                const mukhiRegion = person.associated_mukhi_region

                return (
                  <div key={person.person_id} className="p-3.5 space-y-2.5 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-navy-900 text-sm break-words">
                          <Link
                            to={ROUTES.PERSON_DETAIL(person.person_id)}
                            className="hover:text-brand-600 transition-colors"
                          >
                            {toProperCaseName(person.full_name)}
                          </Link>
                        </h4>
                        {mukhiName ? (
                          <div className="flex items-center gap-1 text-[11px] text-slate-600 mt-0.5">
                            <UserCheck className="h-3 w-3 text-brand-600 shrink-0" />
                            <span className="font-medium truncate">{mukhiName}</span>
                            {mukhiRegion && <span className="text-slate-400">({mukhiRegion})</span>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 italic mt-0.5">
                            <Building className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>Mukhi Not Assigned</span>
                          </div>
                        )}
                      </div>

                      {/* Occupation Status Badge */}
                      <div className="shrink-0">
                        {person.occupation === 'Occupation Pending' || person.occupation_status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                            <Clock className="h-3 w-3 text-amber-600" />
                            <span>Pending</span>
                          </span>
                        ) : person.occupation === 'Occupation Rejected' || person.occupation_status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200">
                            <XCircle className="h-3 w-3 text-rose-600" />
                            <span>Rejected</span>
                          </span>
                        ) : person.occupation === 'Occupation Not Provided' || person.occupation_status === 'NOT_PROVIDED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">
                            <Briefcase className="h-3 w-3 text-slate-400" />
                            <span>Not Provided</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 border border-blue-200">
                            <Briefcase className="h-3 w-3 text-blue-600" />
                            <span>{person.occupation}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons on mobile: full width 2 columns */}
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleOpenMukhiContact(person)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-2.5 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors shadow-2xs h-[36px]"
                        title={mukhiName ? `Contact through ${mukhiName}` : 'Contact through Mukhi'}
                      >
                        <UserCheck className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                        <span className="truncate">Via Mukhi</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenAdminContact(person)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-navy-900 bg-navy-900 px-2.5 py-2 text-xs font-semibold text-white hover:bg-navy-800 transition-colors shadow-2xs h-[36px]"
                      >
                        <Shield className="h-3.5 w-3.5 text-brand-300 shrink-0" />
                        <span className="truncate">Via Admin</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop Table View (Screens >= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                  <th className="px-4 sm:px-5 py-3">Person Name</th>
                  <th className="px-4 py-3">Occupation / Profession</th>
                  <th className="px-4 py-3">Associated Mukhi</th>
                  <th className="px-4 sm:px-5 py-3 text-right min-w-[340px]">Contact Channel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredPeople.map((person) => {
                  const mukhiName = person.associated_mukhi_name
                  const mukhiRegion = person.associated_mukhi_region

                  return (
                    <tr
                      key={person.person_id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-4 sm:px-5 py-3.5 font-bold text-navy-900">
                        <Link
                          to={ROUTES.PERSON_DETAIL(person.person_id)}
                          className="hover:text-brand-600 transition-colors"
                        >
                          {toProperCaseName(person.full_name)}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        {person.occupation === 'Occupation Pending' || person.occupation_status === 'PENDING' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                            <Clock className="h-3 w-3 text-amber-600" />
                            <span>Occupation Pending</span>
                          </span>
                        ) : person.occupation === 'Occupation Rejected' || person.occupation_status === 'REJECTED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800 border border-rose-200">
                            <XCircle className="h-3 w-3 text-rose-600" />
                            <span>Occupation Rejected</span>
                          </span>
                        ) : person.occupation === 'Occupation Not Provided' || person.occupation_status === 'NOT_PROVIDED' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 border border-slate-200">
                            <Briefcase className="h-3 w-3 text-slate-400" />
                            <span>Occupation Not Provided</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
                            <Briefcase className="h-3 w-3 text-blue-600" />
                            <span>{person.occupation}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700">
                        {mukhiName ? (
                          <div>
                            <span className="font-semibold text-navy-900 flex items-center gap-1">
                              <UserCheck className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                              <span>{mukhiName}</span>
                            </span>
                            {mukhiRegion && (
                              <span className="text-[11px] text-slate-500 block pl-4.5">
                                {mukhiRegion}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 italic">
                            <Building className="h-3.5 w-3.5 text-slate-400" />
                            <span>Mukhi Not Assigned</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 sm:px-5 py-3.5 text-right">
                        <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-2 flex-wrap">
                          {/* Button 1: Contact Through Mukhi */}
                          <button
                            type="button"
                            onClick={() => handleOpenMukhiContact(person)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50/70 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 hover:text-brand-900 transition-colors shadow-2xs whitespace-nowrap cursor-pointer active:scale-95"
                            title={
                              mukhiName
                                ? `Contact through ${mukhiName}`
                                : 'Contact through Mukhi leadership'
                            }
                          >
                            <UserCheck className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                            <span>Contact Through Mukhi</span>
                          </button>

                          {/* Button 2: Contact Through Admin */}
                          <button
                            type="button"
                            onClick={() => handleOpenAdminContact(person)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-2xs whitespace-nowrap cursor-pointer active:scale-95"
                            title="Contact through Central Administration"
                          >
                            <Shield className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <span>Contact Through Admin</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>

      {/* Controlled Contact Through Mukhi Modal */}
      <ContactThroughMukhiModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        person={contactTargetPerson}
        onSwitchToAdmin={(p) => {
          setContactModalOpen(false)
          setAdminTargetPerson(p)
          setAdminModalOpen(true)
        }}
      />

      {/* Controlled Contact Through Admin Modal */}
      <ContactThroughAdminModal
        isOpen={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        person={adminTargetPerson}
      />
    </div>
  )
}
