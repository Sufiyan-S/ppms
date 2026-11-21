import axios, { isAxiosError } from 'axios'
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

// If the server returns 401 and we are still authenticated, the session has expired.
// Checking isAuthenticated prevents repeated redirects from concurrent 401 responses.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    sanitizeErrorMessage(error)
    recordSuspendedPump(error)
    if (error.response?.status === 401 && useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login?reason=session_expired'
    }
    return Promise.reject(error)
  }
)

export default apiClient
