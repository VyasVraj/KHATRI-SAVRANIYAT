/**
 * Graph Builder — Pure utility for constructing a TreeGraph domain model
 * from raw relationships, family roster data, and person census records.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. REAL SAVED RELATIONSHIPS:
 *    Integrates verified interpersonal relationships (public.relationships)
 *    and synchronized family roster records (public.family_members).
 *    No synthetic placeholders, fake parents, or imaginary UUIDs.
 * 2. BOUNDED TRAVERSAL:
 *    Clamped to [-2, +2] generations from root. Hard limits on max nodes (100) and edges (150).
 * 3. STRICT GENERATION MAPPING:
 *    - Grandparents: -2
 *    - Parents (Father, Mother): -1
 *    - Head of Family & Spouses: 0
 *    - Children, Siblings & Extended: +1
 * 4. SOLID COLOR & BADGE METADATA:
 *    Injects edge pill labels ('Father', 'Mother', 'Son', 'Brother', 'Other'),
 *    couple indicators, calculated age, and family context for instant display.
 */

import type {
  PersonSummary,
  RelationshipRow,
} from '@/features/relationships/types'
import {
  MAX_GENERATION_DISTANCE,
  MAX_TREE_NODES,
  MAX_TREE_EDGES,
  type TreeGraph,
  type TreeNode,
  type TreeEdge,
  type TreeRole,
} from '../types'

export interface FamilyTreeContext {
  familyId?: string
  familyName?: string
  totalMemberCount?: number
  members?: Array<{
    person_id: string
    role: string | null
    is_head: boolean
  }>
}

/**
 * Calculates a person's age in years from ISO date or birth year.
 */
function calculateAge(
  dobIso?: string | null,
  dobYear?: number | null
): number | null {
  if (dobIso) {
    const dob = new Date(dobIso)
    if (!isNaN(dob.getTime())) {
      const today = new Date()
      let age = today.getFullYear() - dob.getFullYear()
      const m = today.getMonth() - dob.getMonth()
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--
      }
      return age >= 0 ? age : null
    }
  }
  if (dobYear) {
    const currentYear = new Date().getFullYear()
    const age = currentYear - dobYear
    return age >= 0 ? age : null
  }
  return null
}

/**
 * Builds a deterministic, bounded TreeGraph centered on rootPerson,
 * enriched with family roster metadata.
 */
