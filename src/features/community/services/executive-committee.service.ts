/**
 * Executive Committee Service — 31-member official register & family Mukhi selection.
 *
 * Source of truth: Official Executive Committee Register (Karyakarini).
 * Provides access to all 31 official members with search and designation/city filtering.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'

export interface ExecutiveCommitteeMember {
  id: string
  serial_number: number
  designation: string
  full_name: string
  nukh: string
  city: string
  mobile_number: string
  is_active: boolean
  linked_person_id?: string | null
  linked_user_id?: string | null
  created_at?: string
}

export interface ExecutiveCommitteeFilters {
  search?: string
  designation?: string
  city?: string
}

/** Official 31-member fallback seed data from Executive Committee Register.pdf */
export const OFFICIAL_EXECUTIVE_COMMITTEE: ExecutiveCommitteeMember[] = [
  { id: 'exec-1', serial_number: 1, designation: 'President', full_name: 'Shri Vasant Kumar Jamnadas Pamnani', nukh: 'Karatela', city: 'Bhavnagar', mobile_number: '9033361661', is_active: true },
  { id: 'exec-2', serial_number: 2, designation: 'Vice President', full_name: 'Shri Yudhishthir Kevalram', nukh: 'Soneja', city: 'Ujjain', mobile_number: '9425332249', is_active: true },
  { id: 'exec-3', serial_number: 3, designation: 'Vice President', full_name: 'Shri Balkishan Gobindram', nukh: 'Dhandha', city: 'Pushkar', mobile_number: '9414300034', is_active: true },
  { id: 'exec-4', serial_number: 4, designation: 'Vice President', full_name: 'Smt. Heeradevi Basant Kumar', nukh: 'Khuha', city: 'Ujjain', mobile_number: '9977824443', is_active: true },
  { id: 'exec-5', serial_number: 5, designation: 'General Secretary', full_name: 'Mukhi Ghanshyamdas Hemandas', nukh: 'Kapoor', city: 'Bantva', mobile_number: '9909972633', is_active: true },
  { id: 'exec-6', serial_number: 6, designation: 'Secretary', full_name: 'Mukhi Jeevatram Gehimal', nukh: 'Keeri', city: 'Jetpur', mobile_number: '9426930441', is_active: true },
  { id: 'exec-7', serial_number: 7, designation: 'Treasurer', full_name: 'Shri Chandiram Jethanand', nukh: 'Khuha', city: 'Jaipur', mobile_number: '9314513167', is_active: true },
  { id: 'exec-8', serial_number: 8, designation: 'Organization Secretary', full_name: 'Mukhi Ghanshyamdas Kalloomal', nukh: 'Hargun', city: 'Ulhasnagar', mobile_number: '7066706525', is_active: true },
  { id: 'exec-9', serial_number: 9, designation: 'Member', full_name: 'Shri Bhojraj Bhai Mirchumal', nukh: 'Chhatpar', city: 'Deesa', mobile_number: '9426360264', is_active: true },
  { id: 'exec-10', serial_number: 10, designation: 'Member', full_name: 'Shri Chandra Prakash Veermal', nukh: 'Keeri', city: 'Ujjain', mobile_number: '9827397575', is_active: true },
  { id: 'exec-11', serial_number: 11, designation: 'Member', full_name: 'Shri Bherumal Nathumal', nukh: 'Somesar', city: 'Deoli', mobile_number: '9413860511', is_active: true },
  { id: 'exec-12', serial_number: 12, designation: 'Member', full_name: 'Shri Harish Kumar Chainmal', nukh: 'Acharya', city: 'Jaipur', mobile_number: '9414366681', is_active: true },
  { id: 'exec-13', serial_number: 13, designation: 'Member', full_name: 'Mukhi Gobindram Jethalal Janiyani', nukh: 'Khuha', city: 'Rajkot', mobile_number: '9879548959', is_active: true },
  { id: 'exec-14', serial_number: 14, designation: 'Member', full_name: 'Shri Mahesh Kumar Mohanlal', nukh: 'Varde', city: 'Beawar', mobile_number: '9829127009', is_active: true },
  { id: 'exec-15', serial_number: 15, designation: 'Member', full_name: 'Shri Dharmendra Ishwardas', nukh: 'Khuha', city: 'Jaipur', mobile_number: '9772891560', is_active: true },
  { id: 'exec-16', serial_number: 16, designation: 'Member', full_name: 'Shri Bharat Dulhanomal', nukh: 'Dhandha', city: 'Rajkot', mobile_number: '9328707428', is_active: true },
  { id: 'exec-17', serial_number: 17, designation: 'Member', full_name: 'Shri Vijay Kumar Utumal', nukh: 'Hargun', city: 'Jetpur', mobile_number: '9925928848', is_active: true },
  { id: 'exec-18', serial_number: 18, designation: 'Member', full_name: 'Shri Jaykishan Devidas', nukh: 'Khuha', city: 'Varanasi', mobile_number: '9415303951', is_active: true },
  { id: 'exec-19', serial_number: 19, designation: 'Member', full_name: 'Shri Harish Kumar Narumal', nukh: 'Dagiya', city: 'Ajmer', mobile_number: '9829732242', is_active: true },
  { id: 'exec-20', serial_number: 20, designation: 'Member', full_name: 'Shri Prakash Bhai (Pintu) Mandharam', nukh: 'Saraya', city: 'Surat', mobile_number: '9925314000', is_active: true },
  { id: 'exec-21', serial_number: 21, designation: 'Member', full_name: 'Shri Khemchand Umarnomal', nukh: 'Madhu', city: 'Vadodara', mobile_number: '9998178985', is_active: true },
  { id: 'exec-22', serial_number: 22, designation: 'Member', full_name: 'Mukhi Umesh Kumar Jashanmal', nukh: 'Dagiya', city: 'Hyderabad', mobile_number: '9849474375', is_active: true },
  { id: 'exec-23', serial_number: 23, designation: 'Member', full_name: 'Shri Khemchand Tarachand', nukh: 'Dagiya', city: 'Una', mobile_number: '9898145664', is_active: true },
  { id: 'exec-24', serial_number: 24, designation: 'Member', full_name: 'Shri Raju Bhai Atmaram', nukh: 'Dode', city: 'Rajkot', mobile_number: '9428349832', is_active: true },
  { id: 'exec-25', serial_number: 25, designation: 'Member', full_name: 'Shri Narayandas Vasantmal', nukh: 'Leea', city: 'Delhi', mobile_number: '8130148778', is_active: true },
  { id: 'exec-26', serial_number: 26, designation: 'Member', full_name: 'Shri Gobindram (Gopichand) Khushaldas', nukh: 'Dhabadiya', city: 'Sri Ganganagar', mobile_number: '6377671713', is_active: true },
  { id: 'exec-27', serial_number: 27, designation: 'Member', full_name: 'Smt. Dhanwanti Ben Dayaram', nukh: 'Makdiya', city: 'Jetpur', mobile_number: '7779080704', is_active: true },
  { id: 'exec-28', serial_number: 28, designation: 'Member', full_name: 'Smt. Radha Ben Naresh Kumar', nukh: 'Madhu', city: 'Jaipur', mobile_number: '9928350278', is_active: true },
  { id: 'exec-29', serial_number: 29, designation: 'Member', full_name: 'Smt. Deepika Ben Yashwant Bhai', nukh: 'Khuha', city: 'Deesa', mobile_number: '9409393990', is_active: true },
  { id: 'exec-30', serial_number: 30, designation: 'Member', full_name: 'Smt. Kanchan Ben Dilip Kumar', nukh: 'Chhatpar', city: 'Jaipur', mobile_number: '9119291086', is_active: true },
  { id: 'exec-31', serial_number: 31, designation: 'Member', full_name: 'Smt. Jyoti Ben Ashok Kumar', nukh: 'Dhandha', city: 'Jaipur', mobile_number: '9024193441', is_active: true },
]

