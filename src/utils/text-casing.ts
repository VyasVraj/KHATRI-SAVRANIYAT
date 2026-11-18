/**
 * text-casing.ts — Centralized proper-name and sentence-case formatting utilities.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. PERSON NAMES:
 *    Consistent title/proper casing across all inputs (e.g. 'VRAJ J VYAS', 'vraj j vyas' -> 'Vraj J Vyas').
 * 2. GENERAL TEXT:
 *    Sentence casing for descriptions, notes, and general text fields.
 * 3. PRESERVATION OF SPECIAL DATA:
 *    Strictly preserves emails, URLs, IDs, UUIDs, phone numbers, OTPs, and known acronyms (e.g. FSSAI, AI, API, PWA).
 */

const KNOWN_ACRONYMS = new Set([
  'AI',
  'API',
  'FSSAI',
  'PWA',
  'UI',
  'UX',
  'OTP',
  'SMS',
  'ID',
  'URL',
  'PDF',
  'PAN',
  'GST',
  'USA',
  'UK',
  'UAE',
  'RU',
])

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_REGEX = /^(https?:\/\/|www\.)[^\s]+$/i
const PHONE_REGEX = /^\+?[0-9\s\-().]{7,}$/

/**
 * Checks if a string or token represents protected data that must not have casing altered.
 */
export function isProtectedToken(str: string): boolean {
  if (!str) return false
  const trimmed = str.trim()
  if (UUID_REGEX.test(trimmed)) return true
  if (EMAIL_REGEX.test(trimmed)) return true
  if (URL_REGEX.test(trimmed)) return true
  if (KNOWN_ACRONYMS.has(trimmed.toUpperCase())) return true
  return false
}

/**
 * Formats a single name part (word) into proper name casing.
 * Handles single initials (e.g. 'J' or 'J.'), hyphens ('Mary-Jane'), and apostrophes ("O'Connor").
 */
function formatNameWord(word: string): string {
  if (!word) return ''
  if (isProtectedToken(word)) return word

  // Handle hyphenated names (e.g. "Jean-Pierre")
  if (word.includes('-')) {
    return word
      .split('-')
      .map((part) => formatNameWord(part))
      .join('-')
  }

  // Handle apostrophes (e.g. "O'Connor", "D'Souza")
  if (word.includes("'")) {
    return word
      .split("'")
      .map((part, i) => (i === 0 ? formatNameWord(part) : formatNameWord(part)))
      .join("'")
  }

  // Handle initials like "V." or "V"
  if (/^[a-zA-Z]\.?$/.test(word)) {
    return word.toUpperCase()
  }

  // Preserve camelCase words with internal capital letters (e.g. "MehtaNukh", "SomeNukh", "McDonald")
  if (/^[A-Z][a-z]+[A-Z]/.test(word)) {
    return word
  }

  const lower = word.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/**
 * Formats a person's name into proper title-case.
 *
 * Examples:
 * - "VRAJ J VYAS" -> "Vraj J Vyas"
 * - "vraj j vyas" -> "Vraj J Vyas"
 * - "jAYESH c vYAS" -> "Jayesh C Vyas"
 * - "CHANDRAKANT V VYAS" -> "Chandrakant V Vyas"
 */
export function toProperCaseName(name?: string | null): string {
  if (!name || typeof name !== 'string') return ''
  const trimmed = name.trim()
  if (!trimmed) return ''

  // If already matches UUID or protected token, preserve
  if (isProtectedToken(trimmed)) return trimmed

  // Split on spaces and format each token
  return trimmed
    .split(/\s+/)
    .map((word) => formatNameWord(word))
    .join(' ')
}

/**
 * Formats general text/sentences into standard sentence casing.
 *
 * Examples:
 * - "THIS IS MY FAMILY DESCRIPTION." -> "This is my family description."
 * - "this is my family description." -> "This is my family description."
 * - "tHIS IS MY FAMILY DESCRIPTION." -> "This is my family description."
 * - "FIRST SENTENCE. SECOND SENTENCE." -> "First sentence. Second sentence."
 */
export function toSentenceCase(text?: string | null): string {
  if (!text || typeof text !== 'string') return ''
  const trimmed = text.trim()
  if (!trimmed) return ''

  if (isProtectedToken(trimmed)) return trimmed
  if (PHONE_REGEX.test(trimmed)) return trimmed

  // Check if text already has standard mixed-case prose (where lowercase letters outnumber uppercase letters).
  // If it is already authored with proper nouns (e.g. "Descendants of the elder branch of Ahmedabad."),
  // preserve it so city/gotra/place names aren't mangled, and only ensure sentence starts are capitalized.
  const letters = trimmed.replace(/[^a-zA-Z]/g, '')
  if (!letters) return trimmed

  const upperCount = (letters.match(/[A-Z]/g) || []).length
  const lowerCount = (letters.match(/[a-z]/g) || []).length

  if (lowerCount > upperCount) {
    return trimmed.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_match, prefix, char) => `${prefix}${char.toUpperCase()}`)
  }

  // Split on sentence-ending punctuation like '.', '!', '?'
  const sentences = trimmed.split(/([.!?]\s*)/)

  const formatted = sentences.map((segment, index) => {
    // Odd indices in split with capturing group are the delimiters (e.g. ". ")
    if (index % 2 === 1) return segment

    const segmentTrimmed = segment.trim()
    if (!segmentTrimmed) return segment

    // Process tokens in this sentence
    const tokens = segment.split(/(\s+)/)
    let isFirstWordInSentence = true

    const processedTokens = tokens.map((token) => {
      if (/^\s*$/.test(token)) return token

      if (isProtectedToken(token)) {
        isFirstWordInSentence = false
        return token
      }

      const lower = token.toLowerCase()

      if (isFirstWordInSentence) {
        isFirstWordInSentence = false
        // Capitalize first character of sentence
        return lower.charAt(0).toUpperCase() + lower.slice(1)
      }

      // Check if uppercase token is an acronym
      if (KNOWN_ACRONYMS.has(token.toUpperCase())) {
        return token.toUpperCase()
      }

      return lower
    })

    return processedTokens.join('')
  })

  return formatted.join('')
}
