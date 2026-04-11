import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// All requests go to /api/* — Vite proxy forwards them to Spring Boot in dev.
// In production, both frontend and backend run on the same server, same origin.
const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT from localStorage to every request automatically
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('ppms_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Guard so multiple concurrent 401 responses only trigger one logout+redirect
let sessionExpired = false

// If the server returns 401, the token has expired — clear auth state and force re-login
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !sessionExpired) {
      sessionExpired = true
      // Clear both in-memory Zustand state and persisted localStorage keys
      useAuthStore.getState().clearAuth()
      window.location.href = '/login?reason=session_expired'
    }
    return Promise.reject(error)
  }
)

export default apiClient
