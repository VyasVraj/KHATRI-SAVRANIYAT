/**
 * Circulars & Official Community Notices Service
 *
 * Implements authoritative official notices and circulars for SINDHI KHATRI SAMAJ:
 * - Publication of official directives under AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
 * - Method A: Upload Existing PDF Notice / Circular (auto letterhead + cover sheet)
 * - Method B: Create Notice Online (rich vector PDF with official emblem, layout, and signatory)
 * - Role-Gated Mutations: Strictly ADMIN and SUPER_ADMIN
 * - Community Access: Public and authenticated read, search, filtering, and PDF download
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type {
  CircularItem,
  CircularFilters,
  CircularDirectoryResponse,
  CircularCategory,
} from '../types'
import {
  generateOnlineNoticePdf,
  generateBrandedUploadedPdf,
  type CircularPdfPayload,
} from '@/utils/circular-pdf-generator'

export interface PublishOfficialNoticeInput {
  title: string
  circular_number?: string
  category: CircularCategory
  issuing_authority: string
  issue_date: string
  effective_date?: string | null
  subject?: string | null
  content: string
  instructions?: string | null
  contact_info?: string | null
  signatory_name: string
  signatory_title: string
  creation_method: 'PDF_UPLOAD' | 'ONLINE_EDITOR'
  status: 'PUBLISHED' | 'DRAFT'
  is_pinned?: boolean
  group_id?: string | null
  original_pdf_file?: File | null
  existing_pdf_url?: string | null
  existing_original_pdf_url?: string | null
}

export interface UpdateOfficialNoticeInput extends PublishOfficialNoticeInput {
  id: string
}

/**
 * Canonical verified official community circulars.
 */
