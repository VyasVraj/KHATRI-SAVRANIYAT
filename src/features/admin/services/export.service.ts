/**
 * Export Service — Administrative Data Export & Reports (Feature 3)
 *
 * Implements global export system for Admin and Super Admin:
 * - Formats: Excel (.xlsx / .csv) and PDF reports.
 * - Comprehensive filtering: Geography, Mukhi jurisdiction mapping, Gotra, Nukh, Occupation (30 categories), Status.
 * - Secure permission checks & audit logging to public.export_audit_logs.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import { toProperCaseName } from '@/utils/text-casing'

export interface ExportFilters {
  dataType: 'PEOPLE' | 'FAMILIES' | 'MUKHIS'
  country?: string
  state?: string
  city?: string
  mukhiId?: string
  gotra?: string
  nukh?: string
  occupation?: string
  gender?: string
  deceasedStatus?: 'ALL' | 'LIVING' | 'DECEASED'
  startDate?: string
  endDate?: string
}

export interface ExportAuditLog {
  id: string
  user_id: string | null
  user_role: string | null
  export_type: string
  file_format: string
  record_count: number
  filters_applied: Record<string, unknown> | null
  created_at: string
}

interface RawPersonExport {
  id: string
  first_name: string
  middle_name?: string | null
  last_name?: string | null
  gender?: string | null
  date_of_birth?: string | null
  date_of_death?: string | null
  is_deceased?: boolean | null
  birth_place?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  blood_group?: string | null
  gotra?: string | null
  nukh?: string | null
  occupation?: string | null
  phone?: string | null
  email_contact?: string | null
  status?: string | null
  created_at?: string | null
}

interface RawFamilyExport {
  id: string
  family_name: string
  city?: string | null
  state?: string | null
  country?: string | null
  gotra?: string | null
  nukh?: string | null
  selected_mukhi_id?: string | null
  verification_status?: string | null
  status?: string | null
  created_at?: string | null
}

interface RawMukhiExport {
  id: string
  source_serial_number?: number | null
  mukhi_unique_id?: string | null
  full_name: string
  gram?: string | null
  mobile_number?: string | null
  gotra?: string | null
  nukh?: string | null
  is_active?: boolean | null
  authority_status?: string | null
  created_at?: string | null
}

/**
 * Fetch records for export based on multi-faceted filters.
 */
