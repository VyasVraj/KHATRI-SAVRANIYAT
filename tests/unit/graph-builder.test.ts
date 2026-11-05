/**
 * Unit tests: Graph Builder Algorithm
 * (src/features/tree/utils/graph-builder.ts)
 *
 * Verifies bounded genealogical BFS, generation tiering (-2 to +2),
 * 1-hop lateral constraint, cycle defense, hard node/edge bounds,
 * and zero synthetic placeholder guarantee.
 */

import { describe, it, expect } from 'vitest'
import { buildTreeGraph } from '@/features/tree/utils/graph-builder'
import type { PersonSummary, RelationshipRow } from '@/features/relationships/types'
import { MAX_TREE_NODES, MAX_TREE_EDGES } from '@/features/tree/types'

function makePerson(id: string, firstName: string, lastName = 'Test'): PersonSummary {
  return {
    id,
    first_name: firstName,
    middle_name: null,
    last_name: lastName,
    gender: 'MALE',
    date_of_birth: '1980-01-01',
    profile_privacy: 'COMMUNITY',
    status: 'ACTIVE',
  }
}

function makeRel(
  id: string,
  personA: string,
  personB: string,
  type: 'PARENT' | 'SPOUSE' | 'SIBLING',
  deletedAt: string | null = null
): RelationshipRow {
  return {
    id,
    person_a_id: personA,
    person_b_id: personB,
    relationship_type: type,
    notes: null,
    verification_status: 'UNVERIFIED',
    created_by: 'mock-user',
    created_at: '2026-10-04T00:00:00Z',
    updated_at: '2026-10-04T00:00:00Z',
    deleted_at: deletedAt,
  }
}

