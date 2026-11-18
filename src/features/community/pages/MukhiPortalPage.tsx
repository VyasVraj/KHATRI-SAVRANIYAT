/**
 * MukhiPortalPage Component
 * Dedicated Administrative Portal for Active Authorized Community Mukhis.
 *
 * Scope:
 * - View assigned families under Mukhi jurisdiction.
 * - View member counts and family head census info.
 * - Review contact and assistance requests routed to Mukhi.
 * - Permissions: Access strictly governed to assigned families.
 */

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield,
  Users,
  Home,
  MessageSquare,
  ArrowRight,
  MapPin,
  Search,
  Loader2,
} from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useCommunityMukhis } from '../hooks/useCommunityMukhis'
import { supabase } from '@/lib/supabase'
import { toProperCaseName } from '@/utils/text-casing'

interface AssignedFamily {
  id: string
  family_name: string
  city: string | null
  state: string | null
  created_at: string
  member_count: number
  head_name: string | null
  head_person_id: string | null
}

interface MukhiAssistanceRequest {
  id: string
  requester_name: string
  requester_phone: string
  requester_email: string | null
  message: string | null
  status: string
  created_at: string
  target_person_name?: string
}

export function MukhiPortalPage() {
  const { user } = useAuthContext()
  const { mukhis } = useCommunityMukhis()

  const [selectedMukhiId, setSelectedMukhiId] = useState<string>('')
  const [families, setFamilies] = useState<AssignedFamily[]>([])
  const [requests, setRequests] = useState<MukhiAssistanceRequest[]>([])
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [activeTab, setActiveTab] = useState<'families' | 'requests'>('families')
  const [searchQuery, setSearchQuery] = useState('')

  // Find Mukhi linked to user, or first active mukhi for Admin
  const activeMukhiList = useMemo(() => {
    return mukhis.filter((m) => m.is_active && (m.authority_status === 'ACTIVE' || !m.authority_status))
  }, [mukhis])

  useEffect(() => {
    if (activeMukhiList.length > 0 && !selectedMukhiId) {
      // Find if current user is linked to a Mukhi
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linked = activeMukhiList.find((m: any) => m.user_id === user?.id)
      if (linked) {
        setSelectedMukhiId(linked.id)
      } else {
        setSelectedMukhiId(activeMukhiList[0].id)
      }
    }
  }, [activeMukhiList, user?.id, selectedMukhiId])

  // Current selected mukhi object
  const currentMukhi = useMemo(() => {
    return activeMukhiList.find((m) => m.id === selectedMukhiId) || activeMukhiList[0]
  }, [activeMukhiList, selectedMukhiId])

  // Load families and requests for this Mukhi
  useEffect(() => {
    if (!selectedMukhiId) return

    let isMounted = true
    setIsLoadingData(true)

    async function loadMukhiData() {
      try {
        // 1. Fetch assigned families
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: fams, error: famError } = await (supabase.from('families') as any)
          .select('id, family_name, city, state, created_at')
          .eq('selected_mukhi_id', selectedMukhiId)
          .is('deleted_at', null)

        if (famError) throw famError

        if (!fams || fams.length === 0) {
          if (isMounted) {
            setFamilies([])
            setRequests([])
            setIsLoadingData(false)
          }
          return
        }

        const famIds = (fams as Array<{ id: string }>).map((f) => f.id)

        // 2. Fetch members of these families to count members & find head
        const { data: members } = await supabase
          .from('family_members')
          .select('id, family_id, is_head, person_id, persons(first_name, last_name)')
          .in('family_id', famIds)
          .is('left_at', null)

        // Map member counts & heads
        const famCountMap = new Map<string, number>()
        const famHeadMap = new Map<string, { head_name: string; head_id: string }>()

        members?.forEach((m) => {
          famCountMap.set(m.family_id, (famCountMap.get(m.family_id) || 0) + 1)
          if (m.is_head) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = m.persons as any
            const hName = p ? toProperCaseName(`${p.first_name || ''} ${p.last_name || ''}`.trim()) : 'Head'
            famHeadMap.set(m.family_id, { head_name: hName, head_id: m.person_id })
          }
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedFamilies: AssignedFamily[] = (fams as any[]).map((f: any) => ({
          id: f.id,
          family_name: f.family_name,
          city: f.city,
          state: f.state,
          created_at: f.created_at,
          member_count: famCountMap.get(f.id) || 0,
          head_name: famHeadMap.get(f.id)?.head_name || null,
          head_person_id: famHeadMap.get(f.id)?.head_id || null,
        }))

        // 3. Fetch contact requests for persons in these families
        const allPersonIds = members?.map((m) => m.person_id) || []
        if (allPersonIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: reqs } = await (supabase.from as any)('occupation_contact_requests')
            .select('id, requester_name, requester_phone, requester_email, message, status, created_at, target_person_id, persons(first_name, last_name)')
            .in('target_person_id', allPersonIds)
            .order('created_at', { ascending: false })

          if (isMounted && reqs) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mappedReqs = reqs.map((r: any) => ({
              id: r.id,
              requester_name: r.requester_name,
              requester_phone: r.requester_phone,
              requester_email: r.requester_email,
              message: r.message,
              status: r.status,
              created_at: r.created_at,
              target_person_name: r.persons
                ? toProperCaseName(`${r.persons.first_name || ''} ${r.persons.last_name || ''}`.trim())
                : 'Community Member',
            }))
            setRequests(mappedReqs)
          }
        }

        if (isMounted) {
          setFamilies(mappedFamilies)
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error loading Mukhi Portal data:', err)
      } finally {
        if (isMounted) {
          setIsLoadingData(false)
        }
      }
    }

    loadMukhiData()

    return () => {
      isMounted = false
    }
  }, [selectedMukhiId])

  // Total members in jurisdiction
  const totalJurisdictionMembers = useMemo(() => {
    return families.reduce((acc, f) => acc + f.member_count, 0)
  }, [families])

  // Filtered families
  const filteredFamilies = useMemo(() => {
    if (!searchQuery.trim()) return families
    const q = searchQuery.toLowerCase().trim()
    return families.filter(
      (f) =>
        f.family_name.toLowerCase().includes(q) ||
        (f.head_name && f.head_name.toLowerCase().includes(q)) ||
        (f.city && f.city.toLowerCase().includes(q))
    )
  }, [families, searchQuery])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-navy-100 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-700 text-white shadow-xs">
              <Shield className="h-4.5 w-4.5" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-800">
              Community Leadership
            </span>
          </div>
          <h1 className="text-2xl font-bold text-navy-900 tracking-tight sm:text-3xl">
            Mukhi Portal & Jurisdiction Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-navy-600 mt-1 max-w-2xl leading-normal">
            {currentMukhi ? `Authority: ${currentMukhi.full_name} (${currentMukhi.gram || 'Regional'}). ` : ''}
            Manage and oversee census records, family details, and community assistance requests
            for families assigned to your Mukhi authority.
          </p>
        </div>

        {/* Mukhi Switcher (Available to Admin/Super Admin or Mukhis with multiple assignments) */}
        {activeMukhiList.length > 1 && (
          <div className="w-full md:w-72">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-navy-700 mb-1">
              Active Mukhi Authority
            </label>
            <select
              value={selectedMukhiId}
              onChange={(e) => setSelectedMukhiId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-navy-900 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-2xs"
            >
              {activeMukhiList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.gram || 'Regional'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <Home className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-navy-900">{families.length}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-navy-500">
              Assigned Families
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-navy-900">{totalJurisdictionMembers}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-navy-500">
              Total Community Members
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-navy-900">{requests.length}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-navy-500">
              Assistance & Contact Requests
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-bold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setActiveTab('families')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'families'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Home className="h-4 w-4" />
          Assigned Families ({families.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'requests'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Assistance Requests ({requests.length})
        </button>
      </div>

      {/* Main Tab Content */}
      {isLoadingData ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin mb-2 text-brand-600" />
          <span className="text-xs font-medium">Loading Mukhi records...</span>
        </div>
      ) : activeTab === 'families' ? (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assigned families or heads..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            {filteredFamilies.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <Home className="mx-auto h-8 w-8 text-slate-300" />
                <p className="text-xs sm:text-sm font-medium">
                  No families currently assigned to this Mukhi authority.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Family Name</th>
                      <th className="px-5 py-3">Head of Family</th>
                      <th className="px-5 py-3">Location</th>
                      <th className="px-5 py-3">Members</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFamilies.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-4 font-bold text-navy-900 whitespace-nowrap">
                          {f.family_name}
                        </td>
                        <td className="px-5 py-4 text-slate-700 whitespace-nowrap">
                          {f.head_name ? (
                            <span className="font-semibold">{f.head_name}</span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-600 whitespace-nowrap">
                          {f.city ? (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{f.city}{f.state ? `, ${f.state}` : ''}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Not set</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-800 border border-blue-200">
                            <Users className="h-3 w-3" />
                            {f.member_count} {f.member_count === 1 ? 'member' : 'members'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <Link
                            to={`/families/${f.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-900 transition-colors"
                          >
                            <span>Open Family Profile</span>
                            <ArrowRight className="h-3.5 w-3.5" />
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
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          {requests.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
              <p className="text-xs sm:text-sm font-medium">
                No active contact or assistance requests pending for your assigned families.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((r) => (
                <div key={r.id} className="p-5 hover:bg-slate-50/80 transition-colors space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-navy-900 text-sm">{r.requester_name}</span>
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                          {r.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Regarding member: <span className="font-semibold text-slate-700">{r.target_person_name}</span>
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-navy-800 border border-slate-200">
                    {r.message || 'No additional message provided.'}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-600 font-mono">
                    <span>Phone: {r.requester_phone}</span>
                    {r.requester_email && <span>Email: {r.requester_email}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
