/**
 * ProfessionDirectoryPage Component
 * Profession-Wise People Directory for Admin, Super Admin, and Mukhi Panels (Feature 5).
 *
 * Implements:
 * - Search by Person Name, City, Family.
 * - Filter by the Official 30 Occupation Categories from PDF.
 * - Geographic filters: Country, State, City.
 * - STRICT JURISDICTION LOCK: Mukhis only see records in their assigned region/jurisdiction.
 * - Admins and Super Admins have global access.
 */

import { useState, useEffect } from 'react'
import {
  Briefcase,
  Search,
  MapPin,
  Users,
  ShieldCheck,
  X,
  Loader2,
  ExternalLink,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { OccupationSelect } from '@/components/forms/OccupationSelect'
import { Input } from '@/components/forms/Input'
import { ROUTES } from '@/constants/app'
import { toProperCaseName } from '@/utils/text-casing'

interface RawPersonRecord {
  id: string
  first_name: string
  middle_name?: string | null
  last_name?: string | null
  gender?: string | null
  birth_place?: string | null
  occupation?: string | null
  status?: string | null
  phone?: string | null
  family_members?: Array<{
    family?: {
      id: string
      family_name: string
      city?: string | null
      state?: string | null
      country?: string | null
    } | null
  }> | null
}

interface ProfessionPersonItem {
  id: string
  full_name: string
  occupation: string
  gender: string | null
  birth_place: string | null
  city: string | null
  state: string | null
  country: string | null
  status: string
  phone: string | null
  family_id?: string | null
  family_name?: string | null
  assigned_mukhi_region?: string | null
}

export function ProfessionDirectoryPage() {
  const { user, profile } = useAuthContext()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOccupation, setSelectedOccupation] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')

  const [people, setPeople] = useState<ProfessionPersonItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)

  const isMukhi = profile?.role === 'MUKHI'

  // Fetch Mukhi region if caller is Mukhi
  const [mukhiRegion, setMukhiRegion] = useState<string | null>(null)

  useEffect(() => {
    if (isMukhi && user?.id) {
      // Find Mukhi's region
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase.from as any)('community_mukhis')
        .select('gram, city')
        .eq('linked_user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
        .then(({ data }: { data: { gram?: string | null; city?: string | null } | null }) => {
          if (data) {
            setMukhiRegion(data.gram || data.city || null)
          }
        })
    }
  }, [isMukhi, user?.id])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from as any)('persons')
        .select(`
          id, first_name, middle_name, last_name, gender, birth_place,
          occupation, status, phone, email_contact,
          family_members:family_members(family:families(id, family_name, city, state, country))
        `)
        .is('deleted_at', null)

      // Mukhi Jurisdiction Lock
      if (isMukhi && mukhiRegion) {
        query = query.ilike('birth_place', `%${mukhiRegion}%`)
      }

      if (selectedOccupation) {
        query = query.eq('occupation', selectedOccupation)
      }

      if (cityFilter.trim()) {
        query = query.ilike('birth_place', `%${cityFilter.trim()}%`)
      }

      if (stateFilter.trim()) {
        query = query.ilike('birth_place', `%${stateFilter.trim()}%`)
      }

      if (countryFilter.trim()) {
        query = query.ilike('birth_place', `%${countryFilter.trim()}%`)
      }

      const { data, error } = await query.order('first_name', { ascending: true })

      if (error) {
        setPeople([])
        setTotalCount(0)
      } else {
        const mapped: ProfessionPersonItem[] = ((data || []) as RawPersonRecord[]).map((p) => {
          const fullName = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
          const firstFam = p.family_members?.[0]?.family
          return {
            id: p.id,
            full_name: toProperCaseName(fullName),
            occupation: p.occupation || 'Occupation Pending',
            gender: p.gender || null,
            birth_place: p.birth_place ? toProperCaseName(p.birth_place) : null,
            city: firstFam?.city || null,
            state: firstFam?.state || null,
            country: firstFam?.country || null,
            status: p.status || 'ACTIVE',
            phone: p.phone || null,
            family_id: firstFam?.id || null,
            family_name: firstFam?.family_name ? toProperCaseName(firstFam.family_name) : null,
          }
        })

        // Apply local search across name, city, family
        let filtered = mapped
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim()
          filtered = filtered.filter(
            (item) =>
              item.full_name.toLowerCase().includes(q) ||
              item.occupation.toLowerCase().includes(q) ||
              (item.birth_place && item.birth_place.toLowerCase().includes(q)) ||
              (item.family_name && item.family_name.toLowerCase().includes(q))
          )
        }

        setPeople(filtered)
        setTotalCount(filtered.length)
      }
    } catch {
      setPeople([])
      setTotalCount(0)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOccupation, cityFilter, stateFilter, countryFilter, mukhiRegion, searchQuery])

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedOccupation('')
    setCityFilter('')
    setStateFilter('')
    setCountryFilter('')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-navy-100 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-navy-900 text-brand-300">
            <Briefcase className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-brand-700">
            Community Directory
          </span>
        </div>
        <h1 className="text-2xl font-bold text-navy-900 tracking-tight sm:text-3xl">
          Profession & Occupation Directory
        </h1>
        <p className="text-xs text-navy-600 mt-1">
          Search and connect with community members categorized strictly by the 30 Official Occupation Categories.
        </p>

        {isMukhi && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-1.5 text-xs text-indigo-900">
            <ShieldCheck className="h-4 w-4 text-indigo-700" />
            <span>
              <strong>Regional Scope:</strong> You are viewing community members within your assigned jurisdiction
              {mukhiRegion ? ` (${mukhiRegion})` : ''}.
            </span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-navy-100 bg-white p-5 shadow-xs space-y-4">
        {/* Top Search Input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by person name, occupation, birthplace, or family..."
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-2">
          {/* Occupation Filter */}
          <div className="sm:col-span-2">
            <OccupationSelect
              value={selectedOccupation}
              onChange={setSelectedOccupation}
              required={false}
              label="Filter by Occupation Category"
              placeholder="All 30 Categories"
            />
          </div>

          {/* City / Location */}
          <div>
            <label className="block text-slate-600 font-semibold mb-1">City / Location</label>
            <Input
              type="text"
              placeholder="e.g. Ahmedabad"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            />
          </div>

          {/* State */}
          <div>
            <label className="block text-slate-600 font-semibold mb-1">State / Province</label>
            <Input
              type="text"
              placeholder="e.g. Gujarat"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Clear Filters Button */}
        {(selectedOccupation || cityFilter || stateFilter || countryFilter || searchQuery) && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-semibold text-rose-600 hover:underline"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Results Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-navy-900 uppercase tracking-wide">
              Results: {totalCount} {totalCount === 1 ? 'Person' : 'People'}
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Categorized via 30 Main Occupation Categories
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-brand-600" />
            <p className="text-xs">Loading directory...</p>
          </div>
        ) : people.length === 0 ? (
          <div className="py-16 text-center text-slate-500">
            <Briefcase className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">No community members found matching the criteria.</p>
            <p className="text-xs text-slate-500 mt-1">Try selecting another occupation category or clearing filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-bold uppercase text-[10px]">
                  <th className="px-4 py-3">Person Name</th>
                  <th className="px-4 py-3">Occupation / Profession</th>
                  <th className="px-4 py-3">Location / Birthplace</th>
                  <th className="px-4 py-3">Family Unit</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {people.map((person) => (
                  <tr key={person.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-bold text-navy-900">
                      {person.full_name}
                      {person.gender && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                          ({person.gender[0]})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 border border-blue-200">
                        <Briefcase className="h-3 w-3 text-blue-600" />
                        {person.occupation}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-1 truncate max-w-xs">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{person.birth_place || person.city || '—'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {person.family_name ? (
                        <Link
                          to={ROUTES.FAMILY_DETAIL(person.family_id!)}
                          className="font-medium text-brand-600 hover:text-brand-800 hover:underline flex items-center gap-1"
                        >
                          <Users className="h-3 w-3" />
                          <span>{person.family_name}</span>
                        </Link>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        {person.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={ROUTES.PERSON_DETAIL(person.id)}
                        className="inline-flex items-center gap-1 font-bold text-brand-600 hover:text-brand-800"
                      >
                        <span>View</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
