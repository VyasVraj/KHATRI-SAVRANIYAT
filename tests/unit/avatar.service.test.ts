import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  uploadAvatar,
  deleteAvatar,
  extractStoragePath,
  resolveAvatarUrl,
  resolveAvatarUrls,
  clearAvatarUrlCache,
} from '@/features/media/services/avatar.service'
import { supabase } from '@/lib/supabase'

const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockCreateSignedUrl = vi.fn()
const mockCreateSignedUrls = vi.fn()
const mockRemove = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
        createSignedUrl: mockCreateSignedUrl,
        createSignedUrls: mockCreateSignedUrls,
        remove: mockRemove,
      })),
    },
    rpc: vi.fn(),
  },
}))

describe('Media service: avatar.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAvatarUrlCache()
    mockUpload.mockReset()
    mockGetPublicUrl.mockReset()
    mockCreateSignedUrl.mockReset()
    mockCreateSignedUrls.mockReset()
    mockRemove.mockReset()
  })

  describe('extractStoragePath', () => {
    it('extracts relative storage path from valid public supabase url', () => {
      const url = 'https://abc.supabase.co/storage/v1/object/public/avatars/profiles/user-1/avatar.png'
      expect(extractStoragePath(url)).toBe('profiles/user-1/avatar.png')
    })

    it('extracts relative storage path from canonical avatars/... path', () => {
      const path = 'avatars/persons/11111111-1111-1111-1111-111111111111/avatar.webp'
      expect(extractStoragePath(path)).toBe('persons/11111111-1111-1111-1111-111111111111/avatar.webp')
    })

    it('returns null if url does not match avatars bucket path', () => {
      expect(extractStoragePath('https://external.com/photo.jpg')).toBeNull()
      expect(extractStoragePath(null)).toBeNull()
    })
  })

  describe('resolveAvatarUrl', () => {
    it('creates a signed URL for canonical storage paths in private bucket', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://supabase.co/storage/v1/object/sign/avatars/persons/111/photo.webp?token=xyz' },
        error: null,
      })

      const { resolveAvatarUrl } = await import('@/features/media/services/avatar.service')
      const signed = await resolveAvatarUrl('avatars/persons/111/photo.webp')

      expect(signed).toBe('https://supabase.co/storage/v1/object/sign/avatars/persons/111/photo.webp?token=xyz')
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('persons/111/photo.webp', 3600)
    })

    it('returns direct URL when passing external non-storage URLs', async () => {
      const { resolveAvatarUrl } = await import('@/features/media/services/avatar.service')
      const url = await resolveAvatarUrl('https://example.com/external.jpg')
      expect(url).toBe('https://example.com/external.jpg')
      expect(mockCreateSignedUrl).not.toHaveBeenCalled()
    })

    it('returns null when path is invalid or signing errors', async () => {
      mockCreateSignedUrl.mockResolvedValue({
        data: null,
        error: { message: 'Object not found' },
      })

      const url = await resolveAvatarUrl('avatars/persons/nonexistent/photo.webp')
      expect(url).toBeNull()
    })

    it('caches signed URL and does not re-issue network requests on repeated calls', async () => {
      mockCreateSignedUrl.mockResolvedValueOnce({
        data: { signedUrl: 'https://supabase.co/signed-cached.webp' },
        error: null,
      })

      const url1 = await resolveAvatarUrl('avatars/persons/111/photo.webp')
      const url2 = await resolveAvatarUrl('avatars/persons/111/photo.webp')

      expect(url1).toBe('https://supabase.co/signed-cached.webp')
      expect(url2).toBe('https://supabase.co/signed-cached.webp')
      expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1)
    })
  })

  describe('resolveAvatarUrls', () => {
    it('returns empty Map for empty input', async () => {
      const res = await resolveAvatarUrls([])
      expect(res.size).toBe(0)
      expect(mockCreateSignedUrls).not.toHaveBeenCalled()
    })

    it('batches multiple avatar paths into a single createSignedUrls call', async () => {
      mockCreateSignedUrls.mockResolvedValueOnce({
        data: [
          { path: 'persons/p-1/avatar.webp', signedUrl: 'https://supabase.co/p1.webp' },
          { path: 'persons/p-2/avatar.webp', signedUrl: 'https://supabase.co/p2.webp' },
        ],
        error: null,
      })

      const res = await resolveAvatarUrls([
        'avatars/persons/p-1/avatar.webp',
        'avatars/persons/p-2/avatar.webp',
      ])

      expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1)
      expect(mockCreateSignedUrls).toHaveBeenCalledWith(
        ['persons/p-1/avatar.webp', 'persons/p-2/avatar.webp'],
        3600
      )
      expect(res.get('avatars/persons/p-1/avatar.webp')).toBe('https://supabase.co/p1.webp')
      expect(res.get('avatars/persons/p-2/avatar.webp')).toBe('https://supabase.co/p2.webp')
    })

    it('returns direct URLs for external images without calling storage', async () => {
      const res = await resolveAvatarUrls(['https://images.example.com/external.png'])
      expect(res.get('https://images.example.com/external.png')).toBe('https://images.example.com/external.png')
      expect(mockCreateSignedUrls).not.toHaveBeenCalled()
    })
  })

  describe('deleteAvatar', () => {
    it('calls appropriate RPC and deletes file from storage', async () => {
      mockRemove.mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never)

      const currentUrl = 'https://abc.supabase.co/storage/v1/object/public/avatars/profiles/user-1/avatar.png'
      const res = await deleteAvatar({ type: 'profile', id: 'user-1' }, currentUrl)

      expect(res.error).toBeNull()
      expect(supabase.rpc).toHaveBeenCalledWith('set_profile_avatar', { p_avatar_url: null })
      expect(mockRemove).toHaveBeenCalledWith(['profiles/user-1/avatar.png'])
    })

    it('returns error if target type is unknown or id is invalid', async () => {
      const res = await deleteAvatar({ type: 'unknown' as never, id: 'user-1' }, null)
      expect(res.error).not.toBeNull()
    })
  })

  describe('uploadAvatar', () => {
    it('rejects oversized or invalid file types without calling storage', async () => {
      const oversizedFile = new File([new Uint8Array(6 * 1024 * 1024)], 'too-large.png', {
        type: 'image/png',
      })
      const res = await uploadAvatar(oversizedFile, { type: 'profile', id: 'user-1' })

      expect(res.error).not.toBeNull()
      expect(res.error?.message).toMatch(/exceeds/i)
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('persists strictly canonical storage path avatars/... to database RPC', async () => {
      const validFile = new File(['mock data'], 'avatar.png', { type: 'image/png' })
      mockUpload.mockResolvedValue({ error: null })
      vi.mocked(supabase.rpc).mockResolvedValue({ error: null } as never)

      const personId = '11111111-1111-1111-1111-111111111111'
      const res = await uploadAvatar(validFile, { type: 'person', id: personId })

      expect(res.error).toBeNull()
      expect(res.data?.url).toMatch(/^avatars\/persons\/11111111-1111-1111-1111-111111111111\/avatar_\d+\.png$/)
      // Asserts that database RPC received canonical internal path, NOT a signed or public URL
      expect(supabase.rpc).toHaveBeenCalledWith('set_person_avatar', {
        p_person_id: personId,
        p_avatar_url: expect.stringMatching(/^avatars\/persons\/11111111-1111-1111-1111-111111111111\/avatar_\d+\.png$/),
      })
      expect(supabase.rpc).not.toHaveBeenCalledWith(
        'set_person_avatar',
        expect.objectContaining({
          p_avatar_url: expect.stringContaining('http'),
        })
      )
    })

    it('rolls back storage upload if database RPC fails', async () => {
      const validFile = new File(['mock data'], 'avatar.png', { type: 'image/png' })
      mockUpload.mockResolvedValue({ error: null })
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://abc.supabase.co/storage/v1/object/public/avatars/persons/p-1/photo.png' },
      })
      mockRemove.mockResolvedValue({ error: null })

      vi.mocked(supabase.rpc).mockResolvedValue({
        error: { message: 'Database RLS violation' },
      } as never)

      const res = await uploadAvatar(validFile, { type: 'person', id: '11111111-1111-1111-1111-111111111111' })

      expect(res.error).not.toBeNull()
      expect(res.error?.message).toBe('Database RLS violation')
      // Rolled back storage object
      expect(mockRemove).toHaveBeenCalled()
    })
  })
})
