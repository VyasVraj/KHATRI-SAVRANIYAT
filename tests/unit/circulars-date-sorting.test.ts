import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCirculars,
  parseCircularDate,
  sortCircularsChronologically,
} from '@/features/community/services/circulars.service'
import type { CircularItem } from '@/features/community/types'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: true, error: null }),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'path' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/path.pdf' } }),
      })),
    },
  },
}))

describe('Panchayat Circulars Date-Wise Chronological Sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseCircularDate helper', () => {
    it('parses valid ISO and date strings into timestamps', () => {
      expect(parseCircularDate('2026-11-22T00:00:00Z')).toBe(new Date('2026-11-22T00:00:00Z').getTime())
      expect(parseCircularDate('2026-11-22')).toBe(new Date('2026-11-22').getTime())
    })

    it('returns -Infinity safely for null, undefined, empty, or invalid dates', () => {
      expect(parseCircularDate(null)).toBe(-Infinity)
      expect(parseCircularDate(undefined)).toBe(-Infinity)
      expect(parseCircularDate('')).toBe(-Infinity)
      expect(parseCircularDate('   ')).toBe(-Infinity)
      expect(parseCircularDate('invalid-date-xyz')).toBe(-Infinity)
    })
  })

  describe('sortCircularsChronologically comparison function', () => {
    it('sorts circulars strictly in descending order by official issue date', () => {
      const circA: CircularItem = {
        id: 'A',
        circular_number: 'CIR-A',
        title: 'Circular A',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Central Panchayat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        issue_date: '2026-11-22',
        formatted_date: '22 Nov 2026',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const circB: CircularItem = {
        id: 'B',
        circular_number: 'CIR-B',
        title: 'Circular B',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Central Panchayat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        issue_date: '2026-11-21',
        formatted_date: '21 Nov 2026',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const circC: CircularItem = {
        id: 'C',
        circular_number: 'CIR-C',
        title: 'Circular C',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Central Panchayat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        issue_date: '2026-11-18',
        formatted_date: '18 Nov 2026',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const circD: CircularItem = {
        id: 'D',
        circular_number: 'CIR-D',
        title: 'Circular D',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Central Panchayat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        issue_date: '2026-05-05',
        formatted_date: '05 May 2026',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const circE: CircularItem = {
        id: 'E',
        circular_number: 'CIR-E',
        title: 'Circular E',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Central Panchayat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        issue_date: '2026-01-15',
        formatted_date: '15 Jan 2026',
        is_pinned: true, // Note: Pinned!
        status: 'PUBLISHED',
      }

      const circF: CircularItem = {
        id: 'F',
        circular_number: 'CIR-F',
        title: 'Circular F',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Central Panchayat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        issue_date: '', // Missing date
        formatted_date: '—',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const unordered = [circD, circF, circE, circA, circC, circB]
      const sorted = [...unordered].sort(sortCircularsChronologically)

      // Expected order: A (22 Nov), B (21 Nov), C (18 Nov), D (05 May), E (15 Jan), F (missing)
      expect(sorted.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    })

    it('ensures pinned circulars do NOT override chronological order', () => {
      const olderPinned: CircularItem = {
        id: 'old-pinned',
        circular_number: 'CIR-OLD',
        title: 'Old Pinned Notice',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Central Panchayat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        issue_date: '2026-01-15',
        formatted_date: '15 Jan 2026',
        is_pinned: true,
        status: 'PUBLISHED',
      }

      const newerUnpinned: CircularItem = {
        id: 'new-unpinned',
        circular_number: 'CIR-NEW',
        title: 'New Unpinned Notice',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Central Panchayat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        issue_date: '2026-11-22',
        formatted_date: '22 Nov 2026',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const list = [olderPinned, newerUnpinned]
      list.sort(sortCircularsChronologically)

      expect(list[0].id).toBe('new-unpinned')
      expect(list[1].id).toBe('old-pinned')
    })

    it('correctly sorts circulars spanning multiple years and months', () => {
      const c2024: CircularItem = {
        id: '2024',
        circular_number: 'CIR-2024',
        title: '2024 Notice',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Panchayat',
        signatory_name: '',
        signatory_title: '',
        issue_date: '2024-12-10',
        formatted_date: '10 Dec 2024',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const c2025_jan: CircularItem = {
        id: '2025-jan',
        circular_number: 'CIR-2025-01',
        title: '2025 Jan Notice',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Panchayat',
        signatory_name: '',
        signatory_title: '',
        issue_date: '2025-01-15',
        formatted_date: '15 Jan 2025',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const c2025_dec: CircularItem = {
        id: '2025-dec',
        circular_number: 'CIR-2025-12',
        title: '2025 Dec Notice',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Panchayat',
        signatory_name: '',
        signatory_title: '',
        issue_date: '2025-12-25',
        formatted_date: '25 Dec 2025',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const c2026_nov: CircularItem = {
        id: '2026-nov',
        circular_number: 'CIR-2026-11',
        title: '2026 Nov Notice',
        summary: '',
        content: '',
        category: 'GENERAL',
        issuing_authority: 'Panchayat',
        signatory_name: '',
        signatory_title: '',
        issue_date: '2026-11-22',
        formatted_date: '22 Nov 2026',
        is_pinned: false,
        status: 'PUBLISHED',
      }

      const items = [c2024, c2026_nov, c2025_jan, c2025_dec]
      items.sort(sortCircularsChronologically)

      expect(items.map((i) => i.id)).toEqual(['2026-nov', '2025-dec', '2025-jan', '2024'])
    })
  })

  describe('getCirculars integration with database records & canonical registry', () => {
    it('places newly published circular with today date at the top of listing', async () => {
      // Mock RPC returning newly uploaded circular from database
      const mockDbCircular = {
        id: 'db-circ-today',
        circular_number: 'CIR-2026-099',
        title: 'Brand New Circular Uploaded Today',
        description: 'New directive description',
        content: 'Full content',
        category: 'GENERAL',
        status: 'PUBLISHED',
        issuing_authority: 'Central Panchayat Secretariat',
        signatory_name: 'Panchayat President',
        signatory_title: 'President',
        pdf_url: null,
        original_pdf_url: null,
        creation_method: 'ONLINE_EDITOR',
        is_pinned: false,
        published_at: '2026-11-22T10:00:00Z', // Today's date
        created_at: '2026-11-22T10:00:00Z',
        effective_date: null,
        subject: null,
        instructions: null,
        contact_info: null,
        group_id: null,
      }

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [mockDbCircular],
        error: null,
      } as never)

      const res = await getCirculars()
      expect(res.error).toBeNull()
      const items = res.data?.items || []

      // The circular dated 2026-11-22 must appear first!
      expect(items[0].id).toBe('db-circ-today')
      expect(items[0].title).toBe('Brand New Circular Uploaded Today')

      // Older canonical circulars follow chronologically
      expect(items[1].circular_number).toBe('CIR-2026-006') // 05 May 2026
      expect(items[items.length - 1].circular_number).toBe('CIR-2026-001') // 15 Jan 2026
    })

    it('places uploaded circular with older date below newer circulars', async () => {
      const mockOlderCircular = {
        id: 'db-circ-older',
        circular_number: 'CIR-2025-ARCHIVE',
        title: 'Archived 2025 Circular',
        description: 'Archived circular description',
        content: 'Content',
        category: 'GENERAL',
        status: 'PUBLISHED',
        issuing_authority: 'Central Panchayat Secretariat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        pdf_url: null,
        original_pdf_url: null,
        creation_method: 'ONLINE_EDITOR',
        is_pinned: true,
        published_at: '2025-06-15T00:00:00Z', // 2025 date
        created_at: '2026-11-22T00:00:00Z',
        effective_date: null,
        subject: null,
        instructions: null,
        contact_info: null,
        group_id: null,
      }

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [mockOlderCircular],
        error: null,
      } as never)

      const res = await getCirculars()
      expect(res.error).toBeNull()
      const items = res.data?.items || []

      // 2025 circular must appear after all 2026 circulars
      expect(items[0].circular_number).toBe('CIR-2026-006') // May 2026
      const olderIndex = items.findIndex((c) => c.id === 'db-circ-older')
      expect(olderIndex).toBe(items.length - 1)
    })

    it('maintains strict descending chronological order when category filters are applied', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [],
        error: null,
      } as never)

      const res = await getCirculars({ category: 'ALL' })
      const items = res.data?.items || []

      for (let i = 0; i < items.length - 1; i++) {
        const timeA = new Date(items[i].issue_date).getTime()
        const timeB = new Date(items[i + 1].issue_date).getTime()
        expect(timeA).toBeGreaterThanOrEqual(timeB)
      }
    })

    it('maintains strict descending chronological order when searching', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [],
        error: null,
      } as never)

      const res = await getCirculars({ search: '2026' })
      const items = res.data?.items || []

      expect(items.length).toBeGreaterThanOrEqual(2)
      for (let i = 0; i < items.length - 1; i++) {
        const timeA = new Date(items[i].issue_date).getTime()
        const timeB = new Date(items[i + 1].issue_date).getTime()
        expect(timeA).toBeGreaterThanOrEqual(timeB)
      }
    })

    it('safely handles missing or corrupt dates without crashing and places them last', async () => {
      const mockCorruptCircular = {
        id: 'corrupt-date-circ',
        circular_number: 'CIR-NO-DATE',
        title: 'Notice With Corrupt Date',
        description: '',
        content: '',
        category: 'GENERAL',
        status: 'PUBLISHED',
        issuing_authority: 'Central Panchayat Secretariat',
        signatory_name: 'Signatory',
        signatory_title: 'Title',
        pdf_url: null,
        original_pdf_url: null,
        creation_method: 'ONLINE_EDITOR',
        is_pinned: false,
        published_at: null,
        created_at: null,
      }

      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: [mockCorruptCircular],
        error: null,
      } as never)

      const res = await getCirculars()
      expect(res.error).toBeNull()
      const items = res.data?.items || []

      // The corrupt/missing date circular must be placed last
      expect(items[items.length - 1].id).toBe('corrupt-date-circ')
    })
  })
})
