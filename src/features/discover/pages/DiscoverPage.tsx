/**
 * DiscoverPage — Community Directory Page (Phase 6 Subtask 2 & 3)
 *
 * Primary entry point for community discovery mounted at /discover.
 * Provides tabbed exploration between People Directory and Family Directory.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Home, UserPlus, Plus } from 'lucide-react'
import { PeopleDirectory } from '../components/PeopleDirectory'
import { FamilyDirectory } from '../components/FamilyDirectory'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'
import { useTranslation } from '@/features/i18n'

interface DiscoverPageProps {
  defaultTab?: 'people' | 'families'
}

export function DiscoverPage({ defaultTab = 'people' }: DiscoverPageProps) {
  const [activeTab, setActiveTab] = useState<'people' | 'families'>(defaultTab)
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Page Title & Context Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-brand-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight text-navy-900">
              {t('directory.title')}
            </h1>
          </div>
          <p className="mt-1 text-sm text-navy-600">
            {t('directory.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {activeTab === 'people' ? (
            <Button
              onClick={() => navigate(ROUTES.PERSON_CREATE)}
              className="flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px]"
            >
              <UserPlus className="h-4 w-4" />
              <span>{t('directory.add_person')}</span>
            </Button>
          ) : (
            <Button
              onClick={() => navigate(ROUTES.FAMILY_CREATE)}
              className="flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px]"
            >
              <Plus className="h-4 w-4" />
              <span>{t('directory.add_family')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Directory Navigation Tabs (Mobile segmented pill style) */}
      <div className="border-b border-navy-200">
        <nav
          className="-mb-px flex space-x-6"
          aria-label="Directory Tabs"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'people'}
            aria-controls="people-directory-panel"
            onClick={() => setActiveTab('people')}
            className={[
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none',
              activeTab === 'people'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-navy-500 hover:border-navy-300 hover:text-navy-700',
            ].join(' ')}
          >
            <Users className="h-4 w-4" />
            <span>{t('directory.tab_people')}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'families'}
            aria-controls="family-directory-panel"
            onClick={() => setActiveTab('families')}
            className={[
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none',
              activeTab === 'families'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-navy-500 hover:border-navy-300 hover:text-navy-700',
            ].join(' ')}
          >
            <Home className="h-4 w-4" />
            <span>{t('directory.tab_families')}</span>
          </button>
        </nav>
      </div>

      {/* Directory Tab Content */}
      <div
        id={activeTab === 'people' ? 'people-directory-panel' : 'family-directory-panel'}
        role="tabpanel"
      >
        {activeTab === 'people' ? <PeopleDirectory /> : <FamilyDirectory />}
      </div>
    </div>
  )
}

export { DiscoverPage as PeopleDirectoryPage }
export { DiscoverPage as FamilyDirectoryPage }