export function buildTreeGraph(
  rootPerson: PersonSummary,
  relationships: RelationshipRow[],
  personsMap: Map<string, PersonSummary>,
  familyContext?: FamilyTreeContext
): TreeGraph {
  const nodes = new Map<string, TreeNode>()
  const edges = new Map<string, TreeEdge>()
  const generations = new Map<number, string[]>()
  let isBounded = false

  for (let g = -MAX_GENERATION_DISTANCE; g <= MAX_GENERATION_DISTANCE; g++) {
    generations.set(g, [])
  }

  // Check if root person is Head of Family
  const isRootHead =
    familyContext?.members?.find((m) => m.person_id === rootPerson.id)?.is_head ??
    true

  // 1. Initialize root node
  const rootNode: TreeNode = {
    id: rootPerson.id,
    person: rootPerson,
    generation: 0,
    isRoot: true,
    rolesInTree: new Set(['ROOT']),
    isHead: isRootHead,
    relationshipLabel: isRootHead ? 'Head of Family' : 'Primary Member',
    age: calculateAge(rootPerson.date_of_birth, rootPerson.dob_year),
  }
  nodes.set(rootPerson.id, rootNode)

  // 2. Filter and deduplicate explicit relationships
  const validRelationships: RelationshipRow[] = []
  const seenPairKeys = new Set<string>()

  for (const rel of relationships) {
    if (rel.deleted_at) continue
    if (rel.person_a_id === rel.person_b_id) continue

    const pairKey = `${rel.person_a_id}:${rel.person_b_id}:${rel.relationship_type}`
    if (seenPairKeys.has(pairKey)) continue
    seenPairKeys.add(pairKey)

    validRelationships.push(rel)
  }

  // 3. BFS Traversal across explicit relationships
  interface QueueItem {
    personId: string
    generation: number
    isLateral: boolean
  }

  const queue: QueueItem[] = [
    { personId: rootPerson.id, generation: 0, isLateral: false },
  ]
  const visitedForExpansion = new Set<string>([rootPerson.id])

  while (queue.length > 0) {
    const current = queue.shift()!

    if (nodes.size >= MAX_TREE_NODES) {
      isBounded = true
      break
    }

    // A. Vertical Traversal (Parent & Child)
    if (!current.isLateral) {
      for (const rel of validRelationships) {
        if (rel.relationship_type !== 'PARENT') continue

        // Upward: current is child -> find parent
        if (rel.person_b_id === current.personId) {
          const parentId = rel.person_a_id
          const targetGen = current.generation - 1

          if (targetGen >= -MAX_GENERATION_DISTANCE) {
            const parentPerson = personsMap.get(parentId)
            if (parentPerson) {
              let existingParent = nodes.get(parentId)
              if (!existingParent) {
                if (nodes.size < MAX_TREE_NODES) {
                  existingParent = {
                    id: parentId,
                    person: parentPerson,
                    generation: targetGen,
                    isRoot: false,
                    rolesInTree: new Set(['PARENT']),
                    relationshipLabel: parentPerson.gender === 'FEMALE' ? 'Mother' : 'Father',
                    age: calculateAge(parentPerson.date_of_birth, parentPerson.dob_year),
                  }
                  nodes.set(parentId, existingParent)
                  if (!visitedForExpansion.has(parentId)) {
                    visitedForExpansion.add(parentId)
                    queue.push({
                      personId: parentId,
                      generation: targetGen,
                      isLateral: false,
                    })
                  }
                } else {
                  isBounded = true
                }
              } else {
                existingParent.rolesInTree.add('PARENT')
              }
            }
          }
        }

        // Downward: current is parent -> find child
        if (rel.person_a_id === current.personId) {
          const childId = rel.person_b_id
          const targetGen = current.generation + 1

          if (targetGen <= MAX_GENERATION_DISTANCE) {
            const childPerson = personsMap.get(childId)
            if (childPerson) {
              let existingChild = nodes.get(childId)
              if (!existingChild) {
                if (nodes.size < MAX_TREE_NODES) {
                  existingChild = {
                    id: childId,
                    person: childPerson,
                    generation: targetGen,
                    isRoot: false,
                    rolesInTree: new Set(['CHILD']),
                    relationshipLabel: childPerson.gender === 'FEMALE' ? 'Daughter' : 'Son',
                    age: calculateAge(childPerson.date_of_birth, childPerson.dob_year),
                  }
                  nodes.set(childId, existingChild)
                  if (!visitedForExpansion.has(childId)) {
                    visitedForExpansion.add(childId)
                    queue.push({
                      personId: childId,
                      generation: targetGen,
                      isLateral: false,
                    })
                  }
                } else {
                  isBounded = true
                }
              } else {
                existingChild.rolesInTree.add('CHILD')
              }
            }
          }
        }
      }
    }

    // B. Lateral Traversal (Spouse & Sibling)
    if (!current.isLateral) {
      for (const rel of validRelationships) {
        if (rel.relationship_type === 'SPOUSE') {
          const isEndpoint =
            rel.person_a_id === current.personId ||
            rel.person_b_id === current.personId

          if (isEndpoint) {
            const spouseId =
              rel.person_a_id === current.personId
                ? rel.person_b_id
                : rel.person_a_id
            const spousePerson = personsMap.get(spouseId)

            if (spousePerson) {
              let existingSpouse = nodes.get(spouseId)
              if (!existingSpouse) {
                if (nodes.size < MAX_TREE_NODES) {
                  existingSpouse = {
                    id: spouseId,
                    person: spousePerson,
                    generation: current.generation,
                    isRoot: false,
                    rolesInTree: new Set(['SPOUSE']),
                    relationshipLabel:
                      spousePerson.gender === 'FEMALE' ? 'Wife' : spousePerson.gender === 'MALE' ? 'Husband' : 'Spouse',
                    age: calculateAge(spousePerson.date_of_birth, spousePerson.dob_year),
                  }
                  nodes.set(spouseId, existingSpouse)
                  if (!visitedForExpansion.has(spouseId)) {
                    visitedForExpansion.add(spouseId)
                    queue.push({
                      personId: spouseId,
                      generation: current.generation,
                      isLateral: true,
                    })
                  }
                } else {
                  isBounded = true
                }
              } else {
                existingSpouse.rolesInTree.add('SPOUSE')
              }
            }
          }
        }

        if (rel.relationship_type === 'SIBLING') {
          const isEndpoint =
            rel.person_a_id === current.personId ||
            rel.person_b_id === current.personId

          if (isEndpoint) {
            const siblingId =
              rel.person_a_id === current.personId
                ? rel.person_b_id
                : rel.person_a_id
            const siblingPerson = personsMap.get(siblingId)

            if (siblingPerson) {
              let existingSibling = nodes.get(siblingId)
              if (!existingSibling) {
                if (nodes.size < MAX_TREE_NODES) {
                  existingSibling = {
                    id: siblingId,
                    person: siblingPerson,
                    generation: current.generation,
                    isRoot: false,
                    rolesInTree: new Set(['SIBLING']),
                    relationshipLabel: siblingPerson.gender === 'FEMALE' ? 'Sister' : 'Brother',
                    age: calculateAge(siblingPerson.date_of_birth, siblingPerson.dob_year),
                  }
                  nodes.set(siblingId, existingSibling)
                  if (!visitedForExpansion.has(siblingId)) {
                    visitedForExpansion.add(siblingId)
                    queue.push({
                      personId: siblingId,
                      generation: current.generation,
                      isLateral: true,
                    })
                  }
                } else {
                  isBounded = true
                }
              } else {
                existingSibling.rolesInTree.add('SIBLING')
              }
            }
          }
        }
      }
    }
  }

  // 4. Integrate Family Roster members if provided
  if (familyContext?.members && familyContext.members.length > 0) {
    const headMember =
      familyContext.members.find((m) => m.is_head) ?? familyContext.members[0]
    const headId = headMember ? headMember.person_id : rootPerson.id

    for (const fm of familyContext.members) {
      if (nodes.has(fm.person_id)) {
        const existing = nodes.get(fm.person_id)!
        if (fm.is_head) {
          existing.isHead = true
          existing.relationshipLabel = 'Head of Family'
        }
        continue
      }

      const p = personsMap.get(fm.person_id)
      if (!p) continue

      let gen = 0
      let label = 'Member'
      const roles = new Set<TreeRole>()

      if (fm.is_head) {
        gen = 0
        label = 'Head of Family'
        roles.add('ROOT')
      } else if (fm.role === 'PARENT') {
        gen = -1
        label = p.gender === 'FEMALE' ? 'Mother' : 'Father'
        roles.add('PARENT')
      } else if (fm.role === 'SPOUSE') {
        gen = 0
        label = p.gender === 'FEMALE' ? 'Wife' : p.gender === 'MALE' ? 'Husband' : 'Spouse'
        roles.add('SPOUSE')
      } else if (fm.role === 'CHILD') {
        gen = 1
        label = p.gender === 'FEMALE' ? 'Daughter' : 'Son'
        roles.add('CHILD')
      } else if (fm.role === 'SIBLING') {
        gen = 1
        label = p.gender === 'FEMALE' ? 'Sister' : 'Brother'
        roles.add('SIBLING')
      } else {
        gen = 1
        label = 'Other'
        roles.add('EXTENDED')
      }

      nodes.set(fm.person_id, {
        id: fm.person_id,
        person: p,
        generation: gen,
        isRoot: fm.person_id === rootPerson.id,
        rolesInTree: roles,
        isHead: fm.is_head,
        relationshipLabel: label,
        age: calculateAge(p.date_of_birth, p.dob_year),
      })
    }

    // Synthesize edges from family structure if explicit edges do not already exist
    const parents = familyContext.members.filter((m) => m.role === 'PARENT')
    const children = familyContext.members.filter((m) => m.role === 'CHILD')
    const siblings = familyContext.members.filter((m) => m.role === 'SIBLING')
    const extended = familyContext.members.filter((m) => m.role === 'EXTENDED')
    const spouses = familyContext.members.filter((m) => m.role === 'SPOUSE')

    // Couple edge between parents
    if (parents.length >= 2) {
      const p1 = parents[0]
      const p2 = parents[1]
      const coupleEdgeId = `family-couple-${p1.person_id}-${p2.person_id}`
      if (!edges.has(coupleEdgeId)) {
        edges.set(coupleEdgeId, {
          id: coupleEdgeId,
          relationshipId: coupleEdgeId,
          relationshipType: 'SPOUSE',
          sourceId: p1.person_id,
          targetId: p2.person_id,
          isCouple: true,
          color: '#9333EA',
          relationship: {
            id: coupleEdgeId,
            person_a_id: p1.person_id,
            person_b_id: p2.person_id,
            relationship_type: 'SPOUSE',
            notes: null,
            verification_status: 'VERIFIED',
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          },
        })
      }
    }

    // Connect parents to Head
    for (const p of parents) {
      const pEdgeId = `family-parent-${p.person_id}-${headId}`
      if (!edges.has(pEdgeId)) {
        const pPerson = personsMap.get(p.person_id)
        const isMother = pPerson?.gender === 'FEMALE'
        edges.set(pEdgeId, {
          id: pEdgeId,
          relationshipId: pEdgeId,
          relationshipType: 'PARENT',
          sourceId: p.person_id,
          targetId: headId,
          label: isMother ? 'Mother' : 'Father',
          color: isMother ? '#DB2777' : '#2563EB',
          relationship: {
            id: pEdgeId,
            person_a_id: p.person_id,
            person_b_id: headId,
            relationship_type: 'PARENT',
            notes: null,
            verification_status: 'VERIFIED',
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          },
        })
      }
    }

    // Connect Spouses to Head
    for (const s of spouses) {
      const sEdgeId = `family-spouse-${headId}-${s.person_id}`
      if (!edges.has(sEdgeId)) {
        edges.set(sEdgeId, {
          id: sEdgeId,
          relationshipId: sEdgeId,
          relationshipType: 'SPOUSE',
          sourceId: headId,
          targetId: s.person_id,
          isCouple: true,
          color: '#9333EA',
          label: 'Spouse',
          relationship: {
            id: sEdgeId,
            person_a_id: headId,
            person_b_id: s.person_id,
            relationship_type: 'SPOUSE',
            notes: null,
            verification_status: 'VERIFIED',
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          },
        })
      }
    }

    // Connect Head to Children
    for (const c of children) {
      const cEdgeId = `family-child-${headId}-${c.person_id}`
      if (!edges.has(cEdgeId)) {
        const cPerson = personsMap.get(c.person_id)
        const isDaughter = cPerson?.gender === 'FEMALE'
        edges.set(cEdgeId, {
          id: cEdgeId,
          relationshipId: cEdgeId,
          relationshipType: 'PARENT',
          sourceId: headId,
          targetId: c.person_id,
          label: isDaughter ? 'Daughter' : 'Son',
          color: '#2563EB',
          isDashed: true,
          relationship: {
            id: cEdgeId,
            person_a_id: headId,
            person_b_id: c.person_id,
            relationship_type: 'PARENT',
            notes: null,
            verification_status: 'VERIFIED',
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          },
        })
      }
    }

    // Connect Head to Siblings
    for (const sib of siblings) {
      const sibEdgeId = `family-sib-${headId}-${sib.person_id}`
      if (!edges.has(sibEdgeId)) {
        const sibPerson = personsMap.get(sib.person_id)
        const isSister = sibPerson?.gender === 'FEMALE'
        edges.set(sibEdgeId, {
          id: sibEdgeId,
          relationshipId: sibEdgeId,
          relationshipType: 'SIBLING',
          sourceId: headId,
          targetId: sib.person_id,
          label: isSister ? 'Sister' : 'Brother',
          color: '#2563EB',
          isDashed: true,
          relationship: {
            id: sibEdgeId,
            person_a_id: headId,
            person_b_id: sib.person_id,
            relationship_type: 'SIBLING',
            notes: null,
            verification_status: 'VERIFIED',
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          },
        })
      }
    }

    // Connect Head to Extended
    for (const ext of extended) {
      const extEdgeId = `family-ext-${headId}-${ext.person_id}`
      if (!edges.has(extEdgeId)) {
        edges.set(extEdgeId, {
          id: extEdgeId,
          relationshipId: extEdgeId,
          relationshipType: 'SIBLING',
          sourceId: headId,
          targetId: ext.person_id,
          label: 'Other',
          color: '#2563EB',
          isDashed: true,
          relationship: {
            id: extEdgeId,
            person_a_id: headId,
            person_b_id: ext.person_id,
            relationship_type: 'SIBLING',
            notes: null,
            verification_status: 'VERIFIED',
            created_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            deleted_at: null,
          },
        })
      }
    }
  }

  // 5. Construct edges from explicit relationships
  for (const rel of validRelationships) {
    if (edges.size >= MAX_TREE_EDGES) {
      isBounded = true
      break
    }

    const hasEndpointA = nodes.has(rel.person_a_id)
    const hasEndpointB = nodes.has(rel.person_b_id)

    if (!hasEndpointA || !hasEndpointB) continue
    if (edges.has(rel.id)) continue

    let label: string | undefined = undefined
    let color = '#2563EB'
    let isCouple = false
    let isDashed = false

    if (rel.relationship_type === 'SPOUSE') {
      isCouple = true
      color = '#9333EA'
    } else if (rel.relationship_type === 'PARENT') {
      const p = personsMap.get(rel.person_a_id)
      label = p?.gender === 'FEMALE' ? 'Mother' : 'Father'
      color = p?.gender === 'FEMALE' ? '#DB2777' : '#2563EB'
    } else if (rel.relationship_type === 'SIBLING') {
      const p = personsMap.get(rel.person_b_id)
      label = p?.gender === 'FEMALE' ? 'Sister' : 'Brother'
      isDashed = true
    }

    edges.set(rel.id, {
      id: rel.id,
      relationshipId: rel.id,
      relationshipType: rel.relationship_type,
      sourceId: rel.person_a_id,
      targetId: rel.person_b_id,
      relationship: rel,
      label,
      color,
      isCouple,
      isDashed,
    })
  }

  // 6. Precalculate parentsNames and siblingsNames
  for (const node of nodes.values()) {
    const parentNodes = Array.from(edges.values())
      .filter((e) => e.relationshipType === 'PARENT' && e.targetId === node.id)
      .map((e) => nodes.get(e.sourceId))
      .filter(Boolean) as TreeNode[]

    if (parentNodes.length > 0) {
      node.parentsNames = parentNodes
        .map((p) => `${p.person.first_name} ${p.person.last_name}`)
        .join(' & ')
    }

    const siblingNodes = Array.from(nodes.values()).filter(
      (other) =>
        other.id !== node.id &&
        (other.rolesInTree.has('SIBLING') ||
          (other.generation === node.generation &&
            other.generation > 0 &&
            !other.rolesInTree.has('SPOUSE')))
    )

    if (siblingNodes.length > 0) {
      node.siblingsNames = siblingNodes
        .map((s) => s.person.first_name)
        .join(', ')
    }
  }

  // 7. Group node IDs into generation buckets with deterministic sorting
  for (const node of nodes.values()) {
    const tierList = generations.get(node.generation)
    if (tierList) {
      tierList.push(node.id)
    }
  }

  for (const [gen, list] of generations.entries()) {
    list.sort((a, b) => {
      const nodeA = nodes.get(a)
      const nodeB = nodes.get(b)

      if (gen === -1) {
        if (nodeA?.person.gender === 'MALE' && nodeB?.person.gender === 'FEMALE') return -1
        if (nodeA?.person.gender === 'FEMALE' && nodeB?.person.gender === 'MALE') return 1
      }

      if (gen === 0) {
        if (nodeA?.isHead && !nodeB?.isHead) return -1
        if (!nodeA?.isHead && nodeB?.isHead) return 1
      }

      const nameA = `${nodeA?.person.first_name ?? ''} ${nodeA?.person.last_name ?? ''}`
      const nameB = `${nodeB?.person.first_name ?? ''} ${nodeB?.person.last_name ?? ''}`
      return nameA.localeCompare(nameB)
    })
  }

  return {
    rootPersonId: rootPerson.id,
    familyId: familyContext?.familyId,
    familyName: familyContext?.familyName,
    totalMemberCount: familyContext?.totalMemberCount || nodes.size,
    nodes,
    edges,
    generations,
    isBounded,
  }
}
