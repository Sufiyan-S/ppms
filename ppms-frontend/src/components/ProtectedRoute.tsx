import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { canAccessPage, getDefaultPath } from '../permissions/permissions'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Set to true on routes that are only for SUPER_ADMIN (e.g. /super-admin) */
  superAdminOnly?: boolean
  /**
   * Permission key from PAGE_PERMISSIONS (e.g. 'expenses', 'setup').
   * When provided, the route is only accessible if the logged-in user's role
   * is listed under that key. Unauthorized users are redirected to their
   * default landing page instead of seeing a blank page or an error.
   */
  page?: string
}

/**
 * Wraps any route that requires authentication, with optional role-based access control.
 *
 * Flow:
 *   1. Not logged in → /login
 *   2. Logged in as SUPER_ADMIN on a non-SUPER_ADMIN route → /super-admin
 *   3. Logged in as non-SUPER_ADMIN on a SUPER_ADMIN route → /dashboard
 *   4. `page` prop provided and role not allowed → role's default landing page
 *   5. All checks pass → render children
 */
export default function ProtectedRoute({ children, superAdminOnly = false, page }: Props) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (superAdminOnly && user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  if (!superAdminOnly && user?.role === 'SUPER_ADMIN') {
    return <Navigate to="/super-admin" replace />
  }

  // Role-based page access check
  if (page && !canAccessPage(page, user?.role)) {
    return <Navigate to={getDefaultPath(user?.role)} replace />
  }

  return <>{children}</>
}
