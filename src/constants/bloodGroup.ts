/**
 * Blood Group Constants & Helpers
 *
 * Supported options: A+, A-, B+, B-, AB+, AB-, O+, O-, UNKNOWN
 */

export const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'UNKNOWN',
] as const

export type BloodGroup = (typeof BLOOD_GROUPS)[number]

export const BLOOD_GROUP_OPTIONS: { value: BloodGroup | ''; label: string }[] = [
  { value: '', label: 'Select Blood Group' },
  { value: 'A+', label: 'A+' },
  { value: 'A-', label: 'A-' },
  { value: 'B+', label: 'B+' },
  { value: 'B-', label: 'B-' },
  { value: 'AB+', label: 'AB+' },
  { value: 'AB-', label: 'AB-' },
  { value: 'O+', label: 'O+' },
  { value: 'O-', label: 'O-' },
  { value: 'UNKNOWN', label: 'Unknown / Not Known' },
]

export const BLOOD_GROUP_LABELS: Record<BloodGroup, string> = {
  'A+': 'A+',
  'A-': 'A-',
  'B+': 'B+',
  'B-': 'B-',
  'AB+': 'AB+',
  'AB-': 'AB-',
  'O+': 'O+',
  'O-': 'O-',
  'UNKNOWN': 'Unknown / Not Known',
}

export function isValidBloodGroup(val: unknown): val is BloodGroup {
  return typeof val === 'string' && (BLOOD_GROUPS as readonly string[]).includes(val)
}

/**
 * Format a blood group for display:
 * - Empty / null / undefined -> 'Not provided'
 * - 'UNKNOWN' -> 'Unknown / Not Known'
 * - Standard blood group -> 'A+', 'B+', etc.
 */
export function formatBloodGroup(val: string | null | undefined): string {
  if (!val || val.trim() === '') return 'Not provided'
  if (val === 'UNKNOWN') return 'Unknown / Not Known'
  return val
}
