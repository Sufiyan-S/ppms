import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '../types/auth'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  setAuth: (user: AuthUser) => void
  clearAuth: () => void
  updateUser: (patch: Partial<AuthUser>) => void
}

// Persists only the user profile to localStorage (NOT the token).
// The JWT lives in an httpOnly cookie managed by the browser — it cannot be
// read by JavaScript, which eliminates the XSS token-theft vector.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setAuth: (user) => {
        set({ user, isAuthenticated: true })
      },

      clearAuth: () => {
        set({ user: null, isAuthenticated: false })
      },

      updateUser: (patch) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...patch } : state.user,
        })),
    }),
    {
      name: 'ppms_user',
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isAuthenticated = !!state.user
      },
    }
  )
)
