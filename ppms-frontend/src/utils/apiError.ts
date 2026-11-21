import { isAxiosError } from 'axios'

export type ApiErrorBody = { message?: unknown }

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
  if (!isAxiosError<ApiErrorBody>(err)) return fallback
  const status = err.response?.status
  const message = serverMessage(err)
  if (status !== undefined && status >= 400 && status < 500 && message !== undefined) {
    return message
  }
  return fallback
}

export function serverMessage(err: unknown): string | undefined {
  if (!isAxiosError<ApiErrorBody>(err)) return undefined
  const message = err.response?.data?.message
  return typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined
}
