/**
 * Unit Tests: AuditDetailsModal (Phase 13 Subtask 3)
 * (src/features/admin/components/AuditDetailsModal.tsx)
 */

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AuditDetailsModal } from '@/features/admin/components/AuditDetailsModal'
import type { AdminAuditLogItem } from '@/features/admin/types'

const MOCK_AUDIT_LOG: AdminAuditLogItem = {
  id: 'log-uuid-1',
  action: 'USER_ROLE_CHANGED',
  actor_id: 'actor-uuid-1',
  actor_name: 'Admin Alice',
  actor_email: 'alice@example.com',
  target_type: 'profile',
  target_id: 'target-uuid-2',
  old_data: { role: 'MEMBER' },
  new_data: { role: 'ADMIN' },
  metadata: { reason: 'Promotion to administrator', caller_role: 'SUPER_ADMIN' },
  created_at: '2026-10-16T14:30:00Z',
  total_count: 1,
}

describe('AuditDetailsModal Component', () => {
  const mockOnClose = vi.fn()

  it('renders nothing when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AuditDetailsModal, {
        log: MOCK_AUDIT_LOG,
        isOpen: false,
        onClose: mockOnClose,
      })
    )
    expect(markup).toBe('')
  })

  it('renders structured audit details with actor, target, state changes, and metadata', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AuditDetailsModal, {
        log: MOCK_AUDIT_LOG,
        isOpen: true,
        onClose: mockOnClose,
      })
    )

    expect(markup).toContain('Audit Event Details')
    expect(markup).toContain('Role Changed')
    expect(markup).toContain('Admin Alice')
    expect(markup).toContain('alice@example.com')
    expect(markup).toContain('profile')
    expect(markup).toContain('target-uuid-2')
    expect(markup).toContain('State Changes')
    expect(markup).toContain('role')
    expect(markup).toContain('&quot;MEMBER&quot;')
    expect(markup).toContain('&quot;ADMIN&quot;')
    expect(markup).toContain('Event Metadata')
    expect(markup).toContain('Promotion to administrator')
  })
})
