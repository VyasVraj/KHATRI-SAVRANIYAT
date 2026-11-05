import { describe, it, expect } from 'vitest'
import {
  validateAvatarFile,
  generateAvatarStoragePath,
  getInitials,
  formatFileSize,
  formatMediaDate,
} from '@/features/media/utils/image.utils'

describe('Media utils: image.utils', () => {
  describe('getInitials', () => {
    it('returns uppercase initials for first and last name', () => {
      expect(getInitials('John Doe')).toBe('JD')
      expect(getInitials('Ramesh Kumar Sharma')).toBe('RS')
    })

    it('returns single letter or two letters for single word name', () => {
      expect(getInitials('Priya')).toBe('PR')
    })

    it('returns default fallback when name is null, undefined, or empty', () => {
      expect(getInitials(null)).toBe('?')
      expect(getInitials(undefined)).toBe('?')
      expect(getInitials('')).toBe('?')
      expect(getInitials('   ')).toBe('?')
    })
  })

  describe('generateAvatarStoragePath', () => {
    it('generates predictable profile avatar path without spaces', () => {
      const path = generateAvatarStoragePath({ type: 'profile', id: 'user-123' }, 'png')
      expect(path.startsWith('profiles/user-123/avatar_')).toBe(true)
      expect(path.endsWith('.png')).toBe(true)
      expect(path).not.toContain(' ')
    })

    it('generates predictable person avatar path', () => {
      const path = generateAvatarStoragePath({ type: 'person', id: 'person-456' }, 'jpg')
      expect(path.startsWith('persons/person-456/avatar_')).toBe(true)
      expect(path.endsWith('.jpg')).toBe(true)
    })

    it('generates predictable family crest avatar path', () => {
      const path = generateAvatarStoragePath({ type: 'family', id: 'family-789' }, 'webp')
      expect(path.startsWith('families/family-789/avatar_')).toBe(true)
      expect(path.endsWith('.webp')).toBe(true)
    })
  })

  describe('validateAvatarFile', () => {
    it('accepts valid JPEG, PNG, and WebP files under 5MB', () => {
      const validJpeg = new File(['mock content'], 'photo.jpg', { type: 'image/jpeg' })
      const validPng = new File(['mock content'], 'photo.png', { type: 'image/png' })
      const validWebp = new File(['mock content'], 'photo.webp', { type: 'image/webp' })

      expect(validateAvatarFile(validJpeg).valid).toBe(true)
      expect(validateAvatarFile(validPng).valid).toBe(true)
      expect(validateAvatarFile(validWebp).valid).toBe(true)
    })

    it('rejects files exceeding maximum size (5MB)', () => {
      const largeContent = new Uint8Array(6 * 1024 * 1024)
      const oversizedFile = new File([largeContent], 'heavy.jpg', { type: 'image/jpeg' })

      const res = validateAvatarFile(oversizedFile)
      expect(res.valid).toBe(false)
      expect(res.error).toMatch(/exceeds/i)
    })

    it('rejects disallowed MIME types such as PDF or SVG', () => {
      const pdfFile = new File(['mock'], 'doc.pdf', { type: 'application/pdf' })
      const svgFile = new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' })

      expect(validateAvatarFile(pdfFile).valid).toBe(false)
      expect(validateAvatarFile(svgFile).valid).toBe(false)
    })
  })

  describe('formatFileSize', () => {
    it('formats bytes, KB, MB accurately', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(500)).toBe('500 B')
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(1048576)).toBe('1.0 MB')
      expect(formatFileSize(10485760)).toBe('10.0 MB')
    })
  })

  describe('formatMediaDate', () => {
    it('formats ISO timestamps nicely', () => {
      const formatted = formatMediaDate('2026-10-15T12:00:00Z')
      expect(formatted).toMatch(/2026/)
    })

    it('returns fallback dash for missing date', () => {
      expect(formatMediaDate(null)).toBe('—')
      expect(formatMediaDate(undefined)).toBe('—')
    })
  })
})