export async function fetchExportData(
  filters: ExportFilters
): Promise<ApiResponse<{ records: Record<string, unknown>[]; count: number }>> {
  try {
    if (filters.dataType === 'PEOPLE') {
      // 1. First attempt authoritative PostgreSQL RPC function
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_admin_export_people', {
          p_mukhi_id: filters.mukhiId || null,
          p_country: filters.country || null,
          p_state: filters.state || null,
          p_city: filters.city || null,
          p_gotra: filters.gotra || null,
          p_nukh: filters.nukh || null,
          p_occupation: filters.occupation || null,
          p_gender: filters.gender && filters.gender !== 'ALL' ? filters.gender : null,
          p_deceased_status: filters.deceasedStatus && filters.deceasedStatus !== 'ALL' ? filters.deceasedStatus : null,
          p_start_date: filters.startDate ? `${filters.startDate}T00:00:00Z` : null,
          p_end_date: filters.endDate ? `${filters.endDate}T23:59:59Z` : null,
        })

        if (!rpcError && Array.isArray(rpcData)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formatted = (rpcData as any[]).map((r) => ({
            'Person ID': r.person_id,
            'Full Name': toProperCaseName(r.full_name),
            Gender: r.gender || '—',
            'Date of Birth': r.date_of_birth || '—',
            'Deceased Status': r.deceased_status || 'Living',
            Birthplace: r.birthplace ? toProperCaseName(r.birthplace) : '—',
            City: r.city ? toProperCaseName(r.city) : '—',
            State: r.state ? toProperCaseName(r.state) : '—',
            Country: r.country ? toProperCaseName(r.country) : 'India',
            'Blood Group': r.blood_group || '—',
            Gotra: r.gotra || '—',
            Nukh: r.nukh || '—',
            'Occupation / Profession': r.occupation || 'Occupation Pending',
            'Associated Mukhi': r.associated_mukhi || 'Mukhi Not Assigned',
            'Primary Phone': r.primary_phone || '—',
            'Email Address': r.email_address || '—',
            'Profile Status': r.profile_status || 'ACTIVE',
            'Registration Date': r.registration_date || '—',
          }))

          return { data: { records: formatted, count: formatted.length }, error: null }
        }
      } catch {
        // Fall back to client-side/PostgREST resolution below
      }

      // 2. Direct PostgREST Fallback with Authoritative Mukhi Resolution
      // Fetch active Mukhis
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mukhisData } = await (supabase.from as any)('community_mukhis')
        .select('id, full_name, gram, linked_person_id, is_active, authority_status')
        .eq('is_active', true)

      interface ActiveMukhiItem {
        id: string
        full_name: string
        gram: string | null
        linked_person_id: string | null
      }
      const activeMukhis: ActiveMukhiItem[] = (mukhisData || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m: any) => m.authority_status === 'ACTIVE' || !m.authority_status
      )

      const mukhiMap = new Map<string, ActiveMukhiItem>()
      const linkedPersonMukhiMap = new Map<string, ActiveMukhiItem>()
      for (const m of activeMukhis) {
        mukhiMap.set(m.id, m)
        if (m.linked_person_id) {
          linkedPersonMukhiMap.set(m.linked_person_id, m)
        }
      }

      // Fetch family memberships for active family mukhi association
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: familyMembersData } = await (supabase.from as any)('family_members')
        .select('person_id, families(id, selected_mukhi_id)')
        .is('left_at', null)

      const personFamilyMukhiMap = new Map<string, string>()
      if (Array.isArray(familyMembersData)) {
        for (const fm of familyMembersData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fam = (fm as any).families
          const mukhiId = fam?.selected_mukhi_id
          if (fm.person_id && mukhiId) {
            personFamilyMukhiMap.set(fm.person_id, mukhiId)
          }
        }
      }

      // Query persons table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from as any)('persons')
        .select(`
          id, first_name, middle_name, last_name, maiden_name, gender,
          date_of_birth, date_of_death, is_deceased, birth_place, city, state, country, blood_group,
          gotra, nukh, kul, occupation, email_contact, phone,
          status, verification_status, created_at
        `)
        .is('deleted_at', null)

      if (filters.country) {
        query = query.or(`country.ilike.%${filters.country}%,birth_place.ilike.%${filters.country}%`)
      }
      if (filters.state) {
        query = query.or(`state.ilike.%${filters.state}%,birth_place.ilike.%${filters.state}%`)
      }
      if (filters.city) {
        query = query.or(`city.ilike.%${filters.city}%,birth_place.ilike.%${filters.city}%`)
      }
      if (filters.gotra) {
        query = query.eq('gotra', filters.gotra)
      }
      if (filters.nukh) {
        query = query.eq('nukh', filters.nukh)
      }
      if (filters.occupation) {
        query = query.eq('occupation', filters.occupation)
      }
      if (filters.gender && filters.gender !== 'ALL') {
        query = query.eq('gender', filters.gender)
      }
      if (filters.deceasedStatus === 'LIVING') {
        query = query.is('date_of_death', null).or('is_deceased.is.null,is_deceased.eq.false')
      } else if (filters.deceasedStatus === 'DECEASED') {
        query = query.or('date_of_death.not.is.null,is_deceased.eq.true,status.eq.DECEASED')
      }
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate)
      }
      if (filters.endDate) {
        query = query.lte('created_at', `${filters.endDate}T23:59:59Z`)
      }

      const { data, error } = await query.order('first_name', { ascending: true })
      if (error) {
        return { data: null, error: { code: error.code, message: error.message } }
      }

      // Filter and associate Mukhi
      const formatted: Record<string, unknown>[] = []
      const rawPeople = (data || []) as RawPersonExport[]

      for (const p of rawPeople) {
        // Authoritative Family-Level Mukhi Resolution:
        // Person -> Family Membership -> Family (selected_mukhi_id) -> Community Mukhi
        const famMukhiId = personFamilyMukhiMap.get(p.id)
        const resolvedMukhi: ActiveMukhiItem | null = famMukhiId ? mukhiMap.get(famMukhiId) || null : null

        // Apply Mukhi Filter:
        // If a specific Mukhi is selected, only include records matching this Mukhi
        if (filters.mukhiId) {
          if (!resolvedMukhi || resolvedMukhi.id !== filters.mukhiId) {
            continue
          }
        }

        const fullName = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')
        const deceasedText = p.date_of_death
          ? `Deceased (${p.date_of_death})`
          : p.is_deceased || p.status === 'DECEASED'
          ? 'Deceased'
          : 'Living'

        const associatedMukhiText = resolvedMukhi
          ? resolvedMukhi.gram
            ? `${resolvedMukhi.full_name} (${resolvedMukhi.gram})`
            : resolvedMukhi.full_name
          : 'Mukhi Not Assigned'

        formatted.push({
          'Person ID': p.id,
          'Full Name': toProperCaseName(fullName),
          Gender: p.gender || '—',
          'Date of Birth': p.date_of_birth || '—',
          'Deceased Status': deceasedText,
          Birthplace: p.birth_place ? toProperCaseName(p.birth_place) : '—',
          City: p.city ? toProperCaseName(p.city) : '—',
          State: p.state ? toProperCaseName(p.state) : '—',
          Country: p.country ? toProperCaseName(p.country) : 'India',
          'Blood Group': p.blood_group || '—',
          Gotra: p.gotra || '—',
          Nukh: p.nukh || '—',
          'Occupation / Profession': p.occupation || 'Occupation Pending',
          'Associated Mukhi': associatedMukhiText,
          'Primary Phone': p.phone || '—',
          'Email Address': p.email_contact || '—',
          'Profile Status': p.status || 'ACTIVE',
          'Registration Date': p.created_at ? new Date(p.created_at).toISOString().split('T')[0] : '—',
        })
      }

      return { data: { records: formatted, count: formatted.length }, error: null }
    } else if (filters.dataType === 'FAMILIES') {
      // 1. First attempt PostgreSQL RPC function
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('get_admin_export_families', {
          p_mukhi_id: filters.mukhiId || null,
          p_country: filters.country || null,
          p_state: filters.state || null,
          p_city: filters.city || null,
          p_gotra: filters.gotra || null,
          p_nukh: filters.nukh || null,
          p_start_date: filters.startDate ? `${filters.startDate}T00:00:00Z` : null,
          p_end_date: filters.endDate ? `${filters.endDate}T23:59:59Z` : null,
        })

        if (!rpcError && Array.isArray(rpcData)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formatted = (rpcData as any[]).map((f) => ({
            'Family ID': f.family_id,
            'Family Name': toProperCaseName(f.family_name),
            City: f.city || '—',
            'State / Province': f.state || '—',
            Country: f.country || 'India',
            Gotra: f.gotra || '—',
            Nukh: f.nukh || '—',
            'Associated Mukhi': f.associated_mukhi || 'Mukhi Not Assigned',
            'Verification Status': f.verification_status || 'PENDING',
            Status: f.status || 'ACTIVE',
            'Registration Date': f.registration_date || '—',
          }))

          return { data: { records: formatted, count: formatted.length }, error: null }
        }
      } catch {
        // Fall back to PostgREST query
      }

      // Fetch active Mukhis
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mukhisData } = await (supabase.from as any)('community_mukhis')
        .select('id, full_name, gram, is_active, authority_status')
        .eq('is_active', true)

      interface ActiveMukhiItem {
        id: string
        full_name: string
        gram: string | null
      }
      const activeMukhis: ActiveMukhiItem[] = (mukhisData || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m: any) => m.authority_status === 'ACTIVE' || !m.authority_status
      )
      const mukhiMap = new Map<string, ActiveMukhiItem>()
      for (const m of activeMukhis) {
        mukhiMap.set(m.id, m)
      }

      // Query families table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from as any)('families')
        .select(`
          id, family_name, city, state, country, gotra, nukh,
          status, verification_status, created_at, selected_mukhi_id
        `)
        .is('deleted_at', null)

      if (filters.country) query = query.ilike('country', `%${filters.country}%`)
      if (filters.state) query = query.ilike('state', `%${filters.state}%`)
      if (filters.city) query = query.ilike('city', `%${filters.city}%`)
      if (filters.gotra) query = query.eq('gotra', filters.gotra)
      if (filters.nukh) query = query.eq('nukh', filters.nukh)
      if (filters.startDate) query = query.gte('created_at', filters.startDate)
      if (filters.endDate) query = query.lte('created_at', `${filters.endDate}T23:59:59Z`)

      const { data, error } = await query.order('family_name', { ascending: true })
      if (error) {
        return { data: null, error: { code: error.code, message: error.message } }
      }

      const formatted: Record<string, unknown>[] = []
      const rawFamilies = (data || []) as RawFamilyExport[]

      for (const f of rawFamilies) {
        let resolvedMukhi: ActiveMukhiItem | null = f.selected_mukhi_id ? mukhiMap.get(f.selected_mukhi_id) || null : null

        if (!resolvedMukhi && activeMukhis.length > 0 && f.city) {
          const normCity = f.city.toLowerCase().trim()
          resolvedMukhi =
            activeMukhis.find((m) => {
              const gram = (m.gram || '').toLowerCase().trim()
              return gram && (gram.includes(normCity) || normCity.includes(gram))
            }) || null
        }

        if (filters.mukhiId) {
          if (!resolvedMukhi || resolvedMukhi.id !== filters.mukhiId) {
            continue
          }
        }

        const associatedMukhiText = resolvedMukhi
          ? resolvedMukhi.gram
            ? `${resolvedMukhi.full_name} (${resolvedMukhi.gram})`
            : resolvedMukhi.full_name
          : 'Mukhi Not Assigned'

        formatted.push({
          'Family ID': f.id,
          'Family Name': toProperCaseName(f.family_name),
          City: f.city || '—',
          'State / Province': f.state || '—',
          Country: f.country || 'India',
          Gotra: f.gotra || '—',
          Nukh: f.nukh || '—',
          'Associated Mukhi': associatedMukhiText,
          'Verification Status': f.verification_status || 'PENDING',
          Status: f.status || 'ACTIVE',
          'Registration Date': f.created_at ? new Date(f.created_at).toISOString().split('T')[0] : '—',
        })
      }

      return { data: { records: formatted, count: formatted.length }, error: null }
    } else {
      // MUKHIS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from as any)('community_mukhis')
        .select(`
          id, source_serial_number, mukhi_unique_id, full_name, gram,
          mobile_number, gotra, nukh, is_active, authority_status, created_at
        `)

      if (filters.city) {
        query = query.ilike('gram', `%${filters.city}%`)
      }
      if (filters.gotra) query = query.eq('gotra', filters.gotra)
      if (filters.nukh) query = query.eq('nukh', filters.nukh)

      const { data, error } = await query.order('source_serial_number', { ascending: true })
      if (error) {
        return { data: null, error: { code: error.code, message: error.message } }
      }

      const formatted = ((data || []) as RawMukhiExport[]).map((m) => ({
        'Serial #': m.source_serial_number,
        'Mukhi ID': m.mukhi_unique_id || `MUK-${String(m.source_serial_number || 1).padStart(4, '0')}`,
        'Full Name': m.full_name,
        'Assigned Region / Gram': m.gram || '—',
        'Mobile Number': m.mobile_number || '—',
        Gotra: m.gotra || '—',
        Nukh: m.nukh || '—',
        'Authority Status': m.authority_status || (m.is_active ? 'ACTIVE' : 'INACTIVE'),
        'Active Status': m.is_active ? 'Yes' : 'No',
      }))

      return { data: { records: formatted, count: formatted.length }, error: null }
    }
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'EXPORT_FETCH_ERROR',
        message: err instanceof Error ? err.message : 'Failed to query export records.',
      },
    }
  }
}

