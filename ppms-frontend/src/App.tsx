import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProtectedRoute from './components/ProtectedRoute'

const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const OverviewPage = lazy(() => import('./pages/dashboard/OverviewPage'))
const ShiftsPage = lazy(() => import('./pages/shifts/ShiftsPage'))
const ShiftPlanningPage = lazy(() => import('./pages/shifts/ShiftPlanningPage'))
const SetupPage = lazy(() => import('./pages/setup/SetupPage'))
const InventoryPage = lazy(() => import('./pages/inventory/InventoryPage'))
const CreditPage = lazy(() => import('./pages/credit/CreditPage'))
const BalanceSheetPage = lazy(() => import('./pages/balancesheet/BalanceSheetPage'))
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'))
const SuperAdminPage = lazy(() => import('./pages/superadmin/SuperAdminPage'))
const ExpensesPage = lazy(() => import('./pages/expenses/ExpensesPage'))
const DocumentsPage = lazy(() => import('./pages/documents/DocumentsPage'))
const CashDrawerPage = lazy(() => import('./pages/cash/CashDrawerPage'))
const CalibrationPage = lazy(() => import('./pages/calibration/CalibrationPage'))
const AuditLogPage = lazy(() => import('./pages/audit/AuditLogPage'))
const PayrollPage = lazy(() => import('./pages/payroll/PayrollPage'))
const AncillaryProductsPage = lazy(() => import('./pages/ancillary/AncillaryProductsPage'))
const CreditBalancePortalPage = lazy(() => import('./pages/portal/CreditBalancePortalPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Never retry a 401 — the token is expired; retrying just fires the logout interceptor again
      retry: (failureCount, error: any) => {
        if (error?.response?.status === 401) return false
        return failureCount < 1
      },
      staleTime: 30_000,
    },
  },
})

function PageFallback() {
  return (
    <div className="ui-auth-shell">
      <div className="ui-auth-card text-center text-sm text-slate-500">
        Loading...
      </div>
    </div>
  )
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={withSuspense(<LoginPage />)} />
          <Route path="/forgot-password" element={withSuspense(<ForgotPasswordPage />)} />
          <Route path="/reset-password" element={withSuspense(<ResetPasswordPage />)} />
          <Route
            path="/dashboard"
            element={withSuspense(
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            )}
          >
            <Route
              index
              element={withSuspense(
                <ProtectedRoute page="overview">
                  <OverviewPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="shifts"
              element={withSuspense(
                <ProtectedRoute page="shifts">
                  <ShiftsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="shift-planning"
              element={withSuspense(
                <ProtectedRoute page="shiftPlanning">
                  <ShiftPlanningPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="inventory"
              element={withSuspense(
                <ProtectedRoute page="inventory">
                  <InventoryPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="credit"
              element={withSuspense(
                <ProtectedRoute page="credit">
                  <CreditPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="expenses"
              element={withSuspense(
                <ProtectedRoute page="expenses">
                  <ExpensesPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="documents"
              element={withSuspense(
                <ProtectedRoute page="documents">
                  <DocumentsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="cash"
              element={withSuspense(
                <ProtectedRoute page="cashDrawer">
                  <CashDrawerPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="calibration"
              element={withSuspense(
                <ProtectedRoute page="calibration">
                  <CalibrationPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="payroll"
              element={withSuspense(
                <ProtectedRoute page="payroll">
                  <PayrollPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="ancillary"
              element={withSuspense(
                <ProtectedRoute page="products">
                  <AncillaryProductsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="audit"
              element={withSuspense(
                <ProtectedRoute page="auditLog">
                  <AuditLogPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="balance-sheets"
              element={withSuspense(
                <ProtectedRoute page="balanceSheets">
                  <BalanceSheetPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="reports"
              element={withSuspense(
                <ProtectedRoute page="reports">
                  <ReportsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="setup"
              element={withSuspense(
                <ProtectedRoute page="setup">
                  <SetupPage />
                </ProtectedRoute>
              )}
            />
          </Route>
          <Route
            path="/super-admin"
            element={withSuspense(
              <ProtectedRoute superAdminOnly>
                <SuperAdminPage />
              </ProtectedRoute>
            )}
          />
          <Route path="/portal/credit-balance" element={withSuspense(<CreditBalancePortalPage />)} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
