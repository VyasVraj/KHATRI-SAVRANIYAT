import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchGotraNukhRegistry } from '@/services/gotraNukh.service'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('gotraNukh.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws an honest error when database query fails', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: null, error: new Error('Table not found') }),
      }),
    } as unknown as ReturnType<typeof supabase.from>)

    await expect(fetchGotraNukhRegistry()).rejects.toThrow('Database error fetching Gotras: Table not found')
  })

  it('throws an honest error when database returns empty records', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    } as unknown as ReturnType<typeof supabase.from>)

    await expect(fetchGotraNukhRegistry()).rejects.toThrow('No registered Gotras found in database.')
  })

  it('maps database rows into gotras and gotraNukhMap when database returns data', async () => {
    const mockGotras = [
      { id: 'g1', name: 'Garg' },
      { id: 'g2', name: 'Garga' },
    ]
    const mockNukhs = [
      { id: 'n1', gotra_id: 'g1', name: 'Gargya' },
      { id: 'n2', gotra_id: 'g2', name: 'Gargeya' },
    ]

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'gotras') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockGotras, error: null }),
          }),
        } as unknown as ReturnType<typeof supabase.from>
      }
      if (table === 'nukhs') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockNukhs, error: null }),
          }),
        } as unknown as ReturnType<typeof supabase.from>
      }
      return {} as unknown as ReturnType<typeof supabase.from>
    })

    const result = await fetchGotraNukhRegistry()
    expect(result.gotras).toEqual(['Garg', 'Garga'])
    expect(result.gotraNukhMap['Garg']).toEqual(['Gargya'])
    expect(result.gotraNukhMap['Garga']).toEqual(['Gargeya'])
  })
})
