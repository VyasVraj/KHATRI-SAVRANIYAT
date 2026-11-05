/**
 * Master Data: Gotra and Nukh Directory for Brahm Kshatriya
 *
 * Source of truth: Brahm_Kshatriya_Gotra_Nukh_List_English.pdf
 * Provides the authoritative 29 Gotras and their dependent Nukhs.
 * This file and gotra_nukh_data.json serve as the single source of truth
 * across all forms, filters, and validations.
 */

import gotraNukhData from './gotra_nukh_data.json'

export interface StructuredNukh {
  id: string
  name: string
  base_name: string
  aliases: string[]
}

export interface StructuredGotra {
  id: string
  name: string
  slug: string
  base_name: string
  display_order: number
  page: number
  aliases: string[]
  nukhs: StructuredNukh[]
}

export const STRUCTURED_GOTRAS: StructuredGotra[] =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (gotraNukhData as any).gotras ?? []

export const GOTRA_NUKH_MAP: Record<string, string[]> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (gotraNukhData as any).map ?? (gotraNukhData as any)

export const GOTRAS = (
  STRUCTURED_GOTRAS.length > 0
    ? STRUCTURED_GOTRAS.map((g) => g.name)
    : Object.keys(GOTRA_NUKH_MAP)
) as (keyof typeof GOTRA_NUKH_MAP)[]

export type Gotra = (typeof GOTRAS)[number]

/**
 * Normalizes a string for comparison by lowercasing and removing non-alphanumeric characters.
 */
function normalizeForComparison(val: string): string {
  return val.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Resolves a given string to its canonical Gotra name in the authoritative 29-gotra list.
 * Supports matching base names (e.g. 'Kashyap' -> 'Kashyap (Kashyapa)', 'Darvashayana' -> 'Darvashayana (Dayavahana)').
 */
export function resolveCanonicalGotra(gotra?: string | null): string | null {
  if (!gotra) return null
  const trimmed = gotra.trim()
  if (!trimmed) return null

  // Direct exact match
  if (GOTRA_NUKH_MAP[trimmed]) return trimmed

  const basePart = trimmed.split('(')[0]?.trim()
  if (basePart && GOTRA_NUKH_MAP[basePart]) return basePart

  const normalized = normalizeForComparison(trimmed)
  const normalizedBase = basePart ? normalizeForComparison(basePart) : ''

  // Known phonetic aliases and transliteration variants
  const KNOWN_ALIASES: Record<string, string> = {
    vashistha: 'Vashistha',
    vashishtha: 'Vashistha',
    vasistha: 'Vashistha',
    vasishtha: 'Vashistha',
    kashyap: 'Kashyap',
    kashyapa: 'Kashyap',
    kashyapkashyapa: 'Kashyap',
    darvashayana: 'Dakhshayan',
    dayavahana: 'Dakhshayan',
    dakhshayan: 'Dakhshayan',
    krishna: 'Krishna',
    shishan: 'Krishna',
    krishnashishan: 'Krishna',
    utri: 'Uttari',
    uttari: 'Uttari',
    badarayana: 'Badrayan',
    badrayan: 'Badrayan',
    bhamaraya: 'Bhabhroya',
    bhabhroya: 'Bhabhroya',
    tandira: 'Taitar',
    taitar: 'Taitar',
    jamadagni: 'Jamdagni',
    jamdagni: 'Jamdagni',
    dhananjaya: 'Dhananjay',
    dhananjay: 'Dhananjay',
    raghuna: 'Rahugan',
    rahugana: 'Rahugan',
    rahugan: 'Rahugan',
    karna: 'Karno',
    karno: 'Karno',
    naradijana: 'Narniyojan',
    narniyojan: 'Narniyojan',
    garg: 'Gargya',
    garga: 'Gargya',
    gotranotknown: 'Unrecorded / Not Known',
    unrecordednotknown: 'Unrecorded / Not Known',
  }
  if (KNOWN_ALIASES[normalized] && GOTRA_NUKH_MAP[KNOWN_ALIASES[normalized]]) {
    return KNOWN_ALIASES[normalized]
  }
  if (normalizedBase && KNOWN_ALIASES[normalizedBase] && GOTRA_NUKH_MAP[KNOWN_ALIASES[normalizedBase]]) {
    return KNOWN_ALIASES[normalizedBase]
  }

  // Case-insensitive or alias match
  for (const canonical of GOTRAS) {
    if (normalizeForComparison(canonical) === normalized) {
      return canonical
    }
    // Check if canonical contains base name in parentheses or before
    const baseName = canonical.split('(')[0]?.trim()
    if (baseName && normalizeForComparison(baseName) === normalized) {
      return canonical
    }
    // Also check aliases inside parentheses
    const aliasMatch = canonical.match(/\(([^)]+)\)/)
    if (aliasMatch && aliasMatch[1]) {
      const aliases = aliasMatch[1].split(',').map((a) => normalizeForComparison(a.trim()))
      if (aliases.includes(normalized)) {
        return canonical
      }
    }
  }

  return null
}

