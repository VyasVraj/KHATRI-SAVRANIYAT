/**
 * Text Sanitization Utilities
 *
 * Provides minimal, predictable, plain-text sanitization for user-controlled free-text fields.
 *
 * Guiding Principles:
 * 1. Plain-text model: The platform uses plain-text content exclusively (zero HTML content).
 * 2. Complete Unicode preservation: Preserves legitimate international text across all scripts
 *    (Gujarati, Hindi, Sindhi, Devanagari, Urdu, Gurmukhi, accented Latin, etc.).
 * 3. Normal punctuation preservation: Retains standard punctuation, mathematical operators,
 *    and line breaks.
 * 4. Tag & markup neutralization: Strips script blocks, iframe blocks, style blocks, HTML tags,
 *    and dangerous pseudo-protocols (javascript:, data:text/html, vbscript:).
 * 5. Control character removal: Strips null bytes and non-printable ASCII control characters
 *    while preserving standard whitespace (\t, \n, \r).
 */

// Matches dangerous executable / embedding blocks and their inner contents
const EMBEDDED_BLOCK_REGEX = /<\s*(script|style|iframe|object|embed|applet)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi

// Matches unclosed/standalone opening dangerous tags (e.g., <script src="..." or <script>)
const UNCLOSED_DANGEROUS_TAG_REGEX = /<\s*(script|style|iframe|object|embed|applet)(?:\s+[^>]*|\s*)>/gi

// Matches HTML comments
const HTML_COMMENT_REGEX = /<!--[\s\S]*?-->/g

// Matches all valid HTML opening, closing, or self-closing tags
// (Ensures <letter... is matched as a tag, while preserving mathematical expressions like 5 < 10)
const HTML_TAG_REGEX = /<\/?[a-zA-Z][^>]*>/g

// Matches dangerous executable protocol schemes (javascript:, vbscript:, data:...)
const DANGEROUS_PROTOCOL_REGEX = /(?:javascript|vbscript|data)\s*:[^\s]*/gi

// Matches ASCII control characters except \t (0x09), \n (0x0A), and \r (0x0D)
// 0x00 (NULL) to 0x08, 0x0B (VT), 0x0C (FF), 0x0E to 0x1F, and 0x7F (DEL)
// eslint-disable-next-line no-control-regex -- Explicitly matching and stripping malicious ASCII control characters
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

// Matches bidirectional override characters that can obfuscate display order
const BIDI_OVERRIDE_REGEX = /[\u202A-\u202E\u2066-\u2069]/g

/**
 * Strips HTML tags, script/style/iframe blocks, dangerous protocols, and control characters.
 *
 * @param input Raw user string
 * @param preserveNewlines When true, preserves \n and \r\n (for multiline fields like bio/story)
 * @returns Sanitized plain text
 */
export function sanitizeRawText(input: unknown, preserveNewlines = false): string {
  if (typeof input !== 'string') {
    return ''
  }

  if (!input) {
    return ''
  }

  // 1. Strip embedded executable/renderable blocks completely (including content between tags)
  let result = input.replace(EMBEDDED_BLOCK_REGEX, '')
  result = result.replace(UNCLOSED_DANGEROUS_TAG_REGEX, '')

  // 2. Strip HTML comments
  result = result.replace(HTML_COMMENT_REGEX, '')

  // 3. Strip all remaining HTML tags
  result = result.replace(HTML_TAG_REGEX, '')

  // 4. Strip dangerous pseudo-protocols
  result = result.replace(DANGEROUS_PROTOCOL_REGEX, '')

  // 5. Strip ASCII control characters and BiDi override exploits
  result = result.replace(CONTROL_CHAR_REGEX, '')
  result = result.replace(BIDI_OVERRIDE_REGEX, '')

  // 6. Handle whitespace and newlines
  if (preserveNewlines) {
    // Normalize Windows CRLF to standard LF
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Remove trailing whitespace on each line while preserving single-line breaks
    result = result
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
    // Collapse 3 or more consecutive newlines into 2 (at most 1 blank line between paragraphs)
    result = result.replace(/\n{3,}/g, '\n\n')
    // Trim leading and trailing newlines
    result = result.trim()
  } else {
    // Replace all newlines, carriage returns, and tabs with single spaces
    result = result.replace(/[\r\n\t]+/g, ' ')
    // Collapse consecutive spaces into a single space
    result = result.replace(/ {2,}/g, ' ')
    result = result.trim()
  }

  return result
}

/**
 * Sanitizes single-line free text (e.g. names, titles, locations, gotra, nukh, captions).
 * Collapses newlines and multiple spaces into single spaces.
 */
export function sanitizeText(input: unknown): string {
  return sanitizeRawText(input, false)
}

/**
 * Sanitizes multiline free text (e.g. bios, descriptions, stories, evidence notes, announcements).
 * Preserves deliberate paragraph line breaks while stripping dangerous markup and control characters.
 */
export function sanitizeMultilineText(input: unknown): string {
  return sanitizeRawText(input, true)
}

/**
 * Optional string transformer for Zod schemas that sanitizes single-line text.
 * Leaves null or undefined untouched; sanitizes strings.
 */
export function sanitizeTextOptional(input: unknown): string | undefined {
  if (input === undefined || input === null || input === '') {
    return undefined
  }
  const sanitized = sanitizeText(input)
  return sanitized.length > 0 ? sanitized : undefined
}

/**
 * Optional string transformer for Zod schemas that sanitizes multiline text.
 * Leaves null or undefined untouched; sanitizes strings.
 */
export function sanitizeMultilineTextOptional(input: unknown): string | undefined {
  if (input === undefined || input === null || input === '') {
    return undefined
  }
  const sanitized = sanitizeMultilineText(input)
  return sanitized.length > 0 ? sanitized : undefined
}
