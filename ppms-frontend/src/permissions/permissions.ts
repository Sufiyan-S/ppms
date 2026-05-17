import type { UserRole } from '../types/auth'

/**
 * Central RBAC permission map for PPMS.
 *
 * PAGE_PERMISSIONS — controls which roles can access each page/route.
 * Sidebar items and route guards both derive from this map, keeping UI and routing consistent.
 *
 * ACTION_PERMISSIONS — controls which roles can perform specific actions within a page
 * (e.g. open a shift, add a calibration record). Used by the usePermission hook for
 * conditional rendering of buttons, forms, and action menus.
 */

// ─── Page / Route Permissions ──────────────────────────────────────────────

export const PAGE_PERMISSIONS: Record<string, UserRole[]> = {
  overview:        ['OWNER', 'ADMIN', 'MANAGER'],
  shifts:          ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  shiftPlanning:   ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  inventory:       ['OWNER', 'ADMIN', 'MANAGER'],
  credit:          ['OWNER', 'ADMIN', 'MANAGER'],
  expenses:        ['OWNER', 'ADMIN', 'MANAGER', 'ACCOUNTANT'],
  documents:       ['OWNER', 'ADMIN'],
  cashDrawer:      ['OWNER', 'ADMIN', 'MANAGER'],
  calibration:     ['OWNER', 'ADMIN', 'MANAGER'],
  payroll:         ['OWNER'],
  products:        ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  auditLog:        ['OWNER', 'ADMIN'],
  balanceSheets:   ['OWNER', 'ADMIN', 'MANAGER'],
  reports:         ['OWNER', 'ADMIN', 'MANAGER'],
  setup:           ['OWNER', 'ADMIN'],
  settlements:     ['OWNER', 'ADMIN', 'MANAGER'],
}

// ─── Action-Level Permissions ───────────────────────────────────────────────

export const ACTION_PERMISSIONS: Record<string, UserRole[]> = {
  // Shifts
  'shift:open':                    ['OWNER', 'ADMIN', 'MANAGER'],
  'shift:close':                   ['OWNER', 'ADMIN', 'MANAGER'],
  'shift:add-credit-entry':        ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  'shift:void-credit-entry':       ['OWNER', 'ADMIN', 'MANAGER'],
  'shift:resolve-discrepancy':     ['OWNER', 'ADMIN', 'MANAGER'],

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
  'credit:manage-interest':        ['OWNER', 'ADMIN', 'MANAGER'],
  'credit:approve-payment':        ['OWNER', 'ADMIN', 'MANAGER'],
  'credit:grant-extension':        ['OWNER', 'ADMIN'],

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
  'product:manage':                ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],
  'product:record-sale':           ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'],

  // Payroll — OWNER only (backend tightened from OWNER/ADMIN to OWNER only)
  'payroll:generate':              ['OWNER'],
  'payroll:update-status':         ['OWNER'],

  // Setup
  'setup:manage':                  ['OWNER', 'ADMIN'],

  // Balance Sheets & Reports
  'balanceSheet:delete':           ['OWNER', 'ADMIN'],

  // Payment Settlements
  'settlement:write':              ['OWNER', 'ADMIN', 'MANAGER'],
  'settlement:configure':          ['OWNER', 'ADMIN'],
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
 * Returns the default redirect path for a role — the first page they are allowed to access.
 * Used by ProtectedRoute when a role is redirected away from an unauthorized page.
 */
export function getDefaultPath(role: UserRole | undefined): string {
  if (!role) return '/login'
  if (role === 'SUPER_ADMIN') return '/super-admin'
  if (role === 'OPERATOR') return '/dashboard/shifts'
  return '/dashboard'
}
