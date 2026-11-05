/** Family Page — Full implementation in Phase 3/4/5 */
import { TreePine } from 'lucide-react'

export function FamilyPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
          <TreePine className="h-8 w-8 text-teal-600" aria-hidden="true" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-navy-900">My Family</h1>
        <p className="text-navy-500">
          Your family tree, members, and household. Coming in a future phase.
        </p>
      </div>
    </div>
  )
}
