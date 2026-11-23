import type { UserRole } from '../types/auth'

/**
 * Central RBAC permission map for PPMS.
 *
 * PAGE_PERMISSIONS — controls which roles can access each page/route.
 * Sidebar items and route guards both derive from this map, keeping UI and routing consistent.
 *
 * ACTION_PERMISSIONS — controls which roles can perform specific actions within a page
 * (e.g. open a shift, add a calibration record). Read through canPerformAction for
 * conditional rendering of buttons, forms, and action menus.
 */

// ─── Page / Route Permissions ──────────────────────────────────────────────

export const PAGE_PERMISSIONS: Record<string, UserRole[]> = {
  myShift:         ['OPERATOR'],
  overview:        ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT'],
  approvals:       ['OWNER', 'ADMIN'],
  shifts:          ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  shiftPlanning:   ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  inventory:       ['OWNER', 'ADMIN', 'MANAGER'],
  credit:          ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT'],
  expenses:        ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT'],
  documents:       ['OWNER', 'ADMIN'],
  cashDrawer:      ['OWNER', 'ADMIN', 'MANAGER'],
  calibration:     ['OWNER', 'ADMIN', 'MANAGER'],
  payroll:         ['OWNER'],
  products:        ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  auditLog:        ['OWNER', 'ADMIN'],
  balanceSheets:   ['OWNER', 'ADMIN', 'MANAGER'],
  reports:         ['OWNER', 'ADMIN', 'MANAGER'],
  setup:           ['OWNER', 'ADMIN', 'MANAGER'],
  settlements:     ['OWNER', 'ADMIN', 'MANAGER'],
  notifications:   ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'ACCOUNTANT'],
}

const PAGE_PATHS: Record<string, string> = {
  myShift:       '/dashboard/my-shift',
  overview:      '/dashboard',
  approvals:     '/dashboard/approvals',
  shifts:        '/dashboard/shifts',
  shiftPlanning: '/dashboard/shift-planning',
  inventory:     '/dashboard/inventory',
  credit:        '/dashboard/credit',
  expenses:      '/dashboard/expenses',
  documents:     '/dashboard/documents',
  cashDrawer:    '/dashboard/cash',
  calibration:   '/dashboard/calibration',
  payroll:       '/dashboard/payroll',
  products:      '/dashboard/ancillary',
  auditLog:      '/dashboard/audit',
  balanceSheets: '/dashboard/balance-sheets',
  reports:       '/dashboard/reports',
  setup:         '/dashboard/setup',
  settlements:   '/dashboard/settlements',
  notifications: '/dashboard/notifications',
}

// ─── Action-Level Permissions ───────────────────────────────────────────────

