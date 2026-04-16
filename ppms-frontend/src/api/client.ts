import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// All requests go to /api/* — Vite proxy forwards them to Spring Boot in dev.
// In production, both frontend and backend run on the same server, same origin.
// withCredentials: true is required so the browser sends the httpOnly JWT cookie
// automatically on every request — axios does not do this by default.
const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// If the server returns 401 and we are still authenticated, the session has expired.
// Checking isAuthenticated prevents repeated redirects from concurrent 401 responses.
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
