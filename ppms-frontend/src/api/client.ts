import axios, { isAxiosError } from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../store/authStore'
import { usePumpStore } from '../store/usePumpStore'
import type { ApiErrorBody } from '../utils/apiError'

// All requests go to /api/* — Vite proxy forwards them to Spring Boot in dev.
// In production, both frontend and backend run on the same server, same origin.
// withCredentials: true is required so the browser sends the httpOnly JWT cookie
// automatically on every request — axios does not do this by default.
const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// Patterns that indicate a raw Java exception or SQL error leaked through.
// Any message matching these is replaced with a generic string before it reaches
// component-level error handlers — preventing internal implementation details
// from being displayed to users.
const DANGEROUS_MESSAGE_PATTERNS = [
  /\bat\s+[\w$.]+\([\w.]+:\d+\)/, // Java stack trace line: "at com.example.Foo(Bar.java:42)"
  /^org\./,                         // Spring / Hibernate class names
  /^com\./,                         // Java package names
  /^java\./,                         // JDK class names
  /\bException\b/,                  // Any unhandled Java exception message
  /could not execute/i,             // Hibernate SQL execution error
  /constraint.*violation/i,         // DB constraint error
  /\bSQL\b.*\bError\b/i,           // Generic SQL error string
]

function sanitizeErrorMessage(error: unknown): void {
  if (!isAxiosError<ApiErrorBody>(error)) return
  const data = error.response?.data
  if (!data || typeof data.message !== 'string') return
  const message = data.message
  const isLeaking = DANGEROUS_MESSAGE_PATTERNS.some((p) => p.test(message))
  if (isLeaking) {
    data.message = 'Something went wrong. Please try again.'
  }
}

const PUMP_SUSPENDED_MESSAGE = 'Pump is suspended'
const PUMP_ID_IN_URL = /\/(?:pumps|inventory)\/(\d+)(?:\/|$|\?)/

function recordSuspendedPump(error: unknown): void {
  if (!isAxiosError<ApiErrorBody>(error)) return
  if (error.response?.status !== 403 || error.response.data?.message !== PUMP_SUSPENDED_MESSAGE) return
  const pumpIdInUrl = PUMP_ID_IN_URL.exec(error.config?.url ?? '')?.[1]
  const pumpId = pumpIdInUrl ? Number(pumpIdInUrl) : usePumpStore.getState().selectedPumpId
  if (pumpId !== null) usePumpStore.getState().markPumpSuspended(pumpId)
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  retriedAfterRefresh?: boolean
  replayedAfterOtherTabRefresh?: boolean
}

type SessionRenewal = 'refreshed' | 'refreshed-by-other-tab'

const URLS_WITHOUT_REFRESH = ['/auth/login', '/auth/refresh', '/auth/logout']
const REFRESH_LOCK_NAME = 'ppms-session-refresh'
const LAST_REFRESH_AT_KEY = 'ppms_last_refresh_at'
const RECENT_REFRESH_MS = 10_000

let refreshInFlight: Promise<void> | null = null

function readLastRefreshAt(): number {
  try {
    return Number(localStorage.getItem(LAST_REFRESH_AT_KEY)) || 0
  } catch {
    // Storage blocked (private mode): treat as "no other tab refreshed", so this tab refreshes itself.
    return 0
  }
}

function recordRefreshCompleted(): void {
  try {
    localStorage.setItem(LAST_REFRESH_AT_KEY, String(Date.now()))
  } catch {
    // Storage blocked: other tabs will refresh on their own after waiting for the lock.
  }
}

function otherTabRefreshedSince(failedAt: number): boolean {
  const lastRefreshAt = readLastRefreshAt()
  return lastRefreshAt > 0 && (lastRefreshAt >= failedAt || Date.now() - lastRefreshAt < RECENT_REFRESH_MS)
}

// Concurrent 401s share one refresh: the server treats a second use of the same refresh cookie as theft.
function refreshSession(): Promise<void> {
  refreshInFlight ??= apiClient
    .post('/auth/refresh')
    .then(() => recordRefreshCompleted())
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

// Tabs share the refresh cookie, so the lock keeps two tabs from presenting the same one.
async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return task()
  return await navigator.locks.request(REFRESH_LOCK_NAME, task)
}

function renewSession(failedAt: number, mayUseOtherTabRefresh: boolean): Promise<SessionRenewal> {
  return withRefreshLock(async () => {
    if (mayUseOtherTabRefresh && otherTabRefreshedSince(failedAt)) return 'refreshed-by-other-tab'
    await refreshSession()
    return 'refreshed'
  })
}

function canRetryAfterRefresh(config: RetryableRequestConfig | undefined): config is RetryableRequestConfig {
  return !!config && !config.retriedAfterRefresh && !URLS_WITHOUT_REFRESH.includes(config.url ?? '')
}

// Checking isAuthenticated prevents repeated redirects from concurrent 401 responses.
function endExpiredSession(): void {
  if (!useAuthStore.getState().isAuthenticated) return
  useAuthStore.getState().clearAuth()
  window.location.href = '/login?reason=session_expired'
}

// A 401 while authenticated means the short-lived JWT expired: renew it once with the refresh
// cookie (or reuse another tab's fresh renewal) and replay the request; if that fails too, the session is over.
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const failedAt = Date.now()
    sanitizeErrorMessage(error)
    recordSuspendedPump(error)
    if (error.response?.status !== 401 || !useAuthStore.getState().isAuthenticated) {
      return Promise.reject(error)
    }
    const config: RetryableRequestConfig | undefined = error.config
    if (!canRetryAfterRefresh(config)) {
      endExpiredSession()
      return Promise.reject(error)
    }
    let renewal: SessionRenewal
    try {
      renewal = await renewSession(failedAt, !config.replayedAfterOtherTabRefresh)
    } catch {
      endExpiredSession()
      return Promise.reject(error)
    }
    if (renewal === 'refreshed-by-other-tab') {
      config.replayedAfterOtherTabRefresh = true
    } else {
      config.retriedAfterRefresh = true
    }
    return apiClient(config)
  }
)

export default apiClient