export const CANONICAL_CIRCULARS_REGISTRY: CircularItem[] = [
  {
    id: 'cir-2026-001',
    circular_number: 'CIR-2026-001',
    title: 'Annual Census Verification & Family Seat Registration Drive 2026-27',
    summary:
      'Official directive from the Central Census Committee and Panchayat Secretariat establishing deadlines and protocols for digital household updates.',
    content: `AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
SHREE KHATRI SAMAJ CENTRAL PANCHAYAT
HEADQUARTERS: CENTRAL PANCHAYAT SECRETARIAT
CIRCULAR NO: CIR-2026-001                                      DATE: 15 JANUARY 2026

SUBJECT: ANNUAL CENSUS VERIFICATION & FAMILY SEAT REGISTRATION DRIVE 2026-27

Respected Community Members and Regional Mukhis,

By resolution of the Central Panchayat Executive Council and the Jan Ganna (Census) Central Committee, the digital Census Verification & Family Seat Claiming Drive for the year 2026-27 is hereby officially declared open across all regional zones.

KEY DIRECTIVES FOR ALL HOUSEHOLDS:
1. Every Family Head is requested to log in and verify their household census tree, ensuring all births, marriages, and lineage details (Gotra, Nukh, Kuldevta) are recorded accurately.
2. Unregistered family members and newly married couples must be linked to their canonical ancestral records before the verification deadline.
3. Family seat claiming requires review by designated regional moderators or the head of family. In case of duplicate member flags, prompt coordination with the Census Directorate is advised.
4. Regional Mukhis are requested to convene local help-desks in their respective towns to assist elderly community members with digital verification.

SCHEDULE:
- Active Verification Window: 1st February 2026 to 31st March 2026
- Final Register Compilation: 15th April 2026

For inquiries or verification petitions, please contact your Regional Zonal Mukhi or email census@khatrisarvaniyat.org.

Issued under the Seal and Authority of the Central Panchayat Secretariat.`,
    category: 'CENSUS',
    issuing_authority: 'Jan Ganna Central Committee & Central Panchayat',
    signatory_name: 'Chandrakant Mohanlal Keria',
    signatory_title: 'Chief Census Commissioner & Secretary',
    issue_date: '2026-01-15T00:00:00Z',
    formatted_date: '15 Jan 2026',
    is_pinned: true,
    status: 'PUBLISHED',
    committee_id: 'comm-jan-ganna',
    committee_name: 'Jan Ganna (Census) Central Committee',
    official_seal_text: 'SEAL OF AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)',
    creation_method: 'ONLINE_EDITOR',
  },
  {
    id: 'cir-2026-002',
    circular_number: 'CIR-2026-002',
    title: 'Resolution on Modest Social Observances & Matrimonial Dispute Protocol',
    summary:
      'Sarvaniyat Samiti guidance encouraging simplicity in community ceremonies and establishing confidential family conciliation procedures.',
    content: `AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
SARVANIYAT & SAMAJIK SAMADHAN SAMITI (SOCIAL WELFARE COMMISSION)
CIRCULAR NO: CIR-2026-002                                      DATE: 20 FEBRUARY 2026

SUBJECT: RESOLUTION ON MODEST SOCIAL OBSERVANCES & MATRIMONIAL CONCILIATION

Respected Community Elders, Youth, and Samaj Bandhus,

The Sarvaniyat Samiti, in consultation with the Senior Advisory Council (Panch), has passed the following advisory resolutions for the overall social welfare and economic health of community families:

1. SIMPLICITY IN CEREMONIES:
Families are warmly urged to observe modest and thoughtful arrangements during engagement (Sagai), wedding (Lagna), and post-funeral rituals (Besnu). Ostentatious displays and wasteful expenditure create undue burdens on middle-income households and contradict our traditional community values.

2. CONFIDENTIAL MATRIMONIAL CONCILIATION:
In the unfortunate event of marital strain or domestic discord, families are earnestly requested to approach the Sarvaniyat Samiti before initiating external legal proceedings. Our panel of respected elders and legal counselors provides free, impartial, and strictly confidential mediation.

3. DOWRY PROHIBITION PROTOCOL:
Any demand or acceptance of dowry remains strictly contrary to community bylaws. Instances brought to the Samiti will be addressed firmly by the Central Panchayat.

The Samiti invites all families to uphold mutual respect, social dignity, and cultural integrity.

Issued with the blessings of the Senior Advisory Council.`,
    category: 'WELFARE',
    issuing_authority: 'Sarvaniyat & Samajik Samadhan Samiti',
    signatory_name: 'Pravinbhai Khetani',
    signatory_title: 'Council Chairman, Sarvaniyat Samiti',
    issue_date: '2026-02-20T00:00:00Z',
    formatted_date: '20 Feb 2026',
    is_pinned: true,
    status: 'PUBLISHED',
    committee_id: 'comm-sarvaniyat-samiti',
    committee_name: 'Sarvaniyat & Samajik Samadhan Samiti',
    official_seal_text: 'SEAL OF AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)',
    creation_method: 'ONLINE_EDITOR',
  },
  {
    id: 'cir-2026-003',
    circular_number: 'CIR-2026-003',
    title: 'General Body Election Notification: Zonal Mukhi Tenure 2026-2029',
    summary:
      'Official election commission schedule for the selection and ratification of regional Gram Mukhis across Gujarat, Rajasthan, and Mumbai zones.',
    content: `AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
CENTRAL ELECTION COMMISSION
CIRCULAR NO: CIR-2026-003                                      DATE: 10 MARCH 2026

SUBJECT: GENERAL BODY ELECTION NOTIFICATION — ZONAL MUKHI TENURE 2026-2029

To all Registered Community Members, Gram Panchayats, and Elders:

In accordance with Article 14 of the Akhil Bharat Sindhi Brahmkhatri Panchayat Constitution, the three-year term of the current Zonal Mukhis concludes on 30th June 2026.

ELECTION COMMISSION SCHEDULE:
- Publication of Preliminary Voters Roll: 1st April 2026
- Filing of Nominations: 15th April to 30th April 2026
- Scrutiny & Withdrawal: 5th May 2026
- Voting & Consensus Assembly: 24th May 2026
- Declaration of Results: 31st May 2026

ELIGIBILITY CRITERIA:
Nominees for Zonal Mukhi must be verified community members of good standing, with minimum 10 years of active social contribution and no record of community disciplinary sanctions.

Forms are available at Zonal Panchayat offices and downloadable from the community portal.`,
    category: 'ELECTION',
    issuing_authority: 'Central Election Commission',
    signatory_name: 'Advocate Rameshchandra V. Khatri',
    signatory_title: 'Chief Election Officer',
    issue_date: '2026-03-10T00:00:00Z',
    formatted_date: '10 Mar 2026',
    is_pinned: false,
    status: 'PUBLISHED',
    committee_id: 'comm-election',
    committee_name: 'Central Election Commission',
    official_seal_text: 'SEAL OF CENTRAL ELECTION COMMISSION',
    creation_method: 'ONLINE_EDITOR',
  },
  {
    id: 'cir-2026-004',
    circular_number: 'CIR-2026-004',
    title: 'Executive Council Resolution: Higher Education Scholarship Fund 2026',
    summary:
      'Announcement of ₹25 Lakh corpus allocation for competitive exam coaching and post-graduate scholarships for meritorious community students.',
    content: `AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
EDUCATION & YOUTH EMPOWERMENT TRUST
CIRCULAR NO: CIR-2026-004                                      DATE: 01 APRIL 2026

SUBJECT: HIGHER EDUCATION SCHOLARSHIP FUND 2026 — MERIT & NEED SCHEMES

The Executive Council of the Central Panchayat has unanimously approved the disbursement of ₹25,00,000 under the Saraswati Vidya Sahay Yojana for the academic session 2026-27:

1. MERIT CATEGORY:
Full tuition assistance for students scoring 90%+ in Class 12 or securing admission in premier national institutes (IIT, IIM, AIIMS, NIT, NLU).

2. PROFESSIONAL & VOCATIONAL GRANTS:
Special stipends for chartered accountancy, medical post-graduation, and technology certifications.

3. WOMEN EDUCATION SUBSIDY:
Targeted bursaries covering 75% college fees for female students pursuing higher professional education.

Application deadline: 30th June 2026. Apply through your Zonal Mukhi or email education@khatrisarvaniyat.org.`,
    category: 'GOVERNANCE',
    issuing_authority: 'Education & Youth Empowerment Trust',
    signatory_name: 'Shantilal J. Brahmkhatri',
    signatory_title: 'Trustee & Education Secretary',
    issue_date: '2026-04-01T00:00:00Z',
    formatted_date: '01 Apr 2026',
    is_pinned: false,
    status: 'PUBLISHED',
    committee_id: 'comm-education',
    committee_name: 'Education & Youth Empowerment Trust',
    official_seal_text: 'SEAL OF SHREE KHATRI VIDYA SAHAY TRUST',
    creation_method: 'ONLINE_EDITOR',
  },
  {
    id: 'cir-2026-005',
    circular_number: 'CIR-2026-005',
    title: 'Urgent Directive: Medical Relief & Emergency Blood Donor Registry Drive',
    summary:
      'Establishment of statewide emergency blood group database and free summer medical camp dates across regional centers.',
    content: `AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
MEDICAL & HEALTH RELIEF COMMITTEE
CIRCULAR NO: CIR-2026-005                                      DATE: 18 APRIL 2026

SUBJECT: URGENT MEDICAL RELIEF CAMPS & EMERGENCY BLOOD REGISTRY DRIVE

To all community youth, medical professionals, and family heads:

With the onset of peak summer, the Medical & Health Relief Committee is organizing a series of free multi-specialty health screening camps across Kutch, Banaskantha, and Saurashtra regions.

CAMP HIGHLIGHTS:
1. Free comprehensive health checkups, blood sugar, lipid profile, and ECG screenings for seniors (age 60+).
2. Pediatric nutritional guidance and eye screening for school students.
3. Highly subsidized distribution of spectacles and chronic disease maintenance medications.

EMERGENCY BLOOD DONATION REGISTRY DRIVE:
A statewide emergency blood donor network is being digitized. Healthy community members between 18 and 50 years of age are earnestly appealed to enroll their blood group in the Community Hub database. Your timely registration helps save precious lives during emergency surgeries and accidents.

Camp Dates:
- Bhuj Samaj Bhavan: Sunday, 3rd May 2026 (9 AM – 3 PM)
- Palanpur Seva Kendra: Sunday, 10th May 2026 (9 AM – 3 PM)

Contact: Dr. Vinodbhai Bagani, Health Committee Chairman (health@khatrisarvaniyat.org).`,
    category: 'URGENT',
    issuing_authority: 'Medical & Health Relief Committee',
    signatory_name: 'Dr. Vinodbhai Bagani',
    signatory_title: 'Chairman, Medical Relief Committee',
    issue_date: '2026-04-18T00:00:00Z',
    formatted_date: '18 Apr 2026',
    is_pinned: false,
    status: 'PUBLISHED',
    committee_id: 'comm-medical-relief',
    committee_name: 'Medical & Health Relief Committee',
    official_seal_text: 'SEAL OF KHATRI AROGYA SEVA SAMITI',
    creation_method: 'ONLINE_EDITOR',
  },
  {
    id: 'cir-2026-006',
    circular_number: 'CIR-2026-006',
    title: 'All-India Khatri Youth Cricket & Badminton Championship 2026 Guidelines',
    summary:
      'Youth Wing announcement detailing tournament dates, zonal team registrations, player age categories, and sportsmanship code.',
    content: `AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)
KHATRI YOUTH & SPORTS WING
CIRCULAR NO: CIR-2026-006                                      DATE: 05 MAY 2026

SUBJECT: ALL-INDIA KHATRI YOUTH CRICKET & BADMINTON CHAMPIONSHIP 2026

Attention All Regional Youth Wings & Sports Clubs!

The Youth & Sports Wing is delighted to announce the 8th All-India Khatri Youth Sports Festival, featuring interstate tennis-ball cricket and badminton championships in Surat:

TOURNAMENT DATES: 2nd to 4th October 2026
HOST VENUE: Surat District Cricket Academy Grounds, Surat, Gujarat

REGISTRATION & RULES:
1. Teams must represent designated regional zones (Kutch, North Gujarat, Central Gujarat, Saurashtra, Marwar, Maharashtra, Central India).
2. Each cricket team may register up to 14 players (all registered community census members aged 16 to 35).
3. Badminton tournaments feature Men's Singles, Women's Singles, and Mixed Doubles categories.
4. Trophies, medals, and aggregate cash prizes totaling ₹2,50,000 will be awarded, with special recognition for the Player of the Tournament and fair play squad.

Team entries must be countersigned by the respective Regional Zonal Mukhi and submitted by 15th August 2026.

Let us celebrate sportsmanship, physical vitality, and fraternal bonding!`,
    category: 'GENERAL',
    issuing_authority: 'Khatri Youth & Sports Wing',
    signatory_name: 'Kirtibhai Somani',
    signatory_title: 'President, Khatri Youth Wing',
    issue_date: '2026-05-05T00:00:00Z',
    formatted_date: '05 May 2026',
    is_pinned: false,
    status: 'PUBLISHED',
    committee_id: 'comm-youth-wing',
    committee_name: 'Khatri Youth & Sports Wing',
    official_seal_text: 'SEAL OF KHATRI YOUTH & SPORTS WING',
    creation_method: 'ONLINE_EDITOR',
  },
]

