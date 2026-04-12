import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// All requests go to /api/* — Vite proxy forwards them to Spring Boot in dev.
// In production, both frontend and backend run on the same server, same origin.
const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT to every request — read from Zustand store (single source of truth)
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// If the server returns 401 and we are still authenticated, the token has expired.
// Checking isAuthenticated prevents repeated redirects from concurrent 401 responses
// and also means this guard self-resets whenever the user logs back in.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login?reason=session_expired'
    }
    return Promise.reject(error)
  }
)

export default apiClient
