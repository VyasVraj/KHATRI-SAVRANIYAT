/**
 * People feature — public API barrel
 *
 * Exports the intended public API of the people feature domain.
 * Internal helpers and implementation details are not re-exported.
 */

// Service functions and types
export {
  createPerson,
  getPerson,
  updatePerson,
  listPersons,
  softDeletePerson,
  getPersonByUserId,
  type PersonRow,
  type ListPersonsParams,
} from './services/people.service'

// Schemas and input types
export {
  createPersonSchema,
  updatePersonSchema,
  type CreatePersonInput,
  type CreatePersonParsed,
  type UpdatePersonInput,
} from './schemas/people.schemas'

// TanStack Query hooks
export { usePerson, usePersonByUserId } from './hooks/usePerson'
export { usePersonList } from './hooks/usePersonList'
export {
  useCreatePerson,
  useUpdatePerson,
  useSoftDeletePerson,
} from './hooks/usePersonMutations'

// UI components
export { PersonCard } from './components/PersonCard'
export { PersonDetail } from './components/PersonDetail'
export { PersonForm } from './components/PersonForm'

// Pages (consumed by router — re-exported for convenience)
export { PersonListPage } from './pages/PersonListPage'
export { PersonCreatePage } from './pages/PersonCreatePage'
export { PersonDetailPage } from './pages/PersonDetailPage'
export { PersonEditPage } from './pages/PersonEditPage'
