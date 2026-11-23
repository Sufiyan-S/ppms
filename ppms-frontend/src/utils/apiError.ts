import { isAxiosError } from 'axios'
import { activeLanguage, hasTranslation, translateKey } from '../i18n'
import { codeLabel } from '../constants/labels'

export type ApiErrorBody = { message?: unknown; code?: unknown; params?: unknown }

export const NO_CONNECTION_MESSAGE = 'No connection — check your network and try again.'
export const NO_SERVER_RESPONSE_MESSAGE = "Server didn't respond — please try again in a moment."

/** A message for a request that got no answer at all (offline or timed out), otherwise undefined. */
export function networkErrorMessage(err: unknown): string | undefined {
  if (!isAxiosError(err) || err.response) return undefined
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return translateKey('errors:noServerResponse')
  if (err.code === 'ERR_NETWORK') return translateKey('errors:noConnection')
  return undefined
}

/**
 * Extracts a safe, user-facing error message from an Axios error response.
 *
 * 4xx responses are business/validation errors from the backend — their message
 * is always safe to show directly to the user (no stack traces, no DB internals).
 * Outside English, an error the backend names with a code is shown from errors.json in the user's language.
 *
 * Requests that got no answer say whether the network or the server is at fault.
 * 5xx and unexpected errors fall back to a generic message so raw server errors
 * are never exposed.
 */
export function parseApiError(err: unknown, fallback?: string): string {
  const fallbackMessage = fallback ?? translateKey('errors:generic')
  if (!isAxiosError<ApiErrorBody>(err)) return fallbackMessage
  const networkMessage = networkErrorMessage(err)
  if (networkMessage) return networkMessage
  const status = err.response?.status
  if (status !== undefined && status >= 400 && status < 500) {
    const message = translatedServerError(err) ?? serverMessage(err)
    if (message !== undefined) return message
  }
  return fallbackMessage
}

export function serverMessage(err: unknown): string | undefined {
  if (!isAxiosError<ApiErrorBody>(err)) return undefined
  const message = err.response?.data?.message
  return typeof message === 'string' && message.trim().length > 0 ? message.trim() : undefined
}

/**
 * errors:<code> in the user's language, filled with the response's params; params named "…Code" are enum codes
 * and are shown as their translated labels. Undefined in English, where the server's own message is exact.
 */
export function translatedServerError(err: unknown): string | undefined {
  if (!isAxiosError<ApiErrorBody>(err)) return undefined
  return translatedErrorCode(err.response?.data?.code, err.response?.data?.params)
}

/**
 * errors:<code> in the user's language for a code and params the server sent outside an error response,
 * such as a refused item of a bulk approval. Undefined in English or for an unknown code.
 */
export function translatedErrorCode(code: unknown, params: unknown): string | undefined {
  if (activeLanguage() === 'en' || typeof code !== 'string' || !hasTranslation(`errors:${code}`)) return undefined
  return translateKey(`errors:${code}`, translatedParams(params))
}

/** Params ready for a translation: those named "…Code" are enum codes, replaced by their translated labels. */
export function translatedParams(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== 'object') return {}
  return Object.fromEntries(Object.entries(params).map(([name, value]) => [
    name,
    name.endsWith('Code') && typeof value === 'string' ? codeLabel(value) : value,
  ]))
}
