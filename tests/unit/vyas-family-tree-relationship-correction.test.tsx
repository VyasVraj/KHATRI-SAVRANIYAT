/**
 * Unit Test: Vyas Family Tree Relationship Correction & In-Law Generational Leveling
 * (tests/unit/vyas-family-tree-relationship-correction.test.tsx)
 *
 * Specifically verifies the resolution of the bug reported in the prompt and screenshots:
 * - Tushar Vyas selected as "Brother (भाई)"
 * - Maya Vyas selected as "Sister-in-law (साली / ननद / भाभी / जेठानी / देवरानी)"
 * - MUST NOT display Tushar as Grandfather or Maya as Grandmother in Gen 0.
 * - MUST place Tushar and Maya in Generation 1 as a married couple branch.
 * - MUST place Chandrakant and Devila in Generation 0 (Grandparents).
 * - MUST place Jayesh and Jignasha in Generation 1 (Head & Wife).
 * - MUST place Harsh in Generation 2 (Son of Tushar & Maya).
 * - MUST place Vraj and Dhruv in Generation 2 (Sons of Jayesh & Jignasha).
 */

import { describe, it, expect } from 'vitest'
import { buildTreeGraph, type FamilyTreeContext } from '@/features/tree/utils/graph-builder'
import { computeTreeLayout } from '@/features/tree/utils/generation-layout'
import type { PersonSummary, RelationshipRow } from '@/features/relationships/types'

const CHANDRAKANT_ID = '00000000-0000-0000-0000-000000000001'
const DEVILA_ID      = '00000000-0000-0000-0000-000000000002'
const TUSHAR_ID      = '00000000-0000-0000-0000-000000000003'
const MAYA_ID        = '00000000-0000-0000-0000-000000000004'
const HARSH_ID       = '00000000-0000-0000-0000-000000000005'
const JAYESH_ID      = '00000000-0000-0000-0000-000000000006'
const JIGNASHA_ID    = '00000000-0000-0000-0000-000000000007'
const VRAJ_ID        = '00000000-0000-0000-0000-000000000008'
const DHRUV_ID       = '00000000-0000-0000-0000-000000000009'

function createVyasPersonsMap(): Map<string, PersonSummary> {
  const map = new Map<string, PersonSummary>()
  map.set(CHANDRAKANT_ID, {
    id: CHANDRAKANT_ID,
    first_name: 'Chandrakant',
    middle_name: 'V',
    last_name: 'Vyas',
    gender: 'MALE',
    date_of_birth: '1935-04-12',
    status: 'DECEASED',
    profile_privacy: 'COMMUNITY',
  })
  map.set(DEVILA_ID, {
    id: DEVILA_ID,
    first_name: 'Devila',
    middle_name: 'C',
    last_name: 'Vyas',
    gender: 'FEMALE',
    date_of_birth: '1938-08-15',
    status: 'DECEASED',
    profile_privacy: 'COMMUNITY',
  })
  map.set(TUSHAR_ID, {
    id: TUSHAR_ID,
    first_name: 'Tushar',
    middle_name: 'C',
    last_name: 'Vyas',
    gender: 'MALE',
    date_of_birth: '1965-06-10',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })
  map.set(MAYA_ID, {
    id: MAYA_ID,
    first_name: 'Maya',
    middle_name: 'T',
    last_name: 'Vyas',
    gender: 'FEMALE',
    date_of_birth: '1977-03-22',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })
  map.set(HARSH_ID, {
    id: HARSH_ID,
    first_name: 'Harsh',
    middle_name: 'T',
    last_name: 'Vyas',
    gender: 'MALE',
    date_of_birth: '2000-01-15',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })
  map.set(JAYESH_ID, {
    id: JAYESH_ID,
    first_name: 'Jayesh',
    middle_name: 'C',
    last_name: 'Vyas',
    gender: 'MALE',
    date_of_birth: '1973-10-18',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })
  map.set(JIGNASHA_ID, {
    id: JIGNASHA_ID,
    first_name: 'Jignasha',
    middle_name: 'J',
    last_name: 'Vyas',
    gender: 'FEMALE',
    date_of_birth: '1973-12-05',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })
  map.set(VRAJ_ID, {
    id: VRAJ_ID,
    first_name: 'Vraj',
    middle_name: 'J',
    last_name: 'Vyas',
    gender: 'MALE',
    date_of_birth: '2004-05-14',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })
  map.set(DHRUV_ID, {
    id: DHRUV_ID,
    first_name: 'Dhruv',
    middle_name: 'J',
    last_name: 'Vyas',
    gender: 'MALE',
    date_of_birth: '2008-09-20',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })
  return map
}

