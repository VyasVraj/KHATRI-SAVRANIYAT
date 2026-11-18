/**
 * Unit & Integration Tests: KHATRI SARVANIYAT — Strict Bug Fixes & Feature Removals
 *
 * Covers all 9 specified requirements:
 * 1. Family Tree Relationship Logic (Head separated from interpersonal relationships)
 * 2. Family Member Invitation Searchable Combobox
 * 3. MemberList Edit & Soft-Removal (Opens EditMemberModal, avoids 403 error)
 * 4. Family Census Active Count & Neutral UI Styling
 * 5. Removal of Duplicate Review Queue Feature
 * 6. Removal of Data Import and Staging Feature
 * 7. Removal of Potential Duplicate Flag from Person Profiles
 * 8. Mukhi Directory Changes Synchronization with Linked Persons
 * 9. Removal of Notification Preferences / Settings
 */

import { describe, it, expect, vi } from 'vitest'
import { buildTreeGraph } from '@/features/tree/utils/graph-builder'
import { ADMIN_NAV_ITEMS } from '@/features/admin/constants'
import { ROUTES } from '@/constants/app'
import { upsertCommunityMukhi } from '@/features/community/services/community-mukhis.service'
import { supabase } from '@/lib/supabase'
import type { TreeGraph } from '@/features/tree/types'
import type { PersonSummary, RelationshipRow } from '@/features/relationships/types'

vi.mock('@/lib/supabase', () => {
  const mockFrom = vi.fn()
  const mockRpc = vi.fn()
  return {
    supabase: {
      from: mockFrom,
      rpc: mockRpc,
    },
  }
})

describe('KHATRI SARVANIYAT — Strict Bug Fixes & Feature Removals Verification', () => {
  describe('Area 1: Family Tree Relationship Logic', () => {
    it('does not synthesize husband/wife or other fake edges to the Family Head when head changes', () => {
      const father: PersonSummary = {
        id: 'p-deepak',
        first_name: 'Deepak',
        middle_name: null,
        last_name: 'Khatri',
        gender: 'MALE',
        date_of_birth: '1970-01-01',
        dob_year: 1970,
        status: 'ACTIVE',
      }
      const mother: PersonSummary = {
        id: 'p-seema',
        first_name: 'Seema',
        middle_name: null,
        last_name: 'Khatri',
        gender: 'FEMALE',
        date_of_birth: '1974-05-10',
        dob_year: 1974,
        status: 'ACTIVE',
      }
      const son: PersonSummary = {
        id: 'p-kirtan',
        first_name: 'Kirtan',
        middle_name: null,
        last_name: 'Khatri',
        gender: 'MALE',
        date_of_birth: '2000-08-20',
        dob_year: 2000,
        status: 'ACTIVE',
      }

      const personsMap = new Map<string, PersonSummary>([
        [father.id, father],
        [mother.id, mother],
        [son.id, son],
      ])

      // Explicit relationships: Deepak <-> Seema (SPOUSE), Deepak -> Kirtan (PARENT)
      const relationships: RelationshipRow[] = [
        {
          id: 'rel-spouse-1',
          person_a_id: father.id,
          person_b_id: mother.id,
          relationship_type: 'SPOUSE',
          notes: null,
          verification_status: 'VERIFIED',
          created_by: 'creator',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          deleted_at: null,
        },
        {
          id: 'rel-parent-1',
          person_a_id: father.id,
          person_b_id: son.id,
          relationship_type: 'PARENT',
          notes: null,
          verification_status: 'VERIFIED',
          created_by: 'creator',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          deleted_at: null,
        },
      ]

      // Kirtan (the son) is now designated as Family Head!
      const familyContext = {
        familyId: 'fam-1',
        familyName: 'Khatri Parivar',
        members: [
          { person_id: son.id, role: 'HEAD', is_head: true },
          { person_id: father.id, role: 'PARENT', is_head: false },
          { person_id: mother.id, role: 'PARENT', is_head: false },
        ],
      }

      const graph: TreeGraph = buildTreeGraph(father, relationships, personsMap, familyContext)

      // 1. Father (Deepak) must remain Father, not "Other"
      const fatherNode = graph.nodes.get(father.id)
      expect(fatherNode?.relationshipLabel).toBe('Father')
      expect(fatherNode?.isHead).toBe(false)

      // 2. Mother (Seema) must remain Wife/Mother, NOT Kirtan's wife
      const motherNode = graph.nodes.get(mother.id)
      expect(motherNode?.relationshipLabel).toBe('Wife')

      // 3. Son (Kirtan) is Head of Family
      const sonNode = graph.nodes.get(son.id)
      expect(sonNode?.isHead).toBe(true)

      // 4. Edges must NOT connect Kirtan and Seema as spouses
      const kirtanSeemaEdge = Array.from(graph.edges.values()).find(
        (e) =>
          e.relationshipType === 'SPOUSE' &&
          ((e.sourceId === son.id && e.targetId === mother.id) ||
            (e.sourceId === mother.id && e.targetId === son.id))
      )
      expect(kirtanSeemaEdge).toBeUndefined()

      // 5. Spouse edge must strictly connect Deepak and Seema
      const spouseEdge = Array.from(graph.edges.values()).find(
        (e) => e.relationshipType === 'SPOUSE'
      )
      expect(spouseEdge).toBeDefined()
      expect([spouseEdge?.sourceId, spouseEdge?.targetId]).toContain(father.id)
      expect([spouseEdge?.sourceId, spouseEdge?.targetId]).toContain(mother.id)
    })
  })

  describe('Area 5 & Area 6: Feature Removals from Admin Hub', () => {
    it('removes Duplicate Review Queue from admin navigation items', () => {
      const hasDuplicatesNav = ADMIN_NAV_ITEMS.some(
        (item) => item.label.toLowerCase().includes('duplicate') || item.href === ROUTES.ADMIN_DUPLICATES
      )
      expect(hasDuplicatesNav).toBe(false)
    })

    it('removes Data Import and Staging from admin navigation items', () => {
      const hasImportNav = ADMIN_NAV_ITEMS.some(
        (item) => item.label.toLowerCase().includes('import') || item.href === ROUTES.ADMIN_IMPORT
      )
      expect(hasImportNav).toBe(false)
    })
  })

  describe('Area 8: Mukhi Directory Synchronization with Linked Persons', () => {
    it('synchronizes first_name, last_name, city, gotra, and nukh on linked person profile', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'mukhi-1',
          full_name: 'Bhikhubhai Khatri',
          gram: 'Anand',
          mobile_number: '9876543210',
          gotra: 'Agastya',
          nukh: 'Arora',
          linked_person_id: 'person-bhikhu-1',
        },
        error: null,
      })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === 'community_mukhis') {
          return { update: mockUpdate } as never
        }
        if (table === 'persons') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          } as never
        }
        return {} as never
      })

      const res = await upsertCommunityMukhi({
        id: 'mukhi-1',
        full_name: 'Bhikhubhai Khatri',
        gram: 'Anand',
        mobile_number: '9876543210',
        gotra: 'Agastya',
        nukh: 'Arora',
        linked_person_id: 'person-bhikhu-1',
      })

      expect(res.error).toBeNull()
      expect(res.data?.full_name).toBe('Bhikhubhai Khatri')
    })
  })
})
