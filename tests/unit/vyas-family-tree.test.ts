import { describe, it, expect } from 'vitest'
import { buildTreeGraph } from '@/features/tree/utils/graph-builder'
import { computeTreeLayout } from '@/features/tree/utils/generation-layout'
import { formatRelationshipDisplay } from '@/constants/familyRelationships'
import type { PersonSummary, RelationshipRow } from '@/features/relationships/types'

describe('Vyas Family Tree Generation and Relationship Labels', () => {
  const CHANDRAKANT_ID = 'ck-1'
  const DEVILA_ID = 'dv-1'
  const JAYESH_ID = 'jv-1'
  const JIGNASHA_ID = 'jy-1'
  const TUSHAR_ID = 'tv-1'
  const MAYA_ID = 'mv-1'
  const VRAJ_ID = 'vv-1'
  const DHRUV_ID = 'dh-1'
  const HARSH_ID = 'hv-1'
  const RAJVI_ID = 'rv-1'

  const persons: PersonSummary[] = [
    { id: CHANDRAKANT_ID, first_name: 'Chandrakant', middle_name: null, last_name: 'Vyas', gender: 'MALE', status: 'DECEASED', is_deceased: true },
    { id: DEVILA_ID, first_name: 'Devila', middle_name: null, last_name: 'Vyas', gender: 'FEMALE', status: 'ACTIVE' },
    { id: JAYESH_ID, first_name: 'Jayesh', middle_name: null, last_name: 'Vyas', gender: 'MALE', status: 'ACTIVE' },
    { id: JIGNASHA_ID, first_name: 'Jignasha', middle_name: null, last_name: 'Vyas', gender: 'FEMALE', status: 'ACTIVE' },
    { id: TUSHAR_ID, first_name: 'Tushar', middle_name: null, last_name: 'Vyas', gender: 'MALE', status: 'ACTIVE' },
    { id: MAYA_ID, first_name: 'Maya', middle_name: null, last_name: 'Vyas', gender: 'FEMALE', status: 'ACTIVE' },
    { id: VRAJ_ID, first_name: 'Vraj', middle_name: null, last_name: 'Vyas', gender: 'MALE', status: 'ACTIVE' },
    { id: DHRUV_ID, first_name: 'Dhruv', middle_name: null, last_name: 'Vyas', gender: 'MALE', status: 'ACTIVE' },
    { id: HARSH_ID, first_name: 'Harsh', middle_name: null, last_name: 'Vyas', gender: 'MALE', status: 'ACTIVE' },
    { id: RAJVI_ID, first_name: 'Rajvi', middle_name: null, last_name: 'Vyas', gender: 'FEMALE', status: 'ACTIVE' },
  ]

  const personsMap = new Map(persons.map((p) => [p.id, p]))

  const familyContext = {
    familyId: 'fam-vyas',
    familyName: 'Vyas Family',
    totalMemberCount: 10,
    members: [
      { person_id: JAYESH_ID, role: 'HEAD', is_head: true, relationship_to_head: 'Head of Family' },
      { person_id: CHANDRAKANT_ID, role: 'PARENT', is_head: false, relationship_to_head: 'Father (पिता)' },
      { person_id: DEVILA_ID, role: 'PARENT', is_head: false, relationship_to_head: 'Mother (माता)' },
      { person_id: JIGNASHA_ID, role: 'SPOUSE', is_head: false, relationship_to_head: 'Wife (पत्नी)' },
      { person_id: TUSHAR_ID, role: 'SIBLING', is_head: false, relationship_to_head: 'Brother (भाई)' },
      { person_id: MAYA_ID, role: 'EXTENDED', is_head: false, relationship_to_head: 'Sister-in-law (साली / ननद / भाभी / जेठानी / देवरानी)' },
      { person_id: VRAJ_ID, role: 'CHILD', is_head: false, relationship_to_head: 'Son (बेटा)' },
      { person_id: DHRUV_ID, role: 'CHILD', is_head: false, relationship_to_head: 'Son (बेटा)' },
      { person_id: HARSH_ID, role: 'EXTENDED', is_head: false, relationship_to_head: 'Nephew (भतीजा)' },
      { person_id: RAJVI_ID, role: 'EXTENDED', is_head: false, relationship_to_head: "Nephew's Wife (भतीजे की पत्नी)" },
    ],
  }

  const relationships: RelationshipRow[] = [
    {
      id: 'rel-ck-jv',
      person_a_id: CHANDRAKANT_ID,
      person_b_id: JAYESH_ID,
      relationship_type: 'PARENT',
      notes: null,
      verification_status: 'VERIFIED',
      created_by: 'u1',
      created_at: '',
      updated_at: '',
      deleted_at: null,
    },
    {
      id: 'rel-ck-dv',
      person_a_id: CHANDRAKANT_ID,
      person_b_id: DEVILA_ID,
      relationship_type: 'SPOUSE',
      notes: null,
      verification_status: 'VERIFIED',
      created_by: 'u1',
      created_at: '',
      updated_at: '',
      deleted_at: null,
    },
    {
      id: 'rel-jv-jy',
      person_a_id: JAYESH_ID,
      person_b_id: JIGNASHA_ID,
      relationship_type: 'SPOUSE',
      notes: null,
      verification_status: 'VERIFIED',
      created_by: 'u1',
      created_at: '',
      updated_at: '',
      deleted_at: null,
    },
    {
      id: 'rel-jv-vv',
      person_a_id: JAYESH_ID,
      person_b_id: VRAJ_ID,
      relationship_type: 'PARENT',
      notes: null,
      verification_status: 'VERIFIED',
      created_by: 'u1',
      created_at: '',
      updated_at: '',
      deleted_at: null,
    },
    {
      id: 'rel-jv-dh',
      person_a_id: JAYESH_ID,
      person_b_id: DHRUV_ID,
      relationship_type: 'PARENT',
      notes: null,
      verification_status: 'VERIFIED',
      created_by: 'u1',
      created_at: '',
      updated_at: '',
      deleted_at: null,
    },
    {
      id: 'rel-jv-tv',
      person_a_id: JAYESH_ID,
      person_b_id: TUSHAR_ID,
      relationship_type: 'SIBLING',
      notes: null,
      verification_status: 'VERIFIED',
      created_by: 'u1',
      created_at: '',
      updated_at: '',
      deleted_at: null,
    },
  ]

  it('builds tree graph matching exactly the 10-person Vyas family reference design', () => {
    const rootPerson = personsMap.get(JAYESH_ID)!
    const graph = buildTreeGraph(rootPerson, relationships, personsMap, familyContext)

    // Verify Generations
    expect(graph.nodes.get(CHANDRAKANT_ID)?.generation).toBe(0)
    expect(graph.nodes.get(DEVILA_ID)?.generation).toBe(0)

    expect(graph.nodes.get(JAYESH_ID)?.generation).toBe(1)
    expect(graph.nodes.get(JIGNASHA_ID)?.generation).toBe(1)
    expect(graph.nodes.get(TUSHAR_ID)?.generation).toBe(1)
    expect(graph.nodes.get(MAYA_ID)?.generation).toBe(1)

    expect(graph.nodes.get(VRAJ_ID)?.generation).toBe(2)
    expect(graph.nodes.get(DHRUV_ID)?.generation).toBe(2)
    expect(graph.nodes.get(HARSH_ID)?.generation).toBe(2)
    expect(graph.nodes.get(RAJVI_ID)?.generation).toBe(2)

    // Verify Formatted Display Labels (Screenshot 4)
    expect(formatRelationshipDisplay(graph.nodes.get(CHANDRAKANT_ID)?.relationshipLabel)).toBe('Father (पिता)')
    expect(formatRelationshipDisplay(graph.nodes.get(DEVILA_ID)?.relationshipLabel)).toBe('Mother (माता)')
    expect(graph.nodes.get(JAYESH_ID)?.relationshipLabel).toBe('Head of Family')
    expect(formatRelationshipDisplay(graph.nodes.get(JIGNASHA_ID)?.relationshipLabel)).toBe('Wife (पत्नी)')
    expect(formatRelationshipDisplay(graph.nodes.get(TUSHAR_ID)?.relationshipLabel)).toBe('Brother (भाई)')
    expect(formatRelationshipDisplay(graph.nodes.get(MAYA_ID)?.relationshipLabel)).toBe('Sister-in-law (भाभी)')
    expect(formatRelationshipDisplay(graph.nodes.get(VRAJ_ID)?.relationshipLabel)).toBe('Son (बेटा)')
    expect(formatRelationshipDisplay(graph.nodes.get(DHRUV_ID)?.relationshipLabel)).toBe('Son (बेटा)')
    expect(formatRelationshipDisplay(graph.nodes.get(HARSH_ID)?.relationshipLabel)).toBe('Nephew (भतीजा)')
    expect(formatRelationshipDisplay(graph.nodes.get(RAJVI_ID)?.relationshipLabel)).toBe("Nephew's Wife (भतीजे की पत्नी)")

    // Verify Layout Positioning (Branches)
    const layout = computeTreeLayout(graph)
    const jPos = layout.nodes.find((n) => n.id === JAYESH_ID)?.position
    const tPos = layout.nodes.find((n) => n.id === TUSHAR_ID)?.position
    const ckPos = layout.nodes.find((n) => n.id === CHANDRAKANT_ID)?.position
    const vPos = layout.nodes.find((n) => n.id === VRAJ_ID)?.position
    const hPos = layout.nodes.find((n) => n.id === HARSH_ID)?.position

    // Parents top tier
    expect(ckPos?.y).toBe(0)
    // Sibling branches middle tier
    expect(jPos?.y).toBe(240)
    expect(tPos?.y).toBe(240)
    // Children bottom tier
    expect(vPos?.y).toBe(480)
    expect(hPos?.y).toBe(480)
  })
})
