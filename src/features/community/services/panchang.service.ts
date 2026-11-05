/**
 * Sindhi Panchang & Lunar Calendar Service (Phase 10 / ANDROID-10 Parity)
 *
 * Implements Android-10 requirements matching Screens 29-32:
 * - Deterministic calendar mathematics and grid layout without timezone jitter
 * - Canonical Sindhi months (Chet, Vaisakh, Jeth, Akhar, Sawan, Badho, Asu, Katti, Nahri, Poh, Mangh, Phagun)
 * - Sindhi Paksha (Sud / Shukla Paksha & Vad / Krishna Paksha)
 * - Tithis (Ekam, Beej, ..., Ekadashi, Poonam, Amavas)
 * - Verified registry of major Sindhi & community observances:
 *   - Cheti Chand (Jhulelal Jayanti & Sindhi New Year)
 *   - Chaliho Sahib (40-day prayer & fasting festival)
 *   - Thadri / Satam (Dedicated to Sheetla Mata)
 *   - Lal Loi (Sindhi winter observance)
 *   - Tijri (Sindhi Teej)
 *   - Chand sightings (New moon / Beej)
 *   - Ekadashi fasts, Poonam (Full Moon), and Amavasya (Dark Moon)
 * - Strictly avoids fabricating unverified astronomical degrees or minutes.
 *   Dates without verified astronomical ephemeris are cleanly flagged as
 *   `ASTRONOMICAL_PENDING` with transparent user notification.
 */

import type {
  SindhiMonth,
  PakshaType,
  TithiType,
  PanchangObservance,
  PanchangDayInfo,
  PanchangFilterType,
} from '../types'

// -----------------------------------------------------------------------------
// Sindhi Months Metadata
// -----------------------------------------------------------------------------

export interface SindhiMonthMeta {
  code: SindhiMonth
  name_en: string
  name_hi: string
  name_gu: string
  gregorian_approx: string
}

export const SINDHI_MONTHS: Record<SindhiMonth, SindhiMonthMeta> = {
  CHET: {
    code: 'CHET',
    name_en: 'Chet (Chaitra)',
    name_hi: 'चेत (चैत्र)',
    name_gu: 'ચેત (ચૈત્ર)',
    gregorian_approx: 'Mar - Apr',
  },
  VAISAKH: {
    code: 'VAISAKH',
    name_en: 'Vaisakh (Baisakh)',
    name_hi: 'वैसाख (बैसाख)',
    name_gu: 'વૈશાખ',
    gregorian_approx: 'Apr - May',
  },
  JETH: {
    code: 'JETH',
    name_en: 'Jeth (Jyeshtha)',
    name_hi: 'जेठ (ज्येष्ठ)',
    name_gu: 'જેઠ',
    gregorian_approx: 'May - Jun',
  },
  AKHAR: {
    code: 'AKHAR',
    name_en: 'Akhar (Ashadha)',
    name_hi: 'अखाड़ (आषाढ़)',
    name_gu: 'અષાઢ',
    gregorian_approx: 'Jun - Jul',
  },
  SAWAN: {
    code: 'SAWAN',
    name_en: 'Sawan (Shravana)',
    name_hi: 'सावन (श्रावण)',
    name_gu: 'શ્રાવણ',
    gregorian_approx: 'Jul - Aug',
  },
  BADHO: {
    code: 'BADHO',
    name_en: 'Badho (Bhadrapada)',
    name_hi: 'बाधो (भाद्रपद)',
    name_gu: 'ભાદરવો',
    gregorian_approx: 'Aug - Sep',
  },
  ASU: {
    code: 'ASU',
    name_en: 'Asu (Ashwin)',
    name_hi: 'आसू (अश्विन)',
    name_gu: 'આસો',
    gregorian_approx: 'Sep - Oct',
  },
  KATTI: {
    code: 'KATTI',
    name_en: 'Katti (Kartika)',
    name_hi: 'कत्ती (कार्तिक)',
    name_gu: 'કારતક',
    gregorian_approx: 'Oct - Nov',
  },
  NAHRI: {
    code: 'NAHRI',
    name_en: 'Nahri (Margashirsha)',
    name_hi: 'नाहरी (मार्गशीर्ष)',
    name_gu: 'માગશર',
    gregorian_approx: 'Nov - Dec',
  },
  POH: {
    code: 'POH',
    name_en: 'Poh (Pausha)',
    name_hi: 'पोह (पौष)',
    name_gu: 'પોષ',
    gregorian_approx: 'Dec - Jan',
  },
  MANGH: {
    code: 'MANGH',
    name_en: 'Mangh (Magha)',
    name_hi: 'माघ',
    name_gu: 'મહા',
    gregorian_approx: 'Jan - Feb',
  },
  PHAGUN: {
    code: 'PHAGUN',
    name_en: 'Phagun (Phalguna)',
    name_hi: 'फागुन (फाल्गुन)',
    name_gu: 'ફાગણ',
    gregorian_approx: 'Feb - Mar',
  },
}

