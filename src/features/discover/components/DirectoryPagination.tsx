/**
 * DirectoryPagination component
 *
 * Implements Fetch N+1 deterministic pagination controls.
 * Avoids expensive full-table COUNT(*) queries.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/features/i18n'

interface DirectoryPaginationProps {
  page: number
  hasPreviousPage: boolean
  hasNextPage: boolean
  onPageChange: (page: number) => void
  isLoading?: boolean
  className?: string
}

export function DirectoryPagination({
  page,
  hasPreviousPage,
  hasNextPage,
  onPageChange,
  isLoading = false,
  className = '',
}: DirectoryPaginationProps) {
  const { t } = useTranslation()

  // If on page 1 and no next page, pagination is unnecessary
  if (page === 1 && !hasNextPage) {
    return null
  }

  return (
    <nav
      aria-label="Directory pagination"
      className={`flex items-center justify-between border-t border-navy-200 px-2 py-4 sm:px-4 ${className}`}
    >
      <div className="flex flex-1 justify-between sm:justify-end sm:gap-3">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPreviousPage || isLoading}
          className={[
            'inline-flex min-h-[44px] items-center gap-1 rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 shadow-sm',
            'hover:bg-navy-50 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white',
          ].join(' ')}
          aria-label={t('directory.previous')}
        >
          <ChevronLeft className="h-4 w-4" />
          <span>{t('directory.previous')}</span>
        </button>

        <span
          className="inline-flex items-center px-3 text-xs font-semibold text-navy-600"
          aria-current="page"
        >
          {t('directory.page')} {page}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage || isLoading}
          className={[
            'inline-flex min-h-[44px] items-center gap-1 rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs font-medium text-navy-700 shadow-sm',
            'hover:bg-navy-50 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white',
          ].join(' ')}
          aria-label={t('directory.next')}
        >
          <span>{t('directory.next')}</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  )
}
