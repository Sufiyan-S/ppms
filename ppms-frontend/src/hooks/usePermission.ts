import { useAuthStore } from '../store/authStore'
import { canAccessPage, canPerformAction } from '../permissions/permissions'

/**
 * Hook for checking RBAC permissions inside components.
 *
 * Usage:
 *
 *   const { hasAction, hasPage } = usePermission()
 *
 *   // Hide a button if the user cannot open a shift
 *   {hasAction('shift:open') && <button>Open Shift</button>}
 *
 *   // Check page access
 *   {hasPage('expenses') && <Link to="/dashboard/expenses">Expenses</Link>}
 */
export function usePermission() {
  const role = useAuthStore((s) => s.user?.role)

  return {
    /** Returns true if the current user's role is allowed to perform the given action. */
    hasAction: (action: string): boolean => canPerformAction(action, role),

    /** Returns true if the current user's role is allowed to access the given page. */
    hasPage: (page: string): boolean => canAccessPage(page, role),

    /** The current user's role, for cases where direct comparison is needed. */
    role,
  }
}