/**
 * Uploads a circular PDF file to Supabase storage 'circulars' bucket.
 */
export async function uploadCircularPdfToStorage(
  fileOrBlob: File | Blob,
  path: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('circulars')
      .upload(path, fileOrBlob, {
        upsert: true,
        contentType: 'application/pdf',
      })

    if (error) {
      return null
    }

    const { data: publicUrlData } = supabase.storage
      .from('circulars')
      .getPublicUrl(data.path)

    return publicUrlData?.publicUrl || null
  } catch {
    return null
  }
}

/**
 * Safely parse any date value (ISO string, date string, timestamp) into epoch milliseconds.
 * Returns -Infinity for missing, null, empty, or invalid dates so they are sorted last.
 */
export function parseCircularDate(dateVal?: string | null): number {
  if (!dateVal || typeof dateVal !== 'string' || dateVal.trim() === '') {
    return -Infinity
  }
  const timestamp = new Date(dateVal).getTime()
  return isNaN(timestamp) ? -Infinity : timestamp
}

/**
 * Compares two circular items in strict descending chronological order:
 * 1. Primary: Official issue_date descending (newest year, newest month, newest day first).
 * 2. Missing or invalid dates are placed safely at the bottom (after all valid dates).
 * 3. Tie-breaker: If dates are identical, sort by circular_number or id descending.
 *
 * NOTE: Pinned circulars do NOT override chronological ordering.
 * A pinned older circular will not appear above a newer circular solely because it is pinned.
 */
