/**
 * Cryptographic token generator and SHA-256 hasher for invitations (Phase 8)
 *
 * Rules:
 * - Uses window.crypto / globalThis.crypto for CSPRNG.
 * - Generates 256-bit (32-byte) hex string (64 hex characters).
 * - Hashes using Web Crypto SubtleCrypto SHA-256 to 64 lowercase hex characters.
 * - Plaintext tokens are kept strictly in transient memory; never logged or saved to browser storage.
 */

/**
 * Generates a 256-bit cryptographically secure random token formatted as 64 lowercase hex characters.
 */
export function generateInvitationToken(): string {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error('Cryptographically secure random number generator is not available in this environment.')
  }

  const bytes = new Uint8Array(32)
  cryptoObj.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Computes the SHA-256 hash of a plaintext token using Web Crypto SubtleCrypto.
 * Returns a 64-character lowercase hex string.
 *
 * @param token - Plaintext invitation token
 */
export async function hashInvitationToken(token: string): Promise<string> {
  const trimmed = token.trim()
  if (!trimmed) {
    throw new Error('Cannot hash empty invitation token.')
  }

  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto
  if (!cryptoObj || !cryptoObj.subtle || typeof cryptoObj.subtle.digest !== 'function') {
    throw new Error('Web Crypto subtle digest is not available in this environment.')
  }

  const enc = new TextEncoder()
  const data = enc.encode(trimmed)
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
