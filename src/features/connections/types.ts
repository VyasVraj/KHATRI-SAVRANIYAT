/**
 * Types definition for the Connections feature domain (Phase 7)
 *
 * Models the User-to-User social graph, connection statuses,
 * user summaries, and mutual connection metadata.
 */

export type ConnectionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED'

export interface ConnectionRow {
  id: string
  requester_id: string
  addressee_id: string
  status: ConnectionStatus
  created_at: string
  updated_at: string
}

export interface ConnectedProfileSummary {
  id: string
  display_name: string | null
  avatar_url: string | null
  email?: string
}

export interface ConnectionWithProfile extends ConnectionRow {
  /** The other user's profile information (relative to current user) */
  other_user: ConnectedProfileSummary
  /** Whether the current user was the requester of this connection */
  is_requester: boolean
}

export interface MutualConnectionsCountResult {
  user_a_id: string
  user_b_id: string
  mutual_count: number
}

export type ConnectionListFilter = 'ALL' | 'ACCEPTED' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'BLOCKED'