export function sortCircularsChronologically(a: CircularItem, b: CircularItem): number {
  const timeA = parseCircularDate(a.issue_date)
  const timeB = parseCircularDate(b.issue_date)

  if (timeA !== timeB) {
    return timeB - timeA // Descending: newest date first
  }

  // Tie-breaker for identical dates: circular_number or id descending
  const numA = a.circular_number || a.id || ''
  const numB = b.circular_number || b.id || ''
  return numB.localeCompare(numA, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Fetch verified official community circulars matching criteria.
 * Queries RPC or announcements table and merges with canonical registry.
 */
export async function getCirculars(
  filters: CircularFilters = {}
): Promise<ApiResponse<CircularDirectoryResponse>> {
  try {
    let dbItems: CircularItem[] = []

    // 1. Try querying get_public_official_circulars RPC
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)(
        'get_public_official_circulars'
      )

      if (!rpcError && Array.isArray(rpcData)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dbItems = rpcData.map((row: any) => {
          const pubDate = row.published_at || null
          const isValidDate = pubDate && !isNaN(new Date(pubDate).getTime())
          const cat = (row.category || 'GENERAL') as Exclude<CircularCategory, 'ALL'>
          return {
            id: row.id,
            circular_number: row.circular_number,
            title: row.title,
            summary: row.description || (row.content ? row.content.slice(0, 150) + '…' : ''),
            description: row.description,
            content: row.content || '',
            category: cat,
            issuing_authority: row.issuing_authority || 'Central Panchayat Secretariat',
            signatory_name: row.signatory_name || 'Central Secretariat',
            signatory_title: row.signatory_title || 'Authorized Signatory',
            issue_date: pubDate || '',
            formatted_date: isValidDate
              ? new Date(pubDate).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Date Not Provided',
            is_pinned: Boolean(row.is_pinned),
            status: row.status || 'PUBLISHED',
            committee_id: row.group_id || 'comm-central-panchayat',
            committee_name: row.issuing_authority || 'Central Panchayat Secretariat',
            official_seal_text: 'SEAL OF AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)',
            pdf_url: row.pdf_url || null,
            original_pdf_url: row.original_pdf_url || null,
            creation_method: row.creation_method || 'ONLINE_EDITOR',
            subject: row.subject || null,
            instructions: row.instructions || null,
            contact_info: row.contact_info || null,
            effective_date: row.effective_date || null,
            group_id: row.group_id || null,
          }
        })
      } else {
        // Fallback: direct table select
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: annData, error: annError } = await (supabase.from as any)('announcements')
          .select('*')
          .is('deleted_at', null)
          .order('published_at', { ascending: false })

        if (!annError && Array.isArray(annData)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dbItems = annData.map((a: any) => {
            const pubDate = a.published_at || null
            const isValidDate = pubDate && !isNaN(new Date(pubDate).getTime())
            const yr = isValidDate ? new Date(pubDate).getFullYear() : 'UNDATED'
            const seq = String(a.id || '').replace(/[^0-9]/g, '').slice(0, 3).padStart(3, '1')
            const circNum = a.circular_number || `CIR-${yr}-${seq}`
            const cat = (a.announcement_type || 'GENERAL') as Exclude<CircularCategory, 'ALL'>

            return {
              id: a.id,
              circular_number: circNum,
              title: a.title,
              summary: a.description || (a.content ? a.content.slice(0, 150) + '…' : ''),
              description: a.description,
              content: a.content || '',
              category: cat,
              issuing_authority: a.issuing_authority || 'Central Panchayat Secretariat',
              signatory_name: a.signatory_name || 'Central Secretariat',
              signatory_title: a.signatory_title || 'Authorized Signatory',
              issue_date: pubDate || '',
              formatted_date: isValidDate
                ? new Date(pubDate).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Date Not Provided',
              is_pinned: Boolean(a.is_pinned),
              status: a.status || 'PUBLISHED',
              committee_id: a.group_id || 'comm-central-panchayat',
              committee_name: a.issuing_authority || 'Central Panchayat Secretariat',
              official_seal_text: 'SEAL OF AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)',
              pdf_url: a.pdf_url || null,
              original_pdf_url: a.original_pdf_url || null,
              creation_method: a.creation_method || 'ONLINE_EDITOR',
              subject: a.subject || null,
              instructions: a.instructions || null,
              contact_info: a.contact_info || null,
              effective_date: a.effective_date || null,
              group_id: a.group_id || null,
            }
          })
        }
      }
    } catch {
      // Graceful fallback to canonical registry
    }

    // Merge database items and canonical registry
    const seenIds = new Set<string>()
    const combined: CircularItem[] = []

    for (const item of dbItems) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id)
        combined.push(item)
      }
    }

    for (const item of CANONICAL_CIRCULARS_REGISTRY) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id)
        combined.push(item)
      }
    }

    let items = combined

    // Filter by category
    if (filters.category && filters.category !== 'ALL') {
      items = items.filter((c) => c.category === filters.category)
    }

    // Filter by issuer
    if (filters.issuer && filters.issuer !== 'ALL') {
      items = items.filter((c) => c.issuing_authority === filters.issuer)
    }

    // Filter by status (unless ALL requested by admin)
    if (filters.status === 'PUBLISHED') {
      items = items.filter((c) => c.status === 'PUBLISHED')
    }

    // Text search
    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim()
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.circular_number.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.content.toLowerCase().includes(q) ||
          c.issuing_authority.toLowerCase().includes(q) ||
          c.signatory_name.toLowerCase().includes(q) ||
          (c.subject && c.subject.toLowerCase().includes(q))
      )
    }

    // Sort strictly in descending chronological order by official circular issue_date
    // Newest year, month, and day first; missing/invalid dates placed last.
    // Pinned circulars do NOT override chronological order.
    items.sort(sortCircularsChronologically)

    const availableCategories: CircularCategory[] = [
      'ALL',
      'CENSUS',
      'GOVERNANCE',
      'WELFARE',
      'URGENT',
      'GENERAL',
    ]

    const availableIssuers = Array.from(
      new Set(combined.map((c) => c.issuing_authority))
    ).sort()

    return {
      data: {
        items,
        totalCount: items.length,
        availableCategories,
        availableIssuers,
      },
      error: null,
    }
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Failed to fetch circulars directory.'
    return {
      data: null,
      error: {
        message: errorMsg,
        code: 'CIRCULARS_FETCH_ERROR',
      },
    }
  }
}

