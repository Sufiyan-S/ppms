import { Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { queryClient } from './queryClient'
import ProtectedRoute from './components/ProtectedRoute'
import { OfflineBanner } from './components/OfflineBanner'
import { DocumentTitle } from './components/DocumentTitle'
import { SkeletonRows } from './components/Skeleton'
import { pageLoaders } from './routes/pageLoaders'
import { CHANGE_PASSWORD_PATH } from './permissions/permissions'
import { useLanguageFollowsUser } from './i18n/useLanguageFollowsUser'

const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'))
const ChangePasswordRequiredPage = lazy(() => import('./pages/auth/ChangePasswordRequiredPage'))
const DashboardPage = lazy(pageLoaders.dashboard)
const OverviewPage = lazy(pageLoaders.overview)
const ApprovalsPage = lazy(pageLoaders.approvals)
const ShiftsPage = lazy(pageLoaders.shifts)
const MyShiftPage = lazy(pageLoaders.myShift)
const ShiftPlanningPage = lazy(pageLoaders.shiftPlanning)
const SetupPage = lazy(pageLoaders.setup)
const InventoryPage = lazy(pageLoaders.inventory)
const CreditPage = lazy(pageLoaders.credit)
const BalanceSheetPage = lazy(pageLoaders.balanceSheets)
const ReportsPage = lazy(pageLoaders.reports)
const SuperAdminPage = lazy(pageLoaders.superAdmin)
const ExpensesPage = lazy(pageLoaders.expenses)
const DocumentsPage = lazy(pageLoaders.documents)
const CashDrawerPage = lazy(pageLoaders.cash)
const CalibrationPage = lazy(pageLoaders.calibration)
const AuditLogPage = lazy(pageLoaders.audit)
const PayrollPage = lazy(pageLoaders.payroll)
const AncillaryProductsPage = lazy(pageLoaders.ancillary)
const PaymentSettlementsPage = lazy(pageLoaders.settlements)
const NotificationsPage = lazy(pageLoaders.notifications)
const CreditBalancePortalPage = lazy(() => import('./pages/portal/CreditBalancePortalPage'))

function PageFallback() {
  const { t } = useTranslation()
  return (
    <div className="ui-auth-shell">
      <div className="ui-auth-card text-center text-sm text-ink-3">
        {t('loading.app')}
      </div>
    </div>
  )
}

function NestedPageFallback() {
  const { t } = useTranslation()
  return (
    <div className="ui-page ui-page--narrow" role="status" aria-busy="true">
      <span className="sr-only">{t('loading.page')}</span>
      <SkeletonRows count={4} />
    </div>
  )
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>
}

function withPageSuspense(element: ReactNode) {
  return <Suspense fallback={<NestedPageFallback />}>{element}</Suspense>
}

export default function App() {
  // Subscribing here re-renders the whole tree when the language changes, so every screen picks it up.
  useTranslation()
  useLanguageFollowsUser()
  return (
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />
      <BrowserRouter>
        <DocumentTitle />
        <Routes>
          <Route path="/login" element={withSuspense(<LoginPage />)} />
          <Route path="/forgot-password" element={withSuspense(<ForgotPasswordPage />)} />
          <Route path="/reset-password" element={withSuspense(<ResetPasswordPage />)} />
          <Route path={CHANGE_PASSWORD_PATH} element={withSuspense(<ChangePasswordRequiredPage />)} />
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
              element={withPageSuspense(
                <ProtectedRoute page="overview">
                  <OverviewPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="approvals"
              element={withPageSuspense(
                <ProtectedRoute page="approvals">
                  <ApprovalsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="my-shift"
              element={withPageSuspense(
                <ProtectedRoute page="myShift">
                  <MyShiftPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="shifts"
              element={withPageSuspense(
                <ProtectedRoute page="shifts">
                  <ShiftsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="shift-planning"
              element={withPageSuspense(
                <ProtectedRoute page="shiftPlanning">
                  <ShiftPlanningPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="inventory"
              element={withPageSuspense(
                <ProtectedRoute page="inventory">
                  <InventoryPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="credit"
              element={withPageSuspense(
                <ProtectedRoute page="credit">
                  <CreditPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="credit/:clientId"
              element={withPageSuspense(
                <ProtectedRoute page="credit">
                  <CreditPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="expenses"
              element={withPageSuspense(
                <ProtectedRoute page="expenses">
                  <ExpensesPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="documents"
              element={withPageSuspense(
                <ProtectedRoute page="documents">
                  <DocumentsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="cash"
              element={withPageSuspense(
                <ProtectedRoute page="cashDrawer">
                  <CashDrawerPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="calibration"
              element={withPageSuspense(
                <ProtectedRoute page="calibration">
                  <CalibrationPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="payroll"
              element={withPageSuspense(
                <ProtectedRoute page="payroll">
                  <PayrollPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="ancillary"
              element={withPageSuspense(
                <ProtectedRoute page="products">
                  <AncillaryProductsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="audit"
              element={withPageSuspense(
                <ProtectedRoute page="auditLog">
                  <AuditLogPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="settlements"
              element={withPageSuspense(
                <ProtectedRoute page="settlements">
                  <PaymentSettlementsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="notifications"
              element={withPageSuspense(
                <ProtectedRoute page="notifications">
                  <NotificationsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="balance-sheets"
              element={withPageSuspense(
                <ProtectedRoute page="balanceSheets">
                  <BalanceSheetPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="reports"
              element={withPageSuspense(
                <ProtectedRoute page="reports">
                  <ReportsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="setup"
              element={withPageSuspense(
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
