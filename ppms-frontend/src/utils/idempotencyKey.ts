/** The key sent with one write and the exact request it was sent with. */
export interface SubmitAttempt {
  key: string
  requestJson: string
}

// getRandomValues works on plain-http LAN addresses too, where crypto.randomUUID is unavailable.
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Resending the same request keeps the previous key, so the server answers a retry after a timeout with the
 * first result; changed figures get a new key because the server refuses a key reused for a different request.
 */
export function attemptFor(previous: SubmitAttempt | null, request: unknown): SubmitAttempt {
  const requestJson = JSON.stringify(request)
  return previous?.requestJson === requestJson ? previous : { key: newIdempotencyKey(), requestJson }
}