/**
 * Publishes an official notice or circular (Method A or Method B).
 * Role-gated strictly to ADMIN and SUPER_ADMIN.
 */
export async function publishOfficialCircular(
  input: PublishOfficialNoticeInput
): Promise<ApiResponse<{ id: string; pdf_url: string | null }>> {
  try {
    let generatedPdfUrl: string | null = input.existing_pdf_url || null
    let uploadedOriginalPdfUrl: string | null = input.existing_original_pdf_url || null

    const timestamp = Date.now()
    const circNumber =
      input.circular_number?.trim() ||
      `CIR-${new Date().getFullYear()}-${String(timestamp).slice(-3)}`

    const pdfPayload: CircularPdfPayload = {
      title: input.title,
      circular_number: circNumber,
      category: input.category,
      issuing_authority: input.issuing_authority,
      issue_date: input.issue_date,
      effective_date: input.effective_date,
      subject: input.subject,
      content: input.content,
      instructions: input.instructions,
      contact_info: input.contact_info,
      signatory_name: input.signatory_name,
      signatory_title: input.signatory_title,
      creation_method: input.creation_method,
    }

    // Handle Method A: Uploaded PDF
    if (input.creation_method === 'PDF_UPLOAD' && input.original_pdf_file) {
      const fileBytes = await input.original_pdf_file.arrayBuffer()

      // 1. Upload original PDF
      const origPath = `original/${timestamp}_${input.original_pdf_file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      uploadedOriginalPdfUrl = await uploadCircularPdfToStorage(
        input.original_pdf_file,
        origPath
      )

      // 2. Generate branded PDF with letterhead cover page
      const brandedResult = await generateBrandedUploadedPdf(fileBytes, pdfPayload)

      // 3. Upload branded PDF
      const brandedPath = `branded/${timestamp}_${brandedResult.filename}`
      generatedPdfUrl = await uploadCircularPdfToStorage(brandedResult.blob, brandedPath)

      // Fallback to data URI if storage offline
      if (!generatedPdfUrl) {
        generatedPdfUrl = brandedResult.dataUri
      }
    } else {
      // Handle Method B: Online Editor
      const generatedResult = await generateOnlineNoticePdf(pdfPayload)
      const brandedPath = `branded/${timestamp}_${generatedResult.filename}`
      generatedPdfUrl = await uploadCircularPdfToStorage(generatedResult.blob, brandedPath)

      if (!generatedPdfUrl) {
        generatedPdfUrl = generatedResult.dataUri
      }
    }

    // Insert into database via RPC publish_official_circular
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newId, error: rpcError } = await (supabase.rpc as any)(
        'publish_official_circular',
        {
          p_title: input.title,
          p_content: input.content,
          p_category: input.category === 'ALL' ? 'GENERAL' : input.category,
          p_circular_number: circNumber,
          p_issuing_authority: input.issuing_authority,
          p_signatory_name: input.signatory_name,
          p_signatory_title: input.signatory_title,
          p_pdf_url: generatedPdfUrl,
          p_original_pdf_url: uploadedOriginalPdfUrl,
          p_creation_method: input.creation_method,
          p_subject: input.subject || null,
          p_instructions: input.instructions || null,
          p_contact_info: input.contact_info || null,
          p_effective_date: input.effective_date || null,
          p_status: input.status,
          p_is_pinned: Boolean(input.is_pinned),
          p_group_id: input.group_id || null,
        }
      )

      if (!rpcError && newId) {
        // Authoritative: ensure the official circular issue_date is persisted to published_at
        if (input.issue_date && input.status === 'PUBLISHED') {
          try {
            const issueIso = new Date(input.issue_date).toISOString()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from as any)('announcements')
              .update({ published_at: issueIso })
              .eq('id', newId)
          } catch {
            // Non-blocking
          }
        }
        return { data: { id: newId, pdf_url: generatedPdfUrl }, error: null }
      }
    } catch {
      // RPC fallback
    }

    // Direct insert fallback if RPC was not executed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insertData, error: insertError } = await (supabase.from as any)(
      'announcements'
    )
      .insert({
        title: input.title,
        content: input.content,
        description:
          input.content.length > 200 ? input.content.slice(0, 197) + '...' : input.content,
        announcement_type: input.category === 'ALL' ? 'GENERAL' : input.category,
        circular_number: circNumber,
        issuing_authority: input.issuing_authority,
        signatory_name: input.signatory_name,
        signatory_title: input.signatory_title,
        pdf_url: generatedPdfUrl,
        original_pdf_url: uploadedOriginalPdfUrl,
        creation_method: input.creation_method,
        subject: input.subject || null,
        instructions: input.instructions || null,
        contact_info: input.contact_info || null,
        effective_date: input.effective_date || null,
        status: input.status,
        is_pinned: Boolean(input.is_pinned),
        published_at:
          input.status === 'PUBLISHED'
            ? (input.issue_date ? new Date(input.issue_date).toISOString() : new Date().toISOString())
            : null,
      })
      .select('id')
      .single()

    if (insertError) {
      return {
        data: null,
        error: {
          code: insertError.code || 'CIRCULAR_PUBLISH_ERROR',
          message: insertError.message || 'Failed to publish official circular.',
        },
      }
    }

    return {
      data: { id: insertData?.id || circNumber, pdf_url: generatedPdfUrl },
      error: null,
    }
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Failed to publish official notice.'
    return {
      data: null,
      error: { code: 'PUBLISH_EXCEPTION', message: errorMsg },
    }
  }
}

/**
 * Updates an official circular.
 */
export async function updateOfficialCircular(
  input: UpdateOfficialNoticeInput
): Promise<ApiResponse<boolean>> {
  try {
    let generatedPdfUrl: string | null = input.existing_pdf_url || null
    let uploadedOriginalPdfUrl: string | null = input.existing_original_pdf_url || null

    const timestamp = Date.now()
    const circNumber = input.circular_number || `CIR-${new Date().getFullYear()}-001`

    const pdfPayload: CircularPdfPayload = {
      title: input.title,
      circular_number: circNumber,
      category: input.category,
      issuing_authority: input.issuing_authority,
      issue_date: input.issue_date,
      effective_date: input.effective_date,
      subject: input.subject,
      content: input.content,
      instructions: input.instructions,
      contact_info: input.contact_info,
      signatory_name: input.signatory_name,
      signatory_title: input.signatory_title,
      creation_method: input.creation_method,
    }

    // If replacement PDF file uploaded
    if (input.creation_method === 'PDF_UPLOAD' && input.original_pdf_file) {
      const fileBytes = await input.original_pdf_file.arrayBuffer()
      const origPath = `original/${timestamp}_${input.original_pdf_file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      uploadedOriginalPdfUrl = await uploadCircularPdfToStorage(input.original_pdf_file, origPath)

      const brandedResult = await generateBrandedUploadedPdf(fileBytes, pdfPayload)
      const brandedPath = `branded/${timestamp}_${brandedResult.filename}`
      generatedPdfUrl = await uploadCircularPdfToStorage(brandedResult.blob, brandedPath)
      if (!generatedPdfUrl) generatedPdfUrl = brandedResult.dataUri
    } else if (input.creation_method === 'ONLINE_EDITOR') {
      // Regenerate branded PDF for online edited content
      const generatedResult = await generateOnlineNoticePdf(pdfPayload)
      const brandedPath = `branded/${timestamp}_${generatedResult.filename}`
      generatedPdfUrl = await uploadCircularPdfToStorage(generatedResult.blob, brandedPath)
      if (!generatedPdfUrl) generatedPdfUrl = generatedResult.dataUri
    }

    // Try RPC update_official_circular
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updated, error: rpcError } = await (supabase.rpc as any)(
        'update_official_circular',
        {
          p_circular_id: input.id,
          p_title: input.title,
          p_content: input.content,
          p_category: input.category === 'ALL' ? 'GENERAL' : input.category,
          p_issuing_authority: input.issuing_authority,
          p_signatory_name: input.signatory_name,
          p_signatory_title: input.signatory_title,
          p_pdf_url: generatedPdfUrl,
          p_original_pdf_url: uploadedOriginalPdfUrl,
          p_subject: input.subject || null,
          p_instructions: input.instructions || null,
          p_contact_info: input.contact_info || null,
          p_status: input.status,
          p_is_pinned: Boolean(input.is_pinned),
        }
      )

      if (!rpcError && updated) {
        if (input.issue_date) {
          try {
            const issueIso = new Date(input.issue_date).toISOString()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from as any)('announcements')
              .update({ published_at: issueIso })
              .eq('id', input.id)
          } catch {
            // Non-blocking
          }
        }
        return { data: true, error: null }
      }
    } catch {
      // Direct table fallback
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: tableError } = await (supabase.from as any)('announcements')
      .update({
        title: input.title,
        content: input.content,
        description:
          input.content.length > 200 ? input.content.slice(0, 197) + '...' : input.content,
        announcement_type: input.category === 'ALL' ? 'GENERAL' : input.category,
        issuing_authority: input.issuing_authority,
        signatory_name: input.signatory_name,
        signatory_title: input.signatory_title,
        pdf_url: generatedPdfUrl,
        original_pdf_url: uploadedOriginalPdfUrl,
        subject: input.subject || null,
        instructions: input.instructions || null,
        contact_info: input.contact_info || null,
        status: input.status,
        is_pinned: Boolean(input.is_pinned),
        published_at: input.issue_date ? new Date(input.issue_date).toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.id)

    if (tableError) {
      return {
        data: null,
        error: { code: 'CIRCULAR_UPDATE_ERROR', message: tableError.message },
      }
    }

    return { data: true, error: null }
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Failed to update official notice.'
    return { data: null, error: { code: 'UPDATE_EXCEPTION', message: errorMsg } }
  }
}

