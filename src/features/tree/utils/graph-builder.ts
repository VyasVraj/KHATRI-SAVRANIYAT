/**
 * Graph Builder — Pure utility for constructing a TreeGraph domain model
 * from raw relationships, family roster data, and person census records.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. REAL SAVED RELATIONSHIPS:
 *    Integrates verified interpersonal relationships (public.relationships)
 *    and synchronized family roster records (public.family_members).
 * 2. INDEPENDENT FAMILY HEAD DESIGNATION:
 *    Head of Family is strictly an administrative status (isHead). It NEVER alters,
 *    demotes, or changes actual genealogical relationships (Father, Mother, Son, Wife, Brother).
 * 3. HIERARCHICAL DAG GENERATION LEVELING:
 *    Assigns generations based on the actual genealogical parent-child DAG.
 *    Grandparents/ancestors are at the top tier, children and grandchildren below.
 *    Changing Family Head never warps or inverts the generation tiers.
 * 4. SOLID COLOR & BADGE METADATA:
 *    Injects edge pill labels, couple indicators, calculated age, and family context.
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
    relationship_to_head?: string | null
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
 * Builds a deterministic, bounded TreeGraph centered on family genealogy,
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

  for (let g = 0; g <= 4; g++) {
    generations.set(g, [])
  }
  for (let g = -MAX_GENERATION_DISTANCE; g < 0; g++) {
    generations.set(g, [])
  }

  // 1. Gather all unique person IDs in the family graph
  const allPersonIds = new Set<string>([rootPerson.id])
  if (familyContext?.members) {
    for (const m of familyContext.members) {
      allPersonIds.add(m.person_id)
    }
  }

  // 2. Filter and deduplicate relationships
  const validRelationships: RelationshipRow[] = []
  const seenPairKeys = new Set<string>()

  for (const rel of relationships) {
    if (rel.deleted_at) continue
    if (rel.person_a_id === rel.person_b_id) continue

    const pairKey = `${rel.person_a_id}:${rel.person_b_id}:${rel.relationship_type}`
    if (seenPairKeys.has(pairKey)) continue
    seenPairKeys.add(pairKey)

    validRelationships.push(rel)
    allPersonIds.add(rel.person_a_id)
    allPersonIds.add(rel.person_b_id)
  }

  // Graph adjacencies for DAG leveling and edge generation
  const parentToChildren = new Map<string, Set<string>>()
  const childToParents = new Map<string, Set<string>>()
  const spouses = new Map<string, Set<string>>()
  const siblings = new Map<string, Set<string>>()

  for (const rel of validRelationships) {
    if (rel.relationship_type === 'PARENT') {
      const pId = rel.person_a_id
      const cId = rel.person_b_id
      if (!parentToChildren.has(pId)) parentToChildren.set(pId, new Set())
      parentToChildren.get(pId)!.add(cId)

      if (!childToParents.has(cId)) childToParents.set(cId, new Set())
      childToParents.get(cId)!.add(pId)
    } else if (rel.relationship_type === 'SPOUSE') {
      const { person_a_id: a, person_b_id: b } = rel
      if (!spouses.has(a)) spouses.set(a, new Set())
      spouses.get(a)!.add(b)
      if (!spouses.has(b)) spouses.set(b, new Set())
      spouses.get(b)!.add(a)
    } else if (rel.relationship_type === 'SIBLING') {
      const { person_a_id: a, person_b_id: b } = rel
      if (!siblings.has(a)) siblings.set(a, new Set())
      siblings.get(a)!.add(b)
      if (!siblings.has(b)) siblings.set(b, new Set())
      siblings.get(b)!.add(a)
    }
  }

  if (!familyContext) {
    // ---------------------------------------------------------------------------
    // MODE A: Standalone BFS Traversal (Individual Person Relative Tree View)
    // ---------------------------------------------------------------------------
    const rootNode: TreeNode = {
      id: rootPerson.id,
      person: rootPerson,
      generation: 0,
      isRoot: true,
      rolesInTree: new Set(['ROOT']),
      isHead: false,
      relationshipLabel: 'Primary Member',
      age: calculateAge(rootPerson.date_of_birth, rootPerson.dob_year),
    }
    nodes.set(rootPerson.id, rootNode)

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

      const adjacentRels = validRelationships.filter(
        (r) => r.person_a_id === current.personId || r.person_b_id === current.personId
      )

      for (const rel of adjacentRels) {
        const isA = rel.person_a_id === current.personId
        const otherPersonId = isA ? rel.person_b_id : rel.person_a_id
        const otherPerson = personsMap.get(otherPersonId)
        if (!otherPerson) continue

        let nextGen = current.generation
        let isLateral = false
        let role: TreeRole = 'EXTENDED'

        if (rel.relationship_type === 'PARENT') {
          if (isA) {
            nextGen = current.generation + 1
            role = nextGen === 1 ? 'CHILD' : 'GRANDCHILD'
          } else {
            nextGen = current.generation - 1
            role = nextGen === -1 ? 'PARENT' : 'GRANDPARENT'
          }
        } else if (rel.relationship_type === 'SPOUSE') {
          nextGen = current.generation
          isLateral = true
          role = 'SPOUSE'
        } else if (rel.relationship_type === 'SIBLING') {
          nextGen = current.generation
          isLateral = true
          role = 'SIBLING'
        }

        if (current.isLateral && isLateral) continue
        if (nextGen < -MAX_GENERATION_DISTANCE || nextGen > MAX_GENERATION_DISTANCE) continue

        if (!nodes.has(otherPersonId)) {
          if (nodes.size >= MAX_TREE_NODES) {
            isBounded = true
            break
          }
          let label = 'Member'
          if (role === 'PARENT') label = otherPerson.gender === 'FEMALE' ? 'Mother' : 'Father'
          else if (role === 'CHILD') label = otherPerson.gender === 'FEMALE' ? 'Daughter' : 'Son'
          else if (role === 'SPOUSE') label = otherPerson.gender === 'FEMALE' ? 'Wife' : 'Husband'
          else if (role === 'SIBLING') label = otherPerson.gender === 'FEMALE' ? 'Sister' : 'Brother'
          else if (role === 'GRANDPARENT') label = otherPerson.gender === 'FEMALE' ? 'Grandmother' : 'Grandfather'
          else if (role === 'GRANDCHILD') label = otherPerson.gender === 'FEMALE' ? 'Granddaughter' : 'Grandson'

          nodes.set(otherPersonId, {
            id: otherPersonId,
            person: otherPerson,
            generation: nextGen,
            isRoot: false,
            rolesInTree: new Set([role]),
            isHead: false,
            relationshipLabel: label,
            age: calculateAge(otherPerson.date_of_birth, otherPerson.dob_year),
          })
        }

        if (!visitedForExpansion.has(otherPersonId)) {
          visitedForExpansion.add(otherPersonId)
          queue.push({
            personId: otherPersonId,
            generation: nextGen,
            isLateral,
          })
        }
      }
    }
  } else {
    // ---------------------------------------------------------------------------
    // MODE B: Hierarchical DAG Leveling (Family Tree View)
    // ---------------------------------------------------------------------------

    // Also infer connections from familyContext.members roles & relationships
  if (familyContext?.members) {
    const headMember = familyContext.members.find((m) => m.is_head)

    // Infer sibling connections relative to Head
    if (headMember) {
      for (const m of familyContext.members) {
        if (m.person_id === headMember.person_id) continue
        const rel = (m.relationship_to_head || '').toLowerCase()
        const isSib = m.role === 'SIBLING' || /brother|sister|sibling|भाई|बहन/.test(rel)
        if (isSib) {
          if (!siblings.has(m.person_id)) siblings.set(m.person_id, new Set())
          siblings.get(m.person_id)!.add(headMember.person_id)
          if (!siblings.has(headMember.person_id)) siblings.set(headMember.person_id, new Set())
          siblings.get(headMember.person_id)!.add(m.person_id)
        }
      }
    }

    // Infer spouse connections for In-Laws (e.g. Sister-in-law Maya married to Tushar, Nephew's wife Rajvi married to Harsh)
    for (const m of familyContext.members) {
      const rel = (m.relationship_to_head || '').toLowerCase()
      const isSisterInLaw = /sister-in-law|भाभी|साली|जेठानी|देवरानी/.test(rel)
      if (isSisterInLaw && (!spouses.has(m.person_id) || spouses.get(m.person_id)!.size === 0)) {
        // Find brother in family
        const brotherMember = familyContext.members.find(
          (other) =>
            other.person_id !== m.person_id &&
            (other.role === 'SIBLING' || /brother|भाई/.test((other.relationship_to_head || '').toLowerCase()))
        )
        if (brotherMember) {
          if (!spouses.has(m.person_id)) spouses.set(m.person_id, new Set())
          spouses.get(m.person_id)!.add(brotherMember.person_id)
          if (!spouses.has(brotherMember.person_id)) spouses.set(brotherMember.person_id, new Set())
          spouses.get(brotherMember.person_id)!.add(m.person_id)
        }
      }

      const isNephewsWife = /nephew's wife|भतीजे की पत्नी|भांजे की पत्नी/.test(rel)
      if (isNephewsWife && (!spouses.has(m.person_id) || spouses.get(m.person_id)!.size === 0)) {
        // Find nephew in family
        const nephewMember = familyContext.members.find(
          (other) =>
            other.person_id !== m.person_id &&
            /nephew|भतीजा|भांजा/.test((other.relationship_to_head || '').toLowerCase())
        )
        if (nephewMember) {
          if (!spouses.has(m.person_id)) spouses.set(m.person_id, new Set())
          spouses.get(m.person_id)!.add(nephewMember.person_id)
          if (!spouses.has(nephewMember.person_id)) spouses.set(nephewMember.person_id, new Set())
          spouses.get(nephewMember.person_id)!.add(m.person_id)
        }
      }

      const isNiecesHusband = /niece's husband|भतीजी का पति|भांजी का पति/.test(rel)
      if (isNiecesHusband && (!spouses.has(m.person_id) || spouses.get(m.person_id)!.size === 0)) {
        // Find niece in family
        const nieceMember = familyContext.members.find(
          (other) =>
            other.person_id !== m.person_id &&
            /niece|भतीजी|भांजी/.test((other.relationship_to_head || '').toLowerCase())
        )
        if (nieceMember) {
          if (!spouses.has(m.person_id)) spouses.set(m.person_id, new Set())
          spouses.get(m.person_id)!.add(nieceMember.person_id)
          if (!spouses.has(nieceMember.person_id)) spouses.set(nieceMember.person_id, new Set())
          spouses.get(nieceMember.person_id)!.add(m.person_id)
        }
      }
    }

    // Infer parentage for Nephew / Niece relative to Head (Brother's/Sister's children)
    for (const m of familyContext.members) {
      const rel = (m.relationship_to_head || '').toLowerCase()
      const isNephewOrNiece = /nephew|niece|भतीजा|भतीजी|भांजा|भांजी/.test(rel)
      if (isNephewOrNiece && (!childToParents.has(m.person_id) || childToParents.get(m.person_id)!.size === 0)) {
        const sibMember = familyContext.members.find(
          (other) =>
            other.person_id !== m.person_id &&
            (other.role === 'SIBLING' || /brother|sister|भाई|बहन/.test((other.relationship_to_head || '').toLowerCase()))
        )
        if (sibMember) {
          if (!childToParents.has(m.person_id)) childToParents.set(m.person_id, new Set())
          childToParents.get(m.person_id)!.add(sibMember.person_id)
          if (!parentToChildren.has(sibMember.person_id)) parentToChildren.set(sibMember.person_id, new Set())
          parentToChildren.get(sibMember.person_id)!.add(m.person_id)

          for (const spId of spouses.get(sibMember.person_id) || []) {
            childToParents.get(m.person_id)!.add(spId)
            if (!parentToChildren.has(spId)) parentToChildren.set(spId, new Set())
            parentToChildren.get(spId)!.add(m.person_id)
          }
        }
      }
    }

    // Fallback parent/child inference if no explicit parent-child edges exist in validRelationships
    const hasExplicitParentChild = childToParents.size > 0
    if (!hasExplicitParentChild) {
      const parentMembers = familyContext.members.filter((m) => m.role === 'PARENT')
      const childMembers = familyContext.members.filter((m) => m.role === 'CHILD')
      const gpMembers = familyContext.members.filter((m) => m.role === 'GRANDPARENT')

      if (gpMembers.length > 0 && parentMembers.length > 0) {
        for (const gp of gpMembers) {
          for (const p of parentMembers) {
            if (!parentToChildren.has(gp.person_id)) parentToChildren.set(gp.person_id, new Set())
            parentToChildren.get(gp.person_id)!.add(p.person_id)
            if (!childToParents.has(p.person_id)) childToParents.set(p.person_id, new Set())
            childToParents.get(p.person_id)!.add(gp.person_id)
          }
        }
      }

      if (parentMembers.length > 0 && childMembers.length > 0) {
        for (const p of parentMembers) {
          for (const c of childMembers) {
            if (!parentToChildren.has(p.person_id)) parentToChildren.set(p.person_id, new Set())
            parentToChildren.get(p.person_id)!.add(c.person_id)
            if (!childToParents.has(c.person_id)) childToParents.set(c.person_id, new Set())
            childToParents.get(c.person_id)!.add(p.person_id)
          }
        }
      }
    }
  }

  // Sibling parentage inheritance: siblings share the exact same parents
  for (let pass = 0; pass < 3; pass++) {
    for (const [pId, sibSet] of siblings.entries()) {
      for (const sibId of sibSet) {
        const sibParents = childToParents.get(sibId)
        if (sibParents && sibParents.size > 0) {
          if (!childToParents.has(pId)) childToParents.set(pId, new Set())
          for (const parId of sibParents) {
            childToParents.get(pId)!.add(parId)
            if (!parentToChildren.has(parId)) parentToChildren.set(parId, new Set())
            parentToChildren.get(parId)!.add(pId)
          }
        }
      }
    }
  }

  // 3. Compute deterministic generation levels for each person using parent-child DAG
  const personGeneration = new Map<string, number>()

  // Find root ancestors (persons in family with no parents in the family graph)
  const candidateAncestors = Array.from(allPersonIds).filter(
    (id) => !childToParents.has(id) || childToParents.get(id)!.size === 0
  )

  // Filter out spouses or siblings of persons who DO have parents
  const trueAncestors = candidateAncestors.filter((id) => {
    const spSet = spouses.get(id)
    if (spSet && spSet.size > 0) {
      for (const spId of spSet) {
        if (childToParents.has(spId) && childToParents.get(spId)!.size > 0) {
          return false
        }
      }
    }
    const sibSet = siblings.get(id)
    if (sibSet && sibSet.size > 0) {
      for (const sibId of sibSet) {
        if (childToParents.has(sibId) && childToParents.get(sibId)!.size > 0) {
          return false
        }
      }
    }
    return true
  })

  // Assign depth 0 to true root ancestors
  const ancestorList = trueAncestors.length > 0 ? trueAncestors : candidateAncestors
  for (const ancId of ancestorList) {
    personGeneration.set(ancId, 0)
    // Spouses of root ancestors also depth 0
    for (const spId of spouses.get(ancId) || []) {
      personGeneration.set(spId, 0)
    }
  }

  // Propagate depth down parent-child relationships
  const queue = Array.from(ancestorList)
  for (const ancId of ancestorList) {
    for (const spId of spouses.get(ancId) || []) {
      if (!queue.includes(spId)) {
        queue.push(spId)
      }
    }
  }

  while (queue.length > 0) {
    const currId = queue.shift()!
    const currGen = personGeneration.get(currId) ?? 0

    // Down to children
    for (const childId of parentToChildren.get(currId) || []) {
      const nextGen = currGen + 1
      const existing = personGeneration.get(childId)
      if (existing === undefined || nextGen > existing) {
        personGeneration.set(childId, nextGen)
        queue.push(childId)

        // Spouses of child get same generation
        for (const spId of spouses.get(childId) || []) {
          const spExisting = personGeneration.get(spId)
          if (spExisting === undefined || nextGen > spExisting) {
            personGeneration.set(spId, nextGen)
            queue.push(spId)
          }
        }
      }
    }
  }

  // Ensure all persons in allPersonIds have a generation assigned
  for (const id of allPersonIds) {
    if (!personGeneration.has(id)) {
      // Check if spouse or sibling has generation
      let assigned = false
      for (const spId of spouses.get(id) || []) {
        if (personGeneration.has(spId)) {
          personGeneration.set(id, personGeneration.get(spId)!)
          assigned = true
          break
        }
      }
      if (!assigned) {
        for (const sibId of siblings.get(id) || []) {
          if (personGeneration.has(sibId)) {
            personGeneration.set(id, personGeneration.get(sibId)!)
            assigned = true
            break
          }
        }
      }
      if (!assigned) {
        const fm = familyContext?.members?.find((m) => m.person_id === id)
        const rel = (fm?.relationship_to_head || '').toLowerCase()
        const headMember = familyContext?.members?.find((m) => m.is_head)
        const headGen = headMember && personGeneration.has(headMember.person_id)
          ? personGeneration.get(headMember.person_id)!
          : 1

        if (fm?.is_head) {
          personGeneration.set(id, headGen)
        } else if (fm?.role === 'PARENT' || /father|mother|parent|माता|पिता/.test(rel)) {
          personGeneration.set(id, Math.max(0, headGen - 1))
        } else if (fm?.role === 'GRANDPARENT' || /grandfather|grandmother|दादा|नाना|दादी|नानी/.test(rel)) {
          personGeneration.set(id, Math.max(0, headGen - 2))
        } else if (
          fm?.role === 'SIBLING' ||
          fm?.role === 'SPOUSE' ||
          /brother|sister|sibling|spouse|wife|husband|sister-in-law|brother-in-law|भाई|बहन|पत्नी|पति|भाभी|साली|जेठानी|देवरानी/.test(rel)
        ) {
          personGeneration.set(id, headGen)
        } else if (
          fm?.role === 'CHILD' ||
          /child|son|daughter|nephew|niece|बेटा|बेटी|संतान|भतीजा|भतीजी|भांजा|भांजी/.test(rel)
        ) {
          personGeneration.set(id, headGen + 1)
        } else {
          personGeneration.set(id, headGen)
        }
      }
    }
  }

  // Check total generations depth in this family
  const allGens = Array.from(personGeneration.values())
  const maxGen = Math.max(0, ...allGens)

  // 4. Construct TreeNode domain models with accurate relationship labels
  for (const personId of allPersonIds) {
    if (nodes.size >= MAX_TREE_NODES) {
      isBounded = true
      break
    }

    const p = personsMap.get(personId)
    if (!p) continue

    const gen = personGeneration.get(personId) ?? 0
    const fm = familyContext?.members?.find((m) => m.person_id === personId)
    const isHead = fm?.is_head ?? (personId === rootPerson.id && (fm?.is_head || false))

    // Derive semantic relationship label strictly from genealogy & reference PDF
    let label = 'Member'
    const isFemale = p.gender === 'FEMALE'

    if (isHead) {
      label = 'Head of Family'
    } else if (
      fm?.relationship_to_head &&
      fm.relationship_to_head !== 'Other' &&
      !['Head of Family', 'Member'].includes(fm.relationship_to_head)
    ) {
      label = fm.relationship_to_head
    } else if (maxGen >= 2) {
      // 3-Generation Family Tree (e.g. Grandparents, Parents, Grandchildren)
      if (gen === 0) {
        label = isFemale ? 'Grandmother' : 'Grandfather'
      } else if (gen === 1) {
        const isSpouseOfDescendant = Array.from(spouses.get(personId) || []).some(
          (spId) => childToParents.has(spId) && childToParents.get(spId)!.size > 0
        )
        if (isSpouseOfDescendant) {
          label = isFemale ? 'Wife' : 'Husband'
        } else {
          label = isFemale ? 'Daughter' : 'Son'
        }
      } else if (gen >= 2) {
        label = isFemale ? 'Daughter' : 'Son'
      }
    } else if (maxGen === 1) {
      // 2-Generation Family Tree (Parents & Children)
      if (gen === 0) {
        const hasSpouseInGen0 = Array.from(spouses.get(personId) || []).some(
          (spId) => (personGeneration.get(spId) ?? 0) === 0
        )
        if (isFemale) {
          label = hasSpouseInGen0 ? 'Wife' : 'Mother'
        } else {
          label = 'Father'
        }
      } else {
        label = isFemale ? 'Daughter' : 'Son'
      }
    } else if (fm?.role === 'PARENT') {
      label = isFemale ? 'Mother' : 'Father'
    } else if (fm?.role === 'SPOUSE') {
      label = isFemale ? 'Wife' : 'Husband'
    } else if (fm?.role === 'SIBLING') {
      label = isFemale ? 'Sister' : 'Brother'
    } else if (fm?.role === 'CHILD') {
      label = isFemale ? 'Daughter' : 'Son'
    } else if (fm?.role === 'GRANDPARENT') {
      label = isFemale ? 'Grandmother' : 'Grandfather'
    } else if (fm?.role === 'GRANDCHILD') {
      label = isFemale ? 'Granddaughter' : 'Grandson'
    } else {
      label = 'Member'
    }

    const roles = new Set<TreeRole>()
    if (personId === rootPerson.id) roles.add('ROOT')
    if (/father|mother|पिता|माता/.test(label.toLowerCase())) roles.add('PARENT')
    else if (gen === 0 && maxGen >= 2) roles.add('GRANDPARENT')
    else if (gen === 0) roles.add('PARENT')
    else if (gen === 1 && maxGen >= 2) roles.add('PARENT')
    else if (gen >= 2) roles.add('CHILD')

      nodes.set(personId, {
        id: personId,
        person: p,
        generation: gen,
        isRoot: personId === rootPerson.id,
        rolesInTree: roles,
        isHead,
        relationshipLabel: label,
        age: calculateAge(p.date_of_birth, p.dob_year),
      })
    }
  }

  // Ensure all node IDs are registered in their generation bucket
  for (const node of nodes.values()) {
    const bucket = generations.get(node.generation)
    if (bucket && !bucket.includes(node.id)) {
      bucket.push(node.id)
    }
  }

  // 5. Build Relationship Edges
  const connectedPairs = new Set<string>()
  const getPairKey = (a: string, b: string) => [a, b].sort().join('::')

  for (const rel of validRelationships) {
    if (edges.size >= MAX_TREE_EDGES) {
      isBounded = true
      break
    }

    if (!nodes.has(rel.person_a_id) || !nodes.has(rel.person_b_id)) continue
    if (edges.has(rel.id)) continue

    const pairKey = getPairKey(rel.person_a_id, rel.person_b_id)
    if (connectedPairs.has(pairKey)) continue
    connectedPairs.add(pairKey)

    let color = '#2563EB'
    let isCouple = false
    let isDashed = false

    if (rel.relationship_type === 'SPOUSE') {
      isCouple = true
      color = '#9333EA'
    } else if (rel.relationship_type === 'SIBLING') {
      isDashed = true
    }

    edges.set(rel.id, {
      id: rel.id,
      relationshipId: rel.id,
      relationshipType: rel.relationship_type,
      sourceId: rel.person_a_id,
      targetId: rel.person_b_id,
      relationship: rel,
      color,
      isCouple,
      isDashed,
    })
  }

  // Also ensure synthetic couple edges for all known spouses in the family
  for (const [p1, spSet] of spouses.entries()) {
    for (const p2 of spSet) {
      const pairKey = getPairKey(p1, p2)
      if (!connectedPairs.has(pairKey) && nodes.has(p1) && nodes.has(p2)) {
        connectedPairs.add(pairKey)
        const sId = p1 < p2 ? p1 : p2
        const tId = p1 < p2 ? p2 : p1
        const coupleEdgeId = `family-couple-${sId}-${tId}`
        edges.set(coupleEdgeId, {
          id: coupleEdgeId,
          relationshipId: coupleEdgeId,
          relationshipType: 'SPOUSE',
          sourceId: sId,
          targetId: tId,
          isCouple: true,
          color: '#9333EA',
          relationship: {
            id: coupleEdgeId,
            person_a_id: sId,
            person_b_id: tId,
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
  }

  // Also ensure parent-child edges for all derived childToParents
  for (const [cId, parSet] of childToParents.entries()) {
    for (const pId of parSet) {
      const pairKey = getPairKey(pId, cId)
      if (!connectedPairs.has(pairKey) && nodes.has(pId) && nodes.has(cId)) {
        connectedPairs.add(pairKey)
        const parentEdgeId = `family-parent-${pId}-${cId}`
        edges.set(parentEdgeId, {
          id: parentEdgeId,
          relationshipId: parentEdgeId,
          relationshipType: 'PARENT',
          sourceId: pId,
          targetId: cId,
          isCouple: false,
          color: '#2563EB',
          relationship: {
            id: parentEdgeId,
            person_a_id: pId,
            person_b_id: cId,
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
  }

  // 6. Precalculate parentsNames and siblingsNames for card details
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

    const parentNodeIds = new Set(parentNodes.map((p) => p.id))

    // Sibling calculation: strictly shared parents or explicit SIBLING relationship edge
    // NEVER group by same generation or family membership alone
    const siblingNodes = Array.from(nodes.values()).filter((other) => {
      if (other.id === node.id) return false

      // 1. Check for explicit SIBLING edge between node and other
      const hasSiblingEdge = Array.from(edges.values()).some(
        (e) =>
          e.relationshipType === 'SIBLING' &&
          ((e.sourceId === node.id && e.targetId === other.id) ||
            (e.targetId === node.id && e.sourceId === other.id))
      )
      if (hasSiblingEdge) return true

      // 2. Check for shared parent(s) if parents are known
      if (parentNodeIds.size > 0) {
        const otherParentIds = Array.from(edges.values())
          .filter((e) => e.relationshipType === 'PARENT' && e.targetId === other.id)
          .map((e) => e.sourceId)
        const sharesParent = otherParentIds.some((pId) => parentNodeIds.has(pId))
        if (sharesParent) return true
      }

      return false
    })

    if (siblingNodes.length > 0) {
      node.siblingsNames = siblingNodes
        .map((s) => s.person.first_name)
        .join(', ')
    }
  }

  return {
    nodes,
    edges,
    generations,
    rootPersonId: rootPerson.id,
    isBounded,
  }
}
