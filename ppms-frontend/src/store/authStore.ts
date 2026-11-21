import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '../types/auth'
import { queryClient } from '../queryClient'
import { usePumpStore } from './usePumpStore'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  setAuth: (user: AuthUser) => void
  clearAuth: () => void
  updateUser: (patch: Partial<AuthUser>) => void
}

const AUTH_STORAGE_KEY = 'ppms_user'

// Persists only the user profile to localStorage (NOT the token).
// The JWT lives in an httpOnly cookie managed by the browser — it cannot be
// read by JavaScript, which eliminates the XSS token-theft vector.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setAuth: (user) => {
        queryClient.clear()
        set({ user, isAuthenticated: true })
      },

      clearAuth: () => {
        queryClient.clear()
        usePumpStore.getState().clearSelectedPump()
        set({ user: null, isAuthenticated: false })
      },

      updateUser: (patch) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...patch } : state.user,
        })),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (state) => ({
        user: state.user
          ? {
              userId: state.user.userId,
              fullName: state.user.fullName,
              role: state.user.role,
              assignedPumpId: state.user.assignedPumpId,
            }
          : null,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.isAuthenticated = !!state.user
      },
    }
  )
)

// Another tab logging out or signing in as someone else would otherwise leave this tab
// showing the old user's pages while sending the new user's cookie.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== AUTH_STORAGE_KEY) return
    const currentUserId = useAuthStore.getState().user?.userId ?? null
    let storedUserId: number | null = null
    try {
      storedUserId = event.newValue ? JSON.parse(event.newValue)?.state?.user?.userId ?? null : null
    } catch {
      storedUserId = null
    }
    if (storedUserId !== currentUserId) {
      window.location.reload()
    }
  })
}