describe('Vyas Family Tree Relationship Correction', () => {
  it('correctly levels Tushar (Brother) and Maya (Sister-in-law) in Gen 1, never Gen 0 Grandparents', () => {
    const personsMap = createVyasPersonsMap()
    const rootPerson = personsMap.get(JAYESH_ID)!

    // Simulate scenario from screenshot where Tushar was saved as Brother and Maya as Sister-in-law
    const familyContext: FamilyTreeContext = {
      familyId: '00000000-0000-0000-0000-000000000000',
      familyName: 'Vyas Family',
      totalMemberCount: 9,
      members: [
        { person_id: JAYESH_ID, role: 'HEAD', is_head: true, relationship_to_head: 'Head of Family' },
        { person_id: JIGNASHA_ID, role: 'SPOUSE', is_head: false, relationship_to_head: 'Wife (पत्नी)' },
        { person_id: CHANDRAKANT_ID, role: 'PARENT', is_head: false, relationship_to_head: 'Father (पिता)' },
        { person_id: DEVILA_ID, role: 'PARENT', is_head: false, relationship_to_head: 'Mother (माता)' },
        { person_id: TUSHAR_ID, role: 'SIBLING', is_head: false, relationship_to_head: 'Brother (भाई)' },
        { person_id: MAYA_ID, role: 'EXTENDED', is_head: false, relationship_to_head: 'Sister-in-law (साली / ननद / भाभी / जेठानी / देवरानी)' },
        { person_id: HARSH_ID, role: 'CHILD', is_head: false, relationship_to_head: 'Nephew (भतीजा / भांजा)' },
        { person_id: VRAJ_ID, role: 'CHILD', is_head: false, relationship_to_head: 'Son (बेटा)' },
        { person_id: DHRUV_ID, role: 'CHILD', is_head: false, relationship_to_head: 'Son (बेटा)' },
      ],
    }

    // Relationships in DB connecting Grandparents -> Jayesh and Jayesh -> Sons, with Tushar as Sibling
    const relationships: RelationshipRow[] = [
      {
        id: 'rel-ck-dv',
        person_a_id: CHANDRAKANT_ID,
        person_b_id: DEVILA_ID,
        relationship_type: 'SPOUSE',
        notes: null,
        verification_status: 'VERIFIED',
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      {
        id: 'rel-ck-jayesh',
        person_a_id: CHANDRAKANT_ID,
        person_b_id: JAYESH_ID,
        relationship_type: 'PARENT',
        notes: null,
        verification_status: 'VERIFIED',
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      {
        id: 'rel-dv-jayesh',
        person_a_id: DEVILA_ID,
        person_b_id: JAYESH_ID,
        relationship_type: 'PARENT',
        notes: null,
        verification_status: 'VERIFIED',
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      {
        id: 'rel-tushar-jayesh',
        person_a_id: TUSHAR_ID,
        person_b_id: JAYESH_ID,
        relationship_type: 'SIBLING',
        notes: null,
        verification_status: 'VERIFIED',
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      {
        id: 'rel-jayesh-jignasha',
        person_a_id: JAYESH_ID,
        person_b_id: JIGNASHA_ID,
        relationship_type: 'SPOUSE',
        notes: null,
        verification_status: 'VERIFIED',
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      {
        id: 'rel-jayesh-vraj',
        person_a_id: JAYESH_ID,
        person_b_id: VRAJ_ID,
        relationship_type: 'PARENT',
        notes: null,
        verification_status: 'VERIFIED',
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      {
        id: 'rel-jayesh-dhruv',
        person_a_id: JAYESH_ID,
        person_b_id: DHRUV_ID,
        relationship_type: 'PARENT',
        notes: null,
        verification_status: 'VERIFIED',
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
    ]

    const graph = buildTreeGraph(rootPerson, relationships, personsMap, familyContext)

    // 1. Generations check
    const ckNode = graph.nodes.get(CHANDRAKANT_ID)!
    const dvNode = graph.nodes.get(DEVILA_ID)!
    const tusharNode = graph.nodes.get(TUSHAR_ID)!
    const mayaNode = graph.nodes.get(MAYA_ID)!
    const jayeshNode = graph.nodes.get(JAYESH_ID)!
    const jignashaNode = graph.nodes.get(JIGNASHA_ID)!
    const harshNode = graph.nodes.get(HARSH_ID)!
    const vrajNode = graph.nodes.get(VRAJ_ID)!
    const dhruvNode = graph.nodes.get(DHRUV_ID)!

    // Gen 0: Parents of Head
    expect(ckNode.generation).toBe(0)
    expect(dvNode.generation).toBe(0)
    expect(ckNode.relationshipLabel).toBe('Father (पिता)')
    expect(dvNode.relationshipLabel).toBe('Mother (माता)')

    // Gen 1: Siblings & Spouses (NEVER Gen 0)
    expect(tusharNode.generation).toBe(1)
    expect(mayaNode.generation).toBe(1)
    expect(jayeshNode.generation).toBe(1)
    expect(jignashaNode.generation).toBe(1)

    // Verify Tushar is Brother and Maya is Sister-in-law
    expect(tusharNode.relationshipLabel).toBe('Brother (भाई)')
    expect(mayaNode.relationshipLabel).toContain('Sister-in-law')

    // Gen 2: Children
    expect(vrajNode.generation).toBe(2)
    expect(dhruvNode.generation).toBe(2)
    expect(harshNode.generation).toBe(2)

    // 2. Layout check
    const layout = computeTreeLayout(graph)
    const tusharPos = layout.nodes.find((n) => n.id === TUSHAR_ID)!.position
    const mayaPos = layout.nodes.find((n) => n.id === MAYA_ID)!.position
    const jayeshPos = layout.nodes.find((n) => n.id === JAYESH_ID)!.position
    const ckPos = layout.nodes.find((n) => n.id === CHANDRAKANT_ID)!.position

    // Parents and siblings in Gen 1 are on identical Y line below Grandparents
    expect(tusharPos.y).toBe(jayeshPos.y)
    expect(mayaPos.y).toBe(tusharPos.y)
    expect(tusharPos.y).toBeGreaterThan(ckPos.y)
  })
})