/**
 * Fetch all 31 official Executive Committee members from Supabase,
 * with fallback to official register seed data if table is pending migration.
 */
export async function getExecutiveCommitteeMembers(
  filters: ExecutiveCommitteeFilters = {}
): Promise<ApiResponse<ExecutiveCommitteeMember[]>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from as any)('executive_committee_members')
      .select('*')
      .eq('is_active', true)

    if (filters.designation && filters.designation !== 'ALL') {
      query = query.eq('designation', filters.designation)
    }

    if (filters.city && filters.city !== 'ALL') {
      query = query.eq('city', filters.city)
    }

    const { data, error } = await query.order('serial_number', { ascending: true })

    if (error) {
      // Graceful fallback to official register dataset
      let list = [...OFFICIAL_EXECUTIVE_COMMITTEE]
      if (filters.search?.trim()) {
        const q = filters.search.toLowerCase().trim()
        list = list.filter(
          (m) =>
            m.full_name.toLowerCase().includes(q) ||
            m.city.toLowerCase().includes(q) ||
            m.nukh.toLowerCase().includes(q) ||
            m.designation.toLowerCase().includes(q)
        )
      }
      if (filters.designation && filters.designation !== 'ALL') {
        list = list.filter((m) => m.designation === filters.designation)
      }
      if (filters.city && filters.city !== 'ALL') {
        list = list.filter((m) => m.city.toLowerCase() === filters.city!.toLowerCase())
      }
      return { data: list, error: null }
    }

    let result = (data as unknown as ExecutiveCommitteeMember[]) ?? []

    if (filters.search?.trim()) {
      const q = filters.search.toLowerCase().trim()
      result = result.filter(
        (m) =>
          m.full_name.toLowerCase().includes(q) ||
          m.city.toLowerCase().includes(q) ||
          m.nukh.toLowerCase().includes(q) ||
          m.designation.toLowerCase().includes(q)
      )
    }

    return { data: result, error: null }
  } catch {
    let list = [...OFFICIAL_EXECUTIVE_COMMITTEE]
    if (filters.search?.trim()) {
      const q = filters.search.toLowerCase().trim()
      list = list.filter(
        (m) =>
          m.full_name.toLowerCase().includes(q) ||
          m.city.toLowerCase().includes(q) ||
          m.nukh.toLowerCase().includes(q) ||
          m.designation.toLowerCase().includes(q)
      )
    }
    if (filters.designation && filters.designation !== 'ALL') {
      list = list.filter((m) => m.designation === filters.designation)
    }
    if (filters.city && filters.city !== 'ALL') {
      list = list.filter((m) => m.city.toLowerCase() === filters.city!.toLowerCase())
    }
    return { data: list, error: null }
  }
}

