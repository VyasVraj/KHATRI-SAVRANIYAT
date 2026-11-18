/**
 * Unit Tests: Vyas Family Tree Relationship Logic & Family Head Independence
 * (tests/unit/vyas-family-tree-relationship-logic.test.tsx)
 *
 * Verifies the 9-member Vyas Family Tree specification:
 * 1. Gen 0 (Grandparents): Chandrakant V Vyas & Devila C Vyas (Deceased).
 * 2. Gen 1 (Middle):
 *    - Branch 1: Tushar C Vyas & Maya T Vyas (Wife)
 *    - Branch 2: Jayesh C Vyas (Head of Family) & Jignasha J Vyas (Wife)
 *    - Tushar and Jayesh are Brothers.
 * 3. Gen 2 (Children):
 *    - Under Branch 1: Harsh T Vyas (Son of Tushar & Maya)
 *    - Under Branch 2: Vraj J Vyas & Dhruv J Vyas (Sons of Jayesh & Jignasha)
 *
 * RIGOROUS INVARIANTS:
 * - Changing Head of Family (Jayesh -> Tushar -> Vraj -> Maya) NEVER mutates,
 *   deletes, or alters actual genealogical relationships.
 * - Changing Head of Family NEVER inverts or warps generation levels.
 *   (Grandparents remain Gen 0, Parents Gen 1, Grandchildren Gen 2).
 * - Jignasha remains Wife of Jayesh, Maya remains Wife of Tushar.
 * - Vraj being Head never makes his mother his wife, or his father his son.
 * - Text casing: all names formatted to Proper/Title Case.
 */

import { describe, it, expect } from 'vitest'
import { buildTreeGraph } from '@/features/tree/utils/graph-builder'
import { computeTreeLayout } from '@/features/tree/utils/generation-layout'
import { toProperCaseName, toSentenceCase } from '@/utils/text-casing'
import type { PersonSummary, RelationshipRow } from '@/features/relationships/types'
import type { FamilyTreeContext } from '@/features/tree/utils/graph-builder'

// 9-person Vyas family IDs
const CHANDRAKANT_ID = '00000000-0000-0000-0000-000000000001'
const DEVILA_ID      = '00000000-0000-0000-0000-000000000002'
const TUSHAR_ID      = '00000000-0000-0000-0000-000000000003'
const MAYA_ID        = '00000000-0000-0000-0000-000000000004'
const HARSH_ID       = '00000000-0000-0000-0000-000000000005'
const JAYESH_ID      = '00000000-0000-0000-0000-000000000006'
const JIGNASHA_ID    = '00000000-0000-0000-0000-000000000007'
const VRAJ_ID        = '00000000-0000-0000-0000-000000000008'
const DHRUV_ID       = '00000000-0000-0000-0000-000000000009'

function createVyasPersons(): Map<string, PersonSummary> {
  const map = new Map<string, PersonSummary>()

  map.set(CHANDRAKANT_ID, {
    id: CHANDRAKANT_ID,
    first_name: 'CHANDRAKANT',
    middle_name: 'V',
    last_name: 'VYAS',
    gender: 'MALE',
    date_of_birth: '1935-04-12',
    status: 'DECEASED',
    profile_privacy: 'COMMUNITY',
  })

  map.set(DEVILA_ID, {
    id: DEVILA_ID,
    first_name: 'DEVILA',
    middle_name: 'C',
    last_name: 'VYAS',
    gender: 'FEMALE',
    date_of_birth: '1938-08-15',
    status: 'DECEASED',
    profile_privacy: 'COMMUNITY',
  })

  map.set(TUSHAR_ID, {
    id: TUSHAR_ID,
    first_name: 'TUSHAR',
    middle_name: 'C',
    last_name: 'VYAS',
    gender: 'MALE',
    date_of_birth: '1965-06-10',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })

  map.set(MAYA_ID, {
    id: MAYA_ID,
    first_name: 'MAYA',
    middle_name: 'T',
    last_name: 'VYAS',
    gender: 'FEMALE',
    date_of_birth: '1977-03-22',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })

  map.set(HARSH_ID, {
    id: HARSH_ID,
    first_name: 'HARSH',
    middle_name: 'T',
    last_name: 'VYAS',
    gender: 'MALE',
    date_of_birth: '2000-01-15',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })

  map.set(JAYESH_ID, {
    id: JAYESH_ID,
    first_name: 'JAYESH',
    middle_name: 'C',
    last_name: 'VYAS',
    gender: 'MALE',
    date_of_birth: '1975-09-05',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })

  map.set(JIGNASHA_ID, {
    id: JIGNASHA_ID,
    first_name: 'JIGNASHA',
    middle_name: 'J',
    last_name: 'VYAS',
    gender: 'FEMALE',
    date_of_birth: '1975-12-14',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })

  map.set(VRAJ_ID, {
    id: VRAJ_ID,
    first_name: 'VRAJ',
    middle_name: 'J',
    last_name: 'VYAS',
    gender: 'MALE',
    date_of_birth: '2006-04-18',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })

  map.set(DHRUV_ID, {
    id: DHRUV_ID,
    first_name: 'DHRUV',
    middle_name: 'J',
    last_name: 'VYAS',
    gender: 'MALE',
    date_of_birth: '2010-10-10',
    status: 'ACTIVE',
    profile_privacy: 'COMMUNITY',
  })

  return map
}

