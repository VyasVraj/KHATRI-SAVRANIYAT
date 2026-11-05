/**
 * Feature API barrel: Relationships Domain
 *
 * Public entrypoint for interpersonal relationships between census persons (PARENT, SPOUSE, SIBLING).
 * Subtasks 1 & 2 provide types, Zod schemas, service layer, hooks, and UI components.
 */

// Types
export {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  type RelationshipType,
  type VerificationStatus,
  type PersonSummary,
  type RelationshipRow,
  type RelationshipWithEndpoints,
  type PersonRelativeRole,
  type PersonRelationshipItem,
  type PersonRelationshipsSummary,
  type ListPersonRelationshipsOptions,
} from './types'

// Schemas & Input Types
export {
  relationshipTypeSchema,
  createRelationshipSchema,
  updateRelationshipSchema,
  type CreateRelationshipInput,
  type UpdateRelationshipInput,
} from './schemas/relationships.schema'

// Service Functions
export {
  createRelationship,
  listPersonRelationships,
  getRelationship,
  updateRelationship,
  softDeleteRelationship,
} from './services/relationships.service'

// Hooks
export { usePersonRelationships } from './hooks/usePersonRelationships'
export {
  useAddRelationship,
  useUpdateRelationship,
  useSoftDeleteRelationship,
  mapRoleToCanonicalRelationship,
  type AddRelationshipParams,
} from './hooks/useRelationshipMutations'

// Components
export { PersonRelationshipsList, type PersonRelationshipsListProps } from './components/PersonRelationshipsList'
export { RelationshipCard, type RelationshipCardProps } from './components/RelationshipCard'
export { AddRelationshipModal, type AddRelationshipModalProps } from './components/AddRelationshipModal'
export { EditRelationshipModal, type EditRelationshipModalProps } from './components/EditRelationshipModal'
export { RemoveRelationshipDialog, type RemoveRelationshipDialogProps } from './components/RemoveRelationshipDialog'
