/**
 * Tests: Comprehensive Family Relationships & Complete Vyas Family Validation
 *
 * Verifies:
 * 1. 13 categories and definitions from KHATRI_SARVANIYAT_Comprehensive_Family_Relationship_Reference(1).pdf
 * 2. 10-member validation family:
 *    - Gen 0: Chandrakant (Father, Deceased) & Devila (Mother)
 *    - Gen 1: Jayesh (Head of Family) & Jignasha (Wife)
 *    - Gen 1 Branch: Tushar (Brother) & Maya (Sister-in-law)
 *    - Gen 2: Vraj (Son) & Dhruv (Son)
 *    - Gen 2 Branch: Harsh (Nephew) & Rajvi (Nephew's Wife)
 * 3. Kinship derivation engine:
 *    - Sibling's wife -> Sister-in-law (भाभी)
 *    - Brother's son -> Nephew (भतीजा)
 *    - Sister's son -> Nephew (भांजा)
 *    - Nephew's wife -> Nephew's Wife (भतीजे की पत्नी)
 *    - Child's spouse -> Daughter-in-law (बहू)
 *    - Spouse's parents -> Father-in-law (ससुर), Mother-in-law (सास)
 *    - Father's brother -> Paternal Uncle (चाचा / ताऊ)
 *    - Father's brother's wife -> Aunt by marriage (चाची / ताई)
 *    - Uncle's son -> First Cousin (चचेरा भाई)
 * 4. Tree Graph & Layout:
 *    - Accurate generation tier mapping (0: Parents of head, 1: Head & Sibling branches, 2: Children & Nephews)
 *    - Harsh and Rajvi placed side-by-side as couple unit in Gen 2
 *    - Couple edge between Harsh and Rajvi
 * 5. KeyRelationshipsPanel rendering:
 *    - Displays Key Relationships with respect to Head
 *    - Displays Legend with couple (∞), direct line, and deceased markers
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  FAMILY_RELATIONSHIP_CATEGORIES,
  getRelationshipByCode,
  formatRelationshipDisplay,
} from '@/constants/familyRelationships'
import {
  deriveRelationship,
  type GraphAdjacencyContext,
} from '@/features/relationships/services/relationshipDerivation.service'
import { buildTreeGraph } from '@/features/tree/utils/graph-builder'
import { computeTreeLayout } from '@/features/tree/utils/generation-layout'
import { KeyRelationshipsPanel } from '@/features/tree/components/KeyRelationshipsPanel'
import type { PersonSummary, RelationshipRow } from '@/features/relationships/types'
import type { FamilyMemberWithPerson } from '@/features/family-members/services/family-members.service'

// Mock 10-person Vyas family census data
const PERSON_CHANDRAKANT: PersonSummary = {
  id: 'person-chandrakant',
  first_name: 'Chandrakant',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'MALE',
  status: 'DECEASED',
  date_of_birth: '1945-01-01',
}

const PERSON_DEVILA: PersonSummary = {
  id: 'person-devila',
  first_name: 'Devila',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'FEMALE',
  status: 'ACTIVE',
  date_of_birth: '1954-05-10',
}

const PERSON_JAYESH: PersonSummary = {
  id: 'person-jayesh',
  first_name: 'Jayesh',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'MALE',
  status: 'ACTIVE',
  date_of_birth: '1973-03-15',
}

const PERSON_JIGNASHA: PersonSummary = {
  id: 'person-jignasha',
  first_name: 'Jignasha',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'FEMALE',
  status: 'ACTIVE',
  date_of_birth: '1973-07-20',
}

const PERSON_TUSHAR: PersonSummary = {
  id: 'person-tushar',
  first_name: 'Tushar',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'MALE',
  status: 'ACTIVE',
  date_of_birth: '1972-02-10',
}

const PERSON_MAYA: PersonSummary = {
  id: 'person-maya',
  first_name: 'Maya',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'FEMALE',
  status: 'ACTIVE',
  date_of_birth: '1979-11-05',
}

const PERSON_VRAJ: PersonSummary = {
  id: 'person-vraj',
  first_name: 'Vraj',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'MALE',
  status: 'ACTIVE',
  date_of_birth: '2004-09-15',
}

const PERSON_DHRUV: PersonSummary = {
  id: 'person-dhruv',
  first_name: 'Dhruv',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'MALE',
  status: 'ACTIVE',
  date_of_birth: '2008-06-25',
}

const PERSON_HARSH: PersonSummary = {
  id: 'person-harsh',
  first_name: 'Harsh',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'MALE',
  status: 'ACTIVE',
  date_of_birth: '1999-04-12',
}

const PERSON_RAJVI: PersonSummary = {
  id: 'person-rajvi',
  first_name: 'Rajvi',
  middle_name: null,
  last_name: 'Vyas',
  gender: 'FEMALE',
  status: 'ACTIVE',
  date_of_birth: '2000-08-18',
}

const ALL_PERSONS_MAP = new Map<string, PersonSummary>([
  [PERSON_CHANDRAKANT.id, PERSON_CHANDRAKANT],
  [PERSON_DEVILA.id, PERSON_DEVILA],
  [PERSON_JAYESH.id, PERSON_JAYESH],
  [PERSON_JIGNASHA.id, PERSON_JIGNASHA],
  [PERSON_TUSHAR.id, PERSON_TUSHAR],
  [PERSON_MAYA.id, PERSON_MAYA],
  [PERSON_VRAJ.id, PERSON_VRAJ],
  [PERSON_DHRUV.id, PERSON_DHRUV],
  [PERSON_HARSH.id, PERSON_HARSH],
  [PERSON_RAJVI.id, PERSON_RAJVI],
])

const MOCK_RELATIONSHIPS: RelationshipRow[] = [
  // Chandrakant & Devila (Spouses)
  {
    id: 'rel-c-d',
    person_a_id: PERSON_CHANDRAKANT.id,
    person_b_id: PERSON_DEVILA.id,
    relationship_type: 'SPOUSE',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Chandrakant & Devila -> Jayesh (Parents)
  {
    id: 'rel-c-j',
    person_a_id: PERSON_CHANDRAKANT.id,
    person_b_id: PERSON_JAYESH.id,
    relationship_type: 'PARENT',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  {
    id: 'rel-d-j',
    person_a_id: PERSON_DEVILA.id,
    person_b_id: PERSON_JAYESH.id,
    relationship_type: 'PARENT',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Chandrakant & Devila -> Tushar (Parents)
  {
    id: 'rel-c-t',
    person_a_id: PERSON_CHANDRAKANT.id,
    person_b_id: PERSON_TUSHAR.id,
    relationship_type: 'PARENT',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  {
    id: 'rel-d-t',
    person_a_id: PERSON_DEVILA.id,
    person_b_id: PERSON_TUSHAR.id,
    relationship_type: 'PARENT',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Jayesh & Tushar (Siblings)
  {
    id: 'rel-j-t',
    person_a_id: PERSON_JAYESH.id,
    person_b_id: PERSON_TUSHAR.id,
    relationship_type: 'SIBLING',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Jayesh & Jignasha (Spouse)
  {
    id: 'rel-j-jig',
    person_a_id: PERSON_JAYESH.id,
    person_b_id: PERSON_JIGNASHA.id,
    relationship_type: 'SPOUSE',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Tushar & Maya (Spouse)
  {
    id: 'rel-t-m',
    person_a_id: PERSON_TUSHAR.id,
    person_b_id: PERSON_MAYA.id,
    relationship_type: 'SPOUSE',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Jayesh & Jignasha -> Vraj (Parents)
  {
    id: 'rel-j-v',
    person_a_id: PERSON_JAYESH.id,
    person_b_id: PERSON_VRAJ.id,
    relationship_type: 'PARENT',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Jayesh & Jignasha -> Dhruv (Parents)
  {
    id: 'rel-j-dh',
    person_a_id: PERSON_JAYESH.id,
    person_b_id: PERSON_DHRUV.id,
    relationship_type: 'PARENT',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Tushar & Maya -> Harsh (Parents)
  {
    id: 'rel-t-h',
    person_a_id: PERSON_TUSHAR.id,
    person_b_id: PERSON_HARSH.id,
    relationship_type: 'PARENT',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  {
    id: 'rel-m-h',
    person_a_id: PERSON_MAYA.id,
    person_b_id: PERSON_HARSH.id,
    relationship_type: 'PARENT',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
  // Harsh & Rajvi (Spouse)
  {
    id: 'rel-h-r',
    person_a_id: PERSON_HARSH.id,
    person_b_id: PERSON_RAJVI.id,
    relationship_type: 'SPOUSE',
    notes: null,
    verification_status: 'VERIFIED',
    created_by: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    deleted_at: null,
  },
]

const MOCK_FAMILY_MEMBERS: FamilyMemberWithPerson[] = [
  {
    id: 'mem-1',
    family_id: 'fam-vyas',
    person_id: PERSON_CHANDRAKANT.id,
    role: 'PARENT',
    relationship_to_head: 'Father (पिता)',
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_CHANDRAKANT as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-2',
    family_id: 'fam-vyas',
    person_id: PERSON_DEVILA.id,
    role: 'PARENT',
    relationship_to_head: 'Mother (माता)',
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_DEVILA as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-3',
    family_id: 'fam-vyas',
    person_id: PERSON_JAYESH.id,
    role: 'HEAD',
    relationship_to_head: 'Head of Family',
    is_head: true,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_JAYESH as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-4',
    family_id: 'fam-vyas',
    person_id: PERSON_JIGNASHA.id,
    role: 'SPOUSE',
    relationship_to_head: 'Wife (पत्नी)',
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_JIGNASHA as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-5',
    family_id: 'fam-vyas',
    person_id: PERSON_TUSHAR.id,
    role: 'SIBLING',
    relationship_to_head: 'Brother (भाई)',
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_TUSHAR as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-6',
    family_id: 'fam-vyas',
    person_id: PERSON_MAYA.id,
    role: 'EXTENDED',
    relationship_to_head: 'Sister-in-law (भाभी)',
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_MAYA as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-7',
    family_id: 'fam-vyas',
    person_id: PERSON_VRAJ.id,
    role: 'CHILD',
    relationship_to_head: 'Son (बेटा)',
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_VRAJ as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-8',
    family_id: 'fam-vyas',
    person_id: PERSON_DHRUV.id,
    role: 'CHILD',
    relationship_to_head: 'Son (बेटा)',
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_DHRUV as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-9',
    family_id: 'fam-vyas',
    person_id: PERSON_HARSH.id,
    role: 'CHILD',
    relationship_to_head: 'Nephew (भतीजा)',
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_HARSH as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
  {
    id: 'mem-10',
    family_id: 'fam-vyas',
    person_id: PERSON_RAJVI.id,
    role: 'EXTENDED',
    relationship_to_head: "Nephew's Wife (भतीजे की पत्नी)",
    is_head: false,
    joined_at: '2026-01-01',
    left_at: null,
    added_by: 'system',
    created_at: '2026-01-01',
    person: PERSON_RAJVI as unknown as NonNullable<FamilyMemberWithPerson['person']>,
  },
]

describe('Comprehensive Family Relationship System', () => {
  describe('1. Centralized Master Registry (13 Categories & Standardized Codes)', () => {
    it('contains all 13 categories defined in the authoritative PDF', () => {
      expect(FAMILY_RELATIONSHIP_CATEGORIES.length).toBe(13)
      const categoryNames = FAMILY_RELATIONSHIP_CATEGORIES.map((c) => c.categoryName)
      expect(categoryNames).toContain('Immediate family and spouse')
      expect(categoryNames).toContain('Grandparents, grandchildren and ancestors')
      expect(categoryNames).toContain('Siblings and half/step siblings')
      expect(categoryNames).toContain('Aunts, uncles and their spouses')
      expect(categoryNames).toContain('Cousins and cousin-side relations')
      expect(categoryNames).toContain('Nephews, nieces and ALL their branches')
      expect(categoryNames).toContain("In-laws: spouse's family and child's spouse")
      expect(categoryNames).toContain('Step-family, adoptive and foster relationships')
      expect(categoryNames).toContain('Further generations and extended descendants')
      expect(categoryNames).toContain('Guardian, household and social/ceremonial ties')
      expect(categoryNames).toContain('Former, deceased and relationship status')
      expect(categoryNames).toContain('Reciprocal and derived relationships for family-tree software')
      expect(categoryNames).toContain('Other / Specify Community Relationship')
    })

    it('contains stable uppercase relationship codes', () => {
      expect(getRelationshipByCode('FATHER')?.englishLabel).toBe('Father')
      expect(getRelationshipByCode('MOTHER')?.englishLabel).toBe('Mother')
      expect(getRelationshipByCode('HUSBAND')?.englishLabel).toBe('Husband')
      expect(getRelationshipByCode('WIFE')?.englishLabel).toBe('Wife')
      expect(getRelationshipByCode('BROTHERS_SON')?.hindiLabel).toBe('भतीजा')
      expect(getRelationshipByCode('SISTERS_SON')?.hindiLabel).toBe('भांजा')
      expect(getRelationshipByCode('NEPHEWS_WIFE')?.displayLabel).toContain('भतीजे की पत्नी')
    })

    it('formats relationship display correctly for legacy and new keys', () => {
      expect(formatRelationshipDisplay('Brother (भाई)')).toBe('Brother (भाई)')
      expect(formatRelationshipDisplay('brother')).toBe('Brother (भाई)')
      expect(formatRelationshipDisplay('nephew')).toBe('Nephew (भतीजा / भांजा)')
    })
  })

  describe('2. Kinship Derivation Engine', () => {
    const context: GraphAdjacencyContext = {
      personsMap: ALL_PERSONS_MAP,
      relationships: MOCK_RELATIONSHIPS,
    }

    it("derives all 9 relatives accurately from Jayesh's perspective", () => {
      // Jayesh -> Chandrakant = Father
      const relC = deriveRelationship(PERSON_CHANDRAKANT.id, PERSON_JAYESH.id, context)
      expect(relC?.relationshipCode).toBe('FATHER')
      expect(relC?.displayLabel).toBe('Father (पिता)')

      // Jayesh -> Devila = Mother
      const relD = deriveRelationship(PERSON_DEVILA.id, PERSON_JAYESH.id, context)
      expect(relD?.relationshipCode).toBe('MOTHER')
      expect(relD?.displayLabel).toBe('Mother (माता)')

      // Jayesh -> Jignasha = Wife
      const relJig = deriveRelationship(PERSON_JIGNASHA.id, PERSON_JAYESH.id, context)
      expect(relJig?.relationshipCode).toBe('WIFE')
      expect(relJig?.displayLabel).toBe('Wife (पत्नी)')

      // Jayesh -> Tushar = Brother
      const relT = deriveRelationship(PERSON_TUSHAR.id, PERSON_JAYESH.id, context)
      expect(relT?.relationshipCode).toBe('BROTHER')
      expect(relT?.displayLabel).toBe('Brother (भाई)')

      // Jayesh -> Maya = Sister-in-law (भाभी)
      const relM = deriveRelationship(PERSON_MAYA.id, PERSON_JAYESH.id, context)
      expect(relM?.relationshipCode).toBe('SISTER_IN_LAW')
      expect(relM?.displayLabel).toBe('Sister-in-law (भाभी)')

      // Jayesh -> Vraj = Son
      const relV = deriveRelationship(PERSON_VRAJ.id, PERSON_JAYESH.id, context)
      expect(relV?.relationshipCode).toBe('SON')
      expect(relV?.displayLabel).toBe('Son (बेटा)')

      // Jayesh -> Dhruv = Son
      const relDh = deriveRelationship(PERSON_DHRUV.id, PERSON_JAYESH.id, context)
      expect(relDh?.relationshipCode).toBe('SON')
      expect(relDh?.displayLabel).toBe('Son (बेटा)')

      // Jayesh -> Harsh = Nephew (भतीजा)
      const relH = deriveRelationship(PERSON_HARSH.id, PERSON_JAYESH.id, context)
      expect(relH?.relationshipCode).toBe('BROTHERS_SON')
      expect(relH?.displayLabel).toBe('Nephew (भतीजा)')

      // Jayesh -> Rajvi = Nephew's Wife (भतीजे की पत्नी)
      const relR = deriveRelationship(PERSON_RAJVI.id, PERSON_JAYESH.id, context)
      expect(relR?.relationshipCode).toBe('NEPHEWS_WIFE')
      expect(relR?.displayLabel).toBe("Nephew's Wife (भतीजे की पत्नी)")
    })

    it('derives interpersonal relationships between other family members correctly', () => {
      // Harsh to Vraj = First Cousin (चचेरा भाई)
      const relHarshToVraj = deriveRelationship(PERSON_HARSH.id, PERSON_VRAJ.id, context)
      expect(relHarshToVraj?.displayLabel).toBe('Cousin (चचेरा भाई)')

      // Tushar to Vraj = Paternal Uncle (चाचा / ताऊ)
      const relTusharToVraj = deriveRelationship(PERSON_TUSHAR.id, PERSON_VRAJ.id, context)
      expect(relTusharToVraj?.relationshipCode).toBe('PATERNAL_UNCLE')
      expect(relTusharToVraj?.displayLabel).toBe('Paternal uncle (चाचा / ताऊ)')

      // Maya to Vraj = Aunt by marriage (चाची / ताई)
      const relMayaToVraj = deriveRelationship(PERSON_MAYA.id, PERSON_VRAJ.id, context)
      expect(relMayaToVraj?.relationshipCode).toBe('AUNT_BY_MARRIAGE')
      expect(relMayaToVraj?.displayLabel).toBe('Aunt by marriage (चाची / ताई)')

      // Rajvi to Tushar = Daughter-in-law (बहू)
      const relRajviToTushar = deriveRelationship(PERSON_RAJVI.id, PERSON_TUSHAR.id, context)
      expect(relRajviToTushar?.relationshipCode).toBe('DAUGHTER_IN_LAW')
      expect(relRajviToTushar?.displayLabel).toBe('Daughter-in-law (बहू)')

      // Tushar to Rajvi = Father-in-law (ससुर)
      const relTusharToRajvi = deriveRelationship(PERSON_TUSHAR.id, PERSON_RAJVI.id, context)
      expect(relTusharToRajvi?.relationshipCode).toBe('FATHER_IN_LAW')
      expect(relTusharToRajvi?.displayLabel).toBe('Father-in-law (ससुर)')

      // Maya to Rajvi = Mother-in-law (सास)
      const relMayaToRajvi = deriveRelationship(PERSON_MAYA.id, PERSON_RAJVI.id, context)
      expect(relMayaToRajvi?.relationshipCode).toBe('MOTHER_IN_LAW')
      expect(relMayaToRajvi?.displayLabel).toBe('Mother-in-law (सास)')
    })
  })

  describe('3. Tree Graph Generation & Generational Layout', () => {
    it('builds full 10-node tree with accurate generation tiers and couple edges', () => {
      const graph = buildTreeGraph(
        PERSON_JAYESH,
        MOCK_RELATIONSHIPS,
        ALL_PERSONS_MAP,
        {
          familyId: 'fam-vyas',
          familyName: 'Vyas Family',
          members: MOCK_FAMILY_MEMBERS,
        }
      )

      expect(graph.nodes.size).toBe(10)

      // Generation 0: Chandrakant & Devila
      const nodeC = graph.nodes.get(PERSON_CHANDRAKANT.id)
      const nodeD = graph.nodes.get(PERSON_DEVILA.id)
      expect(nodeC?.generation).toBe(0)
      expect(nodeD?.generation).toBe(0)
      expect(nodeC?.relationshipLabel).toBe('Father (पिता)')
      expect(nodeD?.relationshipLabel).toBe('Mother (माता)')

      // Generation 1: Jayesh, Jignasha, Tushar, Maya
      const nodeJ = graph.nodes.get(PERSON_JAYESH.id)
      const nodeJig = graph.nodes.get(PERSON_JIGNASHA.id)
      const nodeT = graph.nodes.get(PERSON_TUSHAR.id)
      const nodeM = graph.nodes.get(PERSON_MAYA.id)
      expect(nodeJ?.generation).toBe(1)
      expect(nodeJig?.generation).toBe(1)
      expect(nodeT?.generation).toBe(1)
      expect(nodeM?.generation).toBe(1)
      expect(nodeJ?.isHead).toBe(true)
      expect(nodeT?.relationshipLabel).toBe('Brother (भाई)')
      expect(nodeM?.relationshipLabel).toBe('Sister-in-law (भाभी)')

      // Generation 2: Vraj, Dhruv, Harsh, Rajvi
      const nodeV = graph.nodes.get(PERSON_VRAJ.id)
      const nodeDh = graph.nodes.get(PERSON_DHRUV.id)
      const nodeH = graph.nodes.get(PERSON_HARSH.id)
      const nodeR = graph.nodes.get(PERSON_RAJVI.id)
      expect(nodeV?.generation).toBe(2)
      expect(nodeDh?.generation).toBe(2)
      expect(nodeH?.generation).toBe(2)
      expect(nodeR?.generation).toBe(2)
      expect(nodeH?.relationshipLabel).toBe('Nephew (भतीजा)')
      expect(nodeR?.relationshipLabel).toBe("Nephew's Wife (भतीजे की पत्नी)")

      // Couple edge between Harsh and Rajvi
      const coupleEdges = Array.from(graph.edges.values()).filter((e) => e.isCouple)
      const harshRajviCouple = coupleEdges.find(
        (e) =>
          (e.sourceId === PERSON_HARSH.id && e.targetId === PERSON_RAJVI.id) ||
          (e.sourceId === PERSON_RAJVI.id && e.targetId === PERSON_HARSH.id)
      )
      expect(harshRajviCouple).toBeDefined()
    })

    it('positions Harsh and Rajvi side-by-side as a couple unit in generation layout', () => {
      const graph = buildTreeGraph(
        PERSON_JAYESH,
        MOCK_RELATIONSHIPS,
        ALL_PERSONS_MAP,
        {
          familyId: 'fam-vyas',
          familyName: 'Vyas Family',
          members: MOCK_FAMILY_MEMBERS,
        }
      )

      const layout = computeTreeLayout(graph)
      const flowHarsh = layout.nodes.find((n) => n.id === PERSON_HARSH.id)
      const flowRajvi = layout.nodes.find((n) => n.id === PERSON_RAJVI.id)

      expect(flowHarsh).toBeDefined()
      expect(flowRajvi).toBeDefined()

      // Same generation Y coordinate
      expect(flowHarsh?.position.y).toBe(flowRajvi?.position.y)

      // Adjacent X coordinate (Harsh on left, Rajvi on right with TREE_COUPLE_SPACING = 50)
      const xDiff = Math.abs((flowRajvi?.position.x ?? 0) - (flowHarsh?.position.x ?? 0))
      expect(xDiff).toBe(280) // 230 (width) + 50 (couple spacing)
    })
  })

  describe('4. KeyRelationshipsPanel Component', () => {
    it('renders all key relationships and legend accurately', () => {
      const graph = buildTreeGraph(
        PERSON_JAYESH,
        MOCK_RELATIONSHIPS,
        ALL_PERSONS_MAP,
        {
          familyId: 'fam-vyas',
          familyName: 'Vyas Family',
          members: MOCK_FAMILY_MEMBERS,
        }
      )
      const nodesList = Array.from(graph.nodes.values())

      render(
        <KeyRelationshipsPanel
          headPersonName="Jayesh Vyas"
          nodes={nodesList}
        />
      )

      // Header with respect to Jayesh Vyas
      expect(screen.getByText(/Key Relationships/i)).toBeInTheDocument()
      expect(screen.getByText(/Jayesh Vyas/i)).toBeInTheDocument()

      // Relatives listed
      expect(screen.getByText(/Chandrakant/i)).toBeInTheDocument()
      expect(screen.getByText(/Father \(पिता\)/i)).toBeInTheDocument()

      expect(screen.getByText(/Devila/i)).toBeInTheDocument()
      expect(screen.getByText(/Mother \(माता\)/i)).toBeInTheDocument()

      expect(screen.getByText(/Jignasha/i)).toBeInTheDocument()
      expect(screen.getByText(/Wife \(पत्नी\)/i)).toBeInTheDocument()

      expect(screen.getByText(/Tushar/i)).toBeInTheDocument()
      expect(screen.getByText(/Brother \(भाई\)/i)).toBeInTheDocument()

      expect(screen.getByText(/Maya/i)).toBeInTheDocument()
      expect(screen.getByText(/Sister-in-law \(भाभी\)/i)).toBeInTheDocument()

      expect(screen.getByText(/Vraj/i)).toBeInTheDocument()
      expect(screen.getByText(/Dhruv/i)).toBeInTheDocument()
      expect(screen.getAllByText(/Son \(बेटा\)/i).length).toBe(2)

      expect(screen.getByText(/Harsh/i)).toBeInTheDocument()
      expect(screen.getByText(/भतीजा/i)).toBeInTheDocument()

      expect(screen.getByText(/Rajvi/i)).toBeInTheDocument()
      expect(screen.getByText(/भतीजे की पत्नी/i)).toBeInTheDocument()

      // Legend elements
      expect(screen.getByText(/Legend/i)).toBeInTheDocument()
      expect(screen.getByText(/= Couple \/ Married/i)).toBeInTheDocument()
      expect(screen.getByText(/= Parent – Child \(Direct Line\)/i)).toBeInTheDocument()
      expect(screen.getByText(/= Extended \/ Other Connection/i)).toBeInTheDocument()
      expect(screen.getByText(/= Head of Family/i)).toBeInTheDocument()
      expect(screen.getByText(/= Deceased Member/i)).toBeInTheDocument()
    })
  })
})