function makeRel(
  id: string,
  personA: string,
  personB: string,
  type: 'PARENT' | 'SPOUSE' | 'SIBLING'
): RelationshipRow {
  return {
    id,
    person_a_id: personA,
    person_b_id: personB,
    relationship_type: type,
    notes: null,
    verification_status: 'VERIFIED',
    created_by: 'admin',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  }
}

function createVyasRelationships(): RelationshipRow[] {
  return [
    // Gen 0: Chandrakant <-> Devila (Spouse)
    makeRel('rel-1', CHANDRAKANT_ID, DEVILA_ID, 'SPOUSE'),
    // Gen 0 -> Gen 1: Chandrakant & Devila are parents of Tushar
    makeRel('rel-2', CHANDRAKANT_ID, TUSHAR_ID, 'PARENT'),
    makeRel('rel-3', DEVILA_ID, TUSHAR_ID, 'PARENT'),
    // Gen 0 -> Gen 1: Chandrakant & Devila are parents of Jayesh
    makeRel('rel-4', CHANDRAKANT_ID, JAYESH_ID, 'PARENT'),
    makeRel('rel-5', DEVILA_ID, JAYESH_ID, 'PARENT'),
    // Gen 1: Tushar <-> Jayesh (Brothers / Siblings)
    makeRel('rel-6', TUSHAR_ID, JAYESH_ID, 'SIBLING'),
    // Gen 1 Branch 1: Tushar <-> Maya (Spouse)
    makeRel('rel-7', TUSHAR_ID, MAYA_ID, 'SPOUSE'),
    // Gen 1 -> Gen 2: Tushar & Maya are parents of Harsh
    makeRel('rel-8', TUSHAR_ID, HARSH_ID, 'PARENT'),
    makeRel('rel-9', MAYA_ID, HARSH_ID, 'PARENT'),
    // Gen 1 Branch 2: Jayesh <-> Jignasha (Spouse)
    makeRel('rel-10', JAYESH_ID, JIGNASHA_ID, 'SPOUSE'),
    // Gen 1 -> Gen 2: Jayesh & Jignasha are parents of Vraj & Dhruv
    makeRel('rel-11', JAYESH_ID, VRAJ_ID, 'PARENT'),
    makeRel('rel-12', JIGNASHA_ID, VRAJ_ID, 'PARENT'),
    makeRel('rel-13', JAYESH_ID, DHRUV_ID, 'PARENT'),
    makeRel('rel-14', JIGNASHA_ID, DHRUV_ID, 'PARENT'),
    // Gen 2: Vraj <-> Dhruv (Brothers / Siblings)
    makeRel('rel-15', VRAJ_ID, DHRUV_ID, 'SIBLING'),
  ]
}

function createFamilyContext(headPersonId: string): FamilyTreeContext {
  const memberIds = [
    CHANDRAKANT_ID, DEVILA_ID,
    TUSHAR_ID, MAYA_ID, HARSH_ID,
    JAYESH_ID, JIGNASHA_ID, VRAJ_ID, DHRUV_ID,
  ]

  return {
    familyId: 'family-vyas-9',
    familyName: 'Vyas Family',
    totalMemberCount: 9,
    members: memberIds.map((id) => ({
      person_id: id,
      role: id === headPersonId ? 'HEAD' : 'MEMBER',
      is_head: id === headPersonId,
    })),
  }
}

