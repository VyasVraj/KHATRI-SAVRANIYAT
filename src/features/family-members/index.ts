/**
 * Family members feature — public API barrel
 *
 * Exports only the contracts that other feature domains need to consume.
 * Internal implementation details (error mappers, UUID checks) are not re-exported.
 */

// Service functions & types
export {
  addFamilyMember,
  listFamilyMembers,
  listPersonFamilies,
  getFamilyMember,
  updateFamilyMember,
  removeFamilyMember,
  transferFamilyHead,
  type FamilyMemberRow,
  type FamilyMemberWithPerson,
  type FamilyMemberWithFamily,
  type FamilySummary,
  type ListFamilyMembersOptions,
  type ListPersonFamiliesOptions,
  type RemoveFamilyMemberOptions,
} from './services/family-members.service'

// Schemas & input types
export {
  familyRoleEnum,
  addFamilyMemberSchema,
  updateFamilyMemberSchema,
  type AddFamilyMemberInput,
  type AddFamilyMemberParsed,
  type UpdateFamilyMemberInput,
  type FamilyRoleInput,
} from './schemas/family-members.schemas'

// Hooks
export { useFamilyMembers } from './hooks/useFamilyMembers'
export { useFamilyMember } from './hooks/useFamilyMember'
export { usePersonFamilies } from './hooks/usePersonFamilies'
export {
  useAddFamilyMember,
  useUpdateFamilyMember,
  useRemoveFamilyMember,
  useTransferFamilyHead,
} from './hooks/useFamilyMemberMutations'

// Components
export { MemberCard, type MemberCardProps } from './components/MemberCard'
export { MemberList, type MemberListProps } from './components/MemberList'
export { AddMemberModal, type AddMemberModalProps } from './components/AddMemberModal'
export { EditMemberModal, type EditMemberModalProps } from './components/EditMemberModal'
export { TransferHeadModal, type TransferHeadModalProps } from './components/TransferHeadModal'
export { PersonFamiliesList, type PersonFamiliesListProps } from './components/PersonFamiliesList'
