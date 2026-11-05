/**
 * Unit tests for family invitations service layer and token utilities (Phase 8 — Subtask 4B)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateInvitationToken,
  hashInvitationToken,
} from '@/features/invitations/utils/token'
import {
  createFamilyInvitation,
  getInvitationByToken,
  acceptInvitation,
} from '@/features/invitations/services/invitations.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

describe('Invitation Token Utilities', () => {
  it('generates a 64-character lowercase hex token with sufficient entropy', () => {
    const token1 = generateInvitationToken()
    const token2 = generateInvitationToken()

    expect(token1).toHaveLength(64)
    expect(token2).toHaveLength(64)
    expect(token1).toMatch(/^[0-9a-f]{64}$/)
    expect(token2).toMatch(/^[0-9a-f]{64}$/)
    expect(token1).not.toBe(token2)
  })

  it('computes valid SHA-256 hash using Web Crypto', async () => {
    const token = 'a'.repeat(64)
    const hash = await hashInvitationToken(token)

    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    // Re-hashing the same token yields identical hash
    const hash2 = await hashInvitationToken(token)
    expect(hash).toBe(hash2)
  })

  it('rejects empty or whitespace-only token for hashing', async () => {
    await expect(hashInvitationToken('')).rejects.toThrow('empty')
    await expect(hashInvitationToken('   ')).rejects.toThrow('empty')
  })
})

describe('createFamilyInvitation Service', () => {
  const validFamilyId = '11111111-1111-4111-8111-111111111111'
  const validPersonId = '22222222-2222-4222-8222-222222222222'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('successfully creates an invitation and returns plaintext token and inviteUrl', async () => {
    const fakeInvitationId = '33333333-3333-4333-8333-333333333333'
    ;(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: fakeInvitationId,
      error: null,
    })

    const result = await createFamilyInvitation(
      {
        familyId: validFamilyId,
        personId: validPersonId,
        invitedEmail: 'member@example.com',
        role: 'CHILD',
      },
      'https://community.roots'
    )

    expect(result.error).toBeNull()
    expect(result.data).toBeDefined()
    expect(result.data?.id).toBe(fakeInvitationId)
    expect(result.data?.token).toHaveLength(64)
    expect(result.data?.inviteUrl).toBe(`https://community.roots/invite/${result.data?.token}`)

    // Verify RPC invocation parameter names and hash presence
    expect(supabase.rpc).toHaveBeenCalledWith('create_family_invitation', {
      p_family_id: validFamilyId,
      p_person_id: validPersonId,
      p_invited_email: 'member@example.com',
      p_role: 'CHILD',
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_expires_at: expect.any(String),
    })
  })

  it('fails with validation error on invalid email address', async () => {
    const result = await createFamilyInvitation({
      familyId: validFamilyId,
      personId: validPersonId,
      invitedEmail: 'invalid-email',
      role: 'CHILD',
    })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('fails with validation error on invalid UUID', async () => {
    const result = await createFamilyInvitation({
      familyId: 'not-a-uuid',
      personId: validPersonId,
      invitedEmail: 'test@example.com',
      role: 'CHILD',
    })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('VALIDATION_ERROR')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('sanitizes duplicate pending invitation database error cleanly', async () => {
    ;(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: {
        code: '23505',
        message: 'pending invitation already exists for person',
      },
    })

    const result = await createFamilyInvitation({
      familyId: validFamilyId,
      personId: validPersonId,
      invitedEmail: 'test@example.com',
      role: 'CHILD',
    })

    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('active pending invitation already exists')
  })

  it('sanitizes unauthorized database error cleanly', async () => {
    ;(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'not authorized to create invitations',
      },
    })

    const result = await createFamilyInvitation({
      familyId: validFamilyId,
      personId: validPersonId,
      invitedEmail: 'test@example.com',
      role: 'CHILD',
    })

    expect(result.data).toBeNull()
    expect(result.error?.message).toContain('not authorized')
  })
})

describe('getInvitationByToken Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves invitation preview by computing token hash and calling get_invitation_by_token', async () => {
    const token = 'b'.repeat(64)
    const previewData = [
      {
        id: '44444444-4444-4444-4444-444444444444',
        family_id: '11111111-1111-4111-8111-111111111111',
        family_name: 'Patel Family',
        person_id: '22222222-2222-4222-8222-222222222222',
        person_name: 'Aarav Patel',
        invited_email: 'aarav@example.com',
        role: 'CHILD',
        status: 'PENDING',
        expires_at: '2026-10-15T00:00:00Z',
        is_expired: false,
      },
    ]

    ;(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: previewData,
      error: null,
    })

    const res = await getInvitationByToken(token)

    expect(res.error).toBeNull()
    expect(res.data).toEqual(previewData[0])
    expect(supabase.rpc).toHaveBeenCalledWith('get_invitation_by_token', {
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('returns NOT_FOUND when RPC returns empty array', async () => {
    ;(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: [],
      error: null,
    })

    const res = await getInvitationByToken('b'.repeat(64))

    expect(res.data).toBeNull()
    expect(res.error?.code).toBe('NOT_FOUND')
  })

  it('returns INVALID_TOKEN when token string is empty', async () => {
    const res = await getInvitationByToken('')

    expect(res.data).toBeNull()
    expect(res.error?.code).toBe('INVALID_TOKEN')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

describe('acceptInvitation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls accept_invitation RPC with computed token hash', async () => {
    const token = 'c'.repeat(64)
    ;(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: true,
      error: null,
    })

    const res = await acceptInvitation(token)

    expect(res.error).toBeNull()
    expect(res.data).toBe(true)
    expect(supabase.rpc).toHaveBeenCalledWith('accept_invitation', {
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('sanitizes expired invitation error cleanly', async () => {
    ;(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: {
        code: '23514',
        message: 'Invitation has expired.',
      },
    })

    const res = await acceptInvitation('c'.repeat(64))

    expect(res.data).toBeNull()
    expect(res.error?.message).toContain('expired')
  })

  it('sanitizes unauthorized error cleanly', async () => {
    ;(supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'Authentication required to accept an invitation.',
      },
    })

    const res = await acceptInvitation('c'.repeat(64))

    expect(res.data).toBeNull()
    expect(res.error?.message).toContain('sign in')
  })
})