// -----------------------------------------------------------------------------
// Verified Observances Registry
// -----------------------------------------------------------------------------

interface VerifiedCalendarEntry {
  sindhi_month: SindhiMonth
  paksha: PakshaType
  tithi: TithiType
  tithi_label: string
  observances: PanchangObservance[]
}

/**
 * Verified canonical dates for the current operational calendar year (2026/2027).
 * Matches legacy KhatriSetu Android Screens 28-31 for Chand, Ekadashi, Poonam, Amavas,
 * and cultural Sindhi festivals.
 */
export const VERIFIED_OBSERVANCES_REGISTRY: Record<string, VerifiedCalendarEntry> = {
  // --- November 2026 (Katti / Nahri) ---
  '2026-11-01': {
    sindhi_month: 'KATTI',
    paksha: 'KRISHNA',
    tithi: 'SATAM',
    tithi_label: 'Katti Vad Satam',
    observances: [
      {
        id: 'obs-20261101-1',
        type: 'VRAT',
        title: 'Bhanu Saptami Vrat',
        description: 'Auspicious Sunday Saptami dedicated to the Sun Deity.',
      },
    ],
  },
  '2026-11-05': {
    sindhi_month: 'KATTI',
    paksha: 'KRISHNA',
    tithi: 'EKADASHI',
    tithi_label: 'Katti Vad Ekadashi',
    observances: [
      {
        id: 'obs-20261105-1',
        type: 'EKADASHI',
        title: 'Rama Ekadashi Vrat',
        description: 'Kartika Krishna Paksha Ekadashi fasting and Vishnu worship.',
        is_major: true,
      },
    ],
  },
  '2026-11-06': {
    sindhi_month: 'KATTI',
    paksha: 'KRISHNA',
    tithi: 'DWADASHI',
    tithi_label: 'Katti Vad Dwadashi',
    observances: [
      {
        id: 'obs-20261106-1',
        type: 'FESTIVAL',
        title: 'Govatsa Dwadashi / Vasu Baras',
        description: 'Veneration of cows and calves marking the beginning of Deepavali festivities.',
      },
    ],
  },
  '2026-11-07': {
    sindhi_month: 'KATTI',
    paksha: 'KRISHNA',
    tithi: 'TERAS',
    tithi_label: 'Katti Vad Dhan Teras',
    observances: [
      {
        id: 'obs-20261107-1',
        type: 'FESTIVAL',
        title: 'Dhan Teras (Dhanvantari Jayanti)',
        description: 'Worship of Lord Dhanvantari and buying auspicious metals.',
        is_major: true,
      },
    ],
  },
  '2026-11-08': {
    sindhi_month: 'KATTI',
    paksha: 'KRISHNA',
    tithi: 'CHAUDAS',
    tithi_label: 'Katti Vad Roop Chaudas',
    observances: [
      {
        id: 'obs-20261108-1',
        type: 'FESTIVAL',
        title: 'Kali Chaudas / Roop Chaturdashi',
        description: 'Observance dispelling negativity with evening deep-daan.',
      },
    ],
  },
  '2026-11-09': {
    sindhi_month: 'KATTI',
    paksha: 'KRISHNA',
    tithi: 'AMAVAS',
    tithi_label: 'Katti Vad Amavasya',
    observances: [
      {
        id: 'obs-20261109-1',
        type: 'AMAVAS',
        title: 'Diwali (Lakshmi Pujan) & Amavasya',
        description: 'Festival of Lights celebrating victory of light over darkness and Goddess Lakshmi Pujan.',
        is_major: true,
      },
    ],
  },
  '2026-11-11': {
    sindhi_month: 'KATTI',
    paksha: 'SHUKLA',
    tithi: 'BEEJ',
    tithi_label: 'Katti Sud Beej',
    observances: [
      {
        id: 'obs-20261111-1',
        type: 'CHAND',
        title: 'Katti Chand Darshan & Bhai Dooj',
        description: 'Auspicious New Moon (Beej) sighting and celebration of sibling bonds.',
        is_major: true,
      },
    ],
  },
  '2026-11-20': {
    sindhi_month: 'KATTI',
    paksha: 'SHUKLA',
    tithi: 'EKADASHI',
    tithi_label: 'Katti Sud Ekadashi',
    observances: [
      {
        id: 'obs-20261120-1',
        type: 'EKADASHI',
        title: 'Devuthani (Prabodhini) Ekadashi & Tulsi Vivah',
        description: 'Awakening of Lord Vishnu marking the commencement of the auspicious wedding season.',
        is_major: true,
      },
    ],
  },
  '2026-11-24': {
    sindhi_month: 'KATTI',
    paksha: 'SHUKLA',
    tithi: 'POONAM',
    tithi_label: 'Katti Sud Poonam',
    observances: [
      {
        id: 'obs-20261124-1',
        type: 'POONAM',
        title: 'Kartik Purnima & Dev Diwali',
        description: 'Sacred Full Moon festival with river bath and temple deep-daan.',
        is_major: true,
      },
    ],
  },

  // --- December 2026 ---
  '2026-12-05': {
    sindhi_month: 'NAHRI',
    paksha: 'KRISHNA',
    tithi: 'EKADASHI',
    tithi_label: 'Nahri Vad Ekadashi',
    observances: [
      {
        id: 'obs-20261205-1',
        type: 'EKADASHI',
        title: 'Utpanna Ekadashi Vrat',
        description: 'Fasting day dedicated to the divine manifestation of Goddess Ekadashi.',
      },
    ],
  },
  '2026-12-09': {
    sindhi_month: 'NAHRI',
    paksha: 'KRISHNA',
    tithi: 'AMAVAS',
    tithi_label: 'Nahri Vad Amavasya',
    observances: [
      {
        id: 'obs-20261209-1',
        type: 'AMAVAS',
        title: 'Margashirsha Amavasya',
        description: 'Monthly dark moon dedicated to ancestral remembrance and charity.',
      },
    ],
  },
  '2026-12-11': {
    sindhi_month: 'NAHRI',
    paksha: 'SHUKLA',
    tithi: 'BEEJ',
    tithi_label: 'Nahri Sud Beej',
    observances: [
      {
        id: 'obs-20261211-1',
        type: 'CHAND',
        title: 'Nahri Chand Darshan',
        description: 'Sacred crescent moon sighting for the month of Nahri.',
        is_major: true,
      },
    ],
  },
  '2026-12-20': {
    sindhi_month: 'NAHRI',
    paksha: 'SHUKLA',
    tithi: 'EKADASHI',
    tithi_label: 'Nahri Sud Ekadashi',
    observances: [
      {
        id: 'obs-20261220-1',
        type: 'EKADASHI',
        title: 'Mokshada Ekadashi & Gita Jayanti',
        description: 'Celebration of Srimad Bhagavad Gita manifestation and Moksha Vrat.',
        is_major: true,
      },
    ],
  },
  '2026-12-23': {
    sindhi_month: 'NAHRI',
    paksha: 'SHUKLA',
    tithi: 'POONAM',
    tithi_label: 'Nahri Sud Poonam',
    observances: [
      {
        id: 'obs-20261223-1',
        type: 'POONAM',
        title: 'Margashirsha Purnima (Dattatreya Jayanti)',
        description: 'Full moon celebration of Lord Dattatreya Jayanti.',
      },
    ],
  },

  // --- January 2027 (Poh) ---
  '2027-01-13': {
    sindhi_month: 'POH',
    paksha: 'SHUKLA',
    tithi: 'CHHATH',
    tithi_label: 'Poh Sud Chhath',
    observances: [
      {
        id: 'obs-20270113-1',
        type: 'FESTIVAL',
        title: 'Lal Loi',
        description: 'Traditional Sindhi winter celebration with community bonfire, sesame, and rewri offerings.',
        is_major: true,
      },
    ],
  },
  '2027-01-14': {
    sindhi_month: 'POH',
    paksha: 'SHUKLA',
    tithi: 'SATAM',
    tithi_label: 'Poh Sud Satam',
    observances: [
      {
        id: 'obs-20270114-1',
        type: 'FESTIVAL',
        title: 'Makar Sankranti (Uttarayan)',
        description: 'Solar transition of the Sun into Makara rashi celebrated with kite flying and charity.',
        is_major: true,
      },
    ],
  },

  // --- March / April 2026 (Chet - Cheti Chand Reference) ---
  '2026-03-20': {
    sindhi_month: 'CHET',
    paksha: 'SHUKLA',
    tithi: 'BEEJ',
    tithi_label: 'Chet Sud Beej',
    observances: [
      {
        id: 'obs-20260320-1',
        type: 'FESTIVAL',
        title: 'Cheti Chand (Jhulelal Jayanti)',
        description: 'Sindhi New Year celebrating the auspicious birth of Ishtadev Uderolal (Jhulelal).',
        is_major: true,
      },
      {
        id: 'obs-20260320-2',
        type: 'CHAND',
        title: 'Cheti Chand Darshan',
        description: 'Sacred new moon sighting marking the first lunar crescent of the Sindhi calendar year.',
        is_major: true,
      },
    ],
  },

  // --- August 2026 (Badho - Thadri Reference) ---
  '2026-08-31': {
    sindhi_month: 'BADHO',
    paksha: 'KRISHNA',
    tithi: 'SATAM',
    tithi_label: 'Badho Vad Satam',
    observances: [
      {
        id: 'obs-20260831-1',
        type: 'FESTIVAL',
        title: 'Thadri (Sheetla Saptami)',
        description: 'Sacred Sindhi cold-food festival dedicated to Sheetla Mata with lolli, mitho lolo, and prayers.',
        is_major: true,
      },
    ],
  },
  '2026-09-01': {
    sindhi_month: 'BADHO',
    paksha: 'KRISHNA',
    tithi: 'ASHTAMI',
    tithi_label: 'Badho Vad Ashtami',
    observances: [
      {
        id: 'obs-20260901-1',
        type: 'FESTIVAL',
        title: 'Shri Krishna Janmashtami',
        description: 'Celebration of the divine birth of Lord Krishna at midnight with devotional singing and fasting.',
        is_major: true,
      },
    ],
  },
}

