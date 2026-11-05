/**
 * Families feature — public API barrel
 *
 * Exports only the contracts that other feature domains need to consume.
 * Internal implementation details (error helpers) are not re-exported.
 */

// Service functions and types
export {
  createFamily,
  getFamily,
  updateFamily,
  listFamilies,
  softDeleteFamily,
  type FamilyRow,
  type ListFamiliesParams,
} from './services/families.service'

// Schemas and input types
export {
  createFamilySchema,
  updateFamilySchema,
  type CreateFamilyInput,
  type CreateFamilyParsed,
  type UpdateFamilyInput,
} from './schemas/families.schemas'

// TanStack Query hooks
export { useFamily } from './hooks/useFamily'
export { useFamilyList } from './hooks/useFamilyList'
export {
  useCreateFamily,
  useUpdateFamily,
  useSoftDeleteFamily,
} from './hooks/useFamilyMutations'

// UI components
export { FamilyCard } from './components/FamilyCard'
export { FamilyDetail } from './components/FamilyDetail'
export { FamilyForm } from './components/FamilyForm'
export { FamilyCreationWizard } from './components/FamilyCreationWizard'

// Pages
export { FamilyListPage } from './pages/FamilyListPage'
export { FamilyCreatePage } from './pages/FamilyCreatePage'
export { FamilyDetailPage } from './pages/FamilyDetailPage'
export { FamilyEditPage } from './pages/FamilyEditPage'
