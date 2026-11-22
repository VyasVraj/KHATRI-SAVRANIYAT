import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  compressProfilePhoto,
  detectMimeTypeFromBytes,
  TARGET_MAX_WIDTH_OR_HEIGHT,
  TARGET_MAX_SIZE_MB,
  TARGET_MIME_TYPE,
  MAX_PHOTO_BYTES,
  formatCompressedSizeFeedback,
} from '@/features/media/utils/imageCompression.utils'
import { uploadAvatar } from '@/features/media/services/avatar.service'
import { supabase } from '@/lib/supabase'

const mockUpload = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        remove: mockRemove,
        createSignedUrl: vi.fn(),
      })),
    },
    rpc: vi.fn(),
  },
}))

describe('Image Compression Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockReset()
    mockRemove.mockReset()
  })

  describe('detectMimeTypeFromBytes', () => {
    it('detects JPEG header (FF D8 FF)', async () => {
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
      const blob = new Blob([bytes], { type: '' })
      const detected = await detectMimeTypeFromBytes(blob)
      expect(detected).toBe('image/jpeg')
    })

    it('detects PNG header (89 50 4E 47 0D 0A 1A 0A)', async () => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      const blob = new Blob([bytes], { type: '' })
      const detected = await detectMimeTypeFromBytes(blob)
      expect(detected).toBe('image/png')
    })

    it('detects WebP header (RIFF ... WEBP)', async () => {
      const bytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50, // WEBP
      ])
      const blob = new Blob([bytes], { type: '' })
      const detected = await detectMimeTypeFromBytes(blob)
      expect(detected).toBe('image/webp')
    })

    it('detects HEIC header with ftypheic', async () => {
      const bytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x18,
        0x66, 0x74, 0x79, 0x70, // ftyp
        0x68, 0x65, 0x69, 0x63, // heic
      ])
      const blob = new Blob([bytes], { type: '' })
      const detected = await detectMimeTypeFromBytes(blob)
      expect(detected).toBe('image/heic')
    })

    it('falls back to file type if magic bytes are not matched', async () => {
      const blob = new Blob(['test text'], { type: 'image/jpeg' })
      const detected = await detectMimeTypeFromBytes(blob)
      expect(detected).toBe('image/jpeg')
    })
  })

  describe('compressProfilePhoto', () => {
    it('compresses an input file to WebP within targets', async () => {
      const rawFile = new File(['fake image data bytes for test'], 'photo.png', {
        type: 'image/png',
      })

      const result = await compressProfilePhoto(rawFile)

      expect(result).toBeDefined()
      expect(result.file).toBeInstanceOf(File)
      expect(result.file.name).toMatch(/\.webp$/)
      expect(result.file.type).toBe(TARGET_MIME_TYPE)
      expect(result.format).toBe('image/webp')
      expect(result.width).toBeLessThanOrEqual(TARGET_MAX_WIDTH_OR_HEIGHT)
      expect(result.height).toBeLessThanOrEqual(TARGET_MAX_WIDTH_OR_HEIGHT)
    })

    it('respects compression configuration constants and formats size feedback', () => {
      expect(TARGET_MAX_WIDTH_OR_HEIGHT).toBe(400)
      expect(MAX_PHOTO_BYTES).toBe(75 * 1024) // 76,800 bytes
      expect(TARGET_MAX_SIZE_MB).toBeLessThanOrEqual(0.075) // ~75 KB target
      expect(TARGET_MIME_TYPE).toBe('image/webp')

      expect(formatCompressedSizeFeedback(50 * 1024)).toBe('Image compressed successfully – 50 KB')
      expect(formatCompressedSizeFeedback(75 * 1024)).toBe('Image compressed successfully – 75 KB')
    })
  })

  describe('Safe Replacement Sequence in uploadAvatar', () => {
    it('uploads compressed image and cleans up old avatar when DB update succeeds', async () => {
      mockUpload.mockResolvedValue({ error: null })
      mockRemove.mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never)

      const file = new File(['image bytes'], 'my-photo.jpg', { type: 'image/jpeg' })
      const oldAvatarUrl = 'avatars/persons/target-123/avatar_11111.webp'

      const result = await uploadAvatar(
        file,
        { type: 'person', id: 'target-123' },
        { previousAvatarUrl: oldAvatarUrl }
      )

      expect(result.error).toBeNull()
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringContaining('persons/target-123/avatar_'),
        expect.any(Object),
        expect.objectContaining({
          contentType: 'image/webp',
          upsert: true,
        })
      )
      expect(supabase.rpc).toHaveBeenCalledWith('set_person_avatar', {
        p_person_id: 'target-123',
        p_avatar_url: expect.stringContaining('avatars/persons/target-123/'),
      })
      // Old photo must be deleted only after DB success
      expect(mockRemove).toHaveBeenCalledWith(['persons/target-123/avatar_11111.webp'])
    })

    it('rolls back newly uploaded file and does NOT delete old photo if database RPC fails', async () => {
      mockUpload.mockResolvedValue({ error: null })
      mockRemove.mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockResolvedValue({
        error: { message: 'Database constraint violation', code: '23505' },
      } as never)

      const file = new File(['image bytes'], 'my-photo.jpg', { type: 'image/jpeg' })
      const oldAvatarUrl = 'avatars/persons/target-123/avatar_old.webp'

      const result = await uploadAvatar(
        file,
        { type: 'person', id: 'target-123' },
        { previousAvatarUrl: oldAvatarUrl }
      )

      expect(result.error).not.toBeNull()
      // The new upload must be rolled back
      expect(mockRemove).toHaveBeenCalledWith([expect.stringContaining('persons/target-123/avatar_')])
      // The old avatar must NOT be deleted
      expect(mockRemove).not.toHaveBeenCalledWith(['persons/target-123/avatar_old.webp'])
    })
  })
})
