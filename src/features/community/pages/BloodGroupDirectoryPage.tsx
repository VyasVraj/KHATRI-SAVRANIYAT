/**
 * BloodGroupDirectoryPage Component
 * Community Directory for connecting members across the 8 blood groups.
 * Provides emergency routing through the person's Family Head without exposing private contact info.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Heart,
  Search,
  MapPin,
  Users,
  Shield,
  Loader2,
  X,
  PhoneCall,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import {
  getBloodDirectoryMembers,
  type BloodDirectoryMember,
} from '../services/blood-directory.service'
import { ContactFamilyHeadBloodModal } from '../components/ContactFamilyHeadBloodModal'

const BLOOD_GROUPS_LIST = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

export function BloodGroupDirectoryPage() {
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [members, setMembers] = useState<BloodDirectoryMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<BloodDirectoryMember | null>(null)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setError(null)

    getBloodDirectoryMembers({
      bloodGroup: selectedBloodGroup,
      search: searchQuery,
    })
      .then((res) => {
        if (!isMounted) return
        if (res.error) {
          setError(res.error.message)
          setMembers([])
        } else {
          setMembers(res.data || [])
        }
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err.message || 'Failed to load blood directory.')
        setMembers([])
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [selectedBloodGroup, searchQuery])

  // Count by blood group
  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    BLOOD_GROUPS_LIST.forEach((bg) => {
      counts[bg] = members.filter((m) => m.blood_group === bg).length
    })
    return counts
  }, [members])

  const handleOpenContact = (member: BloodDirectoryMember) => {
    setSelectedMember(member)
    setModalOpen(true)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-navy-100 pb-5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600 text-white shadow-xs">
            <Heart className="h-4.5 w-4.5 fill-current" />
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-rose-700">
            Emergency Community Directory
          </span>
        </div>
        <h1 className="text-2xl font-bold text-navy-900 tracking-tight sm:text-3xl">
          Blood Group Directory
        </h1>
        <p className="text-xs sm:text-sm text-navy-600 mt-1 max-w-3xl leading-normal">
          Explore and connect with verified community members across all 8 blood groups.
          To maintain strict privacy, personal phone numbers remain confidential and communication
          is routed securely through the designated Family Head.
        </p>

        {/* Privacy badge */}
        <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-1.5 text-xs text-rose-800">
          <Shield className="h-3.5 w-3.5 text-rose-600 shrink-0" />
          <span className="font-medium">
            Contact Through Family Head: Direct numbers are protected; requests are routed to the member&apos;s Family Head.
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
        {/* Blood Group Selector Chips */}
        <div>
          <label className="block text-[11px] font-bold text-navy-800 uppercase tracking-wide mb-2">
            Filter by Blood Group (8 Groups)
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedBloodGroup('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                selectedBloodGroup === 'ALL'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All 8 Blood Groups
            </button>
            {BLOOD_GROUPS_LIST.map((bg) => (
              <button
                key={bg}
                type="button"
                onClick={() => setSelectedBloodGroup(bg)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  selectedBloodGroup === bg
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:border-rose-300'
                }`}
              >
                {bg}
                {groupCounts[bg] ? ` (${groupCounts[bg]})` : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by person name, city, state, or family name..."
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results Header */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-navy-900 uppercase tracking-wide">
              Results: {members.length} {members.length === 1 ? 'Person' : 'People'}
            </span>
            {selectedBloodGroup !== 'ALL' && (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                Group {selectedBloodGroup}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Excludes blank and deceased records
          </span>
        </div>

        {/* Content Table / Cards */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin mb-2 text-rose-600" />
            <span className="text-xs font-medium">Loading blood group directory...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-600">{error}</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Heart className="mx-auto h-8 w-8 text-slate-300" />
            <p className="text-xs sm:text-sm font-medium">
              No verified members found for this criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Person Name</th>
                  <th className="px-5 py-3">Blood Group</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Family Head</th>
                  <th className="px-5 py-3 text-right">Emergency Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.person_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 font-bold text-navy-900 whitespace-nowrap">
                      {m.full_name}
                      {m.family_name && (
                        <div className="text-[11px] font-normal text-slate-500">
                          {m.family_name}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-extrabold text-rose-700 border border-rose-200">
                        <Heart className="h-3 w-3 fill-rose-600 text-rose-600" />
                        {m.blood_group}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600 whitespace-nowrap">
                      {m.city ? (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>
                            {m.city}
                            {m.state ? `, ${m.state}` : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Location unlisted</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                        <span className="font-medium">
                          {m.family_head_name || 'Family Head'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        onClick={() => handleOpenContact(m)}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-xs"
                      >
                        <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
                        Contact Through Family Head
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Emergency Contact Modal */}
      <ContactFamilyHeadBloodModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        member={selectedMember}
      />
    </div>
  )
}