/**
 * Toggles pin status of an official circular.
 */
export async function togglePinOfficialCircular(
  id: string,
  isPinned: boolean
): Promise<ApiResponse<boolean>> {
  try {
    // Try RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('toggle_pin_circular', {
      p_circular_id: id,
      p_is_pinned: isPinned,
    })

    if (!error && data) return { data: true, error: null }

    // Fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: tblError } = await (supabase.from as any)('announcements')
      .update({ is_pinned: isPinned, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (tblError) {
      return { data: null, error: { code: 'PIN_ERROR', message: tblError.message } }
    }

    return { data: true, error: null }
  } catch (err: unknown) {
    return {
      data: null,
      error: { code: 'PIN_EXCEPTION', message: err instanceof Error ? err.message : 'Failed to pin' },
    }
  }
}

/**
 * Deletes or archives an official circular (soft-delete).
 */
export async function deleteOfficialCircular(id: string): Promise<ApiResponse<boolean>> {
  try {
    // Try RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)('delete_official_circular', {
      p_circular_id: id,
    })

    if (!error && data) return { data: true, error: null }

    // Fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: tblError } = await (supabase.from as any)('announcements')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (tblError) {
      return { data: null, error: { code: 'DELETE_ERROR', message: tblError.message } }
    }

    return { data: true, error: null }
  } catch (err: unknown) {
    return {
      data: null,
      error: { code: 'DELETE_EXCEPTION', message: err instanceof Error ? err.message : 'Failed to delete' },
    }
  }
}

