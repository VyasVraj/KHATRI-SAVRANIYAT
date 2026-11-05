/**
 * Graph Builder — Pure utility for constructing a TreeGraph domain model
 * from raw relationships and person census records.
 *
 * ARCHITECTURAL INVARIANTS:
 * 1. ZERO INVENTED NODES OR EDGES:
 *    Only persisted, RLS-visible persons and relationships enter the graph.
 *    No synthetic placeholders, fake parents, or imaginary UUIDs.
 * 2. BOUNDED TRAVERSAL:
 *    Clamped to [-2, +2] generations from root. Hard limits on max nodes (100) and edges (150).
 * 3. STRICT ONE-HOP LATERAL:
 *    Spouses and siblings are traversed at most 1 hop; no recursive lateral expansion.
 * 4. DETERMINISTIC OUTPUT:
 *    Input ordering is normalized; duplicate relationships and invalid self-loops are filtered.
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
} from '../types'

/**
 * Builds a deterministic, bounded TreeGraph centered on rootPerson.
 *
 * @param rootPerson - The census profile of the root person
 * @param relationships - Persisted relationship records returned from the database
 * @param personsMap - Map of personId -> PersonSummary for all candidate nodes
 */
export function buildTreeGraph(
  rootPerson: PersonSummary,
  relationships: RelationshipRow[],
  personsMap: Map<string, PersonSummary>
): TreeGraph {
  const nodes = new Map<string, TreeNode>()
  const edges = new Map<string, TreeEdge>()
  const generations = new Map<number, string[]>()
  let isBounded = false

  for (let g = -MAX_GENERATION_DISTANCE; g <= MAX_GENERATION_DISTANCE; g++) {
    generations.set(g, [])
  }

  // 1. Initialize root node
  const rootNode: TreeNode = {
    id: rootPerson.id,
    person: rootPerson,
    generation: 0,
    isRoot: true,
    rolesInTree: new Set(['ROOT']),
  }
  nodes.set(rootPerson.id, rootNode)

  // 2. Filter and deduplicate relationships
  // Exclude self-relationships, soft-deleted relationships, and duplicate pairs
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

  // 3. Bounded BFS traversal for generation assignment
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

    // A. Vertical Traversal (Ancestors and Descendants)
    // Only vertically discovered nodes and root expand vertically
    if (!current.isLateral) {
      for (const rel of validRelationships) {
        if (rel.relationship_type !== 'PARENT') continue

        // Upward: current is child (person_b_id) -> find parent (person_a_id)
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

        // Downward: current is parent (person_a_id) -> find child (person_b_id)
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

    // B. Lateral Traversal (Spouse & Sibling: strictly 1-hop from vertical nodes)
    if (!current.isLateral) {
      for (const rel of validRelationships) {
        // Spouse
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
                    generation: current.generation, // Spouses share same generation
                    isRoot: false,
                    rolesInTree: new Set(['SPOUSE']),
                  }
                  nodes.set(spouseId, existingSpouse)
                  if (!visitedForExpansion.has(spouseId)) {
                    visitedForExpansion.add(spouseId)
                    // Mark isLateral: true so spouse-chains are NOT expanded recursively
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

        // Sibling
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
                    generation: current.generation, // Siblings share same generation
                    isRoot: false,
                    rolesInTree: new Set(['SIBLING']),
                  }
                  nodes.set(siblingId, existingSibling)
                  if (!visitedForExpansion.has(siblingId)) {
                    visitedForExpansion.add(siblingId)
                    // Mark isLateral: true so sibling-chains are NOT expanded recursively
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

  // 4. Construct edges (ONLY where both endpoints are in nodes map)
  for (const rel of validRelationships) {
    if (edges.size >= MAX_TREE_EDGES) {
      isBounded = true
      break
    }

    const hasEndpointA = nodes.has(rel.person_a_id)
    const hasEndpointB = nodes.has(rel.person_b_id)

    // Critical integrity rule: edge is created only if BOTH endpoints are present
    if (!hasEndpointA || !hasEndpointB) {
      continue
    }

    let sourceId: string
    let targetId: string

    if (rel.relationship_type === 'PARENT') {
      // Invariant: PARENT direction is always Parent -> Child
      sourceId = rel.person_a_id
      targetId = rel.person_b_id
    } else {
      // SPOUSE and SIBLING: canonical lexical ordering from DB
      sourceId = rel.person_a_id
      targetId = rel.person_b_id
    }

    const edge: TreeEdge = {
      id: rel.id,
      relationshipId: rel.id,
      relationshipType: rel.relationship_type,
      sourceId,
      targetId,
      relationship: rel,
    }

    edges.set(rel.id, edge)
  }

  // 5. Group node IDs into generation buckets with deterministic sorting
  for (const node of nodes.values()) {
    const tierList = generations.get(node.generation)
    if (tierList) {
      tierList.push(node.id)
    }
  }

  // Deterministically sort each generation tier:
  // Root person first in tier 0, then sorted by name/ID for stability
  for (const [gen, list] of generations.entries()) {
    list.sort((a, b) => {
      if (gen === 0) {
        if (a === rootPerson.id) return -1
        if (b === rootPerson.id) return 1
      }
      const nodeA = nodes.get(a)
      const nodeB = nodes.get(b)
      const nameA = `${nodeA?.person.first_name ?? ''} ${nodeA?.person.last_name ?? ''}`
      const nameB = `${nodeB?.person.first_name ?? ''} ${nodeB?.person.last_name ?? ''}`
      if (nameA !== nameB) return nameA.localeCompare(nameB)
      return a.localeCompare(b)
    })
  }

  return {
    rootPersonId: rootPerson.id,
    nodes,
    edges,
    generations,
    isBounded,
  }
}
