export const pageLoaders = {
  dashboard:      () => import('../pages/dashboard/DashboardPage'),
  overview:       () => import('../pages/dashboard/OverviewPage'),
  approvals:      () => import('../pages/approvals/ApprovalsPage'),
  myShift:        () => import('../pages/shifts/MyShiftPage'),
  shifts:         () => import('../pages/shifts/ShiftsPage'),
  shiftPlanning:  () => import('../pages/shifts/ShiftPlanningPage'),
  setup:          () => import('../pages/setup/SetupPage'),
  inventory:      () => import('../pages/inventory/InventoryPage'),
  credit:         () => import('../pages/credit/CreditPage'),
  balanceSheets:  () => import('../pages/balancesheet/BalanceSheetPage'),
  reports:        () => import('../pages/reports/ReportsPage'),
  superAdmin:     () => import('../pages/superadmin/SuperAdminPage'),
  expenses:       () => import('../pages/expenses/ExpensesPage'),
  documents:      () => import('../pages/documents/DocumentsPage'),
  cash:           () => import('../pages/cash/CashDrawerPage'),
  calibration:    () => import('../pages/calibration/CalibrationPage'),
  audit:          () => import('../pages/audit/AuditLogPage'),
  payroll:        () => import('../pages/payroll/PayrollPage'),
  ancillary:      () => import('../pages/ancillary/AncillaryProductsPage'),
  settlements:    () => import('../pages/settlements/PaymentSettlementsPage'),
  notifications:  () => import('../pages/notifications/NotificationsPage'),
}

const PAGE_BY_PATH: Record<string, keyof typeof pageLoaders> = {
  '/dashboard':                'overview',
  '/dashboard/approvals':      'approvals',
  '/dashboard/my-shift':       'myShift',
  '/dashboard/shifts':         'shifts',
  '/dashboard/shift-planning': 'shiftPlanning',
  '/dashboard/inventory':      'inventory',
  '/dashboard/credit':         'credit',
  '/dashboard/expenses':       'expenses',
  '/dashboard/documents':      'documents',
  '/dashboard/cash':           'cash',
  '/dashboard/calibration':    'calibration',
  '/dashboard/payroll':        'payroll',
  '/dashboard/ancillary':      'ancillary',
  '/dashboard/audit':          'audit',
  '/dashboard/settlements':    'settlements',
  '/dashboard/notifications':  'notifications',
  '/dashboard/balance-sheets': 'balanceSheets',
  '/dashboard/reports':        'reports',
  '/dashboard/setup':          'setup',
  '/super-admin':              'superAdmin',
}

/** Starts downloading the layout and landing page chunks while login finishes, so the first screen appears sooner. */
export function prefetchLandingPage(path: string) {
  const page = PAGE_BY_PATH[path]
  if (!page) return
  const pages: Array<keyof typeof pageLoaders> = path.startsWith('/dashboard') ? ['dashboard', page] : [page]
  for (const name of pages) {
    pageLoaders[name]().catch((error: unknown) => {
      console.warn('Could not prefetch the landing page; it will load when opened.', error)
    })
  }
}