/**
 * Changes circular publication status (e.g. Unpublish to DRAFT or Publish to PUBLISHED).
 */
export async function togglePublishStatus(
  id: string,
  newStatus: 'PUBLISHED' | 'DRAFT'
): Promise<ApiResponse<boolean>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from as any)('announcements')
      .update({
        status: newStatus,
        published_at: newStatus === 'PUBLISHED' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      return { data: null, error: { code: 'STATUS_ERROR', message: error.message } }
    }
    return { data: true, error: null }
  } catch (err: unknown) {
    return {
      data: null,
      error: { code: 'STATUS_EXCEPTION', message: err instanceof Error ? err.message : 'Failed' },
    }
  }
}

/**
 * Fetch a single circular by ID or circular number.
 */
export async function getCircularById(
  idOrNumber: string
): Promise<ApiResponse<CircularItem | null>> {
  try {
    const canonical =
      CANONICAL_CIRCULARS_REGISTRY.find(
        (c) =>
          c.id === idOrNumber ||
          c.circular_number.toLowerCase() === idOrNumber.toLowerCase()
      )

    if (canonical) {
      return { data: canonical, error: null }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: annRow, error: annError } = await (supabase.from as any)('announcements')
      .select('*')
      .eq('id', idOrNumber)
      .is('deleted_at', null)
      .maybeSingle()

    if (!annError && annRow) {
      const pubDate = annRow.published_at || annRow.created_at || new Date().toISOString()
      const yr = new Date(pubDate).getFullYear()
      const seq = String(annRow.id || '').replace(/[^0-9]/g, '').slice(0, 3).padStart(3, '1')
      const circNum = annRow.circular_number || `CIR-${yr}-${seq}`
      const isUrgent = annRow.announcement_type === 'URGENT'

      return {
        data: {
          id: annRow.id,
          circular_number: circNum,
          title: annRow.title,
          summary: annRow.description || (annRow.content ? annRow.content.slice(0, 150) + '…' : ''),
          content: annRow.content || '',
          category: isUrgent ? 'URGENT' : (annRow.announcement_type || 'GENERAL'),
          issuing_authority: annRow.issuing_authority || 'Central Panchayat Secretariat',
          signatory_name: annRow.signatory_name || 'Central Secretariat',
          signatory_title: annRow.signatory_title || 'Authorized Signatory',
          issue_date: pubDate,
          formatted_date: new Date(pubDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          is_pinned: Boolean(annRow.is_pinned),
          status: annRow.status || 'PUBLISHED',
          committee_id: annRow.group_id || 'comm-central-panchayat',
          committee_name: annRow.issuing_authority || 'Central Panchayat Secretariat',
          official_seal_text: 'SEAL OF AKHIL BHARAT SINDHI BRAHMKHATRI PANCHAYAT (SARVANIYAT)',
          pdf_url: annRow.pdf_url || null,
          original_pdf_url: annRow.original_pdf_url || null,
          creation_method: annRow.creation_method || 'ONLINE_EDITOR',
          subject: annRow.subject || null,
          instructions: annRow.instructions || null,
          contact_info: annRow.contact_info || null,
          effective_date: annRow.effective_date || null,
        },
        error: null,
      }
    }

    return { data: null, error: null }
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : 'Failed to fetch circular details.'
    return {
      data: null,
      error: {
        message: errorMsg,
        code: 'CIRCULAR_DETAIL_ERROR',
      },
    }
  }
}