export const ACTION_PERMISSIONS: Record<string, UserRole[]> = {
  // Shifts
  'shift:open':                    ['OWNER', 'ADMIN', 'MANAGER'],
  'shift:close':                   ['OWNER', 'ADMIN', 'MANAGER'],
  'shift:add-credit-entry':        ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  'shift:void-credit-entry':       ['OWNER', 'ADMIN', 'MANAGER'],
  'shift:resolve-discrepancy':     ['OWNER', 'ADMIN', 'MANAGER'],
  // Operators only see their own shifts, so the pump-wide discrepancy view is not theirs.
  'shift:view-discrepancies':      ['OWNER', 'ADMIN', 'MANAGER'],

  // Shift Planning
  'shiftPlan:write':               ['OWNER', 'ADMIN'],
  'shiftPlan:publish':             ['OWNER', 'ADMIN'],
  'shiftPlan:manage-leaves':       ['OWNER', 'ADMIN'],
  'shiftPlan:manage-preferences':  ['OWNER', 'ADMIN'],

  // Inventory — Manager has full inventory access
  'inventory:record-delivery':     ['OWNER', 'ADMIN', 'MANAGER'],
  'inventory:record-dip-check':    ['OWNER', 'ADMIN', 'MANAGER'],
  'inventory:review-dip-check':    ['OWNER', 'ADMIN', 'MANAGER'],

  // Credit — Manager has full credit access
  'credit:manage-client':          ['OWNER', 'ADMIN', 'MANAGER'],
  'credit:record-payment':         ['OWNER', 'ADMIN', 'MANAGER'],
  'credit:adjust-limit':           ['OWNER', 'ADMIN', 'MANAGER'],
  'credit:manage-interest':        ['OWNER', 'ADMIN'],
  'credit:apply-interest':         ['OWNER', 'ADMIN', 'MANAGER'],
  'credit:approve-payment':        ['OWNER', 'ADMIN'],
  'credit:grant-extension':        ['OWNER', 'ADMIN'],
  'credit:reassign':               ['OWNER', 'ADMIN', 'MANAGER'],
  'credit:waive-interest':         ['OWNER', 'ADMIN'],
  'credit:manage-portal-pin':      ['OWNER', 'ADMIN'],
  'credit:issue-invoice':          ['OWNER', 'ADMIN'],

  // Expenses
  // MANAGER and OPERATOR can create expenses (subject to approval threshold).
  // Only OWNER can delete — ADMIN lost delete access when the backend was tightened.
  'expense:create':                ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  'expense:approve':               ['OWNER', 'ADMIN'],
  'expense:delete':                ['OWNER'],

  // Cash Drawer
  'cash:record-event':             ['OWNER', 'ADMIN', 'MANAGER'],

  // Calibration
  'calibration:add':               ['OWNER', 'ADMIN'],

  // Products (Ancillary)
  'product:manage':                ['OWNER', 'ADMIN'],
  'product:record-sale':           ['OWNER', 'ADMIN', 'MANAGER'],

  // Payroll — OWNER only (backend tightened from OWNER/ADMIN to OWNER only)
  'payroll:generate':              ['OWNER'],
  'payroll:update-status':         ['OWNER'],

  // Setup
  'setup:manage':                  ['OWNER', 'ADMIN'],

  // Staff — which staff member a caller may act on is decided by canManageStaffMember
  'staff:create-admin':            ['OWNER'],
  'staff:edit-details':            ['OWNER', 'ADMIN'],
  'staff:reset-password':          ['OWNER', 'ADMIN'],
  'staff:manage-pay-rates':        ['OWNER'],
  'staff:change-status':           ['OWNER'],
  'staff:move-pump':               ['OWNER'],

  // Balance Sheets & Reports
  'balanceSheet:delete':           ['OWNER', 'ADMIN'],

  // Payment Settlements
  'settlement:write':              ['OWNER', 'ADMIN', 'MANAGER'],
  'settlement:configure':          ['OWNER', 'ADMIN'],
  'settlement:void':               ['OWNER', 'ADMIN'],
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true if the given role is allowed to access the named page.
 * SUPER_ADMIN is always allowed everywhere (they manage the platform).
 */
export function canAccessPage(page: string, role: UserRole | undefined): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  return (PAGE_PERMISSIONS[page] ?? []).includes(role)
}

/** True when the role may open the page at this path, e.g. a notification's target route. */
export function canAccessPath(path: string, role: UserRole | undefined): boolean {
  const page = Object.keys(PAGE_PATHS).find(name => PAGE_PATHS[name] === path)
  return page !== undefined && canAccessPage(page, role)
}

/**
 * Returns true if the given role is allowed to perform the named action.
 * SUPER_ADMIN is always allowed (platform-level access).
 */
export function canPerformAction(action: string, role: UserRole | undefined): boolean {
  if (!role) return false
  if (role === 'SUPER_ADMIN') return true
  return (ACTION_PERMISSIONS[action] ?? []).includes(role)
}

/**
 * Mirrors the backend role hierarchy: an Owner manages every staff role, an Admin only the roles below Admin.
 * Nobody manages their own account or one at or above their own level through the staff screens.
 */
export function canManageStaffMember(callerRole: UserRole | undefined, targetRole: string): boolean {
  if (callerRole === 'SUPER_ADMIN') return true
  if (callerRole === 'OWNER') return targetRole !== 'OWNER' && targetRole !== 'SUPER_ADMIN'
  if (callerRole === 'ADMIN') return targetRole === 'MANAGER' || targetRole === 'OPERATOR' || targetRole === 'ACCOUNTANT'
  return false
}

/** Where a user whose password was set by someone else must go before using the app. */
export const CHANGE_PASSWORD_PATH = '/change-password'

/**
 * Returns the default redirect path for a role — the first page they are allowed to access.
 * Used by ProtectedRoute when a role is redirected away from an unauthorized page.
 */
export function getDefaultPath(role: UserRole | undefined): string {
  if (!role) return '/login'
  if (role === 'SUPER_ADMIN') return '/super-admin'
  const firstPage = Object.keys(PAGE_PATHS).find(page => canAccessPage(page, role))
  return firstPage ? PAGE_PATHS[firstPage] : '/login'
}
