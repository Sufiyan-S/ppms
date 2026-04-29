/**
 * Extracts a safe, user-facing error message from an Axios error response.
 *
 * 4xx responses are business/validation errors from the backend — their message
 * is always safe to show directly to the user (no stack traces, no DB internals).
 *
 * 5xx and unexpected errors fall back to a generic message so raw server errors
 * are never exposed.
 */
export function parseApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const status: unknown  = (err as any)?.response?.status
  const message: unknown = (err as any)?.response?.data?.message
  if (
    typeof status === 'number' && status >= 400 && status < 500 &&
    typeof message === 'string' && message.trim().length > 0
  ) {
    return message.trim()
  }
  return fallback
}
