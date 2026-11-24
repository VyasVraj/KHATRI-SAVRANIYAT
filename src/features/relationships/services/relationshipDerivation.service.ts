/**
 * Centralized Relationship Derivation Engine for SINDHI KHATRI SAMAJ
 *
 * Source: KHATRI_SARVANIYAT_Comprehensive_Family_Relationship_Reference(1).pdf
 *
 * Implements:
 * - Deterministic relationship calculations based strictly on verified person-to-person
 *   graph edges (PARENT, SPOUSE, SIBLING).
 * - Exact distinctions:
 *   - Brother's son (भतीजा) vs Sister's son (भांजा)
 *   - Brother's daughter (भतीजी) vs Sister's daughter (भांजी)
 *   - Nephew's wife (भतीजे की पत्नी / भांजे की पत्नी)
 *   - Niece's husband (भतीजी का पति / भांजी का पति)
 *   - Daughter-in-law (बहू), Son-in-law (दामाद)
 *   - Paternal uncle (चाचा / ताऊ), Aunt by marriage (चाची / ताई)
 *   - Cousins (चचेरा भाई / चचेरी बहन) & Cousin's wife (चचेरे भाई की पत्नी)
 * - Zero guesswork: derives only when underlying connections exist.
 */

import type { RelationshipRow, PersonSummary } from '../types'
import {
  getRelationshipDefinition,
} from '@/constants/familyRelationships'

export interface GraphAdjacencyContext {
  personsMap: Map<string, PersonSummary>
  relationships: RelationshipRow[]
}

export interface DerivedRelationshipResult {
  relationshipCode: string
  englishLabel: string
  hindiLabel: string
  displayLabel: string
  isDirect: boolean
  pathDescription?: string
}

/**
 * Builds directed lookup structures from a collection of verified relationship rows.
 */
export function buildKinshipGraph(relationships: RelationshipRow[]) {
  const parentToChildren = new Map<string, Set<string>>()
  const childToParents = new Map<string, Set<string>>()
  const spouses = new Map<string, Set<string>>()
  const siblings = new Map<string, Set<string>>()

  for (const rel of relationships) {
    if (rel.deleted_at) continue

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

  // Also infer sibling edges for persons who share the same parents
  for (const [, childSet] of parentToChildren.entries()) {
    const children = Array.from(childSet)
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const c1 = children[i]
        const c2 = children[j]
        if (!siblings.has(c1)) siblings.set(c1, new Set())
        siblings.get(c1)!.add(c2)
        if (!siblings.has(c2)) siblings.set(c2, new Set())
        siblings.get(c2)!.add(c1)
      }
    }
  }

  return { parentToChildren, childToParents, spouses, siblings }
}

/**
 * Derives the exact semantic relationship of targetPerson from the perspective of referencePerson.
 * E.g., targetPerson = Harsh, referencePerson = Jayesh -> Returns "Nephew (भतीजा)"
 */