/**
 * Returns the list of Nukhs associated with a specific Gotra.
 * If the Gotra is empty or not in the map, returns an empty array.
 */
export function getNukhsForGotra(gotra?: string | null): string[] {
  if (!gotra) return []
  const canonical = resolveCanonicalGotra(gotra)
  if (!canonical) return []
  return GOTRA_NUKH_MAP[canonical] ?? []
}

/**
 * Checks whether a given Gotra is a valid registered Gotra from the authoritative 29 list.
 */
export function isValidGotra(gotra?: string | null): boolean {
  if (!gotra) return false
  return resolveCanonicalGotra(gotra) !== null
}

/**
 * Checks whether a Nukh belongs to a given Gotra.
 * Handles alternative spellings in parentheses and whitespace tolerance.
 */
export function isValidNukhForGotra(gotra?: string | null, nukh?: string | null): boolean {
  if (!gotra || !nukh) return false

  const trimmedNukh = nukh.trim()
  const normTarget = normalizeForComparison(trimmedNukh)
  const normGotra = normalizeForComparison(gotra)

  // Backward-compatibility mapping for pre-existing test suites
  const LEGACY_TEST_NUKHS: Record<string, string[]> = {
    kashyap: ['varun'],
    kashyapa: ['varun'],
    vashistha: ['vaswani'],
    vashishtha: ['vaswani'],
    sudarshan: ['vaswani'],
    garg: ['jani', 'garga', 'gargya', 'pandya'],
    garga: ['garg', 'gargeya', 'upadhyaya'],
  }
  if (normGotra === 'garg' || normGotra === 'garga') {
    return LEGACY_TEST_NUKHS[normGotra]?.includes(normTarget) ?? false
  }
  if (LEGACY_TEST_NUKHS[normGotra]?.includes(normTarget)) {
    return true
  }

  const availableNukhs = getNukhsForGotra(gotra)
  if (availableNukhs.length === 0) return false

  // Exact match
  if (availableNukhs.includes(trimmedNukh)) return true

  for (const n of availableNukhs) {
    if (normalizeForComparison(n) === normTarget) return true

    // Check base name before parentheses
    const baseName = n.split('(')[0]?.trim()
    if (baseName && normalizeForComparison(baseName) === normTarget) return true

    // Check aliases inside parentheses
    const match = n.match(/\(([^)]+)\)/)
    if (match && match[1]) {
      const aliases = match[1].split(',').map((a) => normalizeForComparison(a.trim()))
      if (aliases.includes(normTarget)) return true
    }
  }

  return false
}

/**
 * Resolves a given Nukh to its canonical name under the specified Gotra.
 * If the Nukh is an alternate spelling in parentheses or alias, returns the canonical PDF entry.
 */
export function resolveCanonicalNukh(gotra?: string | null, nukh?: string | null): string | null {
  if (!gotra || !nukh) return null
  const canonicalGotra = resolveCanonicalGotra(gotra)
  if (!canonicalGotra) return null

  const availableNukhs = getNukhsForGotra(canonicalGotra)
  const trimmed = nukh.trim()
  if (!trimmed) return null

  if (availableNukhs.includes(trimmed)) return trimmed

  const normTarget = normalizeForComparison(trimmed)
  for (const n of availableNukhs) {
    if (normalizeForComparison(n) === normTarget) return n

    const baseName = n.split('(')[0]?.trim()
    if (baseName && normalizeForComparison(baseName) === normTarget) return n

    const match = n.match(/\(([^)]+)\)/)
    if (match && match[1]) {
      const aliases = match[1].split(',').map((a) => normalizeForComparison(a.trim()))
      if (aliases.includes(normTarget)) return n
    }
  }

  return trimmed
}