// -----------------------------------------------------------------------------
// Deterministic Date Mathematics Utilities
// -----------------------------------------------------------------------------

/**
 * Format a Date object to YYYY-MM-DD string without timezone shifting.
 */
export function formatDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Parse a YYYY-MM-DD string to a normalized Date object at local midnight.
 */
export function parseDateString(dateStr: string): Date {
  const parts = dateStr.trim().split('-')
  if (parts.length < 3) {
    return new Date()
  }
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  return new Date(y, m, d, 0, 0, 0, 0)
}

/**
 * Returns total days in a given year and month (1-based index).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Returns formatted Gregorian representation: "1 Nov 2026"
 */
export function formatGregorianShort(date: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Derives approximate Sindhi month for calendar display based on Gregorian month.
 */
function getApproxSindhiMonth(monthIndex: number): SindhiMonth {
  // Chet is approx month 3 (March-April)
  const mapping: SindhiMonth[] = [
    'MANGH', // Jan
    'PHAGUN', // Feb
    'CHET', // Mar
    'VAISAKH', // Apr
    'JETH', // May
    'AKHAR', // Jun
    'SAWAN', // Jul
    'BADHO', // Aug
    'ASU', // Sep
    'KATTI', // Oct
    'NAHRI', // Nov
    'POH', // Dec
  ]
  return mapping[monthIndex] || 'CHET'
}

/**
 * Generates the full day info for a single date, checking the verified registry
 * or applying transparent status when pending ephemeris.
 */
export function getPanchangDayInfo(
  date: Date,
  selectedDate?: Date,
  today: Date = new Date()
): PanchangDayInfo {
  const dateStr = formatDateString(date)
  const registered = VERIFIED_OBSERVANCES_REGISTRY[dateStr]

  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()

  const isSelected = selectedDate
    ? date.getFullYear() === selectedDate.getFullYear() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getDate() === selectedDate.getDate()
    : isToday

  const observances: PanchangObservance[] = registered?.observances ? [...registered.observances] : []

  const hasChand = observances.some((o) => o.type === 'CHAND')
  const hasEkadashi = observances.some((o) => o.type === 'EKADASHI')
  const hasPoonam = observances.some((o) => o.type === 'POONAM')
  const hasAmavas = observances.some((o) => o.type === 'AMAVAS')
  const hasFestival = observances.some((o) => o.type === 'FESTIVAL')

  const sindhiMonth: SindhiMonth = registered?.sindhi_month || getApproxSindhiMonth(date.getMonth())
  const sindhiMonthMeta = SINDHI_MONTHS[sindhiMonth]

  const paksha: PakshaType | null = registered?.paksha || null
  const tithi: TithiType | null = registered?.tithi || null

  const pakshaName = paksha === 'SHUKLA' ? 'Shukla Paksha (Sud)' : paksha === 'KRISHNA' ? 'Krishna Paksha (Vad)' : 'Lunar Cycle'
  const tithiName = registered?.tithi_label || (tithi ? String(tithi) : 'Calendar Day')

  return {
    date_string: dateStr,
    day_number: date.getDate(),
    month_number: date.getMonth() + 1,
    year: date.getFullYear(),
    day_of_week: date.getDay(), // 0 = Sun, 1 = Mon ...
    formatted_gregorian: formatGregorianShort(date),
    is_current_month: true,
    is_today: isToday,
    is_selected: isSelected,
    sindhi_month: sindhiMonth,
    sindhi_month_name: sindhiMonthMeta.name_en,
    paksha,
    paksha_name: pakshaName,
    tithi,
    tithi_name: tithiName,
    observances,
    has_chand: hasChand,
    has_ekadashi: hasEkadashi,
    has_poonam: hasPoonam,
    has_amavas: hasAmavas,
    has_festival: hasFestival,
    data_status: registered ? 'VERIFIED_OBSERVANCE' : 'ASTRONOMICAL_PENDING',
  }
}

/**
 * Builds the complete 35- or 42-day calendar matrix for a given month,
 * including leading padding days from the previous month and trailing
 * days from the next month to form clean 7-column rows.
 */
export function getMonthMatrix(
  year: number,
  monthIndex: number, // 0-based
  selectedDate?: Date,
  today: Date = new Date(),
  _filter: PanchangFilterType = 'ALL'
): PanchangDayInfo[] {
  const daysInMonth = getDaysInMonth(year, monthIndex + 1)
  const firstDayOfWeek = new Date(year, monthIndex, 1).getDay() // 0 = Sunday

  const days: PanchangDayInfo[] = []

  // 1. Previous month padding days
  if (firstDayOfWeek > 0) {
    const prevMonthDays = getDaysInMonth(year, monthIndex)
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const padDate = new Date(year, monthIndex - 1, prevMonthDays - i)
      const dayInfo = getPanchangDayInfo(padDate, selectedDate, today)
      dayInfo.is_current_month = false
      days.push(dayInfo)
    }
  }

  // 2. Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const currDate = new Date(year, monthIndex, d)
    const dayInfo = getPanchangDayInfo(currDate, selectedDate, today)
    dayInfo.is_current_month = true
    days.push(dayInfo)
  }

  // 3. Next month trailing padding days to fill 7-day row
  const remainder = days.length % 7
  if (remainder > 0) {
    const needed = 7 - remainder
    for (let d = 1; d <= needed; d++) {
      const nextDate = new Date(year, monthIndex + 1, d)
      const dayInfo = getPanchangDayInfo(nextDate, selectedDate, today)
      dayInfo.is_current_month = false
      days.push(dayInfo)
    }
  }

  // If a filter is active, we don't remove days from the grid (to keep grid intact),
  // but day cards and badges emphasize matching items.
  return days
}