describe('Graph Builder — Genealogical Traversal', () => {
  const rootPerson = makePerson('root-1', 'RootPerson')

  it('initializes root person at generation 0 with ROOT role', () => {
    const graph = buildTreeGraph(rootPerson, [], new Map())

    expect(graph.rootPersonId).toBe('root-1')
    expect(graph.nodes.size).toBe(1)
    expect(graph.edges.size).toBe(0)

    const rootNode = graph.nodes.get('root-1')
    expect(rootNode).toBeDefined()
    expect(rootNode?.generation).toBe(0)
    expect(rootNode?.isRoot).toBe(true)
    expect(rootNode?.rolesInTree.has('ROOT')).toBe(true)
    expect(graph.generations.get(0)).toEqual(['root-1'])
  })

  it('assigns parents to generation -1 and children to generation +1', () => {
    const parent = makePerson('parent-1', 'Father')
    const child = makePerson('child-1', 'Son')

    const relationships: RelationshipRow[] = [
      makeRel('rel-parent', 'parent-1', 'root-1', 'PARENT'),
      makeRel('rel-child', 'root-1', 'child-1', 'PARENT'),
    ]

    const personMap = new Map([
      ['parent-1', parent],
      ['child-1', child],
    ])

    const graph = buildTreeGraph(rootPerson, relationships, personMap)

    expect(graph.nodes.size).toBe(3)
    expect(graph.edges.size).toBe(2)

    const parentNode = graph.nodes.get('parent-1')
    expect(parentNode?.generation).toBe(-1)
    expect(parentNode?.rolesInTree.has('PARENT')).toBe(true)

    const childNode = graph.nodes.get('child-1')
    expect(childNode?.generation).toBe(1)
    expect(childNode?.rolesInTree.has('CHILD')).toBe(true)

    expect(graph.generations.get(-1)).toContain('parent-1')
    expect(graph.generations.get(1)).toContain('child-1')
  })

  it('assigns spouses and siblings to generation 0', () => {
    const spouse = makePerson('spouse-1', 'Wife')
    const sibling = makePerson('sibling-1', 'Brother')

    const relationships: RelationshipRow[] = [
      makeRel('rel-spouse', 'root-1', 'spouse-1', 'SPOUSE'),
      makeRel('rel-sibling', 'root-1', 'sibling-1', 'SIBLING'),
    ]

    const personMap = new Map([
      ['spouse-1', spouse],
      ['sibling-1', sibling],
    ])

    const graph = buildTreeGraph(rootPerson, relationships, personMap)

    expect(graph.nodes.size).toBe(3)

    const spouseNode = graph.nodes.get('spouse-1')
    expect(spouseNode?.generation).toBe(0)
    expect(spouseNode?.rolesInTree.has('SPOUSE')).toBe(true)

    const siblingNode = graph.nodes.get('sibling-1')
    expect(siblingNode?.generation).toBe(0)
    expect(siblingNode?.rolesInTree.has('SIBLING')).toBe(true)

    expect(graph.generations.get(0)).toContain('root-1')
    expect(graph.generations.get(0)).toContain('spouse-1')
    expect(graph.generations.get(0)).toContain('sibling-1')
  })

  it('traverses 2 generations up (grandparents: -2) and down (grandchildren: +2)', () => {
    const parent = makePerson('parent-1', 'Father')
    const grandparent = makePerson('gparent-1', 'Grandfather')
    const child = makePerson('child-1', 'Son')
    const grandchild = makePerson('gchild-1', 'Grandson')
    const greatGrandparent = makePerson('great-gp-1', 'GreatGrandpa')

    const relationships: RelationshipRow[] = [
      makeRel('rel-1', 'parent-1', 'root-1', 'PARENT'),
      makeRel('rel-2', 'gparent-1', 'parent-1', 'PARENT'),
      // Great-grandparent is at generation -3, which exceeds MAX_GENERATION_DISTANCE (2)
      makeRel('rel-3', 'great-gp-1', 'gparent-1', 'PARENT'),
      makeRel('rel-4', 'root-1', 'child-1', 'PARENT'),
      makeRel('rel-5', 'child-1', 'gchild-1', 'PARENT'),
    ]

    const personMap = new Map([
      ['parent-1', parent],
      ['gparent-1', grandparent],
      ['great-gp-1', greatGrandparent],
      ['child-1', child],
      ['gchild-1', grandchild],
    ])

    const graph = buildTreeGraph(rootPerson, relationships, personMap)

    expect(graph.nodes.get('gparent-1')?.generation).toBe(-2)
    expect(graph.nodes.get('gchild-1')?.generation).toBe(2)

    // Generation -3 (great-grandparent) MUST be pruned by generation clamp
    expect(graph.nodes.has('great-gp-1')).toBe(false)
    expect(graph.edges.has('rel-3')).toBe(false)
  })

  it('enforces 1-hop lateral constraint (does not traverse in-laws or sibling spouses)', () => {
    const sibling = makePerson('sibling-1', 'Brother')
    const siblingSpouse = makePerson('sibling-spouse-1', 'SisterInLaw')

    const relationships: RelationshipRow[] = [
      makeRel('rel-sib', 'root-1', 'sibling-1', 'SIBLING'),
      // Sibling's spouse is a lateral hop from a lateral node (hop = 2)
      makeRel('rel-inlaw', 'sibling-1', 'sibling-spouse-1', 'SPOUSE'),
    ]

    const personMap = new Map([
      ['sibling-1', sibling],
      ['sibling-spouse-1', siblingSpouse],
    ])

    const graph = buildTreeGraph(rootPerson, relationships, personMap)

    expect(graph.nodes.has('sibling-1')).toBe(true)
    // Sibling's spouse must NOT be included in direct tree visualization
    expect(graph.nodes.has('sibling-spouse-1')).toBe(false)
    expect(graph.edges.has('rel-inlaw')).toBe(false)
  })

  it('guarantees zero synthetic private placeholders when person is missing from personMap', () => {
    const visibleParent = makePerson('parent-1', 'VisibleParent')
    // person-hidden-private is in relationships table but RLS prevented fetching person details
    const relationships: RelationshipRow[] = [
      makeRel('rel-1', 'parent-1', 'root-1', 'PARENT'),
      makeRel('rel-2', 'person-hidden-private', 'root-1', 'PARENT'),
    ]

    const personMap = new Map([
      ['parent-1', visibleParent],
      // 'person-hidden-private' is deliberately omitted from personMap (RLS restricted)
    ])

    const graph = buildTreeGraph(rootPerson, relationships, personMap)

    expect(graph.nodes.size).toBe(2) // root + visibleParent only
    expect(graph.nodes.has('person-hidden-private')).toBe(false)
    expect(graph.edges.has('rel-2')).toBe(false)

    // Verify no synthetic placeholder exists anywhere in node names
    for (const node of graph.nodes.values()) {
      expect(node.person.first_name).not.toMatch(/private/i)
      expect(node.person.first_name).not.toBe('[Private Person]')
    }
  })

  it('defends against cyclic relationships without infinite looping', () => {
    // Cyclic parent edge A -> B -> A
    const personB = makePerson('person-b', 'PersonB')

    const relationships: RelationshipRow[] = [
      makeRel('rel-ab', 'root-1', 'person-b', 'PARENT'),
      makeRel('rel-ba', 'person-b', 'root-1', 'PARENT'),
    ]

    const personMap = new Map([['person-b', personB]])

    const graph = buildTreeGraph(rootPerson, relationships, personMap)

    expect(graph.nodes.size).toBe(2)
    // Both edges captured but traversal stopped cleanly
    expect(graph.nodes.has('person-b')).toBe(true)
  })

  it('enforces safety bounds when node limit (100) or edge limit (150) is reached', () => {
    // Generate 120 children
    const manyRelationships: RelationshipRow[] = []
    const manyPersons = new Map<string, PersonSummary>()

    for (let i = 1; i <= 120; i++) {
      const childId = `child-${i}`
      manyPersons.set(childId, makePerson(childId, `Child${i}`))
      manyRelationships.push(makeRel(`rel-${i}`, 'root-1', childId, 'PARENT'))
    }

    const graph = buildTreeGraph(rootPerson, manyRelationships, manyPersons)

    expect(graph.nodes.size).toBeLessThanOrEqual(MAX_TREE_NODES)
    expect(graph.edges.size).toBeLessThanOrEqual(MAX_TREE_EDGES)
    expect(graph.isBounded).toBe(true)
  })

  it('excludes soft-deleted relationships from graph', () => {
    const parent = makePerson('parent-1', 'Father')
    const exSpouse = makePerson('ex-spouse-1', 'ExSpouse')

    const relationships: RelationshipRow[] = [
      makeRel('rel-active', 'parent-1', 'root-1', 'PARENT', null),
      makeRel('rel-deleted', 'root-1', 'ex-spouse-1', 'SPOUSE', '2026-10-04T12:00:00Z'),
    ]

    const personMap = new Map([
      ['parent-1', parent],
      ['ex-spouse-1', exSpouse],
    ])

    const graph = buildTreeGraph(rootPerson, relationships, personMap)

    expect(graph.nodes.has('parent-1')).toBe(true)
    expect(graph.edges.has('rel-active')).toBe(true)
    expect(graph.nodes.has('ex-spouse-1')).toBe(false)
    expect(graph.edges.has('rel-deleted')).toBe(false)
  })
})