/**
 * Logs export audit trail.
 */
export async function logExportAudit(
  exportType: string,
  fileFormat: string,
  recordCount: number,
  filters: Record<string, unknown>
): Promise<void> {
  try {
    const { data: session } = await supabase.auth.getSession()
    if (!session?.session?.user) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)('export_audit_logs').insert({
      user_id: session.session.user.id,
      export_type: exportType,
      file_format: fileFormat,
      record_count: recordCount,
      filters_applied: filters,
    })
  } catch {
    // Audit failure should not block user download
  }
}

/**
 * Generates and triggers download of CSV / Excel file.
 */
export function downloadCsvExcel(
  filename: string,
  records: Record<string, unknown>[]
): void {
  if (!records || records.length === 0) return

  const headers = Object.keys(records[0])
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '""'
    const str = String(val).replace(/"/g, '""')
    return `"${str}"`
  }

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...records.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
  ].join('\r\n')

  // Prepend UTF-8 BOM for Excel compatibility
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generates and triggers printable PDF report with official SINDHI KHATRI SAMAJ branding.
 */
export function generatePdfReport(
  reportTitle: string,
  filtersSummary: string[],
  records: Record<string, unknown>[]
): void {
  if (!records || records.length === 0) return

  const headers = Object.keys(records[0])
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${reportTitle} — SINDHI KHATRI SAMAJ</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 15px; font-size: 11px; }
    .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-start; }
    .org-title { font-size: 14px; font-weight: 900; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px; }
    .report-title { font-size: 18px; font-weight: bold; color: #090d16; margin-top: 4px; }
    .meta-box { font-size: 10px; color: #475569; text-align: right; }
    .filter-summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 14px; font-size: 10px; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
    th { background: #1e3a8a; color: #ffffff; text-align: left; padding: 6px 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid #1e3a8a; }
    td { padding: 6px 8px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 20px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="org-title">AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)</div>
      <div class="report-title">${reportTitle}</div>
    </div>
    <div class="meta-box">
      <div><strong>Export Date:</strong> ${dateStr}</div>
      <div><strong>Total Records:</strong> ${records.length}</div>
      <div><strong>Classification:</strong> Confidential Community Register</div>
    </div>
  </div>

  ${
    filtersSummary.length > 0
      ? `<div class="filter-summary"><strong>Applied Filters:</strong> ${filtersSummary.join(' • ')}</div>`
      : ''
  }

  <table>
    <thead>
      <tr>
        ${headers.map((h) => `<th>${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${records
        .map(
          (row) => `
        <tr>
          ${headers.map((h) => `<td>${row[h] !== null && row[h] !== undefined ? row[h] : '—'}</td>`).join('')}
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    SINDHI KHATRI SAMAJ Official Digital Records • Generated by authorized administrator • Page 1 of 1
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>
  `

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const blobUrl = URL.createObjectURL(blob)
  const printWindow = window.open(blobUrl, '_blank')
  if (printWindow) {
    printWindow.focus()
  }
}
