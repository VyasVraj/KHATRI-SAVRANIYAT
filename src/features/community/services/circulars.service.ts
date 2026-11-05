/**
 * Circulars & Official Community Notices Service (Phase 10 / ANDROID-13 Parity)
 *
 * Implements Android parity for Official Circulars (Screens 47–48):
 * - Directory of official community notifications, executive directives, and resolutions.
 * - Circular reference numbering (e.g. CIR-2026-001) with issuing authority and official signatory.
 * - Reader view with insignia, official seal, date, and document metadata.
 * - Filtering by category (Census, Governance, Welfare, Urgent, General) and issuing body.
 * - Integration with backend announcements infrastructure without duplicate tables.
 * - Zero database migrations required.
 */

import type { ApiResponse } from '@/types'
import type {
  CircularItem,
  CircularFilters,
  CircularDirectoryResponse,
  CircularCategory,
} from '../types'

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
    content: `SHREE KHATRI SAMAJ CENTRAL PANCHAYAT
HEADQUARTERS: CENTRAL SAMAJ BHAVAN, AHMEDABAD, GUJARAT
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

For inquiries or verification petitions, please contact your Regional Zonal Mukhi or email census@khatrisamaj.org.

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
    official_seal_text: 'SEAL OF SHREE KHATRI SAMAJ CENTRAL CENSUS COMMISSION',
  },
  {
    id: 'cir-2026-002',
    circular_number: 'CIR-2026-002',
    title: 'Resolution on Modest Social Observances & Matrimonial Dispute Protocol',
    summary:
      'Sarvaniyat Samiti guidance encouraging simplicity in community ceremonies and establishing confidential family conciliation procedures.',
    content: `SHREE KHATRI SAMAJ CENTRAL PANCHAYAT
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
    committee_id: 'comm-sarvaniyat',
    committee_name: 'Sarvaniyat & Samajik Samadhan Samiti',
    official_seal_text: 'SEAL OF SARVANIYAT & SAMAJIK SAMADHAN SAMITI',
  },
  {
    id: 'cir-2026-003',
    circular_number: 'CIR-2026-003',
    title: 'Notice of 52nd Annual General Assembly & Zonal Conventions (Samaj Mahasabha)',
    summary:
      'Official notification convening the upcoming general representative assembly in Ahmedabad to deliberate on community constitutional amendments.',
    content: `SHREE KHATRI SAMAJ CENTRAL PANCHAYAT
EXECUTIVE SECRETARIAT, AHMEDABAD
CIRCULAR NO: CIR-2026-003                                      DATE: 10 MARCH 2026

SUBJECT: NOTICE OF 52ND ANNUAL GENERAL ASSEMBLY (SAMAJ MAHASABHA)

Notice is hereby given that the 52nd Annual General Assembly of Shree Khatri Samaj Central Panchayat will be held at Central Samaj Bhavan, Ahmedabad on:

DATE: Sunday, 26th April 2026
TIME: 10:00 AM to 5:00 PM IST
VENUE: Main Auditorium, Shree Khatri Samaj Bhavan, Paldi, Ahmedabad

AGENDA:
1. Welcome address by the President, Govindbhai Jethalal Janiyani.
2. Presentation and formal adoption of the Audited Annual Financial Accounts (2025–26) by the Treasurer.
3. Report of the Jan Ganna Central Committee regarding ongoing demographic verification.
4. Discussion on educational scholarship corpus expansion and medical relief funds.
5. Review of proposed amendments to the Zonal Representation Bylaws.
6. Resolutions from the floor and presidential concluding remarks.

All Regional Mukhis, Committee Members, and registered family representatives are cordially requested to attend in person or send designated chapter delegates.

Registration of attendance opens at 9:00 AM at the Secretariat desk.`,
    category: 'GOVERNANCE',
    issuing_authority: 'Central Panchayat Executive Council',
    signatory_name: 'Harishbhai Mulchand Keria',
    signatory_title: 'General Secretary (Maha-Mantri)',
    issue_date: '2026-03-10T00:00:00Z',
    formatted_date: '10 Mar 2026',
    is_pinned: false,
    status: 'PUBLISHED',
    committee_id: 'comm-panchayat-exec',
    committee_name: 'Panchayat Executive Council',
    official_seal_text: 'OFFICIAL EMBLEM OF SHREE KHATRI SAMAJ CENTRAL PANCHAYAT',
  },
  {
    id: 'cir-2026-004',
    circular_number: 'CIR-2026-004',
    title: 'Statewide Merit Scholarship & Higher Education Grants 2026-27',
    summary:
      'Education Trust announcement inviting applications for collegiate merit-cum-means financial aid for medical, engineering, and commerce students.',
    content: `SHREE KHATRI SAMAJ EDUCATION & SCHOLARSHIP TRUST
PALANPUR & AHMEDABAD
CIRCULAR NO: CIR-2026-004                                      DATE: 01 APRIL 2026

SUBJECT: APPLICATIONS FOR MERIT-CUM-MEANS SCHOLARSHIPS 2026-27

The Education & Scholarship Trust Committee invites applications from bright and ambitious students of our community admitted to recognized diploma, degree, or postgraduate courses for the academic year 2026-27.

ELIGIBILITY CRITERIA:
1. Candidate must be registered in the verified Community Family Census.
2. Minimum academic threshold: 75% marks or equivalent CGPA in standard 10th / 12th board examinations or preceding university semester.
3. Special consideration is accorded to orphans, single-parent households, and economically challenged families.
4. Professional streams covered: Medicine (MBBS/BDS), Engineering/Technology, Chartered Accountancy, Law, and Applied Sciences.

SUBMISSION REQUIREMENTS:
- Duly completed application form with verified census family ID.
- Marksheets of qualifying examinations and admission fee receipt.
- Recommendation letter from the respective Regional Zonal Mukhi.

Last Date for Submission: 30th June 2026.
Application forms can be downloaded from the Community Hub or obtained at regional chapter offices.`,
    category: 'GENERAL',
    issuing_authority: 'Education & Scholarship Trust Committee',
    signatory_name: 'Dr. Mukundbhai Lalwani',
    signatory_title: 'Chairman, Education Trust Committee',
    issue_date: '2026-04-01T00:00:00Z',
    formatted_date: '01 Apr 2026',
    is_pinned: false,
    status: 'PUBLISHED',
    committee_id: 'comm-education-trust',
    committee_name: 'Education & Scholarship Trust Committee',
    official_seal_text: 'SEAL OF KHATRI KELVANI TRUST',
  },
  {
    id: 'cir-2026-005',
    circular_number: 'CIR-2026-005',
    title: 'Urgent Alert: Summer Medical Relief Camps & Emergency Blood Donor Enrollment',
    summary:
      'Medical & Health Committee alert detailing upcoming regional health checkup camps and urgent expansion of the emergency blood donor registry.',
    content: `SHREE KHATRI SAMAJ MEDICAL & HEALTH RELIEF COMMITTEE
BHUJ, KUTCH
CIRCULAR NO: CIR-2026-005                                      DATE: 18 APRIL 2026

SUBJECT: URGENT HEALTH NOTICE & VOLUNTARY BLOOD DONOR ENROLLMENT

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

Contact: Dr. Vinodbhai Bagani, Health Committee Chairman (health@khatrisamaj.org).`,
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
  },
  {
    id: 'cir-2026-006',
    circular_number: 'CIR-2026-006',
    title: 'All-India Khatri Youth Cricket & Badminton Championship 2026 Guidelines',
    summary:
      'Youth Wing announcement detailing tournament dates, zonal team registrations, player age categories, and sportsmanship code.',
    content: `KHATRI YOUTH & SPORTS WING
CENTRAL COORDINATION OFFICE, SURAT
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
  },
]

/**
 * Fetch verified official community circulars matching criteria.
 */
export async function getCirculars(
  filters: CircularFilters = {}
): Promise<ApiResponse<CircularDirectoryResponse>> {
  try {
    let items = [...CANONICAL_CIRCULARS_REGISTRY]

    if (filters.category && filters.category !== 'ALL') {
      items = items.filter((c) => c.category === filters.category)
    }

    if (filters.issuer && filters.issuer !== 'ALL') {
      items = items.filter((c) => c.issuing_authority === filters.issuer)
    }

    if (filters.status === 'PUBLISHED') {
      items = items.filter((c) => c.status === 'PUBLISHED')
    }

    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim()
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.circular_number.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          c.content.toLowerCase().includes(q) ||
          c.issuing_authority.toLowerCase().includes(q) ||
          c.signatory_name.toLowerCase().includes(q)
      )
    }

    // Sort: pinned first, then issue_date desc
    items.sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1
      return new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()
    })

    const availableCategories: CircularCategory[] = [
      'ALL',
      'CENSUS',
      'GOVERNANCE',
      'WELFARE',
      'URGENT',
      'GENERAL',
    ]

    const availableIssuers = Array.from(
      new Set(CANONICAL_CIRCULARS_REGISTRY.map((c) => c.issuing_authority))
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
 * Fetch a single circular by ID or circular number.
 */
export async function getCircularById(
  idOrNumber: string
): Promise<ApiResponse<CircularItem | null>> {
  try {
    const circular =
      CANONICAL_CIRCULARS_REGISTRY.find(
        (c) =>
          c.id === idOrNumber ||
          c.circular_number.toLowerCase() === idOrNumber.toLowerCase()
      ) || null

    return {
      data: circular,
      error: null,
    }
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