/**
 * Fetch a single executive committee member by UUID.
 */
export async function getExecutiveCommitteeMember(
  id: string
): Promise<ApiResponse<ExecutiveCommitteeMember | null>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from as any)('executive_committee_members')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      const fallback = OFFICIAL_EXECUTIVE_COMMITTEE.find(
        (m) => m.id === id || String(m.serial_number) === id
      )
      return { data: fallback ?? null, error: null }
    }

    return { data: data as unknown as ExecutiveCommitteeMember, error: null }
  } catch {
    const fallback = OFFICIAL_EXECUTIVE_COMMITTEE.find(
      (m) => m.id === id || String(m.serial_number) === id
    )
    return { data: fallback ?? null, error: null }
  }
}

/**
 * Admin-only: Create or update an official Executive Committee record.
 */
export async function upsertExecutiveCommitteeMember(
  member: Partial<ExecutiveCommitteeMember>
): Promise<ApiResponse<ExecutiveCommitteeMember>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('admin_upsert_committee_member', {
      p_id: member.id || null,
      p_serial_number: member.serial_number ?? null,
      p_designation: member.designation || 'Member',
      p_full_name: member.full_name || '',
      p_nukh: member.nukh || '',
      p_city: member.city || '',
      p_mobile_number: member.mobile_number || '',
      p_is_active: member.is_active ?? true,
    })

    if (error) {
      return { data: null, error: new Error(error.message) }
    }

    return { data: data as ExecutiveCommitteeMember, error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to save committee member'),
    }
  }
}

/**
 * Admin-only: Toggle active status of an official Executive Committee record.
 */
export async function toggleExecutiveCommitteeMemberStatus(
  id: string,
  isActive: boolean
): Promise<ApiResponse<boolean>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('admin_toggle_committee_member_status', {
      p_id: id,
      p_is_active: isActive,
    })

    if (error) {
      return { data: null, error: new Error(error.message) }
    }

    return { data: Boolean(data), error: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Failed to update status'),
    }
  }
}
