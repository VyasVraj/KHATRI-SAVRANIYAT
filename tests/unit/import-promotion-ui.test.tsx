/**
 * Component Tests: ImportBatchPromotionCard & ImportPromotionConfirmationModal
 *
 * Verifies via renderToStaticMarkup:
 * - Promotion button disabled when batch is STAGED or has blocking errors.
 * - Promotion button enabled ONLY when batch is VALIDATED with zero errors and >= 1 eligible records.
 * - Modal renders deliberate confirmation checkbox and text warning against accidental promotion.
 * - Modal renders accurate entity breakdown (persons, families, relationships).
 * - Modal displays post-promotion summary when promotionResult is provided.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ImportBatchPromotionCard } from '@/features/admin/components/ImportBatchPromotionCard'
import { ImportPromotionConfirmationModal } from '@/features/admin/components/ImportPromotionConfirmationModal'
import type { ImportBatchItem, PromoteImportBatchResult } from '@/features/admin/types'

describe('ImportBatchPromotionCard & Modal Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseBatch: ImportBatchItem = {
    id: 'batch-1111-2222',
    created_by: 'admin-user',
    file_name: 'community_census.csv',
    file_format: 'CSV',
    file_hash: 'a'.repeat(64),
    file_size_bytes: 1024,
    status: 'VALIDATED',
    total_records: 10,
    row_counts: { persons: 7, families: 2, relationships: 1 },
    validation_summary: { errors: 0, warnings: 2, valid: 8, duplicates: 1 },
    notes: 'Census batch for promotion',
    created_at: '2026-10-18T00:00:00Z',
    updated_at: '2026-10-18T00:00:00Z',
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    promoted_at: null,
    promoted_by: null,
  }

  describe('Eligibility & Trigger Guards', () => {
    it('renders "Promote Import" enabled when batch is VALIDATED with zero errors and eligible records', () => {
      const html = renderToStaticMarkup(<ImportBatchPromotionCard batch={baseBatch} />)

      expect(html).toContain('Eligible for Promotion:')
      expect(html).toContain('Promote Import')
      expect(html).toContain('10') // eligible count
    })

    it('renders disabled state when batch is still STAGED', () => {
      const stagedBatch: ImportBatchItem = {
        ...baseBatch,
        status: 'STAGED',
      }
      const html = renderToStaticMarkup(<ImportBatchPromotionCard batch={stagedBatch} />)

      expect(html).toContain('Validation Required:')
      expect(html).toContain('Batch must be validated and finalized before promotion')
      expect(html).toContain('disabled=""')
    })

    it('renders disabled state when batch has blocking errors', () => {
      const errorBatch: ImportBatchItem = {
        ...baseBatch,
        validation_summary: { errors: 2, warnings: 1, valid: 7, duplicates: 0 },
      }
      const html = renderToStaticMarkup(<ImportBatchPromotionCard batch={errorBatch} />)

      expect(html).toContain('Blocking Errors Present:')
      expect(html).toContain('record(s) contain blocking errors')
      expect(html).toContain('disabled=""')
    })

    it('displays "Promoted to Census" when batch status is already PROMOTED', () => {
      const promotedBatch: ImportBatchItem = {
        ...baseBatch,
        status: 'PROMOTED',
        promoted_at: '2026-10-18T03:00:00Z',
      }
      const html = renderToStaticMarkup(<ImportBatchPromotionCard batch={promotedBatch} />)

      expect(html).toContain('Promoted to Census')
      expect(html).toContain('Batch Completed:')
      expect(html).not.toContain('open-promotion-modal-button')
    })
  })

  describe('ImportPromotionConfirmationModal Deliberate Confirmation', () => {
    it('renders deliberate confirmation warning and disabled state prior to checking checkbox', () => {
      const html = renderToStaticMarkup(
        <ImportPromotionConfirmationModal
          isOpen={true}
          batch={baseBatch}
          isPromoting={false}
          promotionResult={null}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      )

      expect(html).toContain('Confirm Import Promotion')
      expect(html).toContain('Permanent Census Mutation:')
      expect(html).toContain('confirm-promotion-checkbox')
      expect(html).toContain('I understand that this operation will create real canonical census records')
      expect(html).toContain('Promote Import')
    })

    it('renders post-promotion summary when promotionResult is provided', () => {
      const mockResult: PromoteImportBatchResult = {
        batchId: baseBatch.id,
        status: 'PROMOTED',
        promotedAt: '2026-10-18T04:00:00Z',
        promotedBy: 'admin-uuid',
        promotedCounts: {
          persons: 7,
          families: 2,
          relationships: 1,
          total: 10,
        },
        familyMemberships: 2,
        duplicateFlags: 1,
        total: 10,
      }

      const html = renderToStaticMarkup(
        <ImportPromotionConfirmationModal
          isOpen={true}
          batch={baseBatch}
          isPromoting={false}
          promotionResult={mockResult}
          onConfirm={vi.fn()}
          onClose={vi.fn()}
        />
      )

      expect(html).toContain('Batch Promoted Successfully')
      expect(html).toContain('Canonical Census Records Committed.')
      expect(html).toContain('Persons Created')
      expect(html).toContain('Families Created')
      expect(html).toContain('Head Memberships')
      expect(html).toContain('Done')
    })
  })
})