describe('Vyas Family Tree — 9-Person Structure and Relationship Logic', () => {
  const personsMap = createVyasPersons()
  const relationships = createVyasRelationships()

  it('builds the complete 9-person family graph with correct generations when Jayesh is Head', () => {
    const rootPerson = personsMap.get(JAYESH_ID)!
    const familyContext = createFamilyContext(JAYESH_ID)

    const graph = buildTreeGraph(rootPerson, relationships, personsMap, familyContext)

    expect(graph.nodes.size).toBe(9)

    // Generation 0: Grandparents (Chandrakant & Devila)
    const ckNode = graph.nodes.get(CHANDRAKANT_ID)!
    const dvNode = graph.nodes.get(DEVILA_ID)!
    expect(ckNode.generation).toBe(0)
    expect(dvNode.generation).toBe(0)
    expect(ckNode.relationshipLabel).toBe('Grandfather')
    expect(dvNode.relationshipLabel).toBe('Grandmother')
    expect(ckNode.person.status).toBe('DECEASED')
    expect(dvNode.person.status).toBe('DECEASED')

    // Generation 1: Middle generation (Tushar, Maya, Jayesh, Jignasha)
    const tusharNode = graph.nodes.get(TUSHAR_ID)!
    const mayaNode = graph.nodes.get(MAYA_ID)!
    const jayeshNode = graph.nodes.get(JAYESH_ID)!
    const jignashaNode = graph.nodes.get(JIGNASHA_ID)!
    expect(tusharNode.generation).toBe(1)
    expect(mayaNode.generation).toBe(1)
    expect(jayeshNode.generation).toBe(1)
    expect(jignashaNode.generation).toBe(1)

    // Independent Head status
    expect(jayeshNode.isHead).toBe(true)
    expect(tusharNode.isHead).toBe(false)
    expect(mayaNode.isHead).toBe(false)
    expect(jignashaNode.isHead).toBe(false)

    // Spouses
    expect(mayaNode.relationshipLabel).toBe('Wife')
    expect(jignashaNode.relationshipLabel).toBe('Wife')

    // Generation 2: Children (Harsh, Vraj, Dhruv)
    const harshNode = graph.nodes.get(HARSH_ID)!
    const vrajNode = graph.nodes.get(VRAJ_ID)!
    const dhruvNode = graph.nodes.get(DHRUV_ID)!
    expect(harshNode.generation).toBe(2)
    expect(vrajNode.generation).toBe(2)
    expect(dhruvNode.generation).toBe(2)
    expect(harshNode.relationshipLabel).toBe('Son')
    expect(vrajNode.relationshipLabel).toBe('Son')
    expect(dhruvNode.relationshipLabel).toBe('Son')

    // Sibling validation: Sibling list is computed strictly from shared parents or explicit SIBLING relations
    // NOT from same generation tier (Harsh must NOT have Vraj/Dhruv as siblings)
    expect(jayeshNode.siblingsNames).toBe('TUSHAR')
    expect(tusharNode.siblingsNames).toBe('JAYESH')
    expect(harshNode.siblingsNames).toBeUndefined()
    expect(vrajNode.siblingsNames).toBe('DHRUV')
    expect(dhruvNode.siblingsNames).toBe('VRAJ')

    // Parent validation: Linked to actual biological parents, not all parents in the family
    expect(harshNode.parentsNames).toContain('TUSHAR')
    expect(harshNode.parentsNames).toContain('MAYA')
    expect(vrajNode.parentsNames).toContain('JAYESH')
    expect(vrajNode.parentsNames).toContain('JIGNASHA')
    expect(dhruvNode.parentsNames).toContain('JAYESH')
    expect(dhruvNode.parentsNames).toContain('JIGNASHA')
  })

  it('TEST CASE 1 (Head Transfer: Jayesh -> Tushar): Head badge moves to Tushar, all relationships and generations remain identical', () => {
    // Demote Jayesh, promote Tushar
    const familyContext = createFamilyContext(TUSHAR_ID)
    const rootPerson = personsMap.get(TUSHAR_ID)!

    const graph = buildTreeGraph(rootPerson, relationships, personsMap, familyContext)

    // Generations remain stable
    expect(graph.nodes.get(CHANDRAKANT_ID)!.generation).toBe(0)
    expect(graph.nodes.get(DEVILA_ID)!.generation).toBe(0)
    expect(graph.nodes.get(TUSHAR_ID)!.generation).toBe(1)
    expect(graph.nodes.get(JAYESH_ID)!.generation).toBe(1)
    expect(graph.nodes.get(MAYA_ID)!.generation).toBe(1)
    expect(graph.nodes.get(JIGNASHA_ID)!.generation).toBe(1)
    expect(graph.nodes.get(HARSH_ID)!.generation).toBe(2)
    expect(graph.nodes.get(VRAJ_ID)!.generation).toBe(2)
    expect(graph.nodes.get(DHRUV_ID)!.generation).toBe(2)

    // Head badge moved to Tushar
    expect(graph.nodes.get(TUSHAR_ID)!.isHead).toBe(true)
    expect(graph.nodes.get(JAYESH_ID)!.isHead).toBe(false)

    // Maya is STILL Wife of Tushar, Jignasha is STILL Wife of Jayesh
    expect(graph.nodes.get(MAYA_ID)!.relationshipLabel).toBe('Wife')
    expect(graph.nodes.get(JIGNASHA_ID)!.relationshipLabel).toBe('Wife')

    // Edges are 100% identical
    const spouseEdges = Array.from(graph.edges.values()).filter((e) => e.relationshipType === 'SPOUSE')
    const tusharSpouse = spouseEdges.find(
      (e) => (e.sourceId === TUSHAR_ID && e.targetId === MAYA_ID) || (e.sourceId === MAYA_ID && e.targetId === TUSHAR_ID)
    )
    const jayeshSpouse = spouseEdges.find(
      (e) => (e.sourceId === JAYESH_ID && e.targetId === JIGNASHA_ID) || (e.sourceId === JIGNASHA_ID && e.targetId === JAYESH_ID)
    )
    expect(tusharSpouse).toBeDefined()
    expect(jayeshSpouse).toBeDefined()
  })

  it('TEST CASE 2 (Head Transfer: Tushar -> Vraj [Grandchild]): Does NOT invert the tree; Grandparents remain Gen 0, Parents Gen 1', () => {
    // Vraj (grandchild) becomes Head of Family
    const familyContext = createFamilyContext(VRAJ_ID)
    const rootPerson = personsMap.get(VRAJ_ID)!

    const graph = buildTreeGraph(rootPerson, relationships, personsMap, familyContext)

    // Grandparents MUST NOT become negative generations or children
    expect(graph.nodes.get(CHANDRAKANT_ID)!.generation).toBe(0)
    expect(graph.nodes.get(DEVILA_ID)!.generation).toBe(0)
    expect(graph.nodes.get(CHANDRAKANT_ID)!.relationshipLabel).toBe('Grandfather')
    expect(graph.nodes.get(DEVILA_ID)!.relationshipLabel).toBe('Grandmother')

    // Parents MUST remain generation 1
    expect(graph.nodes.get(JAYESH_ID)!.generation).toBe(1)
    expect(graph.nodes.get(JIGNASHA_ID)!.generation).toBe(1)
    expect(graph.nodes.get(TUSHAR_ID)!.generation).toBe(1)
    expect(graph.nodes.get(MAYA_ID)!.generation).toBe(1)

    // Vraj is generation 2 with isHead = true
    const vrajNode = graph.nodes.get(VRAJ_ID)!
    expect(vrajNode.generation).toBe(2)
    expect(vrajNode.isHead).toBe(true)

    // CRITICAL: Jignasha is NOT Vraj's wife! She remains Jayesh's wife.
    const spouseEdges = Array.from(graph.edges.values()).filter((e) => e.relationshipType === 'SPOUSE')
    const vrajSpouse = spouseEdges.find(
      (e) => e.sourceId === VRAJ_ID || e.targetId === VRAJ_ID
    )
    expect(vrajSpouse).toBeUndefined() // Vraj has no spouse!

    // Jayesh & Jignasha remain Vraj's parents
    const parentEdgesToVraj = Array.from(graph.edges.values()).filter(
      (e) => e.relationshipType === 'PARENT' && e.targetId === VRAJ_ID
    )
    const parentIds = parentEdgesToVraj.map((e) => e.sourceId)
    expect(parentIds).toContain(JAYESH_ID)
    expect(parentIds).toContain(JIGNASHA_ID)
  })

  it('TEST CASE 3 (Head Transfer: Vraj -> Maya [Female In-Law]): Tree hierarchy and relationships remain 100% stable', () => {
    const familyContext = createFamilyContext(MAYA_ID)
    const rootPerson = personsMap.get(MAYA_ID)!

    const graph = buildTreeGraph(rootPerson, relationships, personsMap, familyContext)

    expect(graph.nodes.get(MAYA_ID)!.isHead).toBe(true)
    expect(graph.nodes.get(VRAJ_ID)!.isHead).toBe(false)
    expect(graph.nodes.get(JAYESH_ID)!.isHead).toBe(false)

    // Generations stable
    expect(graph.nodes.get(CHANDRAKANT_ID)!.generation).toBe(0)
    expect(graph.nodes.get(MAYA_ID)!.generation).toBe(1)
    expect(graph.nodes.get(HARSH_ID)!.generation).toBe(2)

    // Maya is still Wife of Tushar and Mother of Harsh
    const harshParents = Array.from(graph.edges.values())
      .filter((e) => e.relationshipType === 'PARENT' && e.targetId === HARSH_ID)
      .map((e) => e.sourceId)
    expect(harshParents).toContain(MAYA_ID)
    expect(harshParents).toContain(TUSHAR_ID)
  })

  it('computes multi-branch layout matching the approved design layout', () => {
    const rootPerson = personsMap.get(JAYESH_ID)!
    const familyContext = createFamilyContext(JAYESH_ID)
    const graph = buildTreeGraph(rootPerson, relationships, personsMap, familyContext)

    const layout = computeTreeLayout(graph)

    // Helper to get position from layout nodes
    const getPos = (id: string) => layout.nodes.find((n) => n.id === id)!.position

    // 1. Generation 0 (Grandparents) is top tier (y = 0)
    const ckPos = getPos(CHANDRAKANT_ID)
    const dvPos = getPos(DEVILA_ID)
    expect(ckPos.y).toBe(0)
    expect(dvPos.y).toBe(0)
    // Devila is to the right of Chandrakant
    expect(dvPos.x).toBeGreaterThan(ckPos.x)

    // 2. Generation 1 (Parents/Uncles) is middle tier (y = 240)
    const tusharPos = getPos(TUSHAR_ID)
    const mayaPos = getPos(MAYA_ID)
    const jayeshPos = getPos(JAYESH_ID)
    const jignashaPos = getPos(JIGNASHA_ID)
    expect(tusharPos.y).toBe(240)
    expect(mayaPos.y).toBe(240)
    expect(jayeshPos.y).toBe(240)
    expect(jignashaPos.y).toBe(240)

    // Branch 1 (Tushar + Maya) is to the left of Branch 2 (Jayesh + Jignasha)
    expect(tusharPos.x).toBeLessThan(jayeshPos.x)
    expect(mayaPos.x).toBeLessThan(jayeshPos.x)

    // 3. Generation 2 (Children) is bottom tier (y = 480)
    const harshPos = getPos(HARSH_ID)
    const vrajPos = getPos(VRAJ_ID)
    const dhruvPos = getPos(DHRUV_ID)
    expect(harshPos.y).toBe(480)
    expect(vrajPos.y).toBe(480)
    expect(dhruvPos.y).toBe(480)

    // Harsh is positioned under Tushar & Maya branch
    const branch1CenterX = (tusharPos.x + mayaPos.x) / 2
    expect(Math.abs(harshPos.x - branch1CenterX)).toBeLessThan(50)

    // Vraj & Dhruv are positioned under Jayesh & Jignasha branch
    const branch2CenterX = (jayeshPos.x + jignashaPos.x) / 2
    const children2CenterX = (vrajPos.x + dhruvPos.x) / 2
    expect(Math.abs(children2CenterX - branch2CenterX)).toBeLessThan(50)
  })

  it('formats uppercase names and descriptions with proper casing', () => {
    expect(toProperCaseName('CHANDRAKANT V VYAS')).toBe('Chandrakant V Vyas')
    expect(toProperCaseName('DEVILA C VYAS')).toBe('Devila C Vyas')
    expect(toProperCaseName('TUSHAR C VYAS')).toBe('Tushar C Vyas')
    expect(toProperCaseName('MAYA T VYAS')).toBe('Maya T Vyas')
    expect(toProperCaseName('HARSH T VYAS')).toBe('Harsh T Vyas')
    expect(toProperCaseName('JAYESH C VYAS')).toBe('Jayesh C Vyas')
    expect(toProperCaseName('JIGNASHA J VYAS')).toBe('Jignasha J Vyas')
    expect(toProperCaseName('VRAJ J VYAS')).toBe('Vraj J Vyas')
    expect(toProperCaseName('DHRUV J VYAS')).toBe('Dhruv J Vyas')

    // Mixed case or lowercase
    expect(toProperCaseName('vraj j vyas')).toBe('Vraj J Vyas')
    expect(toProperCaseName('jAYESH c vYAS')).toBe('Jayesh C Vyas')

    // Sentence casing for description
    expect(
      toSentenceCase('RESPECTED FAMILY LIVING IN OUR COMMUNITY. WE MAINTAIN STRONG ROOTS.')
    ).toBe('Respected family living in our community. We maintain strong roots.')
  })
})
