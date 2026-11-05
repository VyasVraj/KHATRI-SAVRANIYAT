/**
 * FamilyCreatePage — create a new family record.
 *
 * Renders the multi-step FamilyCreationWizard.
 * Handles family identity, privacy settings, optional initial member staging,
 * and sequential creation orchestration.
 */

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { FamilyCreationWizard } from '../components/FamilyCreationWizard'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'

export function FamilyCreatePage() {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Back navigation */}
      <Button
        variant="secondary"
        onClick={() => navigate(ROUTES.FAMILIES)}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to families
      </Button>

      <h1 className="text-2xl font-semibold text-navy-900">Add family</h1>
      <p className="mt-1 mb-8 text-sm text-navy-500">
        Register a new family unit in the community.
      </p>

      <FamilyCreationWizard />
    </div>
  )
}