export function deriveRelationship(
  targetPersonId: string,
  referencePersonId: string,
  context: GraphAdjacencyContext
): DerivedRelationshipResult | null {
  if (targetPersonId === referencePersonId) {
    return null
  }

  const { personsMap, relationships } = context
  const targetPerson = personsMap.get(targetPersonId)
  const refPerson = personsMap.get(referencePersonId)
  if (!targetPerson || !refPerson) return null

  const isFemale = targetPerson.gender === 'FEMALE'
  const { parentToChildren, childToParents, spouses, siblings } = buildKinshipGraph(relationships)

  // 1. Direct Spouse
  if (spouses.get(referencePersonId)?.has(targetPersonId)) {
    const code = isFemale ? 'WIFE' : 'HUSBAND'
    const def = getRelationshipDefinition(code.toLowerCase())
    return {
      relationshipCode: code,
      englishLabel: def?.englishLabel || (isFemale ? 'Wife' : 'Husband'),
      hindiLabel: def?.hindiLabel || (isFemale ? 'पत्नी' : 'पति'),
      displayLabel: def?.displayLabel || (isFemale ? 'Wife (पत्नी)' : 'Husband (पति)'),
      isDirect: true,
      pathDescription: 'Spouse of reference person',
    }
  }

  // 2. Direct Parent
  if (childToParents.get(referencePersonId)?.has(targetPersonId)) {
    const code = isFemale ? 'MOTHER' : 'FATHER'
    const def = getRelationshipDefinition(code.toLowerCase())
    return {
      relationshipCode: code,
      englishLabel: def?.englishLabel || (isFemale ? 'Mother' : 'Father'),
      hindiLabel: def?.hindiLabel || (isFemale ? 'माता' : 'पिता'),
      displayLabel: def?.displayLabel || (isFemale ? 'Mother (माता)' : 'Father (पिता)'),
      isDirect: true,
      pathDescription: 'Parent of reference person',
    }
  }

  // 3. Direct Child
  if (parentToChildren.get(referencePersonId)?.has(targetPersonId)) {
    const code = isFemale ? 'DAUGHTER' : 'SON'
    const def = getRelationshipDefinition(code.toLowerCase())
    return {
      relationshipCode: code,
      englishLabel: def?.englishLabel || (isFemale ? 'Daughter' : 'Son'),
      hindiLabel: def?.hindiLabel || (isFemale ? 'बेटी' : 'बेटा'),
      displayLabel: def?.displayLabel || (isFemale ? 'Daughter (बेटी)' : 'Son (बेटा)'),
      isDirect: true,
      pathDescription: 'Child of reference person',
    }
  }

  // 4. Direct Sibling
  if (siblings.get(referencePersonId)?.has(targetPersonId)) {
    const code = isFemale ? 'SISTER' : 'BROTHER'
    const def = getRelationshipDefinition(code.toLowerCase())
    return {
      relationshipCode: code,
      englishLabel: def?.englishLabel || (isFemale ? 'Sister' : 'Brother'),
      hindiLabel: def?.hindiLabel || (isFemale ? 'बहन' : 'भाई'),
      displayLabel: def?.displayLabel || (isFemale ? 'Sister (बहन)' : 'Brother (भाई)'),
      isDirect: true,
      pathDescription: 'Sibling of reference person',
    }
  }

  // 5. In-Laws: Sibling's Spouse (e.g. Maya is wife of brother Tushar -> Sister-in-law / भाभी)
  for (const sibId of siblings.get(referencePersonId) || []) {
    if (spouses.get(sibId)?.has(targetPersonId)) {
      const sib = personsMap.get(sibId)
      if (sib?.gender === 'MALE') {
        // Brother's wife = Bhabhi
        return {
          relationshipCode: 'SISTER_IN_LAW',
          englishLabel: 'Sister-in-law',
          hindiLabel: 'भाभी',
          displayLabel: 'Sister-in-law (भाभी)',
          isDirect: false,
          pathDescription: `Wife of brother (${sib.first_name})`,
        }
      }
      return {
        relationshipCode: 'BROTHER_IN_LAW',
        englishLabel: 'Brother-in-law',
        hindiLabel: 'जीजा / बहनोई',
        displayLabel: 'Brother-in-law (जीजा / बहनोई)',
        isDirect: false,
        pathDescription: `Husband of sister (${sib?.first_name})`,
      }
    }
  }

  // 6. Nephew / Niece: Child of Sibling (e.g. Harsh is son of brother Tushar -> Nephew / भतीजा)
  for (const sibId of siblings.get(referencePersonId) || []) {
    if (parentToChildren.get(sibId)?.has(targetPersonId)) {
      const sib = personsMap.get(sibId)
      const isBrother = sib?.gender !== 'FEMALE'

      if (isFemale) {
        const code = isBrother ? 'BROTHERS_DAUGHTER' : 'SISTERS_DAUGHTER'
        const hindi = isBrother ? 'भतीजी' : 'भांजी'
        return {
          relationshipCode: code,
          englishLabel: 'Niece',
          hindiLabel: hindi,
          displayLabel: `Niece (${hindi})`,
          isDirect: false,
          pathDescription: `Daughter of ${isBrother ? 'brother' : 'sister'} (${sib?.first_name})`,
        }
      } else {
        const code = isBrother ? 'BROTHERS_SON' : 'SISTERS_SON'
        const hindi = isBrother ? 'भतीजा' : 'भांजा'
        return {
          relationshipCode: code,
          englishLabel: 'Nephew',
          hindiLabel: hindi,
          displayLabel: `Nephew (${hindi})`,
          isDirect: false,
          pathDescription: `Son of ${isBrother ? 'brother' : 'sister'} (${sib?.first_name})`,
        }
      }
    }
  }

  // 7. Nephew's Wife / Niece's Husband: Spouse of Nephew/Niece (e.g. Rajvi is wife of Harsh)
  for (const sibId of siblings.get(referencePersonId) || []) {
    for (const nibId of parentToChildren.get(sibId) || []) {
      if (spouses.get(nibId)?.has(targetPersonId)) {
        const nib = personsMap.get(nibId)
        const sib = personsMap.get(sibId)
        const isBrother = sib?.gender !== 'FEMALE'

        if (nib?.gender === 'MALE') {
          // Target is wife of male nephew
          const hindi = isBrother ? 'भतीजे की पत्नी' : 'भांजे की पत्नी'
          return {
            relationshipCode: 'NEPHEWS_WIFE',
            englishLabel: "Nephew's Wife",
            hindiLabel: hindi,
            displayLabel: `Nephew's Wife (${hindi})`,
            isDirect: false,
            pathDescription: `Wife of nephew (${nib.first_name})`,
          }
        } else {
          // Target is husband of female niece
          const hindi = isBrother ? 'भतीजी का पति' : 'भांजी का पति'
          return {
            relationshipCode: 'NIECES_HUSBAND',
            englishLabel: "Niece's Husband",
            hindiLabel: hindi,
            displayLabel: `Niece's Husband (${hindi})`,
            isDirect: false,
            pathDescription: `Husband of niece (${nib?.first_name})`,
          }
        }
      }
    }
  }

  // 8. Daughter-in-law / Son-in-law: Spouse of Child
  for (const childId of parentToChildren.get(referencePersonId) || []) {
    if (spouses.get(childId)?.has(targetPersonId)) {
      if (isFemale) {
        return {
          relationshipCode: 'DAUGHTER_IN_LAW',
          englishLabel: 'Daughter-in-law',
          hindiLabel: 'बहू',
          displayLabel: 'Daughter-in-law (बहू)',
          isDirect: false,
          pathDescription: 'Wife of child',
        }
      } else {
        return {
          relationshipCode: 'SON_IN_LAW',
          englishLabel: 'Son-in-law',
          hindiLabel: 'दामाद',
          displayLabel: 'Son-in-law (दामाद)',
          isDirect: false,
          pathDescription: 'Husband of child',
        }
      }
    }
  }

  // 8b. Father-in-law / Mother-in-law: Parent of Spouse (e.g. Tushar or Maya to Rajvi)
  for (const spId of spouses.get(referencePersonId) || []) {
    if (childToParents.get(spId)?.has(targetPersonId)) {
      if (targetPerson.gender === 'FEMALE') {
        return {
          relationshipCode: 'MOTHER_IN_LAW',
          englishLabel: 'Mother-in-law',
          hindiLabel: 'सास',
          displayLabel: 'Mother-in-law (सास)',
          isDirect: false,
          pathDescription: 'Mother of spouse',
        }
      }
      return {
        relationshipCode: 'FATHER_IN_LAW',
        englishLabel: 'Father-in-law',
        hindiLabel: 'ससुर',
        displayLabel: 'Father-in-law (ससुर)',
        isDirect: false,
        pathDescription: 'Father of spouse',
      }
    }
  }

  // 9. Paternal Uncle / Aunt: Sibling of Parent (from child's perspective, e.g. Tushar to Vraj)
  for (const parId of childToParents.get(referencePersonId) || []) {
    const parent = personsMap.get(parId)
    if (siblings.get(parId)?.has(targetPersonId)) {
      if (parent?.gender === 'MALE') {
        // Father's sibling
        if (targetPerson.gender === 'MALE') {
          return {
            relationshipCode: 'PATERNAL_UNCLE',
            englishLabel: 'Paternal uncle',
            hindiLabel: 'चाचा / ताऊ',
            displayLabel: 'Paternal uncle (चाचा / ताऊ)',
            isDirect: false,
            pathDescription: `Brother of father (${parent.first_name})`,
          }
        } else {
          return {
            relationshipCode: 'PATERNAL_AUNT',
            englishLabel: 'Paternal aunt',
            hindiLabel: 'बुआ',
            displayLabel: 'Paternal aunt (बुआ)',
            isDirect: false,
            pathDescription: `Sister of father (${parent.first_name})`,
          }
        }
      } else {
        // Mother's sibling
        if (targetPerson.gender === 'MALE') {
          return {
            relationshipCode: 'MATERNAL_UNCLE',
            englishLabel: 'Maternal uncle',
            hindiLabel: 'मामा',
            displayLabel: 'Maternal uncle (मामा)',
            isDirect: false,
            pathDescription: `Brother of mother (${parent?.first_name})`,
          }
        } else {
          return {
            relationshipCode: 'MATERNAL_AUNT',
            englishLabel: 'Maternal aunt',
            hindiLabel: 'मौसी',
            displayLabel: 'Maternal aunt (मौसी)',
            isDirect: false,
            pathDescription: `Sister of mother (${parent?.first_name})`,
          }
        }
      }
    }

    // Aunt by marriage (e.g. Maya is wife of father's brother Tushar -> Chachi / Tai to Vraj)
    for (const sibId of siblings.get(parId) || []) {
      if (spouses.get(sibId)?.has(targetPersonId)) {
        if (parent?.gender === 'MALE') {
          return {
            relationshipCode: 'AUNT_BY_MARRIAGE',
            englishLabel: 'Aunt by marriage',
            hindiLabel: 'चाची / ताई',
            displayLabel: 'Aunt by marriage (चाची / ताई)',
            isDirect: false,
            pathDescription: 'Wife of paternal uncle',
          }
        }
      }
    }
  }

  // 10. Cousins: Child of Parent's Sibling (e.g. Harsh to Vraj)
  for (const parId of childToParents.get(referencePersonId) || []) {
    for (const sibId of siblings.get(parId) || []) {
      if (parentToChildren.get(sibId)?.has(targetPersonId)) {
        return {
          relationshipCode: isFemale ? 'FEMALE_FIRST_COUSIN' : 'MALE_FIRST_COUSIN',
          englishLabel: isFemale ? 'Cousin (Sister)' : 'Cousin (Brother)',
          hindiLabel: isFemale ? 'चचेरी बहन' : 'चचेरा भाई',
          displayLabel: isFemale ? 'Cousin (चचेरी बहन)' : 'Cousin (चचेरा भाई)',
          isDirect: false,
          pathDescription: 'Child of parent sibling',
        }
      }
    }
  }

  // 11. Cousin's Wife (e.g. Rajvi to Vraj)
  for (const parId of childToParents.get(referencePersonId) || []) {
    for (const sibId of siblings.get(parId) || []) {
      for (const cousinId of parentToChildren.get(sibId) || []) {
        if (spouses.get(cousinId)?.has(targetPersonId)) {
          return {
            relationshipCode: 'COUSINS_SPOUSE',
            englishLabel: "Cousin's Wife",
            hindiLabel: 'चचेरे भाई की पत्नी',
            displayLabel: "Cousin's Wife (चचेरे भाई की पत्नी)",
            isDirect: false,
            pathDescription: 'Wife of cousin',
          }
        }
      }
    }
  }

  // 12. Grandparent
  for (const parId of childToParents.get(referencePersonId) || []) {
    if (childToParents.get(parId)?.has(targetPersonId)) {
      const code = isFemale ? 'GRANDMOTHER' : 'GRANDFATHER'
      return {
        relationshipCode: code,
        englishLabel: isFemale ? 'Grandmother' : 'Grandfather',
        hindiLabel: isFemale ? 'दादी / नानी' : 'दादा / नाना',
        displayLabel: isFemale ? 'Grandmother (दादी / नानी)' : 'Grandfather (दादा / नाना)',
        isDirect: false,
        pathDescription: 'Grandparent of reference person',
      }
    }
  }

  return null
}
