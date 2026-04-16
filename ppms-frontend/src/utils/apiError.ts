/**
 * Extracts a safe, user-facing error message from an Axios error response.
 * Passes through known business messages from the backend; falls back to a
 * generic message so raw stack traces or DB errors are never shown to users.
 */

const KNOWN_PREFIXES = [
  'Invalid phone',
  'Invalid credentials',
  'Too many failed',
  'Shift is not open',
  'End reading cannot',
  'Each credit entry',
  'Void reason is required',
  'Cannot void',
  'Discrepancy reason',
  'Password must',
  'Current password',
  'User not found',
  'Pump not found',
]

export function parseApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const message: unknown = (err as any)?.response?.data?.message
  if (typeof message === 'string' && message.trim().length > 0) {
    // Only surface the message if it starts with a known safe prefix
    const isSafe = KNOWN_PREFIXES.some((p) => message.startsWith(p))
    if (isSafe) return message
  }
  return fallback
}
